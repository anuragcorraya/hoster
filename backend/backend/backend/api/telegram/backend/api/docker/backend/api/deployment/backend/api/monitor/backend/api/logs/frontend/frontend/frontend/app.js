// frontend/app.js
const api = {
  list: '/api/project/list',
  create: '/api/project/create',
  deploy: '/api/project/deploy',
  start: '/api/project/start',
  stop: '/api/project/stop',
  restart: '/api/project/restart',
  delete: '/api/project/delete',
  server: '/api/server/status',
  logs: '/api/logs'
};

function el(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html.trim();
  return tmp.firstChild;
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  return r.json();
}

async function renderDashboard() {
  const page = document.getElementById('page');
  page.innerHTML = '';
  const container = el(`<div>
    <h2 class="h1">Dashboard</h2>
    <div class="grid" id="statsGrid"></div>
    <h3 class="h1" style="margin-top:18px">Projects</h3>
    <div id="projectsList"></div>
  </div>`);
  page.appendChild(container);

  const monitor = await fetchJSON(api.server);
  const grid = container.querySelector('#statsGrid');
  grid.appendChild(card('CPU', monitor.cpu));
  grid.appendChild(card('RAM', monitor.ram));
  grid.appendChild(card('Storage', JSON.stringify(monitor.storage)));
  grid.appendChild(card('Network', JSON.stringify(monitor.network)));
  grid.appendChild(card('Uptime', monitor.uptime + 's'));

  loadProjects();
}

function card(title, body) {
  const node = el(`<div class="card"><div class="h1">${title}</div><div class="small">${body}</div></div>`);
  return node;
}

async function loadProjects() {
  const res = await fetchJSON(api.list);
  const list = document.getElementById('projectsList');
  list.innerHTML = '';
  if (!res.projects || res.projects.length === 0) {
    list.innerHTML = '<div class="small">No projects yet. Create one.</div>';
    return;
  }
  res.projects.forEach(p => {
    const row = el(`<div class="project-row">
      <div>
        <div style="font-weight:600">${p.projectName} <span class="small">[${p.framework}]</span></div>
        <div class="small">Status: ${p.status} • ${p.deploymentTime || ''}</div>
      </div>
      <div class="project-actions">
        <button data-id="${p.id}" class="deploy">Deploy</button>
        <button data-id="${p.id}" class="start">Start</button>
        <button data-id="${p.id}" class="stop">Stop</button>
        <button data-id="${p.id}" class="logs">Logs</button>
        <button data-id="${p.id}" class="del">Delete</button>
      </div>
    </div>`);
    list.appendChild(row);
  });

  list.addEventListener('click', async (e) => {
    if (e.target.matches('.deploy')) {
      const id = e.target.dataset.id;
      await fetchJSON(api.deploy, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
      alert('Deploy started — check status in a few seconds.');
    } else if (e.target.matches('.start')) {
      const id = e.target.dataset.id;
      await fetchJSON(api.start, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
      loadProjects();
    } else if (e.target.matches('.stop')) {
      const id = e.target.dataset.id;
      await fetchJSON(api.stop, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
      loadProjects();
    } else if (e.target.matches('.del')) {
      const id = e.target.dataset.id;
      if (!confirm('Delete project?')) return;
      await fetchJSON(api.delete, { method: 'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
      loadProjects();
    } else if (e.target.matches('.logs')) {
      const id = e.target.dataset.id;
      location.hash = '#/logs?id=' + id;
    }
  });
}

function renderCreate() {
  const page = document.getElementById('page');
  page.innerHTML = '';
  const form = el(`<div>
    <h2 class="h1">Create Project</h2>
    <form id="createForm" class="form">
      <div class="field"><input name="projectName" placeholder="Project name" class="input" /></div>
      <div class="field"><input type="file" name="zip" accept=".zip" class="input" /></div>
      <div class="field"><button class="card">Upload & Create</button></div>
    </form>
    <div id="createResult"></div>
  </div>`);
  page.appendChild(form);
  form.querySelector('#createForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const r = await fetch('/api/project/create', { method: 'POST', body: fd });
    const json = await r.json();
    document.getElementById('createResult').innerText = JSON.stringify(json, null, 2);
    setTimeout(() => location.hash = '#/projects', 800);
  });
}

async function renderLogs(query) {
  const page = document.getElementById('page');
  page.innerHTML = '';
  const id = query.get('id');
  page.appendChild(el(`<h2 class="h1">Logs - ${id}</h2>`));
  const container = el('<div class="logs" id="logsBox">Connecting...</div>');
  page.appendChild(container);

  // fetch recent
  const res = await fetchJSON(api.logs + '?id=' + id);
  const box = document.getElementById('logsBox');
  box.innerText = res.logs || '';

  // ws stream
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'logs', id }));
  });
  ws.addEventListener('message', (ev) => {
    try {
      const d = JSON.parse(ev.data);
      if (d.type === 'logs') {
        if (d.initial) box.innerText = d.initial;
        if (d.chunk) box.innerText += d.chunk;
        box.scrollTop = box.scrollHeight;
      }
    } catch (e) {}
  });
}

async function renderMonitor() {
  const page = document.getElementById('page');
  page.innerHTML = '';
  page.appendChild(el('<h2 class="h1">Server Monitor</h2>'));
  const box = el('<div id="monitorBox" class="grid"></div>');
  page.appendChild(box);

  const ws = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host);
  ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'monitor' })));
  ws.addEventListener('message', (ev) => {
    try {
      const d = JSON.parse(ev.data);
      if (d.type === 'monitor') {
        box.innerHTML = '';
        box.appendChild(card('CPU', d.status.cpu));
        box.appendChild(card('RAM', d.status.ram));
        box.appendChild(card('Storage', JSON.stringify(d.status.storage)));
        box.appendChild(card('Network', JSON.stringify(d.status.network)));
        box.appendChild(card('Uptime', d.status.uptime + 's'));
      }
    } catch (e) {}
  });
}

function renderSettings() {
  const page = document.getElementById('page');
  page.innerHTML = '';
  page.appendChild(el('<h2 class="h1">Settings</h2>'));
  page.appendChild(el(`<div class="card"><div class="small">No settings yet. Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in backend/.env</div></div>`));
}

function renderProjects() {
  const page = document.getElementById('page');
  page.innerHTML = '';
  page.appendChild(el('<h2 class="h1">Projects</h2>'));
  page.appendChild(el('<div id="projectsList"></div>'));
  loadProjects();
}

function route() {
  const hash = location.hash || '#/';
  const [path, qs] = hash.slice(1).split('?');
  const query = new URLSearchParams(qs || '');
  if (path === '/') renderDashboard();
  else if (path === 'create') renderCreate();
  else if (path === 'projects') renderProjects();
  else if (path === 'logs') renderLogs(query);
  else if (path === 'monitor') renderMonitor();
  else if (path === 'settings') renderSettings();
  else renderDashboard();
}

window.addEventListener('hashchange', route);
window.addEventListener('load', () => {
  route();
});
