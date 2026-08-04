// backend/api/logs/logs.js
const { spawn, exec } = require('child_process');
const util = require('util');
const execp = util.promisify(exec);
const DockerManager = require('../docker/dockerManager');

class Logs {
  constructor({ docker }) {
    this.docker = docker || new DockerManager();
    this.tailProcesses = new Map();
  }

  async getRecentLogs(projectId) {
    const c = await this.docker.findContainerByProjectId(projectId);
    if (!c) return '';
    const { stdout } = await execp(`docker logs --tail 200 ${c.id}`);
    return stdout;
  }

  streamLogsToSocket(projectId, ws) {
    this.getRecentLogs(projectId).then(initial => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'logs', initial }));
    }).catch(() => {});
    this.docker.findContainerByProjectId(projectId).then(c => {
      if (!c) return;
      const proc = spawn('docker', ['logs', '-f', c.id]);
      proc.stdout.on('data', (d) => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'logs', chunk: d.toString() }));
      });
      proc.stderr.on('data', (d) => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'logs', chunk: d.toString() }));
      });
      ws.on('close', () => {
        proc.kill();
      });
    });
  }
}

module.exports = Logs;
