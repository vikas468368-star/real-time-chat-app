# Project Handoff: Real-Time Chat Application

**Last Updated:** October 11, 2026  
**Application Stack:** Flask 3.1.3 • Flask-SocketIO 5.6.1 • Flask-SQLAlchemy 3.1.1 • SQLite • Vanilla JavaScript • Vanilla CSS  
**Database File:** `instance/chat.db`

---

## 1. Executive Summary

This repository contains a full-stack real-time 1-on-1 messaging web application built with Python Flask and Socket.IO. The application features user authentication, private real-time rooms, unread message tracking, presence indicators (online/offline), typing indicators, message deletion ("Delete for Me" and "Delete for Everyone"), dark/light theme switching, and real-time message editing with persistent database state.

All existing database records (users and chat histories) in `instance/chat.db` have been preserved, and the database schema has been safely upgraded with the `is_edited` column.

---

## 2. Project Directory Structure

```
real-time-chat-app/
├── app.py                            # Flask server, SQLAlchemy models, and Socket.IO handlers
├── requirements.txt                  # Python package dependencies
├── instance/
│   └── chat.db                       # Active SQLite database (users, messages, deleted_message)
├── templates/
│   ├── index.html                    # Main chat dashboard (sidebar, messages view, modals)
│   ├── login.html                    # User login form
│   └── register.html                 # New user registration form
├── static/
│   ├── css/
│   │   ├── style.css                 # Main chat layout, responsive design, dark mode tokens
│   │   └── auth.css                  # Authentication screen styling
│   └── js/
│       └── chat.js                   # Client-side Socket.IO client, message editing, UI state
├── PROJECT_HANDOFF_REAL_TIME_CHAT_APP.md # Complete project handoff and architecture guide
└── README.md                         # Project documentation
```

---

## 3. Database Models & Schema

The application uses SQLite via Flask-SQLAlchemy. The active database is located at `instance/chat.db`.

### `User` Table
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER` | Primary Key | Unique user ID |
| `username` | `VARCHAR(80)` | Unique, Not Null | Account username |
| `password` | `VARCHAR(200)` | Not Null | Hashed password (Werkzeug pbkdf2/scrypt) |

### `Message` Table
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER` | Primary Key | Unique message ID |
| `sender_id` | `INTEGER` | Not Null | User ID of message author |
| `receiver_id` | `INTEGER` | Not Null | User ID of message recipient |
| `message` | `TEXT` | Not Null | Message body content |
| `timestamp` | `DATETIME` | Default: Current UTC | Timestamp of original message |
| `is_read` | `BOOLEAN` | Default: `0` (False) | Read receipt flag |
| `is_edited` | `BOOLEAN` | Default: `0` (False) | Flag indicating if message was edited |

> **Note on Migrations:** `app.py` automatically checks for the presence of `is_edited` on startup using SQLite `PRAGMA table_info(message)` and executes an `ALTER TABLE` if missing. No data reset is required.

### `DeletedMessage` Table
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER` | Primary Key | Entry ID |
| `message_id` | `INTEGER` | Not Null | ID of message hidden for this user |
| `user_id` | `INTEGER` | Not Null | ID of user who clicked "Delete for Me" |

---

## 4. WebSocket Protocol Specification

Private rooms follow the deterministic format:
```python
room = f"chat_{min(user1_id, user2_id)}_{max(user1_id, user2_id)}"
```

### Client -> Server Events

| Event Name | Payload | Handler Logic |
|---|---|---|
| `join` | `{ "room": "chat_1_2" }` | Adds client socket to the room |
| `send_message` | `{ "room": str, "receiver_id": int, "message": str }` | Persists message to DB (`is_edited=False`), emits `receive_message` to room, and sends `new_message_notification` if recipient is online |
| `edit_message` | `{ "message_id": int, "message": str }` | Verifies user is author, updates message text, sets `is_edited = True`, commits DB, and emits `message_edited` to room |
| `delete_message` | `{ "message_id": int }` | Verifies user is author, removes message row completely from DB, and emits `message_deleted` to room |
| `delete_message_for_me` | `{ "message_id": int }` | Adds `(message_id, user_id)` to `DeletedMessage` table and emits `message_deleted_for_me` |
| `load_messages` | `{ "user_id": int }` | Fetches full conversation excluding items in `DeletedMessage`, including `is_edited` state |
| `load_unread_counts` | None | Returns dictionary of unread count grouped by sender |
| `mark_messages_read` | `{ "user_id": int }` | Sets `is_read = True` for messages sent to current user |
| `typing` | `{ "room": str }` | Broadcasts `user_typing` to other room members |
| `stop_typing` | `{ "room": str }` | Broadcasts `user_stop_typing` to other room members |

### Server -> Client Events

| Event Name | Payload | Trigger / Purpose |
|---|---|---|
| `receive_message` | `{ "id": int, "sender_id": int, "username": str, "message": str, "timestamp": str, "is_edited": bool }` | Emitted to room on incoming message |
| `message_edited` | `{ "message_id": int, "message": str, "is_edited": bool }` | Emitted to room when author edits a message |
| `message_deleted` | `{ "message_id": int }` | Emitted to room when author deletes a message for everyone |
| `message_deleted_for_me` | `{ "message_id": int }` | Emitted to sender socket when hiding message locally |
| `chat_history` | `{ "messages": [...] }` | Emitted when opening a contact |
| `online_users` | `{ "users": [user_id, ...] }` | Broadcasted on connect/disconnect |
| `unread_counts` | `{ "counts": { sender_id: count } }` | Emitted on connection |
| `new_message_notification` | Message payload | Sent directly to receiver's active SID |
| `user_typing` | `{ "username": str }` | Shows "<User> is typing..." in active chat |
| `user_stop_typing` | `{}` | Clears typing indicator |

---

## 5. Key Feature Details & Implementation Notes

### A. Message Editing (Completed)
- **Inline Input Edit Mode**: Replaced legacy browser `prompt()` with a modern edit mode:
  - Clicking "Edit" reveals the `#editingBanner` above the message bar with a preview of the text being edited and a Cancel (`✕`) button.
  - The input field is filled with the message's current text and focused with the cursor placed at the end.
  - Pressing `Enter` or clicking the checkmark (`✓`) button submits the edit via `edit_message`.
  - Pressing `Escape` or clicking `✕` cancels the edit cleanly.
- **Dynamic Text Updates**: If a message is edited multiple times, subsequent clicks on "Edit" grab the latest text rather than the initial version.
- **Visual `(edited)` Label**: An inline badge appears next to the timestamp (e.g., `10:32 AM (edited)`) both in real time and upon reloading history from SQLite.
- **Highlight Animation**: Edited messages briefly trigger a subtle glow pulse (`message-edited-highlight`) when updated.

### B. Message Deletion (Preserved & Enhanced)
- Retains both **"Delete for Me"** (stored in `DeletedMessage`) and **"Delete for Everyone"** (permanent removal).
- Replaced prompt dialog with a styled modal card (`#deleteModal`):
  - Sender sees "Delete for Me", "Delete for Everyone", and "Cancel".
  - Recipient only sees "Delete for Me" and "Cancel".
- Smooth fade-and-shrink removal animation (`message-deleted-animate`).

### C. Advanced UI & Design Overhaul (PulseChat)
- **Design System & Typography**: Integrated Google Font `Plus Jakarta Sans` with carefully curated CSS variables for both light and dark themes.
- **Glassmorphism & Depth**: Uses `backdrop-filter: blur(...)` for the top navigation bar, message dock, and modals.
- **Floating Quick-Action Pills**: Clean hover-triggered action pills (`floating-action-pill`) with Edit and Delete icons instead of bulky inline buttons.
- **Dynamic Avatar Generation**: Computes harmonious gradient palettes for each user deterministically based on their username.
- **Live Status Beacons**: Pulsing radar wave animation on active users (`pulse-beacon` / `beaconPulse`).
- **Interactive Typing Wave**: Replaced plain italic text with an animated 3-dot wave bouncing bubble.
- **Floating Input Dock & Emoji Shelf**: Redesigned capsule dock with quick-insert emoji shelf (👋 👍 ❤️ 😂 🔥 🎉 🚀 ✨ 💯) and smooth send/save micro-interactions.
- **Luxury Authentication Screens**: Glassmorphic auth cards with ambient multi-point radial mesh gradients for `/login` and `/register`.

### D. Live Presence & Typing
- Tracks active socket IDs in `online_users` dict in memory.
- Typing emits after each keystroke with a 1.2s inactivity debounce.

### E. Contact Search & Filtering
- `#searchInput` instantly filters contacts in the sidebar in real time without server reloads, with `/` keyboard shortcut.

### F. Theme Management
- `#themeToggle` button toggles between Light and Dark mode using `data-theme="dark"`.
- Preference is saved in browser `localStorage.getItem("chat_theme")`.

### G. Authentication & Logout
- Dedicated logout button (`⏻`) added to the profile bar, redirecting to `/logout`.

---

## 6. How to Run & Test

### 1. Start the Flask-SocketIO Server
Activate the virtual environment if needed and run:
```bash
python app.py
```
The server will start on `http://127.0.0.1:5000` with WebSocket support enabled.

### 2. Available Test Accounts
The database `instance/chat.db` has pre-existing test accounts:
- `vikas`
- `rahul`
- `manjeet`

You can also register any new account directly via `/register`.

### 3. Verification Steps
1. Open two browser windows (one standard and one Incognito).
2. Log in as `vikas` in window 1, and `rahul` in window 2.
3. Select each other from the contacts list.
4. Send a message from `vikas` to `rahul`.
5. Hover over the message in `vikas`'s window and click **Edit**.
6. Modify the text and press **Enter** (or click `✓`).
7. Observe the updated text and `(edited)` indicator appear instantly in both windows.
8. Refresh either browser window to confirm persistent database state.
9. Click **Delete** on a message to test modal options ("Delete for Me" vs "Delete for Everyone").

---

## 7. Recommended Next Enhancements
1. **File & Image Attachments**: Allow sending photos or documents using Flask upload routes and Socket.IO metadata.
2. **Message Reactions**: Emoji reactions (👍, ❤️, 😂) attached to messages.
3. **Voice Notes / Audio Recording**: Media recorder API integration for voice memos.
4. **Group Conversations**: Rooms with multiple participants and member rosters.
