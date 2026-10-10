 <div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0F172A,50:2563EB,100:06B6D4&height=220&section=header&text=Real-Time%20Chat%20App&fontSize=42&fontColor=FFFFFF&animation=fadeIn&fontAlignY=38&desc=Connect.%20Communicate.%20Collaborate.&descSize=16&descAlignY=58&descColor=E2E8F0" width="100%" alt="Real-Time Chat App Header" />

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=500&size=18&duration=3000&pause=1000&color=2563EB&center=true&vCenter=true&width=650&lines=Real-Time+Communication;Private+Messaging;Flask+%7C+Python+%7C+JavaScript;Built+for+Simple+and+Fast+Conversations" alt="Animated Project Introduction" />

<p>
  <img src="https://img.shields.io/badge/Python-3.x-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/Flask-Web_Framework-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask" />
  <img src="https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
</p>

**A web-based messaging application for private conversations, interactive communication, and persistent chat history.**

<p>
  <a href="#features">Features</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#project-structure">Project Structure</a> ·
  <a href="#future-improvements">Future Improvements</a>
</p>

</div>

---

## Overview

Real-Time Chat App is a web-based messaging project built with Python, Flask, HTML, CSS, JavaScript, and SQLite. It provides an interactive interface for users to access their accounts, select contacts, and communicate through private conversations.

The project combines backend development, database management, user authentication, and frontend interactions in one application.

It is designed as a practical full-stack web development project that can be extended with additional communication features and production-ready infrastructure.

## Features

| Feature | Description |
|---|---|
| User Authentication | Registration, login, and user sessions. |
| Private Messaging | Communicate with individual users. |
| Persistent Chat History | Store and retrieve messages using a database. |
| Online Status | Display user availability. |
| Typing Indicator | Indicate when another user is typing. |
| Unread Messages | Track unread messages in conversations. |
| Message Editing | Edit previously sent messages, subject to application permissions. |
| Message Deletion | Delete messages using supported deletion options. |
| Responsive Interface | Chat layout with contacts and a conversation area. |
| Theme Controls | Theme-toggle interface, depending on the current implementation. |

Feature availability may depend on the current code and configuration. Verify each feature in the running application before treating it as production-ready.

## Technology Stack

<div align="center">

| Layer | Technology |
|---|---|
| Backend | Python, Flask |
| Real-Time Communication | Flask-SocketIO, if enabled in the current configuration |
| Frontend | HTML5, CSS3, JavaScript |
| Database | SQLite |
| Templates | Jinja2 |
| Development Environment | VS Code, PowerShell |
| Version Control | Git and GitHub |

</div>

## Project Structure

```text
real-time-chat-app/
│
├── app.py
├── requirements.txt
├── README.md
├── .gitignore
│
├── static/
│   ├── css/
│   │   ├── auth.css
│   │   └── style.css
│   │
│   └── js/
│       └── chat.js
│
├── templates/
│   ├── index.html
│   ├── login.html
│   └── register.html
│
├── instance/       # Local application data, if configured
└── venv/           # Local Python virtual environment
```

The structure above reflects the known project files. Additional files may exist in your local repository.

## Installation

### Prerequisites

Install the following:

- Python 3.x
- Git
- A modern web browser
- Windows PowerShell or another terminal

### 1. Clone the repository

```powershell
git clone https://github.com/vikas468368-star/real-time-chat-app.git
```

### 2. Open the project directory

```powershell
cd real-time-chat-app
```

### 3. Create a virtual environment

```powershell
python -m venv venv
```

### 4. Activate the environment

```powershell
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, use the environment's Python executable directly for the following commands.

### 5. Install dependencies

```powershell
python -m pip install -r requirements.txt
```

### 6. Start the application

```powershell
python app.py
```

Open the local URL displayed in the terminal. For a typical Flask development configuration, it may be:

```text
http://127.0.0.1:5000
```

The actual URL depends on your application configuration.

## How It Works

```text
        User Opens Application
                 |
                 v
       Register or Log In
                 |
                 v
         Open Chat Interface
                 |
                 v
       Select a Conversation
                 |
                 v
        Send or Receive Message
                 |
                 v
       Backend Processes Message
                 |
                 v
      Database Stores Chat History
                 |
                 v
      Conversation Updates in UI
```

The frontend provides the chat interface, while the backend processes requests and manages application data. The database supports persistent storage, allowing messages to be retrieved after a page refresh or a later session.

When configured, Socket.IO can support real-time communication between connected users.

## Security Considerations

Before making the application publicly accessible:

- Keep secret keys and credentials in environment variables.
- Never commit `.env` files, database files, or virtual environments.
- Use secure password hashing.
- Validate and authorize message editing and deletion on the server.
- Protect authenticated routes and user sessions.
- Configure CSRF protection where applicable.
- Use HTTPS in production.
- Disable Flask debug mode in production.
- Validate file uploads if attachments are introduced.
- Apply appropriate access controls to private conversations.

## Future Improvements

The following are potential extensions, not claims that they are already implemented.

- Group chats and group administration.
- Image and document sharing.
- Message replies and emoji reactions.
- Searchable chat history.
- Desktop or browser notifications.
- Improved mobile navigation and accessibility.
- Automated tests for authentication and messaging.
- Production deployment with a managed database.
- Stronger monitoring, logging, and error handling.

## Learning Objectives

This project provides practical experience with:

- Building a web application with Flask.
- Creating registration and login workflows.
- Connecting a frontend to a Python backend.
- Working with relational databases.
- Managing messages and conversation state.
- Implementing real-time interactions.
- Organizing templates, static files, and backend logic.
- Maintaining a project with Git and GitHub.

## Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Implement your changes.
4. Test the application.
5. Submit a pull request with a description of the changes.

## Author

**Vikas Madheshiya**

GitHub: [@vikas468368-star](https://github.com/vikas468368-star)

Project Repository: [Real-Time Chat App](https://github.com/vikas468368-star/real-time-chat-app)

## License

No license has been specified in this README. Add a `LICENSE` file if you want to define the terms under which others may use, modify, and distribute the project.

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:06B6D4,50:2563EB,100:0F172A&height=110&section=footer" width="100%" alt="Decorative Gradient Footer" />

<sub>Built for clear communication and practical full-stack development.</sub>

</div>
