'use strict';
// Server tĩnh nhỏ để thử game ngay trên trình duyệt (http://localhost:5173) mà không cần Electron.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
  '.json': 'application/json',
};

http
  .createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') url = '/index.html';
    const file = path.normalize(path.join(root, url));
    const allowed = ['index.html', 'style.css', path.join('dist', 'bundle.js'), path.join('dist', 'bundle.js.map')];
    const rel = path.relative(root, file);
    if (!allowed.includes(rel)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(5173, '127.0.0.1', () => console.log('Mở http://localhost:5173 trong Chrome/Edge để chơi thử.'));
