// HEXÓPOLIS — servidor: archivos estáticos + salas multijugador por WebSocket
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const Room = require('./shared/room');

const PORT = +process.env.PORT || 3000;
const ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  if (url === '/config.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ server: true, publicUrl: process.env.PUBLIC_URL || global.HX_PUBLIC_URL || null }));
  }
  let file;
  if (url.startsWith('/shared/')) file = path.join(ROOT, 'shared', path.basename(url));
  else file = path.join(ROOT, 'public', path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(ROOT, 'public')) && !file.startsWith(path.join(ROOT, 'shared'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();
const clients = new Set();

function code() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; } while (rooms.has(c));
  return c;
}
function roomList() {
  return [...rooms.values()].filter((r) => r.isPublic).map((r) => {
    const i = r.info();
    return { code: i.code, name: i.name, players: i.seats.length, humans: i.seats.filter((s) => s.kind === 'human').length, started: i.started && !i.over, host: (i.seats.find((s) => s.host) || {}).name };
  });
}
let listTimer = null;
function pushRoomList() {
  clearTimeout(listTimer);
  listTimer = setTimeout(() => {
    const list = roomList();
    for (const c of clients) if (!c.room) c.send({ t: 'rooms', list });
  }, 100);
}

wss.on('connection', (ws) => {
  const c = {
    ws, token: null, name: 'Jugador', room: null,
    send(m) { if (ws.readyState === 1) ws.send(JSON.stringify(m)); },
  };
  clients.add(c);
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const err = (e) => e && c.send({ t: 'error', msg: e });
    switch (m.t) {
      case 'hello': {
        c.token = String(m.token || '').slice(0, 64) || Math.random().toString(36).slice(2);
        c.name = String(m.name || 'Jugador').slice(0, 16).trim() || 'Jugador';
        // reconexión automática a su sala
        for (const r of rooms.values()) {
          const si = r.seatOf(c.token);
          if (si >= 0 && !r.seats[si].left && r.state && r.state.phase !== 'gameOver') { c.room = r; r.join(c, c.token, c.name); c.send({ t: 'joined', code: r.code }); return; }
        }
        c.send({ t: 'rooms', list: roomList() });
        break;
      }
      case 'setName': c.name = String(m.name || 'Jugador').slice(0, 16).trim() || 'Jugador'; break;
      case 'listRooms': c.send({ t: 'rooms', list: roomList() }); break;
      case 'createRoom': {
        if (!c.token) return;
        if (c.room) c.room.leave(c.token);
        const r = new Room({ code: code(), name: String(m.name || `Sala de ${c.name}`).slice(0, 24), isPublic: m.isPublic !== false, onChange: pushRoomList });
        rooms.set(r.code, r);
        c.room = r;
        r.join(c, c.token, c.name);
        c.send({ t: 'joined', code: r.code });
        pushRoomList();
        break;
      }
      case 'joinRoom': {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return err('No existe esa sala');
        if (c.room && c.room !== r) c.room.leave(c.token);
        const res = r.join(c, c.token, c.name);
        if (!res.ok) return err(res.error);
        c.room = r;
        c.send({ t: 'joined', code: r.code });
        pushRoomList();
        break;
      }
      case 'leaveRoom': {
        if (c.room) { c.room.leave(c.token); cleanup(c.room); c.room = null; }
        c.send({ t: 'rooms', list: roomList() });
        pushRoomList();
        break;
      }
      case 'addBot': if (c.room) err(c.room.addBot(c.token, m.level)); break;
      case 'botLevel': if (c.room) err(c.room.setBotLevel(c.token, m.i, m.level)); break;
      case 'removeSeat': if (c.room) err(c.room.removeSeat(c.token, m.i)); break;
      case 'start': if (c.room) err(c.room.start(c.token)); break;
      case 'chat': if (c.room) c.room.say(c.token, m.text); break;
      case 'action': if (c.room) err(c.room.action(c.token, m.action)); break;
    }
  });

  ws.on('close', () => {
    clients.delete(c);
    if (c.room) { c.room.disconnect(c.token); cleanup(c.room); }
    pushRoomList();
  });
});

function cleanup(r) {
  if (!r.seats.some((s) => s.kind === 'human')) { r.destroy(); rooms.delete(r.code); }
}

// latido y limpieza de salas abandonadas
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  const now = Date.now();
  for (const r of rooms.values()) {
    if (r.humansConnected()) { r.idleSince = null; continue; }
    r.idleSince = r.idleSince || now;
    if (now - r.idleSince > 10 * 60 * 1000) { r.destroy(); rooms.delete(r.code); }
  }
}, 15000);

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  ⬢ HEXÓPOLIS en marcha`);
  console.log(`  Local:      http://localhost:${PORT}`);
  ips.forEach((ip) => console.log(`  Red local:  http://${ip}:${PORT}`));
  console.log('');
});
