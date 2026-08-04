// backend/server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');
const WebSocket = require('ws');

const TelegramDB = require('./api/telegram/database');
const Deployment = require('./api/deployment/deployment');
const DockerManager = require('./api/docker/dockerManager');
const Monitor = require('./api/monitor/monitor');
const Logs = require('./api/logs/logs');

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PROJECTS_DIR = path.join(__dirname, 'projects');
const STATIC_DIR = path.join(__dirname, '..', 'frontend');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

const db = new TelegramDB({
  token: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || ''
});

const docker = new DockerManager();
const deploy = new Deployment({ projectsDir: PROJECTS_DIR, docker });
const monitor = new Monitor();
const logs = new Logs({ docker });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(STATIC_DIR));

// file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// API routes

// Create project (upload ZIP)
app.post('/api/project/create', upload.single('zip'), async (req, res) => {
  try {
    const { projectName } = req.body;
    if (!req.file) return res.status(400).json({ error: 'ZIP file required' });

    const id = uuidv4();
    const destZip = req.file.path;
    const projectDir = path.join(PROJECTS_DIR, id);

    await deploy.extractZip(destZip, projectDir);
    const type = await deploy.detectProjectType(projectDir);
    const created = {
      id,
      projectName: projectName || 'Untitled Project',
      framework: type,
      status: 'created',
      deploymentTime: new Date().toISOString(),
      logs: []
    };

    await db.saveData(created);
    res.json({ ok: true, project: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// List projects
app.get('/api/project/list', async (req, res) => {
  try {
    const all = await db.getData();
    res.json({ ok: true, projects: all });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deploy project (build image + run container)
app.post('/api/project/deploy', express.json(), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });

    const project = await db.searchData(id);
    if (!project) return res.status(404).json({ error: 'project not found' });

    const projectDir = path.join(PROJECTS_DIR, id);
    const result = await deploy.buildAndRun(projectDir, id);
    project.status = 'running';
    project.lastDeployed = new Date().toISOString();
    project.container = result.containerId;
    await db.updateData(id, project);
    res.json({ ok: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Start / stop / restart / delete
app.post('/api/project/start', express.json(), async (req, res) => {
  try {
    const { id } = req.body;
    await docker.startContainerByProjectId(id);
    const project = await db.searchData(id);
    if (project) { project.status = 'running'; await db.updateData(id, project); }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/project/stop', express.json(), async (req, res) => {
  try {
    const { id } = req.body;
    await docker.stopContainerByProjectId(id);
    const project = await db.searchData(id);
    if (project) { project.status = 'stopped'; await db.updateData(id, project); }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/project/restart', express.json(), async (req, res) => {
  try {
    const { id } = req.body;
    await docker.restartContainerByProjectId(id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/project/delete', express.json(), async (req, res) => {
  try {
    const { id } = req.body;
    await docker.removeContainerByProjectId(id);
    const project = await db.searchData(id);
    if (project) await db.deleteData(id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Server status
app.get('/api/server/status', async (req, res) => {
  try {
    const status = await monitor.getStatus();
    res.json(status);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Logs list
app.get('/api/logs', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const logsText = await logs.getRecentLogs(id);
    res.json({ ok: true, logs: logsText });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Proxy route for projects: /p/:id/*
app.use('/p/:id', async (req, res, next) => {
  const id = req.params.id;
  // find container port for project
  const target = await docker.getProxyTargetForProject(id);
  if (!target) return res.status(404).send('Project not running');
  // create proxy
  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (path, req) => path.replace(`/p/${id}`, '/')
  });
  proxy(req, res, next);
});

// WebSocket servers for logs and monitor
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  // simple protocol: first message {type: 'logs'|'monitor', id: '...'}
  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'monitor') {
        // send periodic status
        const iv = setInterval(async () => {
          const s = await monitor.getStatus();
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'monitor', status: s }));
        }, 2000);
        ws.on('close', () => clearInterval(iv));
      } else if (data.type === 'logs' && data.id) {
        logs.streamLogsToSocket(data.id, ws);
      }
    } catch (e) {
      console.warn('ws message error', e);
    }
  });
});

server.listen(PORT, () => {
  console.log(`MADDOX CLOUD backend running on http://localhost:${PORT}`);
});
