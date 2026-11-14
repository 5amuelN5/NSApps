// Prueba de integración online: arranca el servidor, crea sala, se unen 2 humanos
// por código, se añaden bots, se juega una partida completa por HTTP+SSE.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bestSet } from '../shared/engine.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const MAP = process.argv[2] || 'clasico';

const srv = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => srv.stdout.on('data', (d) => d.toString().includes('en marcha') && r()));

const post = async (p, body) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
};

function stream(code, cid, onSnap) {
  const ctrl = new AbortController();
  fetch(`${BASE}/api/stream?code=${code}&cid=${cid}`, { signal: ctrl.signal }).then(async (r) => {
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = block.split('\n').find((l) => l.startsWith('data: '));
        if (line) onSnap(JSON.parse(line.slice(6)));
      }
    }
  }).catch(() => {});
  return ctrl;
}

const A = 'aaaaaaaa-1111', B = 'bbbbbbbb-2222', C = 'cccccccc-3333';
const profA = (await post('/api/profile', { cid: A, profile: null, name: 'Ana' })).profile;
const profB = (await post('/api/profile', { cid: B, profile: null, name: 'Beto' })).profile;
const { code } = await post('/api/create', { cid: A, name: 'Ana', public: true, profile: profA });
console.log('Sala creada', code);
const rooms = await (await fetch(BASE + '/api/rooms')).json();
const listed = rooms.some((r) => r.code === code);
let latest = {};
const ctrls = [];
const acting = { [A]: false, [B]: false };
let finished = null;

async function play(cid, snap) {
  const g = snap.game;
  if (!g || acting[cid] || snap.room.status !== 'playing') return;
  const me = snap.you.slot;
  if (g.phase === 'over') { finished = g; return; }
  const myTurn = g.phase === 'setup' && g.settings.setup === 'rapido' ? g.pool[me] > 0 : g.current === me;
  if (!myTurn || !g.players[me].alive) return;
  acting[cid] = true;
  const own = g.owners.map((o, i) => (o === me ? i : -1)).filter((i) => i >= 0);
  let action;
  if (g.phase === 'setup') action = { type: 'setup', t: own[0], n: g.settings.setup === 'rapido' ? g.pool[me] : 1 };
  else if (g.phase === 'claim') action = { type: 'claim', t: g.owners.indexOf(-1) };
  else if (g.phase === 'reinforce') {
    const hand = g.players[me].cards;
    if (hand.length >= 5) action = { type: 'trade', cards: bestSet(hand, g.settings.cards, g.owners, me) };
    else if (g.reinforcements > 0) action = { type: 'place', t: own.sort((a, b) => g.armies[b] - g.armies[a])[0], n: g.reinforcements };
    else action = { type: 'toAttack' };
  } else if (g.phase === 'attack') {
    const from = own.sort((a, b) => g.armies[b] - g.armies[a])[0];
    action = g.armies[from] >= 4 ? { type: 'attack', from, to: -1, blitz: true } : { type: 'endTurn' };
    if (action.to === -1) {
      // vecino enemigo: lo deduce del mapa
      const map = latest.map;
      const tId = map.territories[from].adj.map((id) => map.territories.findIndex((t) => t.id === id)).find((n) => g.owners[n] !== me);
      action = tId != null && tId >= 0 ? { ...action, to: tId } : { type: 'endTurn' };
    }
  } else if (g.phase === 'conquer') action = { type: 'move', n: g.pending.max };
  else if (g.phase === 'fortify') action = { type: 'endTurn' };
  try { await post('/api/action', { code, cid, msg: { type: 'game', action } }); }
  catch (e) { if (!/turno/.test(e.message)) console.log('  aviso', cid.slice(0, 4), g.phase, e.message); }
  acting[cid] = false;
}

latest.map = await (await fetch(`${BASE}/maps/${MAP}.json`)).json();
ctrls.push(stream(code, A, (s) => { latest[A] = s; play(A, s); }));
await post('/api/join', { cid: B, name: 'Beto', code: code.toLowerCase(), profile: profB });
ctrls.push(stream(code, B, (s) => { latest[B] = s; play(B, s); }));
await post('/api/action', { code, cid: A, msg: { type: 'setMap', mapId: MAP } });
await post('/api/action', { code, cid: A, msg: { type: 'setSettings', settings: { botSpeed: 'rapida', turnTime: 0 } } });
await post('/api/action', { code, cid: A, msg: { type: 'addBot', level: 'general' } });
await post('/api/action', { code, cid: A, msg: { type: 'addBot', level: 'recluta' } });
await post('/api/action', { code, cid: B, msg: { type: 'chat', text: 'hola <b>' } });
let err = '';
try { await post('/api/action', { code, cid: B, msg: { type: 'start' } }); } catch (e) { err = e.message; }
let err2 = '';
try { await post('/api/action', { code, cid: A, msg: { type: 'start' } }); } catch (e) { err2 = e.message; }
await post('/api/action', { code, cid: B, msg: { type: 'ready', ready: true } });
await post('/api/action', { code, cid: A, msg: { type: 'start' } });
// espectador
const spec = await post('/api/join', { cid: C, name: 'Curioso', code });
let specSaw = null;
let specDuring = null;
ctrls.push(stream(code, C, (s) => { specSaw = s; if (s.game && s.game.phase !== 'over') specDuring = s; }));

const t0 = Date.now();
while (!finished && Date.now() - t0 < 180000) await new Promise((r) => setTimeout(r, 200));
const snapA = latest[A];
const g = snapA.game;
console.log('Comprobaciones:');
console.log('  sala listada públicamente:', listed);
console.log('  invitado no puede empezar:', err);
console.log('  anfitrión espera a no-listos:', err2);
console.log('  espectador:', spec.spectator === true, '· ve partida:', !!specSaw?.game, '· cartas ocultas durante la partida:', !!specDuring && specDuring.game.players.every((p) => p.cards === undefined));
console.log('  chat saneado:', JSON.stringify(snapA.room.chat.find((c) => !c.sys)?.text));
console.log('  cartas ajenas ocultas para A:', g.players.filter((_, i) => i !== snapA.you.slot && g.phase !== 'over').every((p) => p.cards === undefined));
if (finished) console.log(`  ✔ partida terminada: gana ${finished.players[finished.winner].name} en ${finished.turn} turnos (${finished.winReason})`);
else console.log(`  ✖ sin terminar tras 180 s (turno ${g.turn}, fase ${g.phase})`);
// perfil: experiencia al terminar (la manda el servidor en la instantánea)
await new Promise((r) => setTimeout(r, 500));
for (const [who, cid] of [['Ana', A], ['Beto', B]]) {
  const up = latest[cid]?.you?.profileUpdate;
  if (!up) { console.log(`  ✖ ${who}: sin experiencia al terminar`); continue; }
  const back = await post('/api/profile', { cid, profile: up.signed });
  const pd = JSON.parse(back.profile.d);
  console.log(`  perfil ${who}: +${up.gain.xp} XP (${up.gain.from.map((f) => f[0]).join(', ')}), partidas ${pd.games}, victorias ${pd.wins}, logros ${pd.ach.join(' ')} · firma válida: ${!back.bad}`);
}
const forged = await post('/api/profile', { cid: A, profile: { d: latest[A].you.profileUpdate.signed.d.replace('"xp":', '"xp":9'), s: latest[A].you.profileUpdate.signed.s } });
console.log('  perfil manipulado rechazado:', !!forged.bad);
// revancha
await new Promise((r) => setTimeout(r, 300));
if (finished) {
  await post('/api/action', { code, cid: A, msg: { type: 'rematch' } });
  await new Promise((r) => setTimeout(r, 300));
  console.log('  revancha → estado sala:', latest[A].room.status, '· jugadores:', latest[A].room.slots.length);
}
ctrls.forEach((c) => c.abort());
srv.kill();
process.exit(finished ? 0 : 1);
