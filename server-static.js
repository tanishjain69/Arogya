// Simple static server that serves the whole project root
// Routes / to /site/index.html and exposes /images/* from project root
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT ? Number(process.env.PORT) : 5176;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = process.cwd();

function mapUrl(u) {
  u = decodeURIComponent((u || '/').split('?')[0]);
  if (u === '/' || u === '/index.html') return '/site/index.html';
  if (u === '/style.css') return '/site/style.css';
  if (u === '/app.js') return '/site/app.js';
  if (u === '/logo.svg') return '/site/logo.svg';
  if (u === '/facilities.json') return '/site/facilities.json';
  if (u.startsWith('/site/') || u.startsWith('/images/')) return u;
  // default to serving from /site for other relative assets
  return '/site' + (u.startsWith('/') ? u : '/' + u);
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const u = mapUrl(req.url || '/');
  const file = path.join(ROOT, u);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const it of ifaces[name]) {
      if (!it.internal && it.family === 'IPv4') ips.push(it.address);
    }
  }
  console.log(`Static server running at http://${HOST}:${PORT}/`);
  if (ips.length) {
    console.log('LAN access URLs:\n' + ips.map(ip => `http://${ip}:${PORT}/`).join('\n'));
  }
});