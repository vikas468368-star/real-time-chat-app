from flask import Flask, render_template, request, redirect, url_for, session
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit, join_room
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)

app.config["SECRET_KEY"] = "chat-app-secret-key"
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///chat.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*")
online_users = {}

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, nullable=False)
    receiver_id = db.Column(db.Integer, nullable=False)
    message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=db.func.current_timestamp())
    is_read = db.Column(db.Boolean, default=False)

class DeletedMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.Integer, nullable=False)

with app.app_context():
    db.create_all()


@app.route("/")
def home():
    if "user_id" not in session:
        return redirect(url_for("login"))

    users = User.query.filter(User.id != session["user_id"]).all()
    print("LOGGED-IN USER:", session.get("username"))
    print("CONTACTS FOUND:", [user.username for user in users])

    return render_template(
        "index.html",
        username=session["username"],
        users=users
    )


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        existing_user = User.query.filter_by(username=username).first()

        if existing_user:
            return "Username already exists"

        hashed_password = generate_password_hash(password)

        user = User(
            username=username,
            password=hashed_password
        )

        db.session.add(user)
        db.session.commit()

        return redirect(url_for("login"))

    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        user = User.query.filter_by(username=username).first()

        if user and check_password_hash(user.password, password):
            session["user_id"] = user.id
            session["username"] = user.username

            return redirect(url_for("home"))

        return "Invalid username or password"

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@socketio.on("join")
def handle_join(data):
    room = data["room"]
    join_room(room)


@socketio.on("send_message")
def handle_message(data):
    room = data["room"]
    message = data["message"]

    sender_id = session["user_id"]
    receiver_id = data["receiver_id"]

    new_message = Message(
        sender_id=sender_id,
        receiver_id=receiver_id,
        message=message,
        is_read=False
    )

    db.session.add(new_message)
    db.session.commit()

    message_data = {
        "id": new_message.id,
        "sender_id": sender_id,
        "username": session["username"],
        "message": message,
        "timestamp": new_message.timestamp.strftime("%I:%M %p")
    }

    emit(
        "receive_message",
        message_data,
        room=room
    )

    receiver_sid = online_users.get(receiver_id)

    if receiver_sid:
        emit(
            "new_message_notification",
            message_data,
            to=receiver_sid
        )

@socketio.on("load_messages")
def load_messages(data):
    current_user_id = session["user_id"]
    other_user_id = data["user_id"]

    messages = Message.query.filter(
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
    ).order_by(Message.timestamp.asc()).all()

    history = []

    for msg in messages:
        deleted = DeletedMessage.query.filter_by(
            message_id=msg.id,
            user_id=current_user_id
        ).first()

        if deleted:
            continue

        sender = User.query.get(msg.sender_id)

        history.append({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "username": sender.username,
            "message": msg.message,
            "timestamp": msg.timestamp.strftime("%I:%M %p")
        })

    emit("chat_history", {"messages": history})
@socketio.on("load_unread_counts")
def load_unread_counts():
    current_user_id = session["user_id"]

    messages = Message.query.filter_by(
        receiver_id=current_user_id,
        is_read=False
    ).all()

    unread_counts = {}

    for msg in messages:
        if msg.sender_id not in unread_counts:
            unread_counts[msg.sender_id] = 0

        unread_counts[msg.sender_id] += 1

    emit(
        "unread_counts",
        {
            "counts": unread_counts
        }
    )
@socketio.on("mark_messages_read")
def mark_messages_read(data):
    current_user_id = session["user_id"]
    sender_id = data["user_id"]

    Message.query.filter_by(
        sender_id=sender_id,
        receiver_id=current_user_id,
        is_read=False
    ).update({
        "is_read": True
    })

    db.session.commit()
@socketio.on("delete_message")
def delete_message(data):
    message_id = data["message_id"]
    current_user_id = session["user_id"]

    message = Message.query.get(message_id)

    if not message:
        return

    if message.sender_id != current_user_id:
        return

    Message.query.filter_by(id=message_id).delete()
    db.session.commit()

    room = (
        "chat_" +
        str(min(message.sender_id, message.receiver_id)) +
        "_" +
        str(max(message.sender_id, message.receiver_id))
    )

    emit(
        "message_deleted",
        {
            "message_id": message_id
        },
        room=room
    )
@socketio.on("delete_message_for_me")
def delete_message_for_me(data):
    message_id = data["message_id"]
    user_id = session["user_id"]

    message = Message.query.get(message_id)

    if not message:
        return

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

    emit(
        "message_deleted_for_me",
        {
            "message_id": message_id
        }
    )

@socketio.on("edit_message")
def edit_message(data):
    message_id = data["message_id"]
    new_text = data["message"].strip()
    current_user_id = session["user_id"]

    if not new_text:
        return

    message = Message.query.get(message_id)

    if not message:
        return

    if message.sender_id != current_user_id:
        return

    message.message = new_text
    db.session.commit()

    room = (
        "chat_" +
        str(min(message.sender_id, message.receiver_id)) +
        "_" +
        str(max(message.sender_id, message.receiver_id))
    )

    emit(
        "message_edited",
        {
            "message_id": message_id,
            "message": new_text
        },
        room=room
    )

@socketio.on("connect")
def handle_connect():
    if "user_id" in session:
        user_id = session["user_id"]

        online_users[user_id] = request.sid

        emit(
            "online_users",
            {
                "users": list(online_users.keys())
            },
            broadcast=True
        )


@socketio.on("disconnect")
def handle_disconnect():
    if "user_id" in session:
        user_id = session["user_id"]

        online_users.pop(user_id, None)

        emit(
            "online_users",
            {
                "users": list(online_users.keys())
            },
            broadcast=True
        )
@socketio.on("typing")
def handle_typing(data):
    print("TYPING EVENT:", session["username"], data["room"])

    emit(
        "user_typing",
        {
            "username": session["username"]
        },
        room=data["room"],
        include_self=False
    )

@socketio.on("stop_typing")
def handle_stop_typing(data):
    emit(
        "user_stop_typing",
        {},
        room=data["room"],
        include_self=False
    )
if __name__ == "__main__":
    socketio.run(app, debug=True)