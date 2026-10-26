import os
import re
import time
import uuid
import requests
from collections import defaultdict
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit, join_room
from flask_wtf.csrf import CSRFProtect
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

secret_key = os.environ.get("SECRET_KEY")

if os.environ.get("FLASK_ENV") == "production" and not secret_key:
    raise RuntimeError("SECRET_KEY must be configured in production.")

app.config["SECRET_KEY"] = secret_key or "pulsechat-development-only-key"
db_url = os.environ.get("DATABASE_URL", "sqlite:///chat.db")
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
if os.environ.get("FLASK_ENV") == "production":
    app.config["SESSION_COOKIE_SECURE"] = True

# Upload configuration
UPLOAD_FOLDER = os.path.join(app.root_path, "static", "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 15 * 1024 * 1024  # 15 MB limit

ALLOWED_EXTENSIONS = {
    "png", "jpg", "jpeg", "gif", "webp", "svg",
    "pdf", "txt", "doc", "docx", "zip", "csv", "json"
}
IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "svg"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

csrf = CSRFProtect(app)
db = SQLAlchemy(app)

allowed_origins = os.environ.get(
    "SOCKETIO_ALLOWED_ORIGINS",
    "http://127.0.0.1:5000,http://localhost:5000"
)

socketio = SocketIO(
    app,
    cors_allowed_origins=[
        origin.strip()
        for origin in allowed_origins.split(",")
        if origin.strip()
    ]
)

user_sessions = defaultdict(set)
sid_to_user = {}

# Security & Validation Helpers
USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_\-]{3,30}$")
login_attempts = defaultdict(list)
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 300  # 5 minutes lockout

def is_login_rate_limited(ip):
    now = time.time()
    attempts = [t for t in login_attempts[ip] if now - t < LOGIN_LOCKOUT_SECONDS]
    login_attempts[ip] = attempts
    return len(attempts) >= MAX_LOGIN_ATTEMPTS

def record_failed_login(ip):
    login_attempts[ip].append(time.time())

def reset_login_attempts(ip):
    login_attempts.pop(ip, None)

def validate_registration(username, password):
    if not username:
        return "Username is required."
    if not USERNAME_REGEX.match(username):
        return "Username must be 3 to 30 characters (letters, numbers, underscores, and hyphens only)."
    if not password:
        return "Password is required."
    if len(password) < 6:
        return "Password must be at least 6 characters long."
    if len(password) > 128:
        return "Password cannot exceed 128 characters."
    return None

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    google_id = db.Column(db.String(100), unique=True, nullable=True)
    avatar_url = db.Column(db.String(300), nullable=True)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    receiver_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=db.func.current_timestamp(), index=True)
    is_read = db.Column(db.Boolean, default=False)
    is_edited = db.Column(db.Boolean, default=False)
    reply_to_id = db.Column(db.Integer, db.ForeignKey("message.id"), nullable=True, index=True)
    attachment_url = db.Column(db.String(500), nullable=True)
    attachment_name = db.Column(db.String(255), nullable=True)
    attachment_type = db.Column(db.String(50), nullable=True)
    attachment_size = db.Column(db.Integer, nullable=True)

    __table_args__ = (
        db.Index("idx_message_sender_receiver_time", "sender_id", "receiver_id", "timestamp"),
    )

class DeletedMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey("message.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)

    __table_args__ = (
        db.UniqueConstraint("message_id", "user_id", name="uq_deleted_message_user"),
    )

class MessageReaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey("message.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    emoji = db.Column(db.String(16), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())

    __table_args__ = (
        db.UniqueConstraint("message_id", "user_id", "emoji", name="uq_message_user_emoji"),
    )

with app.app_context():
    db.create_all()
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        if "user" in inspector.get_table_names():
            user_cols = [col["name"] for col in inspector.get_columns("user")]
            with db.engine.connect() as conn:
                if "email" not in user_cols:
                    conn.execute(text("ALTER TABLE user ADD COLUMN email VARCHAR(120)"))
                if "google_id" not in user_cols:
                    conn.execute(text("ALTER TABLE user ADD COLUMN google_id VARCHAR(100)"))
                if "avatar_url" not in user_cols:
                    conn.execute(text("ALTER TABLE user ADD COLUMN avatar_url VARCHAR(300)"))
                conn.commit()

        if "message" in inspector.get_table_names():
            columns = [col["name"] for col in inspector.get_columns("message")]
            with db.engine.connect() as conn:
                if "is_edited" not in columns:
                    conn.execute(text("ALTER TABLE message ADD COLUMN is_edited BOOLEAN DEFAULT 0"))
                if "reply_to_id" not in columns:
                    conn.execute(text("ALTER TABLE message ADD COLUMN reply_to_id INTEGER REFERENCES message(id)"))
                if "attachment_url" not in columns:
                    conn.execute(text("ALTER TABLE message ADD COLUMN attachment_url VARCHAR(500)"))
                if "attachment_name" not in columns:
                    conn.execute(text("ALTER TABLE message ADD COLUMN attachment_name VARCHAR(255)"))
                if "attachment_type" not in columns:
                    conn.execute(text("ALTER TABLE message ADD COLUMN attachment_type VARCHAR(50)"))
                if "attachment_size" not in columns:
                    conn.execute(text("ALTER TABLE message ADD COLUMN attachment_size INTEGER"))
                conn.commit()
    except Exception as e:
        print("Schema update notice:", e)


@app.route("/")
def home():
    if "user_id" not in session:
        return redirect(url_for("login"))

    users = User.query.filter(User.id != session["user_id"]).all()
    return render_template(
        "index.html",
        username=session["username"],
        users=users
    )


def get_google_client_id():
    load_dotenv(override=True)
    cid = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    if cid and not cid.startswith("your-client-id") and not cid.startswith("your-google-client-id"):
        return cid
    return ""


ALLOW_PUBLIC_REGISTRATION = os.environ.get("ALLOW_PUBLIC_REGISTRATION", "false").lower() in ("true", "1", "yes")


@app.route("/register", methods=["GET", "POST"])
def register():
    if "user_id" in session:
        return redirect(url_for("home"))

    if not ALLOW_PUBLIC_REGISTRATION:
        flash("Public account registration is disabled. Please sign in with Google or your existing account.", "info")
        return redirect(url_for("login"))

    google_client_id = get_google_client_id()

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        val_err = validate_registration(username, password)
        if val_err:
            flash(val_err, "error")
            return render_template("register.html", google_client_id=google_client_id), 400

        existing_user = User.query.filter_by(username=username).first()

        if existing_user:
            flash("Username already exists. Please choose a different username.", "error")
            return render_template("register.html", google_client_id=google_client_id), 409

        hashed_password = generate_password_hash(password)

        user = User(
            username=username,
            password=hashed_password
        )

        db.session.add(user)
        db.session.commit()

        flash("Account created successfully! You can now log in.", "success")
        return redirect(url_for("login"))

    return render_template("register.html", google_client_id=google_client_id)


@app.route("/login", methods=["GET", "POST"])
def login():
    if "user_id" in session:
        return redirect(url_for("home"))

    google_client_id = get_google_client_id()

    if request.method == "POST":
        client_ip = request.remote_addr or "127.0.0.1"

        if is_login_rate_limited(client_ip):
            flash("Too many failed login attempts. Please wait 5 minutes before trying again.", "error")
            return render_template("login.html", google_client_id=google_client_id), 429

        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        user = User.query.filter_by(username=username).first()

        if user and check_password_hash(user.password, password):
            reset_login_attempts(client_ip)
            session.clear()
            session["user_id"] = user.id
            session["username"] = user.username

            return redirect(url_for("home"))

        record_failed_login(client_ip)
        flash("Invalid username or password.", "error")
        return render_template("login.html", google_client_id=google_client_id), 401

    return render_template("login.html", google_client_id=google_client_id)


@app.route("/login/google", methods=["POST"])
@csrf.exempt
def google_login():
    data = request.get_json(silent=True) or request.form
    token = data.get("credential") if data else None

    if not token:
        return jsonify({"success": False, "error": "Missing Google ID token."}), 400

    # In testing mode or with mock token
    if app.config.get("TESTING") and token.startswith("mock_token_"):
        user_info = {
            "sub": data.get("sub", "mock_google_id_123"),
            "email": data.get("email", "mock@example.com"),
            "name": data.get("name", "Google User"),
            "picture": data.get("picture", "")
        }
    else:
        try:
            resp = requests.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": token},
                timeout=5
            )
            if resp.status_code != 200:
                return jsonify({"success": False, "error": "Invalid or expired Google token."}), 401
            user_info = resp.json()
        except requests.RequestException:
            return jsonify({"success": False, "error": "Failed to connect to Google authentication service."}), 502

    google_id = user_info.get("sub")
    email = user_info.get("email")
    name = user_info.get("name") or (email.split("@")[0] if email else "google_user")
    avatar = user_info.get("picture")

    if not google_id:
        return jsonify({"success": False, "error": "Google profile did not provide a valid user ID."}), 400

    # Check for existing user by google_id or email
    user = None
    if google_id:
        user = User.query.filter_by(google_id=google_id).first()
    if not user and email:
        user = User.query.filter_by(email=email).first()

    if not user:
        # Generate unique, valid username
        base_username = re.sub(r"[^a-zA-Z0-9_\-]", "", name.replace(" ", "_"))[:20]
        if len(base_username) < 3:
            base_username = f"user_{google_id[:6]}"

        candidate_username = base_username
        suffix = 1
        while User.query.filter_by(username=candidate_username).first():
            candidate_username = f"{base_username[:15]}_{suffix}"
            suffix += 1

        random_password = uuid.uuid4().hex
        user = User(
            username=candidate_username,
            password=generate_password_hash(random_password),
            email=email,
            google_id=google_id,
            avatar_url=avatar
        )
        db.session.add(user)
        db.session.commit()
    else:
        # Update user record with Google details if not already linked
        updated = False
        if not user.google_id:
            user.google_id = google_id
            updated = True
        if email and not user.email:
            user.email = email
            updated = True
        if avatar and not user.avatar_url:
            user.avatar_url = avatar
            updated = True
        if updated:
            db.session.commit()

    client_ip = request.remote_addr or "127.0.0.1"
    reset_login_attempts(client_ip)

    session.clear()
    session["user_id"] = user.id
    session["username"] = user.username

    return jsonify({
        "success": True,
        "redirect_url": url_for("home"),
        "username": user.username
    })


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    flash("You have been logged out successfully.", "success")
    return redirect(url_for("login"))


@app.route("/upload", methods=["POST"])
def upload():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded."}), 400

    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "Empty filename."}), 400

    original_filename = file.filename
    if not allowed_file(original_filename):
        return jsonify({"error": "File type not supported. Allowed: images, PDF, documents, TXT, ZIP."}), 400

    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size > 15 * 1024 * 1024:
        return jsonify({"error": "File size exceeds 15MB limit."}), 400

    ext = original_filename.rsplit(".", 1)[1].lower() if "." in original_filename else ""
    safe_name = secure_filename(original_filename) or f"file_{uuid.uuid4().hex[:6]}"
    unique_filename = f"{uuid.uuid4().hex[:10]}_{safe_name}"
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_filename)
    file.save(save_path)

    file_type = "image" if ext in IMAGE_EXTENSIONS else "file"
    file_url = url_for("static", filename=f"uploads/{unique_filename}")

    return jsonify({
        "success": True,
        "url": file_url,
        "name": original_filename,
        "type": file_type,
        "size": file_size
    })


def format_reactions_for_message(message_id, current_user_id=None):
    reactions = (
        db.session.query(
            MessageReaction.emoji,
            MessageReaction.user_id,
            User.username
        )
        .join(User, MessageReaction.user_id == User.id)
        .filter(MessageReaction.message_id == message_id)
        .all()
    )
    grouped = defaultdict(list)
    for emoji, user_id, username in reactions:
        grouped[emoji].append({"user_id": user_id, "username": username})

    result = []
    for emoji, users in grouped.items():
        result.append({
            "emoji": emoji,
            "count": len(users),
            "users": [u["username"] for u in users],
            "user_reacted": any(u["user_id"] == current_user_id for u in users) if current_user_id else False
        })
    return result


@socketio.on("join")
def handle_join(data):
    if "user_id" not in session:
        return

    room = data.get("room")
    if not room or not isinstance(room, str):
        return

    match = re.match(r"^chat_(\d+)_(\d+)$", room)
    if not match:
        return

    current_user_id = session["user_id"]
    participant_1 = int(match.group(1))
    participant_2 = int(match.group(2))

    # Reject unauthorized room join
    if current_user_id != participant_1 and current_user_id != participant_2:
        return

    join_room(room)


@socketio.on("send_message")
def handle_message(data):
    if "user_id" not in session:
        return

    sender_id = session["user_id"]
    receiver_id = data.get("receiver_id")
    raw_message = (data.get("message") or "").strip()
    reply_to_id = data.get("reply_to_id")
    attachment = data.get("attachment")

    if (not raw_message and not attachment) or not receiver_id:
        return

    try:
        receiver_id = int(receiver_id)
    except (ValueError, TypeError):
        return

    if sender_id == receiver_id:
        return

    recipient = db.session.get(User, receiver_id)
    if not recipient:
        emit("message_error", {"error": "Recipient does not exist."})
        return

    if len(raw_message) > 4000:
        raw_message = raw_message[:4000]

    # Validate reply target if present
    reply_data = None
    valid_reply_id = None
    if reply_to_id:
        try:
            target_id = int(reply_to_id)
            replied_msg = db.session.get(Message, target_id)
            if replied_msg and {replied_msg.sender_id, replied_msg.receiver_id} == {sender_id, receiver_id}:
                valid_reply_id = replied_msg.id
                reply_author = db.session.get(User, replied_msg.sender_id)
                reply_data = {
                    "id": replied_msg.id,
                    "username": reply_author.username if reply_author else "Unknown",
                    "message": (replied_msg.message or "")[:120]
                }
        except (ValueError, TypeError):
            valid_reply_id = None

    att_url = None
    att_name = None
    att_type = None
    att_size = None
    if attachment and isinstance(attachment, dict):
        att_url = attachment.get("url")
        att_name = attachment.get("name")
        att_type = attachment.get("type")
        att_size = attachment.get("size")

    room = f"chat_{min(sender_id, receiver_id)}_{max(sender_id, receiver_id)}"

    new_message = Message(
        sender_id=sender_id,
        receiver_id=receiver_id,
        message=raw_message,
        reply_to_id=valid_reply_id,
        attachment_url=att_url,
        attachment_name=att_name,
        attachment_type=att_type,
        attachment_size=att_size,
        is_read=False
    )

    try:
        db.session.add(new_message)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        emit("message_error", {"error": "Database error while saving message. Please try again."})
        return

    msg_time = new_message.timestamp.strftime("%I:%M %p") if new_message.timestamp else "Just now"

    message_data = {
        "id": new_message.id,
        "sender_id": sender_id,
        "username": session["username"],
        "message": raw_message,
        "timestamp": msg_time,
        "is_edited": False,
        "is_read": False,
        "reply_to": reply_data,
        "attachment": {
            "url": att_url,
            "name": att_name,
            "type": att_type,
            "size": att_size
        } if att_url else None,
        "reactions": []
    }

    emit("receive_message", message_data, room=room)

    receiver_sids = user_sessions.get(receiver_id, set())
    for sid in receiver_sids:
        emit("new_message_notification", message_data, to=sid)


@socketio.on("load_messages")
def load_messages(data):
    if "user_id" not in session:
        return

    current_user_id = session["user_id"]
    other_user_id = data.get("user_id")

    if not other_user_id:
        return

    try:
        other_user_id = int(other_user_id)
    except (ValueError, TypeError):
        return

    deleted_subquery = db.session.query(DeletedMessage.message_id).filter_by(user_id=current_user_id).subquery()

    results = (
        db.session.query(Message, User.username)
        .join(User, Message.sender_id == User.id)
        .outerjoin(deleted_subquery, Message.id == deleted_subquery.c.message_id)
        .filter(
            deleted_subquery.c.message_id.is_(None),
            db.or_(
                db.and_(
                    Message.sender_id == current_user_id,
                    Message.receiver_id == other_user_id
                ),
                db.and_(
                    Message.sender_id == other_user_id,
                    Message.receiver_id == current_user_id
                )
            )
        )
        .order_by(Message.timestamp.asc())
        .all()
    )

    msg_ids = [msg.id for msg, _ in results]

    # Batch load replies to prevent N+1 queries
    reply_ids = [msg.reply_to_id for msg, _ in results if msg.reply_to_id]
    replies_by_id = {}
    if reply_ids:
        replied_messages = (
            db.session.query(Message.id, Message.message, User.username)
            .join(User, Message.sender_id == User.id)
            .filter(Message.id.in_(reply_ids))
            .all()
        )
        for r_id, r_text, r_uname in replied_messages:
            replies_by_id[r_id] = {
                "id": r_id,
                "message": (r_text or "")[:120],
                "username": r_uname
            }

    # Batch load reactions to prevent N+1 queries
    reactions_by_msg = defaultdict(lambda: defaultdict(list))
    if msg_ids:
        all_reactions = (
            db.session.query(
                MessageReaction.message_id,
                MessageReaction.emoji,
                MessageReaction.user_id,
                User.username
            )
            .join(User, MessageReaction.user_id == User.id)
            .filter(MessageReaction.message_id.in_(msg_ids))
            .all()
        )
        for m_id, emoji, u_id, u_name in all_reactions:
            reactions_by_msg[m_id][emoji].append({"user_id": u_id, "username": u_name})

    def get_msg_reactions_list(m_id):
        rxn_map = reactions_by_msg.get(m_id, {})
        res = []
        for emoji, users in rxn_map.items():
            res.append({
                "emoji": emoji,
                "count": len(users),
                "users": [u["username"] for u in users],
                "user_reacted": any(u["user_id"] == current_user_id for u in users)
            })
        return res

    history = [
        {
            "id": msg.id,
            "sender_id": msg.sender_id,
            "username": sender_username,
            "message": msg.message,
            "timestamp": msg.timestamp.strftime("%I:%M %p") if msg.timestamp else "",
            "is_edited": bool(getattr(msg, "is_edited", False)),
            "is_read": bool(getattr(msg, "is_read", False)),
            "reply_to": replies_by_id.get(msg.reply_to_id) if msg.reply_to_id else None,
            "attachment": {
                "url": msg.attachment_url,
                "name": msg.attachment_name,
                "type": msg.attachment_type,
                "size": msg.attachment_size
            } if msg.attachment_url else None,
            "reactions": get_msg_reactions_list(msg.id)
        }
        for msg, sender_username in results
    ]

    emit("chat_history", {"messages": history})


@socketio.on("toggle_reaction")
def handle_toggle_reaction(data):
    if "user_id" not in session:
        return

    current_user_id = session["user_id"]
    message_id = data.get("message_id")
    emoji = (data.get("emoji") or "").strip()

    if not message_id or not emoji:
        return

    try:
        message_id = int(message_id)
    except (ValueError, TypeError):
        return

    msg = db.session.get(Message, message_id)
    if not msg:
        return

    if current_user_id not in (msg.sender_id, msg.receiver_id):
        emit("message_error", {"error": "You cannot react to messages outside your conversation."})
        return

    ALLOWED_REACTION_EMOJIS = {"👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏", "✨", "💯"}
    if emoji not in ALLOWED_REACTION_EMOJIS:
        return

    existing_rxn = MessageReaction.query.filter_by(
        message_id=message_id,
        user_id=current_user_id,
        emoji=emoji
    ).first()

    try:
        if existing_rxn:
            db.session.delete(existing_rxn)
        else:
            new_rxn = MessageReaction(
                message_id=message_id,
                user_id=current_user_id,
                emoji=emoji
            )
            db.session.add(new_rxn)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return

    room = f"chat_{min(msg.sender_id, msg.receiver_id)}_{max(msg.sender_id, msg.receiver_id)}"
    reactions = format_reactions_for_message(message_id, current_user_id)

    emit("reaction_updated", {
        "message_id": message_id,
        "emoji": emoji,
        "reactions": reactions
    }, room=room)


@socketio.on("load_unread_counts")
def load_unread_counts():
    if "user_id" not in session:
        return

    current_user_id = session["user_id"]

    results = (
        db.session.query(Message.sender_id, db.func.count(Message.id))
        .filter(Message.receiver_id == current_user_id, Message.is_read == False)
        .group_by(Message.sender_id)
        .all()
    )
    unread_counts = {sender_id: count for sender_id, count in results}

    emit(
        "unread_counts",
        {
            "counts": unread_counts
        }
    )


@socketio.on("mark_messages_read")
def mark_messages_read(data):
    if "user_id" not in session:
        return

    current_user_id = session["user_id"]
    sender_id = data.get("user_id")

    if not sender_id:
        return

    try:
        sender_id = int(sender_id)
    except (ValueError, TypeError):
        return

    updated_count = Message.query.filter_by(
        sender_id=sender_id,
        receiver_id=current_user_id,
        is_read=False
    ).update({
        "is_read": True
    })

    db.session.commit()

    if updated_count > 0:
        room = f"chat_{min(current_user_id, sender_id)}_{max(current_user_id, sender_id)}"
        emit(
            "messages_read",
            {
                "reader_id": current_user_id,
                "sender_id": sender_id
            },
            room=room
        )


@socketio.on("delete_message")
def delete_message(data):
    if "user_id" not in session:
        return

    message_id = data.get("message_id")
    current_user_id = session["user_id"]

    if not message_id:
        return

    message = db.session.get(Message, message_id)

    if not message or message.sender_id != current_user_id:
        emit("message_error", {"error": "You are not authorized to delete this message."})
        return

    try:
        # Unlink any replies pointing to this message
        Message.query.filter_by(reply_to_id=message_id).update({"reply_to_id": None})
        # Clean up any reactions and local deletion tracking
        MessageReaction.query.filter_by(message_id=message_id).delete()
        DeletedMessage.query.filter_by(message_id=message_id).delete()
        Message.query.filter_by(id=message_id).delete()
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        emit("message_error", {"error": "Failed to delete message. Please try again."})
        return

    room = f"chat_{min(message.sender_id, message.receiver_id)}_{max(message.sender_id, message.receiver_id)}"

    emit(
        "message_deleted",
        {
            "message_id": message_id
        },
        room=room
    )


@socketio.on("delete_message_for_me")
def delete_message_for_me(data):
    if "user_id" not in session:
        return

    message_id = data.get("message_id")
    user_id = session["user_id"]

    if not message_id:
        return

    message = db.session.get(Message, message_id)

    if not message:
        return

    # Verify user is either sender or receiver
    if message.sender_id != user_id and message.receiver_id != user_id:
        emit("message_error", {"error": "You are not authorized to delete this message."})
        return

    try:
        existing = DeletedMessage.query.filter_by(
            message_id=message_id,
            user_id=user_id
        ).first()

        if not existing:
            deleted = DeletedMessage(
                message_id=message_id,
                user_id=user_id
            )

            db.session.add(deleted)
            db.session.commit()
    except Exception as e:
        db.session.rollback()
        emit("message_error", {"error": "Failed to delete message for you."})
        return

    emit(
        "message_deleted_for_me",
        {
            "message_id": message_id
        }
    )


@socketio.on("edit_message")
def edit_message(data):
    if "user_id" not in session:
        return

    message_id = data.get("message_id")
    new_text = (data.get("message") or "").strip()
    current_user_id = session.get("user_id")

    if not new_text or not message_id or not current_user_id:
        return

    # Limit edited length to 4000 characters
    if len(new_text) > 4000:
        new_text = new_text[:4000]

    message = db.session.get(Message, message_id)

    if not message or message.sender_id != current_user_id:
        emit("message_error", {"error": "You are not authorized to edit this message."})
        return

    try:
        message.message = new_text
        message.is_edited = True
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        emit("message_error", {"error": "Failed to update message. Please try again."})
        return

    room = f"chat_{min(message.sender_id, message.receiver_id)}_{max(message.sender_id, message.receiver_id)}"

    emit(
        "message_edited",
        {
            "message_id": message_id,
            "message": new_text,
            "is_edited": True
        },
        room=room
    )


@socketio.on("connect")
def handle_connect():
    if "user_id" in session:
        user_id = session["user_id"]
        sid = request.sid

        user_sessions[user_id].add(sid)
        sid_to_user[sid] = user_id

        emit(
            "online_users",
            {
                "users": list(user_sessions.keys())
            },
            broadcast=True
        )


@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    user_id = sid_to_user.pop(sid, None) or session.get("user_id")

    if user_id and user_id in user_sessions:
        user_sessions[user_id].discard(sid)
        if len(user_sessions[user_id]) == 0:
            user_sessions.pop(user_id, None)

        emit(
            "online_users",
            {
                "users": list(user_sessions.keys())
            },
            broadcast=True
        )


@socketio.on("typing")
def handle_typing(data):
    if "user_id" not in session:
        return

    room = data.get("room")
    if not room or not isinstance(room, str):
        return

    match = re.match(r"^chat_(\d+)_(\d+)$", room)
    if not match:
        return

    if session["user_id"] not in (int(match.group(1)), int(match.group(2))):
        return

    emit(
        "user_typing",
        {
            "username": session["username"]
        },
        room=room,
        include_self=False
    )


@socketio.on("stop_typing")
def handle_stop_typing(data):
    if "user_id" not in session:
        return

    room = data.get("room")
    if not room or not isinstance(room, str):
        return

    match = re.match(r"^chat_(\d+)_(\d+)$", room)
    if not match:
        return

    if session["user_id"] not in (int(match.group(1)), int(match.group(2))):
        return

    emit(
        "user_stop_typing",
        {},
        room=room,
        include_self=False
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="127.0.0.1", port=port, debug=True, allow_unsafe_werkzeug=True, use_reloader=False)
