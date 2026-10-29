 <div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0F172A,35:2563EB,70:7C3AED,100:06B6D4&height=230&section=header&text=PulseChat&fontSize=52&fontColor=FFFFFF&animation=fadeIn&fontAlignY=36&desc=Real-Time%20Messaging%20Platform&descSize=20&descAlignY=60&descColor=E2E8F0" width="100%" alt="PulseChat animated gradient header"/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=500&size=18&duration=2800&pause=900&color=38BDF8&center=true&vCenter=true&width=700&lines=Real-Time+Messaging+with+Flask+and+Socket.IO;Security-Focused+Full-Stack+Development;Live+Presence+%7C+Typing+%7C+Read+Receipts;Modern+Responsive+Chat+Experience" alt="Animated project description"/>

<br/>

<img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python"/>
<img src="https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask"/>
<img src="https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.IO"/>
<img src="https://img.shields.io/badge/SQLAlchemy-D71F00?style=for-the-badge&logo=sqlalchemy&logoColor=white" alt="SQLAlchemy"/>
<img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript"/>

<br/><br/>

<a href="https://github.com/vikas468368-star/real-time-chat-app">
<img src="https://img.shields.io/badge/Explore%20Repository-181717?style=for-the-badge&logo=github&logoColor=white" alt="Explore repository"/>
</a>

</div>

---

## Overview

**PulseChat** is a full-stack, real-time messaging application built with Python, Flask, Flask-SocketIO, SQLAlchemy, HTML, CSS, and JavaScript.

The application combines live communication with a responsive chat interface, user authentication, online presence, message management, and security-focused backend controls.

The goal is to create a practical messaging experience while demonstrating full-stack development, real-time event handling, database integration, and web application security.

## Key Features

### Real-Time Communication

- Instant message delivery using Flask-SocketIO.
- Online presence tracking across multiple browser tabs.
- Live typing indicators.
- Real-time message read receipts.
- Message editing and deletion.
- Reply-to-message functionality.
- Live message reactions.

### Messaging Experience

- Searchable contact list and conversation history.
- In-conversation message search.
- File and image attachments.
- Image previews and document downloads.
- Desktop notification support.
- Audio notification effects.
- Responsive interface for desktop and mobile devices.
- Dark and light themes.

### Security and Reliability

- CSRF protection for supported forms and requests.
- Password hashing using Werkzeug security utilities.
- Login rate limiting to reduce repeated password-guessing attempts.
- Server-side authorization checks for protected messaging actions.
- Input validation and message length limits.
- File upload type and size validation.
- Database constraints and indexes for data integrity.

> Security features are implemented as application-level protections. The project should undergo independent security testing before being described as production-secure.

## Technology Stack

| Technology | Purpose |
|---|---|
| Python | Backend application logic |
| Flask | Web application framework |
| Flask-SocketIO | Real-time, bidirectional communication |
| Flask-WTF | CSRF protection |
| SQLAlchemy | Database access and ORM |
| SQLite | Local development database |
| PostgreSQL | Production database configuration |
| HTML5 | Page structure |
| CSS3 | Responsive styling and themes |
| JavaScript | Chat interactions and client-side behavior |
| Gunicorn | WSGI application server |
| Eventlet | Asynchronous worker configuration |
| Render | Deployment configuration |

## Architecture

```text
+------------------------------------------+
|              User Interface              |
|         HTML, CSS and JavaScript          |
|                                          |
| Chat UI | Search | Themes | Attachments  |
+---------------------+--------------------+
                      |
             HTTP / WebSocket
                      |
+---------------------v--------------------+
|             Flask Backend                |
|                                          |
| Authentication | Validation | CSRF       |
| Messaging      | Authorization           |
| Presence       | File Uploads             |
+---------------------+--------------------+
                      |
               SQLAlchemy ORM
                      |
+---------------------v--------------------+
|                Database                  |
|                                          |
| SQLite: Local Development                |
| PostgreSQL: Production Configuration     |
+------------------------------------------+
```

## Project Structure

```text
real-time-chat-app/
|
|-- app.py
|-- requirements.txt
|-- .env.example
|-- .gitignore
|-- Procfile
|-- render.yaml
|-- LICENSE
|
|-- static/
|   |-- css/
|   |   |-- auth.css
|   |   `-- style.css
|   |-- js/
|   |   `-- chat.js
|   `-- uploads/
|
|-- templates/
|   |-- index.html
|   |-- login.html
|   `-- register.html
|
|-- tests/
|   |-- test_auth.py
|   |-- test_messaging.py
|   |-- test_presence_receipts.py
|   |-- test_edit_delete.py
|   `-- test_features_integrity.py
|
`-- README.md
```

## Getting Started

### Prerequisites

- Python 3.10 or newer, compatible with the project's dependencies.
- Git.
- A modern web browser.

### 1. Clone the Repository

```bash
git clone https://github.com/vikas468368-star/real-time-chat-app.git
cd real-time-chat-app
```

### 2. Create a Virtual Environment

**Windows PowerShell**

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**macOS or Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Dependencies

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configure Environment Variables

If `.env.example` exists in the repository, copy it to `.env`.

PowerShell:

```powershell
Copy-Item .env.example .env
```

Configure the required environment variables according to the example file and application settings. Use a strong, unique secret key and never commit credentials or production secrets to GitHub.

The local SQLite configuration can be used for development when configured by the application.

### 5. Start the Application

```bash
python app.py
```

Open the following address in your browser:

[http://127.0.0.1:5000](http://127.0.0.1:5000)

To test real-time communication, open the application in two browser sessions and sign in with separate accounts.

## Automated Testing

Run the test suite from the repository root:

```bash
python -m unittest discover tests
```

The test suite covers authentication and messaging-related behavior, including authorization, message operations, presence, and other application features.

Test coverage depends on the current contents of the `tests/` directory. Run the tests locally to verify the latest code before deployment.

## Production Deployment

The repository includes deployment configuration for Render.

General deployment process:

1. Push the latest application code to GitHub.
2. Create a new web service or Blueprint deployment in Render.
3. Configure the production database.
4. Set the required environment variables in the hosting dashboard.
5. Verify the service startup command and health of the deployed application.
6. Test login, messaging, uploads, and Socket.IO connections over HTTPS.

The production server is configured to use Gunicorn with an Eventlet worker.

```text
gunicorn --worker-class eventlet -w 1 app:app
```

Review the included `render.yaml` and `Procfile` before deploying. Their configuration should match the current application and hosting environment.

## Security Considerations

PulseChat includes several application-level security controls, but further hardening is recommended before public production use.

- Keep secret keys and database credentials outside version control.
- Use HTTPS for deployed applications.
- Validate and authorize every protected operation on the server.
- Enforce appropriate file upload limits and content validation.
- Configure secure session cookies and trusted origins.
- Test authentication, authorization, CSRF protection, and upload handling.
- Review database backups, retention, and recovery procedures.
- Evaluate rate limiting and monitoring under realistic traffic.

**Privacy note:** Do not assume that messages are end-to-end encrypted unless a dedicated end-to-end encryption design has been implemented and independently verified.

## Future Improvements

Potential improvements include:

- [ ] Add comprehensive integration and security tests.
- [ ] Improve accessibility and keyboard navigation.
- [ ] Add group conversations.
- [ ] Add message delivery and read-state refinements.
- [ ] Improve deployment monitoring and error reporting.
- [ ] Add database migration management.
- [ ] Add automated CI testing.
- [ ] Evaluate scalable multi-worker Socket.IO deployment.
- [ ] Improve attachment retention and storage management.

## Contributing

Contributions, bug reports, and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Implement and test your changes.
4. Commit your work with a clear message.
5. Open a pull request describing the changes.

## Author

**Vikas Madheshiya**

GitHub: [@vikas468368-star](https://github.com/vikas468368-star)

## License

This project is distributed under the MIT License if the repository's included `LICENSE` file confirms those terms. See [`LICENSE`](LICENSE) for details.

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:06B6D4,35:7C3AED,70:2563EB,100:0F172A&height=130&section=footer" width="100%" alt="Colorful gradient footer"/>

**PulseChat — Real-time communication, thoughtfully engineered.**

</div>
