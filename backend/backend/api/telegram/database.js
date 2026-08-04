const fs = require('fs');
const path = require('path');

class TelegramDB {
  constructor({ token = '', chatId = '' } = {}) {
    this.token = token;
    this.chatId = chatId;
    // store DB next to the api folder: ../../data/projects.json relative to this file
    this.dbFile = path.join(__dirname, '..', '..', 'data', 'projects.json');
    this._ensureDbDir();
  }

  _ensureDbDir() {
    const dir = path.dirname(this.dbFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.dbFile)) fs.writeFileSync(this.dbFile, JSON.stringify([]), 'utf8');
  }

  async _read() {
    try {
      const raw = await fs.promises.readFile(this.dbFile, 'utf8');
      return JSON.parse(raw || '[]');
    } catch (e) {
      return [];
    }
  }

  async _write(data) {
    await fs.promises.writeFile(this.dbFile, JSON.stringify(data, null, 2), 'utf8');
  }

  async saveData(item) {
    const all = await this._read();
    all.push(item);
    await this._write(all);
    return item;
  }

  async getData() {
    return await this._read();
  }

  async searchData(id) {
    const all = await this._read();
    return all.find(p => p.id === id) || null;
  }

  async updateData(id, newData) {
    const all = await this._read();
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    all[idx] = newData;
    await this._write(all);
    return newData;
  }

  async deleteData(id) {
    const all = await this._read();
    const filtered = all.filter(p => p.id !== id);
    await this._write(filtered);
    return true;
  }
}

module.exports = TelegramDB;
