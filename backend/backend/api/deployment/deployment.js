const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

class Deployment {
  constructor({ projectsDir = path.join(__dirname, '..', '..', 'projects'), docker } = {}) {
    this.projectsDir = projectsDir;
    this.docker = docker;
    if (!fs.existsSync(this.projectsDir)) fs.mkdirSync(this.projectsDir, { recursive: true });
  }

  async extractZip(zipPath, destDir) {
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(destDir, true);
      return true;
    } catch (e) {
      throw new Error('Failed to extract ZIP: ' + e.message);
    }
  }

  async detectProjectType(projectDir) {
    // simple detection: node (package.json), python (requirements.txt or .py), else static
    try {
      const hasPackage = fs.existsSync(path.join(projectDir, 'package.json'));
      if (hasPackage) return 'node';
      const hasReq = fs.existsSync(path.join(projectDir, 'requirements.txt'));
      if (hasReq) return 'python';
      // look for any .py files
      const files = fs.readdirSync(projectDir);
      if (files.some(f => f.endsWith('.py'))) return 'python';
      return 'static';
    } catch (e) {
      return 'static';
    }
  }

  async buildAndRun(projectDir, projectId) {
    // This is a stub implementation: we do not build real Docker images here.
    // Instead we ask the docker manager to "run" a container that maps to a local port.
    if (!this.docker) throw new Error('Docker manager not available');
    const result = await this.docker.runContainer(projectDir, projectId);
    return {
      ok: true,
      containerId: result.containerId,
      port: result.port,
      message: 'Started (stub) container for project'
    };
  }
}

module.exports = Deployment;
