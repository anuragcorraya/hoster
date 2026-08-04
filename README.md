# MADDOX CLOUD

MADDOX CLOUD is an open-source, free PaaS inspired by Railway.app. It provides a simple UI to create, deploy, and monitor projects running in Docker containers. The system uses a Telegram Bot as a backup datastore and collects local server stats for monitoring.

Important constraints:
- No login / signup.
- No Firebase or paid services.
- Uses only free/open-source technologies.
- Frontend: HTML / CSS / JavaScript.
- Backend: Node.js + Express.
- Container runtime: Docker.

Features
- Dark glass-style dashboard UI
- Project create / deploy / start / stop / restart / delete
- Deployment by uploading ZIP files
- Automatic project type detection (static / node / python)
- Docker-based isolation
- Logs viewer (streaming via WebSocket)
- Server resource monitoring (CPU, RAM, disk, network, uptime)
- Telegram Bot backup for storing project data and history

Prerequisites
- Linux / macOS / Windows with Docker installed and running
- Node.js 18+
- A Telegram Bot token and a chat_id (private group or channel). Bot must be added to the chat.

Quick install (development)
1. Clone or copy this repo locally.
2. Configure env variables (create `.env` at project root):
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   TELEGRAM_CHAT_ID=-1001234567890
   PORT=3000
   PROXY_BASE=/   # optional, base path
3. Install:
   cd backend
   npm install
4. Start server:
   npm run dev
5. Open http://localhost:3000

Folder structure
- frontend/
  - index.html
  - style.css
  - app.js
- backend/
  - server.js
  - package.json
  - api/
    - telegram/
      - database.js
    - deployment/
      - deployment.js
    - docker/
      - dockerManager.js
    - monitor/
      - monitor.js
    - logs/
      - logs.js
  - db/
    - index.json (auto-created)
  - uploads/ (uploaded zips)
  - projects/ (extracted projects)
  - static/ (served frontend)

Security note
- This is a demo/dev platform. Running arbitrary uploads and starting containers can be dangerous. Run inside an isolated environment (VM) and restrict network access. Add authentication and input validation before exposing to public.

Telegram DB details
- The Telegram DB module stores entries in a local JSON index file and posts a copy to a configured Telegram chat for redundancy. The local index is used for reads and updates. See backend/api/telegram/database.js.

How deployments work
- Upload ZIP via `/api/project/create`.
- Backend extracts ZIP to `backend/projects/<id>`.
- Detects project type:
  - Static (no package.json / .py): served by nginx-alike static server (simple http-server inside container)
  - Node.js (package.json present): builds image using Node base image and runs `npm start` or `node index.js`
  - Python (requirements.txt or .py): uses python base image and attempts to run `gunicorn` or `python main.py`
- Docker image is built and container started. Backend reverse-proxies requests to `/p/:projectId/*` to the container port.
- Logs are available through `/ws/logs/:projectId`.

Limitations & future improvements
- Add an auth layer and safe upload sandboxing.
- Use a proper DB (sqlite/postgres) optionally while keeping Telegram backup.
- Better project type detection and custom Dockerfile templates.
- Manage resource limits (cgroups) for containers.

If you'd like, I can:
- Expand type detection
- Add a demo project and example uploads
- Add production-ready reverse proxy (nginx) config and recommended firewall rules
