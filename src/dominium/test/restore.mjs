// Prueba: una partida sobrevive a un reinicio del servidor gracias a la copia cifrada del jugador.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3998, BASE = `http://localhost:${PORT}`;
const env = { ...process.env, PORT: String(PORT), DOM_SAVE_KEY: 'clave-de-prueba-fija' };
const start = () => new Promise((resolve) => {
  const srv = spawn('node', ['server/server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
  srv.stdout.on('data', (d) => d.toString().includes('en marcha') && resolve(srv));
});
const post = async (p, body) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); };
async function firstMessages(code, cid, want, ms = 8000) {
  const ctrl = new AbortController(); const out = [];
  setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`${BASE}/api/stream?code=${code}&cid=${cid}`, { signal: ctrl.signal });
    const dec = new TextDecoder(); let buf = '';
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).split('\n').find((l) => l.startsWith('data: ')); buf = buf.slice(i + 2);
        if (line) { const m = JSON.parse(line.slice(6)); out.push(m); if (want(m, out)) { ctrl.abort(); return out; } }
      }
    }
  } catch { /* abortado */ }
  return out;
}
const CID = 'restaura-1234';
let srv = await start();
const { code } = await post('/api/create', { cid: CID, name: 'Ana', public: false });
for (const l of ['soldado', 'general']) await post('/api/action', { code, cid: CID, msg: { type: 'addBot', level: l } });
await post('/api/action', { code, cid: CID, msg: { type: 'setSettings', settings: { botSpeed: 'rapida', objective: 'capitales' } } });
await post('/api/action', { code, cid: CID, msg: { type: 'start' } });
await post('/api/action', { code, cid: CID, msg: { type: 'leave' } }); // un bot juega por Ana para que avance
await post('/api/join', { cid: CID, name: 'Ana', code });
const msgs = await firstMessages(code, CID, (m, all) => m.type === 'save' && all.filter((x) => x.type === 'save').length >= 2, 15000);
const saves = msgs.filter((m) => m.type === 'save');
const lastRoom = msgs.filter((m) => m.type === 'room').pop();
console.log('copias recibidas:', saves.length, '· tamaño:', saves.at(-1)?.blob.length, 'bytes · turno antes del reinicio:', lastRoom?.game?.turn);
srv.kill(); await new Promise((r) => setTimeout(r, 400));
srv = await start();
console.log('tras reiniciar, la sala existe:', (await (await fetch(`${BASE}/api/roomcheck?code=${code}&cid=${CID}`)).json()).exists);
console.log('restaurar con copia de otro jugador:', (await post('/api/restore', { cid: 'otro-cid-9999', blob: saves.at(-1).blob })).error);
console.log('copia manipulada:', (await post('/api/restore', { cid: CID, blob: saves.at(-1).blob.slice(0, -4) + 'AAAA' })).error);
const r = await post('/api/restore', { cid: CID, blob: saves.at(-1).blob });
console.log('restaurada:', r);
const after = await firstMessages(code, CID, (m) => m.type === 'room' && m.game && m.game.turn > (lastRoom?.game?.turn || 0) + 1, 15000);
const g = after.filter((m) => m.type === 'room').pop()?.game;
console.log('la partida sigue: turno', g?.turn, 'fase', g?.phase, '· capitales:', g?.capitals?.filter((t) => t >= 0).length);
srv.kill();
process.exit(g && g.turn > (lastRoom?.game?.turn || 0) ? 0 : 1);
