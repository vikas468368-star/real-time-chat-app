<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0F172A,50:2563EB,100:06B6D4&height=220&section=header&text=PulseChat&fontSize=46&fontColor=FFFFFF&animation=fadeIn&fontAlignY=38&desc=Production-Ready%20Real-Time%20Messaging%20Platform&descSize=16&descAlignY=58&descColor=E2E8F0" width="100%" alt="PulseChat Header" />

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=500&size=18&duration=3000&pause=1000&color=2563EB&center=true&vCenter=true&width=650&lines=Full-Stack+Real-Time+Messaging;Flask+%7C+Flask-SocketIO+%7C+PostgreSQL;Live+Typing+%7C+Reactions+%7C+Read+Receipts;Searchable+History+%7C+File+Attachments+%7C+Replies" alt="PulseChat Features Typing SVG" />

<p>
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/Flask-3.1.3-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask" />
  <img src="https://img.shields.io/badge/Socket.IO-4.8.1-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/SQLAlchemy-3.1.1-D71F00?style=for-the-badge&logo=sqlalchemy&logoColor=white" alt="SQLAlchemy" />
  <img src="https://img.shields.io/badge/Gunicorn-26.1.0-499848?style=for-the-badge&logo=gunicorn&logoColor=white" alt="Gunicorn" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License" />
</p>

**PulseChat is a modern, responsive, full-stack real-time messaging application engineered with Flask, Flask-SocketIO, SQLAlchemy, and vanilla modern JavaScript.**

<p>
  <a href="#key-features">Key Features</a> ·
  <a href="#architecture--tech-stack">Tech Stack</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#automated-testing">Testing</a> ·
  <a href="#production-deployment">Deployment</a> ·
  <a href="#license">License</a>
</p>

</div>

---

## Key Features

### ⚡ Real-Time Messaging & Presence
- **Bidirectional WebSocket Communication:** Powered by Flask-SocketIO with automatic HTTP long-polling fallback.
- **Multi-Tab Presence Tracking:** Tracks multiple tabs/devices per user using session-mapped connection sets (`user_sessions = defaultdict(set)`). Users remain online until their last active device disconnects.
- **Live Typing Wave Indicator:** Micro-animated typing wave anchored above the dock with debounced auto-stop timers.
- **Real-Time Read Receipts:** Visual checkmarks automatically update from single sent checkmark to double cyan ticks (`✓✓`) live upon recipient view.
- **Message Editing & Deletion:**
  - In-place message edits with live broadcast and visual pulse animations.
  - "Delete for Everyone" permanently removes messages and unlinks replies.
  - "Delete for Me" hides messages for the requesting user while preserving history for other participants.

### 🔍 Search & Rich Interaction
- **Sidebar Contact Search:** Case-insensitive search filters direct messages in real time with `/` keyboard shortcut.
- **In-Conversation Content Search:** Press `Ctrl+F` (or header search icon) to search within active conversations, highlight matches (`<mark>`), view match counts (e.g., `2 of 7`), and navigate matches with `▲` / `▼`.
- **Quote Replies:** Reply to any message with an interactive quote preview banner. Clicking quotes jumps and smoothly scrolls to the target message with an ambient glow pulse.
- **Emoji Reactions:** Quick reaction popover with common emojis (`👍`, `❤️`, `😂`, `😮`, `😢`, `🔥`, etc.). Reactions aggregate live with user-reacted badge indicators.
- **File & Image Attachments:** Secure file upload endpoint with MIME/extension whitelist, max size validation (15MB), inline image previews with full-screen lightbox modal, and downloadable document cards.
- **Audio & Push Alerts:** Zero-dependency audio chime synthesized via Web Audio API alongside desktop Web Notifications support.

### 🛡️ Security & Reliability
- **CSRF Protection:** Integrated Flask-WTF CSRF protection across all web forms and asynchronous file uploads.
- **Brute-Force Rate Limiting:** Enforces a 5-attempt / 5-minute IP lockout on failed logins to prevent credential stuffing.
- **Password Hashing:** Passwords securely hashed with salted Werkzeug crypto hashing (`scrypt`/`pbkdf2`).
- **Authorization Enforcement:** Authoritative server-side authorization checks on all room joins, message dispatches, edits, and deletions.
- **Database Indexing & Integrity:** Composite foreign-key indexes (`sender_id`, `receiver_id`, `timestamp`) and unique constraints prevent N+1 queries and duplicate record creation.

---

## Architecture & Tech Stack

```text
┌────────────────────────────────────────────────────────┐
│                   Client Layer                         │
│  HTML5 + Vanilla CSS Design System + ES6 JavaScript     │
│  • Theme Persistence (Dark / Light)                    │
│  • Web Audio API Synthesizer                           │
│  • History State API for Mobile Back Navigation        │
└───────────────────────────┬────────────────────────────┘
                            │ WebSocket / REST API
┌───────────────────────────▼────────────────────────────┐
│                   Server Layer                         │
│  Python 3 + Flask 3.1.3 + Flask-SocketIO 5.6.1         │
│  • Flask-WTF (CSRF Protection)                         │
│  • Gunicorn + Eventlet (Production WSGI)              │
│  • In-Memory Presence & Sockets Multi-Tab Engine       │
└───────────────────────────┬────────────────────────────┘
                            │ SQLAlchemy ORM
┌───────────────────────────▼────────────────────────────┐
│                   Database Layer                       │
│  SQLite (Local Development) / PostgreSQL (Production)  │
│  • Users, Messages, DeletedMessages, Reactions         │
└────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- Python 3.10+
- Git

### 1. Clone & Navigate
```bash
git clone https://github.com/vikas468368-star/real-time-chat-app.git
cd real-time-chat-app
```

### 2. Set Up Virtual Environment
```bash
# Windows
python -m venv venv
.\venv\Scripts\Activate.ps1

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment
```bash
# Copy example environment configuration
cp .env.example .env
```
Edit `.env` if desired (defaults work out of the box with local SQLite).

### 5. Launch Development Server
```bash
python app.py
```
Open **[http://127.0.0.1:5000](http://127.0.0.1:5000)** in your browser.

---

## Automated Testing

PulseChat contains a comprehensive automated test suite in `tests/`:

```bash
python -m unittest discover tests
```

### Test Coverage
- `tests/test_auth.py`: Registration validation, duplicate checks, brute force lockout, and logout.
- `tests/test_messaging.py`: Real-time private delivery, room isolation, length capping, and chronological history.
- `tests/test_presence_receipts.py`: Multi-tab tracking, typing events, and live read receipts.
- `tests/test_edit_delete.py`: Author editing authorization, Delete for Me isolation, and Delete for Everyone purge.
- `tests/test_features_integrity.py`: Secure uploads, reply linking, emoji reactions, and cascade cleanup.

---

## Production Deployment

### Option A: Render (One-Click Blueprint)
1. Push your repository to GitHub.
2. In [Render](https://render.com), create a **New Blueprint Instance**.
3. Select this repository. The included [`render.yaml`](render.yaml) automatically provisions:
   - A managed PostgreSQL database.
   - A Web Service with Gunicorn + Eventlet worker.
   - Auto-generated `SECRET_KEY` and connection string injection.

### Option B: Railway / Heroku / Container
The included [`Procfile`](Procfile) specifies the production entrypoint:
```text
web: gunicorn --worker-class eventlet -w 1 app:app
```

Environment variables to configure in your production dashboard:
- `SECRET_KEY`: A strong, randomly generated secret string.
- `DATABASE_URL`: Connection URI for your managed PostgreSQL database (`postgresql://...`).
- `FLASK_ENV`: Set to `production` (enables secure HTTPS cookies).

---

## Repository Structure

```text
real-time-chat-app/
├── app.py                     # Core Flask & Socket.IO server and ORM models
├── requirements.txt           # Lean production runtime dependencies
├── Procfile                   # Gunicorn WSGI startup configuration
├── render.yaml                # Render cloud deployment blueprint
├── .env.example               # Environment variable template
├── LICENSE                    # MIT License
├── static/
│   ├── css/
│   │   ├── auth.css           # Authentication layout and alert styles
│   │   └── style.css          # Design system, glassmorphism, responsive styles
│   ├── js/
│   │   └── chat.js            # Real-time client state, sound, and search engine
│   └── uploads/               # User attachment directory
├── templates/
│   ├── index.html             # Chat app shell and interactive dock
│   ├── login.html             # Login view with CSRF alerts
│   └── register.html          # Registration view with client validation
└── tests/
    ├── test_auth.py
    ├── test_messaging.py
    ├── test_presence_receipts.py
    ├── test_edit_delete.py
    └── test_features_integrity.py
```

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
<sub>Designed and developed by <b>Vikas Madheshiya</b></sub>
</div>
