'use strict';
const http = require('http');
const { WebSocketServer } = require('ws');
const C = require('./src/config');
const { RoomManager } = require('./src/rooms/roomManager');
const { handleConnection } = require('./src/network/connection');

function start(port = C.PORT) {
  const manager = new RoomManager();

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        rooms: manager.rooms.size,
        players: manager.playerCount(),
        uptime: Math.round(process.uptime()),
      }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('HACHIHI Counter-Strike server đang chạy.\n');
  });

  const wss = new WebSocketServer({ server, maxPayload: 4096, perMessageDeflate: false });

  wss.on('connection', (ws) => {
    if (wss.clients.size > C.MAX_CONNECTIONS) {
      ws.close(1013, 'full');
      return;
    }
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    handleConnection(ws, manager);
  });

  // Phát hiện kết nối chết (rớt mạng không báo) bằng ping/pong mức giao thức.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* bỏ qua */ }
    }
  }, 15000);

  manager.startLoop();
  server.listen(port, '0.0.0.0', () => {
    const port2 = server.address().port;
    console.log(`[HACHIHI] Server lắng nghe cổng ${port2}`);
    if (!process.env.RENDER) {
      const ips = [];
      for (const list of Object.values(require('os').networkInterfaces())) {
        for (const a of list || []) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
      }
      if (ips.length) console.log(`[HACHIHI] Chơi mạng nội bộ: chọn "Mạng nội bộ" rồi nhập IP: ${ips.join('  hoặc  ')}`);
    }
  });

  const stop = () => {
    clearInterval(heartbeat);
    manager.stopLoop();
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    server.close();
  };

  return { server, wss, manager, stop };
}

if (require.main === module) {
  const app = start();
  process.on('SIGTERM', () => { app.stop(); process.exit(0); });
  process.on('SIGINT', () => { app.stop(); process.exit(0); });
}

module.exports = { start };
