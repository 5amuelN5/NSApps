// DOMINIUM — servidor de juego online (sin dependencias)
// HTTP estático + API JSON + Server-Sent Events para empujar el estado en tiempo real.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildGraph, Game, viewFor, PLAYER_COLORS, DEFAULT_SETTINGS, BOT_LEVELS, MAX_PLAYERS } from '../shared/engine.js';
import { botStep, botAnswerPact } from '../shared/bots.js';
import * as Profile from '../shared/profile.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');
const PORT = Number(process.env.PORT || 3000);
const MAPS_DIR = process.env.MAPS_DIR ? path.resolve(process.env.MAPS_DIR) : path.join(PUBLIC, 'maps');

// ---------------------------------------------------------------- mapas
const MAPS = new Map();
function loadMaps() {
  const idxFile = path.join(MAPS_DIR, 'index.json');
  if (!fs.existsSync(idxFile)) { console.warn('No hay mapas en public/maps'); return []; }
  const index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  for (const m of index) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, `${m.id}.json`), 'utf8'));
      MAPS.set(m.id, { meta: m, graph: buildGraph(data) });
    } catch (e) { console.error('Mapa inválido', m.id, e.message); }
  }
  return index;
}
const MAP_INDEX = loadMaps();
const DEFAULT_MAP = MAPS.has('clasico') ? 'clasico' : MAP_INDEX[0]?.id;

// ---------------------------------------------------------------- perfiles (igual que Hexópolis)
// El perfil vive en el navegador de cada jugador firmado por el servidor: nadie puede subirse el nivel a mano.
// La clave sale de DOM_PROFILE_KEY; si no existe se usa el identificador fijo del servicio en Render.
const PROF_SECRET = process.env.DOM_PROFILE_KEY || process.env.RENDER_SERVICE_ID || null;
if (!PROF_SECRET) console.warn('  Aviso: sin DOM_PROFILE_KEY los perfiles solo valen hasta el próximo reinicio.');
const PROF_KEY = crypto.createHash('sha256').update('dominium:perfil:v1:').update(PROF_SECRET || crypto.randomBytes(32)).digest();
function signProfile(p) {
  const d = JSON.stringify(p);
  return { d, s: crypto.createHmac('sha256', PROF_KEY).update(d).digest('base64url') };
}
function readProfile(x) {
  try {
    if (!x || typeof x.d !== 'string' || typeof x.s !== 'string' || x.d.length > 8000) return null;
    const want = crypto.createHmac('sha256', PROF_KEY).update(x.d).digest();
    const got = Buffer.from(x.s, 'base64url');
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
    const pr = JSON.parse(x.d);
    return pr && pr.v === 1 && typeof pr.id === 'string' ? pr : null;
  } catch { return null; }
}
const profileCache = new Map(); // id → { p, at, avatar } (última ficha conocida, para el ranking de amigos)
const onlineIds = new Map();    // id → nº de conexiones abiertas
const pendingProfiles = new Map(); // cid → { signed, gain, key } no entregado
function touchProfile(pr, avatar) {
  if (!pr || !pr.id) return;
  const old = profileCache.get(pr.id);
  profileCache.set(pr.id, { p: pr, at: Date.now(), avatar: avatar !== undefined ? avatar : old ? old.avatar : null });
}
function cleanAvatar(x) {
  if (typeof x !== 'string' || x.length > 16000) return null;
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x) ? x : null;
}

// ---------------------------------------------------------------- partidas que sobreviven a reinicios
// Cada poco se manda a los jugadores una copia cifrada de la partida (AES-256-GCM). Si el servidor se reinicia,
// el primero que vuelve la reconstruye y los demás entran en su sitio.
const SAVE_KEY = crypto.createHash('sha256').update('dominium:partida:v1:').update(process.env.DOM_SAVE_KEY || PROF_SECRET || crypto.randomBytes(32)).digest();
function sealSave(room) {
  const data = {
    v: 1, code: room.code, name: room.name, public: room.public, hostCid: room.hostCid, mapId: room.mapId, settings: room.settings,
    slots: room.slots.map((x) => ({ kind: x.kind, cid: x.cid, name: x.name, color: x.color, level: x.level, team: x.team, prof: x.prof || null, left: !!x.left })),
    chat: room.chat.slice(-20), state: room.game.state, at: Date.now(),
  };
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', SAVE_KEY, iv);
  const body = Buffer.concat([c.update(zlib.deflateRawSync(JSON.stringify(data))), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}
function openSave(blob) {
  try {
    if (typeof blob !== 'string' || blob.length > 400000) return null;
    const buf = Buffer.from(blob, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', SAVE_KEY, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const raw = zlib.inflateRawSync(Buffer.concat([d.update(buf.subarray(28)), d.final()]));
    const data = JSON.parse(raw.toString('utf8'));
    return data && data.v === 1 && data.state ? data : null;
  } catch { return null; }
}
function shareSave(room) {
  if (room.status !== 'playing' || !room.game) return;
  const st = room.game.state, now = Date.now();
  if (room.saveTurn === st.turn && (now - (room.saveAt || 0) < 20000 || room.saveSeq === st.seq)) return;
  room.saveTurn = st.turn; room.saveAt = now; room.saveSeq = st.seq;
  let blob;
  try { blob = sealSave(room); } catch (e) { console.error('[guardado]', e.message); return; }
  const msg = `data: ${JSON.stringify({ type: 'save', code: room.code, blob })}\n\n`;
  for (const [cid, set] of room.clients) {
    if (humanSlot(room, cid) < 0) continue;
    for (const res of set) { try { res.write(msg); } catch { /* */ } }
  }
}

// ---------------------------------------------------------------- salas
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const clean = (s, max = 20) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const BOT_NAMES = ['Bismarck', 'Aníbal', 'Boudica', 'Saladino', 'Tamerlán', 'Zenobia', 'Pizarro', 'Atila', 'Cleopatra', 'Napoleón', 'Gengis', 'Ramsés', 'Juana', 'Escipión', 'Ciro', 'Leónidas', 'Viriato', 'Isabel', 'Alarico', 'Trajano'];
const SPEED = { lenta: 1000, normal: 520, rapida: 160 };

function makeRoom(cid, name, isPublic) {
  const code = newCode();
  const room = {
    code, name: `Sala de ${name}`, public: !!isPublic, status: 'lobby',
    hostCid: cid, mapId: DEFAULT_MAP, settings: { ...DEFAULT_SETTINGS },
    slots: [], chat: [], clients: new Map(), game: null, graph: null,
    timer: null, deadline: 0, deadlineKey: '', lastActivity: Date.now(), createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function freeColor(room) {
  const used = new Set(room.slots.map((s) => s.color));
  return PLAYER_COLORS.find((c) => !used.has(c.hex))?.hex || PLAYER_COLORS[0].hex;
}

function sys(room, text) {
  room.chat.push({ sys: true, text, ts: Date.now() });
  if (room.chat.length > 80) room.chat.splice(0, room.chat.length - 80);
}

function humanSlot(room, cid) { return room.slots.findIndex((s) => s.kind === 'human' && s.cid === cid); }

function ensureHost(room) {
  const host = room.slots.find((s) => s.kind === 'human' && s.cid === room.hostCid && !s.left);
  const otherOnline = room.slots.some((s) => s.kind === 'human' && s.cid !== room.hostCid && !s.left && s.connected);
  if (host && (host.connected || !otherOnline)) return;
  const h = room.slots.find((s) => s.kind === 'human' && !s.left && s.connected) || room.slots.find((s) => s.kind === 'human' && !s.left);
  if (h) { room.hostCid = h.cid; sys(room, `${h.name} es ahora el anfitrión.`); }
}

const validSlot = (room, i) => Number.isInteger(i) && i >= 0 && i < room.slots.length;

function setSlotProfile(room, s, prof, avatar) {
  if (prof) { s.prof = prof; touchProfile(prof, avatar); }
  if (avatar !== undefined && s.avatar !== avatar) { s.avatar = avatar; room.avatarVer = (room.avatarVer || 0) + 1; }
}

function joinRoom(room, cid, name, prof, avatar) {
  let i = humanSlot(room, cid);
  if (i >= 0) {
    const s = room.slots[i];
    if (room.status === 'lobby') s.name = name;
    s.left = false;
    setSlotProfile(room, s, prof, avatar);
    return { slot: i };
  }
  if (room.status !== 'lobby') return { spectator: true };
  if (room.slots.length >= MAX_PLAYERS) {
    // sustituye a un bot si la sala está llena
    const b = room.slots.findIndex((s) => s.kind === 'bot');
    if (b < 0) return { spectator: true };
    room.slots.splice(b, 1);
  }
  room.slots.push({ kind: 'human', cid, name, color: freeColor(room), ready: false, connected: true, afk: false, timeouts: 0, acts: 0, autoActs: 0, team: room.slots.length % 2 });
  setSlotProfile(room, room.slots[room.slots.length - 1], prof, avatar);
  sys(room, `${name} se ha unido.`);
  return { slot: room.slots.length - 1 };
}

function slotLabel(s) { return s.kind === 'bot' ? s.name : s.name; }

// ---------------------------------------------------------------- difusión
function snapshot(room, cid) {
  const slotIdx = humanSlot(room, cid);
  const g = room.game;
  // las fotos solo viajan cuando cambian (pesan unos KB cada una)
  room.avSent = room.avSent || new Map();
  const av = room.avatarVer || 0;
  const sendAv = room.avSent.get(cid) !== av;
  if (sendAv) room.avSent.set(cid, av);
  const mySlot = slotIdx >= 0 ? room.slots[slotIdx] : null;
  return {
    type: 'room',
    serverTime: Date.now(),
    you: { slot: slotIdx, isHost: room.hostCid === cid, spectator: slotIdx < 0 || room.slots[slotIdx]?.left, profileUpdate: mySlot?.profUpd || null },
    avatars: sendAv ? room.slots.map((x) => x.avatar || null) : undefined,
    avatarVer: av,
    room: {
      code: room.code, name: room.name, public: room.public, status: room.status,
      mapId: room.mapId, settings: room.settings,
      slots: room.slots.map((s) => ({
        kind: s.kind, name: slotLabel(s), color: s.color, level: s.level || null, ready: !!s.ready, team: s.team ?? 0,
        connected: s.kind === 'bot' ? true : !!s.connected, afk: !!s.afk, left: !!s.left, isHost: s.kind === 'human' && s.cid === room.hostCid,
        prof: s.prof || null,
      })),
      chat: room.chat.slice(-60),
      spectators: [...room.clients.keys()].filter((c) => humanSlot(room, c) < 0).length,
    },
    game: g ? viewFor(g.state, slotIdx) : null,
    deadline: room.deadline,
  };
}

// Agrupa los cambios de una misma vuelta del bucle de eventos en un único envío por cliente
function broadcast(room) {
  room.lastActivity = Date.now();
  if (room.bcastPending) return;
  room.bcastPending = true;
  setImmediate(() => { room.bcastPending = false; broadcastNow(room); });
}

function broadcastNow(room) {
  for (const [cid, set] of room.clients) {
    const data = `data: ${JSON.stringify(snapshot(room, cid))}\n\n`;
    for (const res of set) { try { res.write(data); } catch { /* conexión cerrada */ } }
  }
  shareSave(room);
  answerPactsForBots(room);
}

// los bots (y quien está ausente) responden solos a las propuestas de pacto
function answerPactsForBots(room) {
  const g = room.game;
  if (!g || room.status !== 'playing' || room.pactTimer) return;
  const offers = (g.state.pactOffers || []).filter((o) => controlledByBot(room, o.to));
  if (!offers.length) return;
  room.pactTimer = setTimeout(() => {
    room.pactTimer = null;
    if (!room.game || room.status !== 'playing') return;
    for (const o of (room.game.state.pactOffers || []).filter((x) => controlledByBot(room, x.to))) {
      room.game.apply(o.to, { type: 'answerPact', from: o.from, accept: botAnswerPact(room.game, o.to, o.from, botLevelFor(room, o.to)) });
    }
    broadcast(room);
  }, 1400);
}

function restoreRoom(data, cid) {
  if (!data.slots.some((x) => x.kind === 'human' && x.cid === cid)) return { error: 'Esta partida guardada no es tuya' };
  const existing = rooms.get(data.code);
  if (existing) return { code: existing.code };
  const entry = MAPS.get(data.mapId);
  if (!entry) return { error: 'El mapa de esa partida ya no existe' };
  if (data.state.phase === 'over') return { error: 'Esa partida ya terminó' };
  const room = {
    code: data.code, name: data.name, public: !!data.public, status: 'playing',
    hostCid: data.hostCid, mapId: data.mapId, settings: { ...DEFAULT_SETTINGS, ...data.settings },
    slots: data.slots.map((x) => ({ ...x, connected: false, ready: false, afk: x.kind === 'human' && x.cid !== cid, timeouts: 0, acts: 0, autoActs: 0, disconnectedAt: Date.now() })),
    chat: data.chat || [], clients: new Map(), game: new Game(entry.graph, data.state), graph: entry.graph,
    timer: null, deadline: 0, deadlineKey: '', lastActivity: Date.now(), createdAt: Date.now(),
  };
  room.chat.push({ sys: true, text: 'Partida recuperada después de un reinicio del servidor.', ts: Date.now() });
  rooms.set(room.code, room);
  return { code: room.code, restored: true };
}

// ---------------------------------------------------------------- motor de la sala (bots, temporizador)
function controlledByBot(room, p) {
  const pl = room.game.state.players[p];
  if (!pl || pl.neutral) return false;
  const slot = room.slots[p];
  if (!slot) return true;
  return slot.kind === 'bot' || slot.afk || slot.left;
}

function botLevelFor(room, p) {
  const slot = room.slots[p];
  return slot?.kind === 'bot' ? slot.level : 'soldado';
}

function tick(room) {
  room.timer = null; room.timerAt = 0;
  const g = room.game;
  if (!g || room.status !== 'playing') return;
  if (room.clients.size === 0) { room.deadline = 0; room.deadlineKey = ''; return; }
  const s = g.state;
  if (s.phase === 'over') return finishGame(room);
  const actors = g.actors();
  let acted = false;
  for (const p of actors) {
    if (controlledByBot(room, p)) {
      botStep(g, p, botLevelFor(room, p)); acted = true;
      const sl = room.slots[p];
      if (sl && sl.kind === 'human') sl.autoActs = (sl.autoActs || 0) + 1;
    }
  }
  // Fin de tiempo para humanos
  if (room.deadline && Date.now() >= room.deadline) {
    for (const p of g.actors()) {
      if (controlledByBot(room, p)) continue;
      const slot = room.slots[p];
      slot.timeouts = (slot.timeouts || 0) + 1;
      g.autoFinish(p);
      g.log(p, `⏰ Se agotó el tiempo de ${slot.name}.`);
      if (slot.timeouts >= 2) { slot.afk = true; sys(room, `${slot.name} está ausente: un bot juega por él hasta que vuelva.`); }
    }
    room.deadline = 0;
    room.deadlineKey = '';
    acted = true;
  }
  if (acted) broadcast(room);
  schedule(room);
}

function schedule(room) {
  const prevTimer = room.timer, prevAt = room.timerAt || 0;
  const g = room.game;
  if (!g || room.status !== 'playing') return;
  const s = g.state;
  if (s.phase === 'over') return finishGame(room);
  if (room.clients.size === 0) return; // nadie mirando: la partida se pausa
  const actors = g.actors();
  const humans = actors.filter((p) => !controlledByBot(room, p));
  // temporizador de turno
  const tt = Number(room.settings.turnTime) || 0;
  if (tt > 0 && humans.length) {
    const key = s.phase === 'setup' && s.settings.setup === 'rapido' ? 'setup' : `${s.phase === 'claim' || s.phase === 'setup' ? 'c' + s.seq : 't' + s.turn}:${s.current}`;
    if (room.deadlineKey !== key) {
      room.deadlineKey = key;
      const secs = key === 'setup' ? Math.max(60, tt) : key.startsWith('c') ? Math.max(15, Math.round(tt / 4)) : tt;
      room.deadline = Date.now() + secs * 1000;
    }
  } else if (!humans.length) { room.deadline = 0; room.deadlineKey = ''; }
  const botActors = actors.filter((p) => controlledByBot(room, p));
  let delay = null;
  if (botActors.length) {
    delay = SPEED[room.settings.botSpeed] || SPEED.normal;
    if (s.phase === 'claim' || (s.phase === 'setup' && s.settings.setup !== 'rapido')) delay = Math.min(delay, 220);
  }
  if (room.deadline) {
    const left = Math.max(0, room.deadline - Date.now()) + 30;
    delay = delay == null ? left : Math.min(delay, left);
  }
  if (delay == null) { if (prevTimer) clearTimeout(prevTimer); room.timer = null; room.timerAt = 0; return; }
  const at = Date.now() + delay;
  if (prevTimer && prevAt <= at) return; // ya hay un tick programado antes: se mantiene
  if (prevTimer) clearTimeout(prevTimer);
  room.timerAt = at;
  room.timer = setTimeout(() => tick(room), delay);
}

function awardRoom(room) {
  const s = room.game.state;
  room.slots.forEach((slot, i) => {
    if (slot.kind !== 'human' || !slot.prof) return;
    const others = room.slots.filter((_, j) => j !== i);
    const { profile, gain } = Profile.applyGame(slot.prof, {
      state: s, pid: i, mapId: room.mapId,
      // si se fue o un bot jugó por él la mayor parte, no gana experiencia
      left: !!slot.left || (slot.autoActs || 0) > (slot.acts || 0),
      humansOthers: others.filter((x) => x.kind === 'human').length,
      botLevels: others.filter((x) => x.kind === 'bot').map((x) => x.level),
    });
    profile.name = slot.name;
    slot.prof = profile;
    touchProfile(profile, slot.avatar);
    slot.profUpd = { signed: signProfile(profile), gain, key: `${room.code}:${room.game.state.startedAt}` };
    pendingProfiles.set(slot.cid, slot.profUpd);
  });
}

function finishGame(room) {
  if (room.status === 'over') return;
  room.status = 'over';
  room.deadline = 0;
  try { awardRoom(room); } catch (e) { console.error('[perfil]', e); }
  const s = room.game.state;
  sys(room, `🏆 ${s.players[s.winner]?.name} gana la partida.`);
  broadcast(room);
}

function startGame(room) {
  const entry = MAPS.get(room.mapId);
  if (!entry) throw new Error('Mapa no disponible');
  if (room.slots.length < 2) throw new Error('Se necesitan al menos 2 jugadores');
  if (room.settings.teams === 'si' && new Set(room.slots.map((x) => x.team ?? 0)).size < 2) throw new Error('Con equipos hacen falta al menos dos equipos distintos');
  const players = room.slots.map((s, i) => ({ name: s.name, color: s.color, bot: s.kind === 'bot' ? s.level : null, slot: i, team: s.team ?? i % 2 }));
  room.graph = entry.graph;
  room.game = Game.create(entry.graph, players, room.settings);
  room.status = 'playing';
  room.deadline = 0; room.deadlineKey = '';
  for (const s of room.slots) { s.ready = false; s.timeouts = 0; s.acts = 0; s.autoActs = 0; s.profUpd = null; if (s.kind === 'human' && !s.left) s.afk = false; }
  sys(room, `¡La partida comienza en ${entry.meta.name}!`);
  schedule(room);
}

// ---------------------------------------------------------------- acciones de cliente
function handleAction(room, cid, msg) {
  const isHost = room.hostCid === cid;
  const si = humanSlot(room, cid);
  const me = si >= 0 ? room.slots[si] : null;
  const needHost = () => { if (!isHost) throw new Error('Solo el anfitrión puede hacer eso'); };
  const needLobby = () => { if (room.status !== 'lobby') throw new Error('La partida ya ha empezado'); };
  switch (msg.type) {
    case 'chat': {
      const text = clean(msg.text, 200);
      if (!text) return;
      room.chat.push({ name: me?.name || 'Espectador', color: me?.color || '#999', text, ts: Date.now() });
      if (room.chat.length > 80) room.chat.splice(0, room.chat.length - 80);
      return;
    }
    case 'avatar': {
      if (!me) return;
      setSlotProfile(room, me, null, msg.img ? cleanAvatar(msg.img) : null);
      if (me.prof) touchProfile(me.prof, me.avatar);
      return;
    }
    case 'team': {
      needLobby();
      if (!validSlot(room, msg.slot)) throw new Error('Plaza no válida');
      const target = room.slots[msg.slot];
      if (!isHost && target !== me) throw new Error('Solo el anfitrión puede cambiar a otros de equipo');
      const nTeams = Math.min(4, Math.max(2, Math.floor(room.slots.length / 2)));
      target.team = ((target.team ?? 0) + 1) % nTeams;
      return;
    }
    case 'phrase': {
      const PHRASES = ['¡Alianza contra el líder!', '¡Buena jugada!', 'Te vas a enterar 😤', '¿Pacto?', '¡Ups!', 'Vaya dados…', 'Gracias 🙏', '¡Ya casi es mío!', 'No me ataques, por favor', 'Esto es la guerra ⚔️', 'GG 👏', '¡Venganza!'];
      const t = PHRASES[msg.i];
      if (!t || !me) return;
      const now = Date.now();
      if (now - (me.lastEmote || 0) < 1200) return;
      me.lastEmote = now;
      room.chat.push({ name: me.name, color: me.color, text: t, phrase: true, emote: true, slot: si, ts: now });
      if (room.chat.length > 80) room.chat.splice(0, room.chat.length - 80);
      return;
    }
    case 'emote': {
      const EMOTES = ['👍', '👎', '😂', '🤣', '😮', '😱', '😡', '🤬', '😭', '😎', '🤔', '😏', '🤝', '👏', '🙏', '💪', '🔥', '💀', '🎯', '⚔️', '🛡️', '👑', '🎲', '🏳️'];
      const e = EMOTES[msg.e];
      if (!e || !me) return;
      const now = Date.now();
      if (now - (me.lastEmote || 0) < 1200) return;
      me.lastEmote = now;
      room.chat.push({ name: me.name, color: me.color, text: e, emote: true, slot: si, ts: now });
      if (room.chat.length > 80) room.chat.splice(0, room.chat.length - 80);
      return;
    }
    case 'setMap': needHost(); needLobby(); if (!MAPS.has(msg.mapId)) throw new Error('Mapa desconocido'); room.mapId = msg.mapId; return;
    case 'setSettings': {
      needHost(); needLobby();
      const allowed = {
        setup: ['rapido', 'clasico'], cards: ['progresivo', 'fijo'], fortify: ['conectado', 'adyacente'],
        objective: ['dominacion', 'misiones', 'capitales', 'porcentaje'], teams: ['no', 'si'], turnTime: [0, 45, 60, 90, 120, 180, 300], botSpeed: ['lenta', 'normal', 'rapida'],
      };
      for (const [k, v] of Object.entries(msg.settings || {})) if (allowed[k]?.includes(v)) room.settings[k] = v;
      if (typeof msg.public === 'boolean') room.public = msg.public;
      if (msg.name) room.name = clean(msg.name, 32) || room.name;
      return;
    }
    case 'addBot': {
      needHost(); needLobby();
      if (room.slots.length >= MAX_PLAYERS) throw new Error('La sala está llena');
      const level = BOT_LEVELS.some((l) => l.id === msg.level) ? msg.level : 'soldado';
      const used = new Set(room.slots.map((s) => s.name));
      const avail = BOT_NAMES.filter((n) => !used.has(n));
      const name = avail.length ? avail[crypto.randomInt(avail.length)] : `Bot ${room.slots.length + 1}`;
      room.slots.push({ kind: 'bot', name, level, color: freeColor(room), team: room.slots.length % 2 });
      return;
    }
    case 'botLevel': {
      needHost(); needLobby();
      if (!validSlot(room, msg.slot)) throw new Error('Plaza no válida');
      const s = room.slots[msg.slot];
      if (s?.kind === 'bot' && BOT_LEVELS.some((l) => l.id === msg.level)) s.level = msg.level;
      return;
    }
    case 'removeSlot': {
      needHost(); needLobby();
      if (!validSlot(room, msg.slot)) throw new Error('Plaza no válida');
      const s = room.slots[msg.slot];
      if (!s) return;
      if (s.kind === 'human' && s.cid === cid) throw new Error('No puedes expulsarte a ti mismo');
      room.slots.splice(msg.slot, 1);
      if (s.kind === 'human') { sys(room, `${s.name} ha sido expulsado.`); kick(room, s.cid); }
      return;
    }
    case 'color': {
      needLobby();
      if (msg.slot != null && !validSlot(room, msg.slot)) throw new Error('Plaza no válida');
      const target = msg.slot != null && isHost ? room.slots[msg.slot] : me;
      if (!target) return;
      if (!PLAYER_COLORS.some((c) => c.hex === msg.color)) return;
      const other = room.slots.find((s) => s.color === msg.color);
      if (other && other !== target) other.color = target.color;
      target.color = msg.color;
      return;
    }
    case 'ready': needLobby(); if (me) me.ready = !!msg.ready; return;
    case 'start': {
      needHost(); needLobby();
      const notReady = room.slots.filter((s) => s.kind === 'human' && s.cid !== cid && !s.ready && s.connected);
      if (notReady.length && !msg.force) throw new Error(`Esperando a: ${notReady.map((s) => s.name).join(', ')}`);
      startGame(room);
      return;
    }
    case 'rematch': {
      needHost();
      if (room.status !== 'over') throw new Error('La partida sigue en curso');
      room.status = 'lobby'; room.game = null; room.deadline = 0;
      room.slots = room.slots.filter((s) => s.kind === 'bot' || (!s.left && s.connected));
      for (const s of room.slots) { s.afk = false; s.ready = false; s.acts = 0; s.autoActs = 0; s.profUpd = null; }
      sys(room, 'Volviendo a la sala para la revancha.');
      return;
    }
    case 'back': { if (me) { me.afk = false; me.timeouts = 0; sys(room, `${me.name} ha vuelto.`); } return; }
    case 'leave': {
      if (!me) return;
      if (room.status === 'lobby') { room.slots.splice(si, 1); }
      else { me.left = true; me.afk = true; }
      sys(room, `${me.name} ha abandonado${room.status === 'playing' ? ' (un bot toma el mando)' : ''}.`);
      ensureHost(room);
      return;
    }
    case 'game': {
      if (room.status !== 'playing' || !room.game) throw new Error('No hay partida en curso');
      if (si < 0 || me.left) throw new Error('Eres espectador');
      const isPact = msg.action && (msg.action.type === 'pact' || msg.action.type === 'answerPact');
      if (!isPact) {
        if (me.afk) { me.afk = false; }
        me.timeouts = 0;
        me.acts = (me.acts || 0) + 1;
      }
      const r = room.game.apply(si, msg.action);
      if (!r.ok) throw new Error(r.error);
      schedule(room);
      return r;
    }
    default: throw new Error('Acción desconocida');
  }
}

function kick(room, cid) {
  const set = room.clients.get(cid);
  if (!set) return;
  for (const res of set) { try { res.write(`data: ${JSON.stringify({ type: 'kicked' })}\n\n`); res.end(); } catch { /* */ } }
  room.clients.delete(cid);
}

// ---------------------------------------------------------------- HTTP
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };

// La web se sirve desde GitHub Pages y habla con este servidor desde otro origen.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 20000) { reject(new Error('Petición demasiado grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let base = PUBLIC, rel = pathname;
  if (pathname.startsWith('/shared/')) { base = SHARED; rel = pathname.slice('/shared'.length); }
  else if (pathname.startsWith('/maps/')) { base = MAPS_DIR; rel = pathname.slice('/maps'.length); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(base, decodeURIComponent(rel)));
  if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA: cualquier ruta desconocida sin extensión -> index
      if (!path.extname(rel)) return serveStatic(req, res, '/index.html');
      res.writeHead(404); return res.end('No encontrado');
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

const validCid = (c) => typeof c === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(c);

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
  const p = url.pathname;
  try {
    if (req.method === 'OPTIONS' && p.startsWith('/api/')) { res.writeHead(204, CORS); return res.end(); }
    if (p === '/api/ping') return sendJSON(res, 200, { ok: true, rooms: rooms.size, perfiles: process.env.DOM_PROFILE_KEY ? 'clave propia' : process.env.RENDER_SERVICE_ID ? 'clave fija del servicio' : 'clave temporal' });
    if (p === '/api/maps' && req.method === 'GET') return sendJSON(res, 200, MAP_INDEX);
    if (p === '/api/profile' && req.method === 'POST') {
      // crear un perfil, comprobarlo (enlace de recuperación) o cambiar nombre/emblema
      const b = await readBody(req);
      let pr = null;
      if (b.profile) { pr = readProfile(b.profile); if (!pr) return sendJSON(res, 200, { bad: true }); }
      else pr = Profile.newProfile(crypto.randomBytes(9).toString('base64url'), clean(b.name, 16) || 'Comandante');
      if (b.name) pr.name = clean(b.name, 16) || pr.name;
      if (b.emblem && Profile.emblemOk(b.emblem, Profile.levelOf(pr.xp))) pr.emblem = b.emblem;
      if (!b.check) touchProfile(pr, b.avatar !== undefined ? cleanAvatar(b.avatar) : undefined);
      const out = { profile: signProfile(pr), fresh: !b.profile };
      if (validCid(b.cid) && pendingProfiles.has(b.cid)) { out.update = pendingProfiles.get(b.cid); pendingProfiles.delete(b.cid); }
      return sendJSON(res, 200, out);
    }
    if (p === '/api/friends' && req.method === 'POST') {
      const b = await readBody(req);
      const ids = Array.isArray(b.ids) ? b.ids.slice(0, 60).map(String) : [];
      const list = ids.map((id) => { const x = profileCache.get(id); return { id, p: x ? x.p : null, at: x ? x.at : null, avatar: x ? x.avatar || null : null, online: onlineIds.has(id) }; });
      return sendJSON(res, 200, { list });
    }
    if (p === '/api/restore' && req.method === 'POST') {
      const b = await readBody(req);
      if (!validCid(b.cid)) throw new Error('Identificador no válido');
      const data = openSave(b.blob);
      if (!data) return sendJSON(res, 400, { error: 'No se pudo recuperar la partida guardada' });
      const r = restoreRoom(data, b.cid);
      if (r.error) return sendJSON(res, 400, { error: r.error });
      return sendJSON(res, 200, r);
    }
    if (p === '/api/roomcheck' && req.method === 'GET') {
      const room = rooms.get(String(url.searchParams.get('code') || '').toUpperCase());
      const cid = url.searchParams.get('cid');
      if (!room || !validCid(cid)) return sendJSON(res, 200, { exists: false });
      const i = humanSlot(room, cid);
      return sendJSON(res, 200, { exists: true, member: i >= 0 && !room.slots[i].left, status: room.status, name: room.name });
    }
    if (p === '/api/rooms' && req.method === 'GET') {
      const list = [...rooms.values()].filter((r) => r.public && r.status !== 'over' && r.slots.some((s) => s.kind === 'human' && s.connected && !s.left)).map((r) => ({
        code: r.code, name: r.name, status: r.status, mapId: r.mapId, mapName: MAPS.get(r.mapId)?.meta.name,
        players: r.slots.length, humans: r.slots.filter((s) => s.kind === 'human').length, max: MAX_PLAYERS,
        host: r.slots.find((s) => s.cid === r.hostCid)?.name,
      }));
      return sendJSON(res, 200, list);
    }
    if (p === '/api/create' && req.method === 'POST') {
      const b = await readBody(req);
      if (!validCid(b.cid)) throw new Error('Identificador no válido');
      const name = clean(b.name) || 'Comandante';
      const room = makeRoom(b.cid, name, b.public);
      if (b.roomName) room.name = clean(b.roomName, 32) || room.name;
      joinRoom(room, b.cid, name, readProfile(b.profile), b.avatar ? cleanAvatar(b.avatar) : null);
      return sendJSON(res, 200, { code: room.code });
    }
    if (p === '/api/join' && req.method === 'POST') {
      const b = await readBody(req);
      if (!validCid(b.cid)) throw new Error('Identificador no válido');
      const room = rooms.get(String(b.code || '').toUpperCase().trim());
      if (!room) return sendJSON(res, 404, { error: 'No existe ninguna sala con ese código' });
      const r = joinRoom(room, b.cid, clean(b.name) || 'Comandante', readProfile(b.profile), b.avatar ? cleanAvatar(b.avatar) : undefined);
      broadcast(room);
      return sendJSON(res, 200, { code: room.code, ...r });
    }
    if (p === '/api/action' && req.method === 'POST') {
      const b = await readBody(req);
      const room = rooms.get(String(b.code || '').toUpperCase());
      if (!room) return sendJSON(res, 404, { error: 'La sala ya no existe' });
      if (!validCid(b.cid)) throw new Error('Identificador no válido');
      let result;
      try { result = handleAction(room, b.cid, b.msg || {}); }
      catch (e) { return sendJSON(res, 400, { error: e.message }); }
      ensureHost(room);
      broadcast(room);
      if (room.game && room.game.state.phase === 'over' && room.status === 'playing') finishGame(room);
      else if (room.status === 'playing') schedule(room);
      return sendJSON(res, 200, { ok: true, result: result || null });
    }
    if (p === '/api/stream' && req.method === 'GET') {
      const code = String(url.searchParams.get('code') || '').toUpperCase();
      const cid = url.searchParams.get('cid');
      const room = rooms.get(code);
      if (!room || !validCid(cid)) { res.writeHead(404, CORS); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', ...CORS });
      res.write('retry: 2000\n\n');
      if (!room.clients.has(cid)) room.clients.set(cid, new Set());
      room.avSent?.delete(cid); // conexión nueva: reenviar las fotos
      room.clients.get(cid).add(res);
      const si = humanSlot(room, cid);
      const onlineId = si >= 0 ? room.slots[si].prof?.id : null;
      if (onlineId) onlineIds.set(onlineId, (onlineIds.get(onlineId) || 0) + 1);
      if (si >= 0) {
        const s = room.slots[si];
        const wasAway = !s.connected;
        s.connected = true; s.disconnectedAt = 0;
        if (wasAway && room.status === 'playing' && s.afk && !s.left) { s.afk = false; s.timeouts = 0; sys(room, `${s.name} se ha reconectado.`); }
      }
      broadcast(room);
      schedule(room);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* */ } }, 15000);
      req.on('close', () => {
        clearInterval(ping);
        if (onlineId) { const n = (onlineIds.get(onlineId) || 1) - 1; if (n > 0) onlineIds.set(onlineId, n); else onlineIds.delete(onlineId); }
        const set = room.clients.get(cid);
        if (set) { set.delete(res); if (!set.size) room.clients.delete(cid); }
        const i = humanSlot(room, cid);
        if (i >= 0 && !room.clients.has(cid)) {
          room.slots[i].connected = false;
          room.slots[i].disconnectedAt = Date.now();
          ensureHost(room);
          broadcast(room);
        }
      });
      return;
    }
    if (p.startsWith('/api/')) return sendJSON(res, 404, { error: 'No encontrado' });
    return serveStatic(req, res, p);
  } catch (e) {
    return sendJSON(res, 400, { error: e.message });
  }
});

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

// Limpieza periódica: desconectados -> bot; salas vacías -> borrar
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    let changed = false;
    for (const [i, s] of room.slots.entries()) {
      if (s.kind !== 'human' || s.connected || !s.disconnectedAt) continue;
      const away = now - s.disconnectedAt;
      if (room.status === 'lobby' && away > 60000) {
        room.slots.splice(i, 1); sys(room, `${s.name} se ha desconectado.`); changed = true; break;
      }
      if (room.status === 'playing' && away > 30000 && !s.afk) {
        s.afk = true; sys(room, `${s.name} se ha desconectado: un bot juega por él.`); changed = true;
      }
    }
    const prevHost = room.hostCid;
    ensureHost(room);
    if (prevHost !== room.hostCid) changed = true;
    if (changed) { broadcast(room); schedule(room); }
    if (room.clients.size > 0) room.lastClientAt = now;
    if (!room.clients.size && now - (room.lastClientAt || room.createdAt) > 15 * 60000) {
      if (room.timer) clearTimeout(room.timer);
      rooms.delete(room.code);
    }
  }
}, 5000);

server.listen(PORT, () => {
  console.log(`\n  ⚔  DOMINIUM en marcha → http://localhost:${PORT}`);
  console.log(`     ${MAPS.size} mapas cargados: ${[...MAPS.keys()].join(', ')}\n`);
});
