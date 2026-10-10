 <div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0F172A,50:2563EB,100:06B6D4&height=220&section=header&text=Real-Time%20Chat%20App&fontSize=42&fontColor=FFFFFF&animation=fadeIn&fontAlignY=38&desc=Connect.%20Communicate.%20Collaborate.&descSize=16&descAlignY=58&descColor=E2E8F0" width="100%" alt="Real-Time Chat App animated header" />

<a href="https://github.com/vikas468368-star/real-time-chat-app">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=500&size=18&duration=3000&pause=1000&color=2563EB&center=true&vCenter=true&width=650&lines=Real-Time+Communication;Private+Messaging;Flask+%7C+Python+%7C+JavaScript;Built+for+Simple+and+Fast+Conversations" alt="Animated project introduction" />
</a>

<p>
  <a href="https://github.com/vikas468368-star/real-time-chat-app"><img src="https://img.shields.io/badge/Python-3.x-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" /></a>
  <a href="https://flask.palletsprojects.com/"><img src="https://img.shields.io/badge/Flask-Web_Framework-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask" /></a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript"><img src="https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" /></a>
  <a href="https://www.sqlite.org/"><img src="https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" /></a>
</p>

<p>
  A web-based messaging application designed to make communication simple through private conversations, user accounts, and an interactive chat interface.
</p>

<p>
  <a href="https://github.com/vikas468368-star/real-time-chat-app">View Repository</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#features">Features</a>
</p>

</div>

---

## Overview

The **Real-Time Chat App** is a Flask-based web application that provides a platform for users to communicate through private conversations. It combines a Python backend, a database-backed messaging system, and a browser-based interface.

The project focuses on practical web development concepts, including user authentication, message management, persistent data storage, frontend interactions, and Git-based version control.

## Features

| Feature | Description |
|---|---|
| User Authentication | Registration and login pages for user access. |
| Private Messaging | Select a user and communicate through individual conversations. |
| Message Persistence | Store conversations in a database for later retrieval. |
| Online Status | Display user availability in the chat interface. |
| Typing Indicator | Show when another user is typing. |
| Unread Messages | Track unread messages for conversations. |
| Message Editing | Modify previously sent messages. |
| Message Deletion | Delete messages with supported deletion options. |
| Responsive Interface | Dedicated chat layout with contact list and conversation area. |
| Theme Interface | Theme-toggle control in the chat interface. |

## Technology Stack

<div align="center">

| Layer | Technology |
|---|---|
| Backend | Python, Flask |
| Frontend | HTML5, CSS3, JavaScript |
| Database | SQLite |
| UI Rendering | Jinja2 Templates |
| Development Tools | VS Code, PowerShell, Git |
| Source Control | Git and GitHub |

</div>

## Project Structure

```text
real-time-chat-app/
|
|-- app.py
|-- requirements.txt
|-- .gitignore
|
|-- static/
|   |-- css/
|   |   |-- auth.css
|   |   |-- style.css
|   |
|   |-- js/
|       |-- chat.js
|
|-- templates/
|   |-- index.html
|   |-- login.html
|   |-- register.html
|
|-- instance/          # Local database and application data
|-- venv/              # Local Python virtual environment
```

The `instance/` and `venv/` directories are local development resources and are excluded from version control.

## Installation

### Prerequisites

Install the following before running the application:

- Python 3.x
- Git
- A terminal such as PowerShell
- A modern web browser

### 1. Clone the repository

```bash
git clone https://github.com/vikas468368-star/real-time-chat-app.git
```

### 2. Open the project directory

```bash
cd real-time-chat-app
```

### 3. Create a virtual environment

```powershell
python -m venv venv
```

### 4. Activate the virtual environment

On Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, you can invoke the environment's Python executable directly instead.

### 5. Install dependencies

```powershell
python -m pip install -r requirements.txt
```

### 6. Start the application

```powershell
python app.py
```

Open the local address shown in your terminal. For a typical Flask development server, this may be:

```text
http://127.0.0.1:5000
```

The actual address depends on the application's configuration.

## How It Works

```text
User opens the application
          |
          v
Registration or Login
          |
          v
Chat Interface
          |
          v
Select a Conversation
          |
          v
Send or Receive Messages
          |
          v
Backend Processes the Request
          |
          v
Database Stores Message Data
          |
          v
Conversation Displays Messages
```

The backend manages application requests and data, while the frontend presents contacts and conversations. Database storage allows message information to persist beyond a single page interaction.

## Learning Objectives

This project provides practical experience with:

- Building web applications using Flask.
- Creating registration and login interfaces.
- Working with relational databases and SQL.
- Connecting HTML, CSS, and JavaScript to a Python backend.
- Managing chat messages and conversation state.
- Organizing code into templates, static assets, and backend logic.
- Using Git and GitHub to maintain a project repository.

## Security Considerations

Before deploying this project publicly:

- Store secret keys and credentials in environment variables.
- Never commit `.env` files, local databases, or virtual environments.
- Use appropriate password hashing and session configuration.
- Validate and authorize every message-editing and deletion request.
- Apply CSRF protection where applicable.
- Use HTTPS in production.
- Review debug mode and development-server settings before deployment.

## Future Improvements

Potential extensions include:

- WebSocket-based messaging for lower-latency communication.
- Group conversations and group administration.
- Image and document sharing.
- Message replies and reactions.
- Searchable conversation history.
- Notifications for incoming messages.
- Improved mobile layouts and accessibility.
- Production deployment with a managed database.

These are possible future enhancements, not claims that every feature is already implemented.

## Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test the application.
5. Submit a pull request describing your changes.

## Author

**Vikas Madheshiya**

GitHub: [@vikas468368-star](https://github.com/vikas468368-star)

## License

No license has been specified for this repository yet. Add a `LICENSE` file if you want to define the terms under which others may use, modify, or distribute this project.

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:06B6D4,50:2563EB,100:0F172A&height=110&section=footer" width="100%" alt="Decorative animated gradient footer" />

<sub>Designed for clear communication and practical web development.</sub>

</div>
