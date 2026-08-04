// backend/api/deployment/deployment.js
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { exec } = require('child_process');
const util = require('util');
const execp = util.promisify(exec);

class Deployment {
  constructor({ projectsDir, docker }) {
    this.projectsDir = projectsDir;
    this.docker = docker;
  }

  async extractZip(zipPath, destDir) {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);
    return true;
  }

  async detectProjectType(projectDir) {
    const hasPackage = fs.existsSync(path.join(projectDir, 'package.json'));
    const hasPy = fs.readdirSync(projectDir).some(f => f.endsWith('.py'));
    const hasRequirements = fs.existsSync(path.join(projectDir, 'requirements.txt'));
    if (hasPackage) return 'node';
    if (hasPy || hasRequirements) return 'python';
    return 'static';
  }

  async buildAndRun(projectDir, projectId) {
    const type = await this.detectProjectType(projectDir);
    const imageTag = `maddox-${projectId}`.toLowerCase();
    // create simple Dockerfile if not present
    const dockerfilePath = path.join(projectDir, 'Dockerfile');
    if (!fs.existsSync(dockerfilePath)) {
      let dockerfile = '';
      if (type === 'node') {
        dockerfile = `
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install --production
EXPOSE 3000
CMD ["sh", "-c", "npm run start || node index.js || node server.js"]
`.trim();
      } else if (type === 'python') {
        dockerfile = `
FROM python:3.10-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt || true
EXPOSE 3000
CMD ["sh", "-c", "gunicorn -b 0.0.0.0:3000 app:app || python main.py || python app.py"]
`.trim();
      } else {
        // static
        dockerfile = `
FROM node:18-alpine AS build
WORKDIR /app
COPY . .
# serve static files with simple http-server
RUN npm i -g http-server || true
EXPOSE 3000
CMD ["http-server", ".", "-p", "3000", "-a", "0.0.0.0"]
`.trim();
      }
      fs.writeFileSync(dockerfilePath, dockerfile);
    }

    // build
    await this.docker.buildImage(projectDir, imageTag);

    // run
    const containerId = await this.docker.runImage(imageTag, projectId);
    return { imageTag, containerId };
  }
}

module.exports = Deployment;
