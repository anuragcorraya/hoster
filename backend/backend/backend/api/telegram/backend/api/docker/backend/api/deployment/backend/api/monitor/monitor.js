// backend/api/monitor/monitor.js
const si = require('systeminformation');

class Monitor {
  constructor() {}

  async getStatus() {
    const cpu = await si.currentLoad();
    const mem = await si.mem();
    const fsSize = await si.fsSize();
    const networkStats = await si.networkStats();
    const uptime = si.time();
    return {
      cpu: (cpu.currentload || 0).toFixed(2) + '%',
      ram: ((mem.active || mem.used) / mem.total * 100).toFixed(2) + '%',
      storage: fsSize.map(f => ({ fs: f.fs, use: f.use + '%' })),
      network: networkStats.map(n => ({ iface: n.iface, rx: n.rx_bytes, tx: n.tx_bytes })),
      uptime: uptime.uptime
    };
  }
}

module.exports = Monitor;
