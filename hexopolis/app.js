/* HEXÓPOLIS — aplicación cliente: pantallas, red, HUD e interacción */
'use strict';
const $ = (s) => document.querySelector(s);
const RES = Engine.RES, RN = Engine.RES_NAMES, COST = Engine.COST;
const CARD_BG = { wood: '#2fbf5c', brick: '#ff8a55', sheep: '#b6f36b', wheat: '#f2c14e', ore: '#b9c2e0' };
const DEV_ICON = { knight: 'knight', vp: 'vp', roadBuilding: 'road', yop: 'yop', monopoly: 'monopoly' };
const DEV_SHORT = { knight: 'Caballero', vp: 'Punto', roadBuilding: 'Caminos', yop: 'Abundancia', monopoly: 'Monopolio' };
const LVL_NAME = { 1: 'NOVATO', 2: 'NORMAL', 3: 'DIFÍCIL', 4: 'EXPERTO' };
const stars = (n) => `<span class="st">${'★'.repeat(n)}</span>`;
// solo toca el DOM si el contenido ha cambiado (evita repintados y parpadeos)
function setHTML(el, html) { if (!el) return false; if (el._h === html) return false; el.innerHTML = html; el._h = html; return true; }
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* */ } },
};

const App = {
  token: (() => {
    let t = null;
    try { t = sessionStorage.getItem('hx_tok'); } catch (e) { /* */ }
    if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); try { sessionStorage.setItem('hx_tok', t); } catch (e) { /* */ } }
    return t;
  })(),
  name: store.get('hx_name', 'JUGADOR' + Math.floor(Math.random() * 90 + 10)),
  mode: null, ws: null, room: null, you: -1, chat: [],
  view: null, me: -1, localRoom: null, screen: 'menu',
  queue: [], busy: false, pendingJoin: null,
  ui: { build: null, modal: null, side: false },
};

const board = new BoardRenderer($('#board'));
// ---- preferencias de tamaño (se guardan en este navegador) ----
const UI_STEPS = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.7];
const RC_STEPS = [0.75, 0.85, 1, 1.1, 1.2, 1.35, 1.5];
const Prefs = { rc: +store.get('hx_rc', 1) || 1, ui: +store.get('hx_ui', 1) || 1, board: +store.get('hx_board', 1) || 1, build: store.get('hx_build', 'right') === 'top' ? 'top' : 'right' };
function applyBuildPos() {
  document.body.classList.toggle('build-top', Prefs.build === 'top');
  document.querySelectorAll('[data-bpos]').forEach((b) => b.classList.toggle('on', b.dataset.bpos === Prefs.build));
  layout();
}
function applyUiScale() {
  document.documentElement.style.setProperty('--ui', Prefs.ui);
  $('#sz-ui').textContent = Math.round(Prefs.ui * 100) + '%';
  layout();
}
// tamaño de la columna derecha (gráfica de tiradas, costes, Comercio y Fin de turno), todo junto
function applyRcScale() {
  document.documentElement.style.setProperty('--rc', Prefs.rc);
  $('#sz-rc').textContent = Math.round(Prefs.rc * 100) + '%';
  layout();
}
function stepRc(d) {
  let i = RC_STEPS.findIndex((v) => v >= Prefs.rc - 0.001); if (i < 0) i = RC_STEPS.length - 1;
  i = Math.max(0, Math.min(RC_STEPS.length - 1, i + d));
  Prefs.rc = RC_STEPS[i]; store.set('hx_rc', Prefs.rc); applyRcScale();
}
function stepUi(d) {
  let i = UI_STEPS.findIndex((v) => v >= Prefs.ui - 0.001); if (i < 0) i = UI_STEPS.length - 1;
  i = Math.max(0, Math.min(UI_STEPS.length - 1, i + d));
  Prefs.ui = UI_STEPS[i]; store.set('hx_ui', Prefs.ui); applyUiScale();
}
function showBoardZoom(z) { $('#sz-board').textContent = Math.round(z * 100) + '%'; }
const fx = new FX($('#fx'));
board.onPick = onPick;
board.onZoom = (z) => { if (App.screen === 'game') { Prefs.board = z; store.set('hx_board', z.toFixed(2)); } showBoardZoom(z); };

// ================= PANTALLAS =================
function show(name) {
  App.screen = name;
  if (name !== 'game') document.body.classList.remove('spec');
  ['menu', 'lobby', 'room', 'game'].forEach((n) => $('#scr-' + n).classList.toggle('hidden', n !== name));
  if (name !== 'game') { closeModal(); $('#offer-pop').classList.add('hidden'); }
  if (name === 'menu' || name === 'lobby' || name === 'room') showDemo();
  if (name !== 'game') $('#size-pop').classList.add('hidden');
  if (name === 'menu') { renderResume(); if (typeof renderProfileChip === 'function') renderProfileChip(); }
  layout();
  if (name === 'game') { board.zoom = Prefs.board; board.panX = 0; board.panY = 0; board.applyCamera(true); showBoardZoom(Prefs.board); }
  else { board.zoom = 1; board.panX = 0; board.panY = 0; board.applyCamera(true); }
}
function showDemo() {
  if (App.screen === 'game') return;
  if (!App.demo) {
    const s = Engine.createGame([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
    App.demo = Engine.viewFor(s, -1);
    App.demo.boardKey = 'demo' + Math.random();
  }
  board.setTargets(null);
  board.setView(App.demo, [], -1);
}

function toast(msg, info) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('info', !!info); t.classList.add('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 2200);
}
// centro de la zona del tablero (no de la pantalla)
function boardCenter() {
  const r = board.region;
  if (App.screen !== 'game' || !r || r.w < 50) return { x: innerWidth / 2, y: innerHeight / 2, w: innerWidth };
  return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, left: r.x };
}
function bigMsg(text, color) {
  const b = $('#bigmsg');
  const c = boardCenter();
  b.style.left = (c.left != null ? c.left : 0) + 'px';
  b.style.right = 'auto';
  b.style.width = c.w + 'px';
  b.style.top = Math.round(c.y - b.offsetHeight / 2 || c.y - 30) + 'px';
  b.textContent = text; b.style.color = color || '';
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

// ================= MENÚ =================
$('#in-name').value = App.name;
$('#in-name').addEventListener('input', (e) => {
  App.name = e.target.value.toUpperCase().replace(/[^A-Z0-9ÑÁÉÍÓÚÜ _-]/gi, '').slice(0, 14) || 'JUGADOR';
  store.set('hx_name', App.name);
  if (App.ws && App.ws.readyState === 1) send({ t: 'setName', name: App.name });
});
$('#btn-local').onclick = () => { Sfx.unlock(); Sfx.click(); startLocal(); };
$('#btn-online').onclick = () => { Sfx.unlock(); Sfx.click(); goOnline(); };
$('#btn-rules').onclick = () => { Sfx.click(); openModal({ kind: 'rules' }); };
document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => { Sfx.click(); show('menu'); }));

// ================= PARTIDAS GUARDADAS =================
// Online: el servidor manda una copia cifrada de la partida; la guardamos para poder reconstruirla si se reinicia.
// Contra bots: guardamos la partida entera en este navegador para poder continuarla tras recargar o cerrar.
const SAVE_AGE = 3 * 864e5;
const Saves = {
  all() { try { return JSON.parse(store.get('hx_saves', '{}')) || {}; } catch (e) { return {}; } },
  set(token, code, blob) {
    const a = this.all();
    if (blob) a[token] = { code, blob, at: Date.now() }; else if (!code || (a[token] && a[token].code === code)) delete a[token];
    for (const k in a) if (Date.now() - a[k].at > SAVE_AGE) delete a[k];
    store.set('hx_saves', JSON.stringify(a));
  },
  mine() { const v = this.all()[App.token]; return v && Date.now() - v.at < SAVE_AGE ? v : null; },
  // la partida online más reciente guardada en este navegador (aunque la pestaña se cerrara): [token, copia]
  latest(code) {
    return Object.entries(this.all()).filter(([, v]) => Date.now() - v.at < SAVE_AGE && (!code || v.code === code)).sort((a, b) => b[1].at - a[1].at)[0] || null;
  },
  // usar la identidad guardada con esa partida (si se cerró la pestaña, el token de sesión se perdió)
  adopt(token) { App.token = token; try { sessionStorage.setItem('hx_tok', token); } catch (e) { /* */ } },
};
const LocalSave = {
  get() { try { const v = JSON.parse(store.get('hx_local', 'null')); return v && v.snap && v.snap.state && v.snap.state.phase !== 'gameOver' && Date.now() - v.at < 14 * 864e5 ? v : null; } catch (e) { return null; } },
  t: null,
  save(r) {
    clearTimeout(this.t);
    this.t = setTimeout(() => {
      if (App.localRoom !== r || !r.state) return;
      if (r.state.phase === 'gameOver') { this.clear(); return; }
      try { localStorage.setItem('hx_local', JSON.stringify({ snap: r.snapshot(), at: Date.now() })); } catch (e) { /* */ }
    }, 300);
  },
  clear() { clearTimeout(this.t); try { localStorage.removeItem('hx_local'); } catch (e) { /* */ } },
};
function localClient() { return { send: (m) => setTimeout(() => onMsg(JSON.parse(JSON.stringify(m))), 0) }; }
function resumeLocal() {
  const sv = LocalSave.get(); if (!sv) return startLocal();
  if (App.ws) { try { App.ws.close(); } catch (e) { /* */ } App.ws = null; }
  App.mode = 'local';
  if (App.localRoom) App.localRoom.destroy();
  const snap = sv.snap;
  const me = snap.seats.findIndex((x) => x.kind === 'human');
  if (me >= 0) { if (snap.host === snap.seats[me].token) snap.host = App.token; snap.seats[me].token = App.token; snap.seats[me].left = false; }
  let r = null;
  r = Room.fromSnapshot(snap, { onState: () => LocalSave.save(r) });
  App.localRoom = r;
  r.join(localClient(), App.token, App.name);
}
function renderResume() {
  const loc = LocalSave.get();
  $('#btn-resume-local').classList.toggle('hidden', !loc);
  const on = Saves.latest();
  const b = $('#btn-resume-online');
  b.classList.toggle('hidden', !on || !!new URLSearchParams(location.search).get('sala'));
  if (on) b.textContent = '↻ Volver a tu partida online (' + on[1].code + ')';
}
$('#btn-resume-local').onclick = () => { Sfx.unlock(); Sfx.click(); resumeLocal(); };
$('#btn-resume-online').onclick = () => { Sfx.unlock(); Sfx.click(); const on = Saves.latest(); if (!on) return renderResume(); Saves.adopt(on[0]); goOnline(on[1].code); };

// ================= MODO LOCAL =================
function startLocal() {
  if (App.ws) { try { App.ws.close(); } catch (e) { /* */ } App.ws = null; }
  App.mode = 'local';
  if (App.localRoom) App.localRoom.destroy();
  LocalSave.clear();
  const r = new Room({ code: 'LOCAL', name: 'PARTIDA LOCAL', isPublic: false, local: true, onState: () => LocalSave.save(r) });
  App.localRoom = r;
  r.join(localClient(), App.token, App.name);
  r.addBot(App.token, 2); r.addBot(App.token, 3); r.addBot(App.token, 4);
  show('room');
}
function localDispatch(m) {
  const r = App.localRoom; if (!r) return;
  const tk = App.token; let e = null;
  switch (m.t) {
    case 'addBot': e = r.addBot(tk, m.level); break;
    case 'botLevel': e = r.setBotLevel(tk, m.i, m.level); break;
    case 'removeSeat': e = r.removeSeat(tk, m.i); break;
    case 'start': e = r.start(tk); break;
    case 'setRules': e = r.setRules(tk, m.rules); break;
    case 'rematch': e = r.voteRematch(tk); break;
    case 'action': e = r.action(tk, m.action); break;
    case 'chat': r.say(tk, m.text); break;
    case 'leaveRoom': r.destroy(); App.localRoom = null; if (App.mode === 'p2p') P2P.close(); break;
  }
  if (e) onMsg({ t: 'error', msg: e });
}

// ================= MODO ONLINE =================
async function goOnline(joinCode) {
  await App.configReady;
  if (!App.hasServer) return goDirect(joinCode);
  App.mode = 'online';
  setLobbyMode(false);
  if (App.localRoom) { App.localRoom.destroy(); App.localRoom = null; }
  show('lobby');
  if (joinCode) App.pendingJoin = joinCode;
  if (App.ws && App.ws.readyState <= 1) { if (App.ws.readyState === 1) { send({ t: 'listRooms' }); if (App.pendingJoin) { send({ t: 'joinRoom', code: App.pendingJoin }); App.pendingJoin = null; } } return; }
  connect();
}
function connect() {
  $('#net-status').textContent = 'Conectando…';
  let ws;
  if (App.wsUrl) $('#net-status').textContent = 'Conectando con el servidor… (si estaba dormido puede tardar hasta un minuto)';
  try { ws = new WebSocket(App.wsUrl || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws')); }
  catch (e) { $('#net-status').textContent = 'No se pudo conectar al servidor. Abre el juego con "npm start".'; return; }
  App.ws = ws;
  ws.onopen = () => {
    $('#net-status').textContent = 'Conectado ✔';
    ws.send(JSON.stringify({ t: 'hello', token: App.token, name: App.name, profile: ProfStore.signed() }));
    const sv = Saves.mine();
    if (sv) ws.send(JSON.stringify({ t: 'restore', code: sv.code, blob: sv.blob }));
    if (App.pendingJoin) { send({ t: 'joinRoom', code: App.pendingJoin }); App.pendingJoin = null; }
  };
  ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  ws.onclose = () => {
    if (App.ws !== ws) return;
    $('#net-status').textContent = 'Desconectado. Reintentando…';
    if (App.mode === 'online') { if (App.screen === 'game') toast('Conexión perdida… reconectando'); setTimeout(() => { if (App.mode === 'online' && App.ws === ws) connect(); }, 1500); }
  };
}
// ================= MODO DIRECTO (sin servidor) =================
function setLobbyMode(direct) {
  $('#room-list').classList.toggle('hidden', direct);
  $('#in-public').parentElement.classList.toggle('hidden', direct);
}
function goDirect(joinCode) {
  if (App.localRoom) { App.localRoom.destroy(); App.localRoom = null; }
  App.mode = 'p2p';
  show('lobby'); setLobbyMode(true);
  if (!P2P.available()) { $('#net-status').textContent = 'No se pudo cargar el módulo de conexión. Revisa tu conexión a internet y recarga.'; return; }
  $('#net-status').textContent = 'Crea una sala y pasa el código o el enlace, o escribe el código que te hayan dado.';
  if (joinCode) directJoin(joinCode);
}
function directHost() {
  $('#net-status').textContent = 'Creando sala…';
  const name = $('#in-roomname').value.trim() || `Sala de ${App.name}`;
  P2P.host({
    name, hostToken: App.token,
    onRoom: (room, code) => {
      App.mode = 'p2p'; App.localRoom = room;
      const client = { send: (m) => setTimeout(() => onMsg(JSON.parse(JSON.stringify(m))), 0) };
      room.join(client, App.token, App.name);
      onMsg({ t: 'joined', code });
    },
    onError: (msg) => { $('#net-status').textContent = msg; toast(msg); },
  });
}
function directJoin(code) {
  App.mode = 'p2p'; App.localRoom = null;
  $('#net-status').textContent = 'Conectando con la sala ' + code + '…';
  P2P.join(code, {
    token: App.token, name: App.name,
    onMsg: (m) => onMsg(m),
    onFail: (msg) => { $('#net-status').textContent = msg; toast(msg); App.room = null; if (App.screen !== 'lobby') show('lobby'); },
    onLost: (final) => {
      if (final) { toast('Se perdió la conexión con la sala'); App.room = null; App.view = null; App.queue = []; show('lobby'); $('#net-status').textContent = 'Se perdió la conexión con la sala ' + code + '.'; }
      else toast('Reconectando con la sala…', true);
    },
  });
}
window.addEventListener('beforeunload', (e) => {
  if (App.mode === 'p2p' && P2P.role === 'host' && P2P.guestCount() > 0) { e.preventDefault(); e.returnValue = ''; }
});

function send(m) {
  if (App.mode === 'local' || (App.mode === 'p2p' && P2P.role === 'host')) return localDispatch(m);
  if (App.mode === 'p2p') { if (m.t === 'leaveRoom') { P2P.send(m); setTimeout(() => P2P.close(), 150); } else P2P.send(m); return; }
  if (App.ws && App.ws.readyState === 1) App.ws.send(JSON.stringify(m));
}

$('#btn-create').onclick = () => { Sfx.click(); if (App.mode === 'p2p') return directHost(); send({ t: 'createRoom', name: $('#in-roomname').value.trim() || `SALA DE ${App.name}`, isPublic: $('#in-public').checked }); };
$('#btn-join').onclick = () => { const c = $('#in-code').value.trim().toUpperCase(); if (c.length === 4) { Sfx.click(); if (App.mode === 'p2p') directJoin(c); else send({ t: 'joinRoom', code: c }); } else toast('El código tiene 4 caracteres'); };
$('#in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-join').click(); });

function renderRoomList(list) {
  const el = $('#room-list');
  if (!list.length) { el.innerHTML = '<p class="muted">No hay salas públicas. ¡Crea una!</p>'; return; }
  el.innerHTML = list.map((r) => {
    const full = r.players >= (r.max || 4);
    const why = r.mine ? 'Vuelve a tu sitio en esta sala' : r.started ? 'La partida ya ha empezado: puedes mirarla' : full ? 'La sala está llena: puedes mirarla' : 'Entrar a jugar en esta sala';
    const enter = r.mine ? `<button class="btn small green" data-join="${esc(r.code)}" title="${why}">↩ VOLVER</button>` : `<button class="btn small pink" data-join="${esc(r.code)}" ${r.started || full ? 'disabled' : ''} title="${why}">▶ ENTRAR</button>`;
    const del = r.canDelete ? `<button class="btn small trash" data-del="${esc(r.code)}" title="Eliminar la sala para todos">🗑</button>` : '';
    return `<div class="room-item ${r.mine ? 'mine' : ''}"><b>${esc(r.code)}</b><div class="grow">${esc(r.name)}${r.mine ? ' <span class="ri-mine">Tu sala</span>' : ''}<br><span class="muted">${r.players}/${r.max || 4} jugadores · ${r.started ? 'EN PARTIDA' : 'ESPERANDO'}${r.watchers ? ` · 👁 ${r.watchers}` : ''}</span></div>
    <div class="ri-btns">${enter}<button class="btn small cyan" data-watch="${esc(r.code)}" title="Entrar como espectador: ves la partida en directo sin jugar">👁 MIRAR</button>${del}</div></div>`;
  }).join('');
  el.querySelectorAll('[data-join]').forEach((b) => (b.onclick = () => { Sfx.click(); send({ t: 'joinRoom', code: b.dataset.join }); }));
  el.querySelectorAll('[data-watch]').forEach((b) => (b.onclick = () => { Sfx.click(); send({ t: 'joinRoom', code: b.dataset.watch, watch: true }); }));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { Sfx.click(); const r = list.find((x) => x.code === b.dataset.del); if (r) openModal({ kind: 'delroom', code: r.code, name: r.name, started: r.started, people: r.humans - (r.mine ? 1 : 0) + (r.watchers || 0) }); }));
}

// ================= SALA =================
$('#btn-leave').onclick = () => {
  Sfx.click();
  const r = App.room;
  const others = r ? r.seats.filter((x, i) => x.kind === 'human' && i !== App.you).length + (r.spectators || []).length : 0;
  if (isHost() && App.mode === 'online' && others) return openModal({ kind: 'hostleave' });
  leaveRoom();
};
$('#btn-delroom').onclick = () => { Sfx.click(); openModal({ kind: 'delroom' }); };
function isPrivateHost(h) { return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(h); }
function roomLink() {
  const base = (App.publicUrl || location.origin).replace(/\/$/, '');
  return base + location.pathname.replace(/index\.html$/, '').replace(/\/$/, '') + '/?sala=' + (App.room ? App.room.code : '');
}
function copyText(t) {
  const el = $('#room-link'); el.select();
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('¡Enlace copiado!', true), () => { try { document.execCommand('copy'); toast('¡Enlace copiado!', true); } catch (e) { toast(t, true); } });
}
$('#btn-copy').onclick = () => { Sfx.click(); copyText(roomLink()); };
$('#room-link').onclick = (e) => e.target.select();
$('#btn-share').onclick = () => {
  const url = roomLink();
  if (navigator.share) navigator.share({ title: 'Hexópolis', text: '¡Únete a mi partida de Hexópolis!', url }).catch(() => {});
  else copyText(url);
};
function renderShare() {
  const url = roomLink();
  $('#room-link').value = url;
  $('#btn-wa').href = 'https://wa.me/?text=' + encodeURIComponent('¡Únete a mi partida de Hexópolis! ' + url);
  $('#btn-share').classList.toggle('hidden', !navigator.share);
  const host = new URL(url).hostname;
  const warn = $('#link-warn');
  if (isPrivateHost(host)) {
    warn.textContent = 'Ojo: este enlace solo funciona en tu ordenador o tu wifi. Para invitar a gente de fuera, arranca el juego con «npm run online».';
    warn.classList.remove('hidden');
  } else warn.classList.add('hidden');
}
// servidor externo (p. ej. Render gratis): se duerme si nadie lo usa; lo despertamos en cuanto se abre el juego
function wakeServer() {
  try { fetch(App.wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '/config.json'), { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch (e) { /* */ }
}
function loadConfig() {
  App.configReady = fetch('config.json', { cache: 'no-store' }).then((r) => r.json()).then((c) => { App.hasServer = !!c.server; App.publicUrl = c.publicUrl || null; App.wsUrl = c.wsUrl || null; if (App.wsUrl) wakeServer(); if (App.room) renderShare(); }).catch(() => { App.hasServer = false; });
  return App.configReady;
}
document.querySelectorAll('[data-addbot]').forEach((b) => (b.onclick = () => { Sfx.click(); send({ t: 'addBot', level: +b.dataset.addbot }); }));
document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => {
  if (App.localRoom) { App.localRoom.speed = +b.dataset.speed; App.localRoom.sendRoom(); }
}));
$('#btn-start').onclick = () => { Sfx.unlock(); Sfx.click(); send({ t: 'start' }); };
$('#room-chat-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendFromInput('#room-chat-in'); });
$('#room-chat-send').onclick = () => sendFromInput('#room-chat-in');
$('#btn-take-seat').onclick = () => { Sfx.click(); if (App.room) send({ t: 'joinRoom', code: App.room.code }); };

function leaveRoom() {
  send({ t: 'leaveRoom' });
  if (App.mode === 'local') LocalSave.clear();
  else if (App.room) Saves.set(App.token, App.room.code, null);
  App.room = null; App.view = null; App.queue = []; App.busy = false; App.spectator = false;
  if (App.mode === 'local') { App.mode = null; show('menu'); }
  else show('lobby');
  history.replaceState(null, '', location.pathname);
}

function isHost() { return App.room && App.room.hostSeat === App.you; }

function renderRoom() {
  const r = App.room; if (!r) return;
  const host = isHost();
  $('#room-title').textContent = r.local ? 'PARTIDA CONTRA BOTS' : r.name.toUpperCase();
  $('#room-code-box').classList.toggle('hidden', !!r.local);
  $('#room-code').textContent = r.code;
  if (!r.local) renderShare();
  $('#room-chatbox').classList.toggle('hidden', !!r.local);
  $('#speed-row').classList.toggle('hidden', !r.local);
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === r.speed));
  const maxP = r.max || 4;
  $('#host-tools').classList.toggle('hidden', !host || r.seats.length >= maxP);
  $('#rules-sum').innerHTML = rulesSummary(r.rules, r.seats.length) + (r.rules && Engine.teamsError(r.rules, r.seats.length) ? `<span class="rchip warn">⚠ ${Engine.teamsError(r.rules, r.seats.length)}</span>` : '');
  $('#btn-room-rules').textContent = host ? '⚙ CAMBIAR REGLAS' : '📜 VER REGLAS';
  const seats = [];
  for (let i = 0; i < Math.max(4, Math.min(maxP, r.seats.length + 1)); i++) {
    const s = r.seats[i];
    if (!s) { seats.push(`<div class="seat empty"><span class="lbl-px">VACÍO</span></div>`); continue; }
    const lvl = s.kind === 'bot'
      ? (host ? `<span class="kind">Bot · elige dificultad</span><div class="lvl-pick">${[1, 2, 3, 4].map((l) => `<button data-lvl="${i}:${l}" class="${s.level === l ? 'on' : ''}" title="${LVL_NAME[l][0] + LVL_NAME[l].slice(1).toLowerCase()}"><span class="st">${'★'.repeat(l)}</span><span class="ln">${LVL_NAME[l][0] + LVL_NAME[l].slice(1).toLowerCase()}</span></button>`).join('')}</div>` : `<span class="kind">Bot ${stars(s.level)} ${LVL_NAME[s.level][0] + LVL_NAME[s.level].slice(1).toLowerCase()}</span>`)
      : `<span class="kind">${s.host ? '👑 ANFITRIÓN' : 'HUMANO'}${i === App.you ? ' (TÚ)' : ''}${s.connected ? '' : ' · DESCONECTADO'}</span>`;
    const kick = host && i !== App.you ? `<button class="x" data-kick="${i}" title="Quitar">✕</button>` : '';
    const pb = s.prof ? `<button class="seat-prof" data-pcard="${i}" title="Ver el perfil de ${esc(s.name)}">${profBadge(s.prof)}<span>${Profile.rankOf(Profile.levelOf(s.prof.xp)).name} · ver perfil</span></button>` : '';
    const tOk = r.rules && r.rules.teams && !Engine.teamsError(r.rules, r.seats.length);
    const tl = tOk ? `<span class="tm-tag big" style="--tc:${Engine.TEAM_COLORS[i % (r.seats.length / r.rules.teams)]}">Equipo ${Engine.TEAM_NAMES[i % (r.seats.length / r.rules.teams)]}</span>` : '';
    seats.push(`<div class="seat" style="--c:${s.color}">${tl}<span class="nm">${esc(s.name)}</span>${pb}${lvl}${kick}</div>`);
  }
  $('#seats').innerHTML = seats.join('');
  $('#seats').querySelectorAll('[data-lvl]').forEach((b) => (b.onclick = () => { const [i, l] = b.dataset.lvl.split(':').map(Number); Sfx.click(); send({ t: 'botLevel', i, level: l }); }));
  $('#seats').querySelectorAll('[data-pcard]').forEach((b) => (b.onclick = () => { Sfx.click(); const s = App.room.seats[+b.dataset.pcard]; if (s && s.prof) openModal({ kind: 'pcard', prof: s.prof }); }));
  $('#seats').querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => { Sfx.click(); send({ t: 'removeSeat', i: +b.dataset.kick }); }));
  const watchers = r.spectators || [];
  $('#room-watchers').classList.toggle('hidden', !watchers.length);
  $('#room-watchers').textContent = watchers.length ? `👁 Mirando: ${watchers.join(', ')}` : '';
  $('#btn-take-seat').classList.toggle('hidden', !(App.spectator && !r.started && r.seats.length < maxP));
  $('#btn-delroom').classList.toggle('hidden', !(host && App.mode === 'online'));
  $('#btn-start').classList.toggle('hidden', !host);
  $('#btn-start').disabled = r.seats.length < 2;
  $('#room-wait').textContent = host ? (r.seats.length < 2 ? 'Añade bots o espera a otros jugadores (mínimo 2).' : '') : 'Esperando a que el anfitrión empiece la partida…';
  if (App.spectator) $('#room-wait').textContent = r.started ? '👁 Estás mirando esta sala como espectador. Ya no se puede entrar a jugar en esta partida.' : '👁 Estás mirando esta sala como espectador. Pulsa «Jugar en esta sala» para ocupar un sitio libre.';
  renderRoomChat();
}
// ----- equipos -----
function teamBarHTML(v) {
  if (!v.teams) return '';
  let h = '';
  for (let t = 0; t < v.teams.count; t++) {
    const tv = v.players.filter((p) => Engine.teamOf(v, p.id) === t).reduce((a, p) => a + p.vp, 0);
    h += `<span class="tm-score" style="--tc:${Engine.TEAM_COLORS[t]}"><b>${Engine.TEAM_NAMES[t]}</b>${tv}<small>/${v.teams.target}</small></span>`;
  }
  return `<div class="tm-bar" title="Puntos de cada equipo">👥 ${h}</div>`;
}

// ----- revancha por votación -----
function rematchHTML() {
  const R = App.room || {}, me = App.me;
  const votes = new Set(R.rematch || []);
  const humans = (R.seats || []).map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'human' && x.s.connected);
  const voted = votes.has(me), all = humans.length && humans.every((x) => votes.has(x.i));
  const list = humans.length > 1 ? `<div class="rm-list">${humans.map((x) => `<span class="rchip ${votes.has(x.i) ? 'sp' : 'dim'}">${votes.has(x.i) ? '✔' : '…'} ${esc(x.s.name)}</span>`).join('')}</div>` : '';
  const note = humans.length > 1 ? 'La revancha empieza cuando todos la pidan: mismas personas y reglas, mapa nuevo.' : 'Mapa nuevo con las mismas reglas.';
  const vote = me >= 0 ? `<button class="btn ${voted ? 'ghost' : 'pink'}" id="g-vote">${voted ? (all ? 'Empezando…' : '✔ Esperando a los demás · cancelar') : '▶ OTRA PARTIDA'}</button>` : '<span class="muted">Los jugadores pueden pedir la revancha</span>';
  const force = isHost() && humans.length > 1 && votes.size && !all ? '<button class="btn small yellow" id="g-force" title="Empieza la revancha con quien esté conectado">Empezar ya</button>' : '';
  return `<div class="rm-box"><b>¿Revancha?</b>${list}<small class="muted">${note}</small></div>
    <div class="row gap between wrap"><button class="btn ghost" id="g-menu">SALIR</button><button class="btn small" data-close>VER TABLERO</button>${force}${vote}</div>`;
}

// ----- resumen al final de la partida -----
function gameSummaryHTML(v) {
  const order = v.players.slice().sort((a, b) => b.vp - a.vp || (a.id === v.winner ? -1 : b.id === v.winner ? 1 : 0));
  const S = (v.stats && v.stats.pl) || v.players.map(() => ({}));
  const g = (i, k) => (S[i] && S[i][k]) || 0;
  let rank = `<div class="gameover-list">${order.map((p, k) => `<div class="go-row ${p.id === v.winner ? 'win' : ''}" style="--c:${p.color}"><span>${k + 1}º</span><span class="grow" style="color:${p.color}">${esc(p.name)}${p.bot ? ' ' + stars(p.bot) : ''}</span><span>${p.vp} PV</span></div>`).join('')}</div>`;
  if (v.teams) {
    const teams = []; for (let t = 0; t < v.teams.count; t++) teams.push({ t, vp: v.players.filter((p) => Engine.teamOf(v, p.id) === t).reduce((a, p) => a + p.vp, 0) });
    teams.sort((a, b) => (b.t === v.winTeam) - (a.t === v.winTeam) || b.vp - a.vp);
    rank = `<div class="gameover-list">${teams.map((T, k) => `<div class="go-row ${T.t === v.winTeam ? 'win' : ''}" style="--c:${Engine.TEAM_COLORS[T.t]}"><span>${k + 1}º</span><span class="grow"><b style="color:${Engine.TEAM_COLORS[T.t]}">Equipo ${Engine.TEAM_NAMES[T.t]}</b> · ${v.players.filter((p) => Engine.teamOf(v, p.id) === T.t).map((p) => `<span style="color:${p.color}">${esc(p.name)} (${p.vp})</span>`).join(' + ')}</span><span>${T.vp}/${v.teams.target} PV</span></div>`).join('')}</div>`;
  }
  // datos generales
  const R = App.room || {};
  const mins = R.startedAt ? Math.max(1, Math.round(((R.endedAt || Date.now()) - R.startedAt) / 60000)) : null;
  const rolls = (v.stats && v.stats.rolls) || [];
  let lucky = null; for (let n = 2; n <= 12; n++) if ((rolls[n] || 0) > (lucky ? rolls[lucky] : 0)) lucky = n;
  const facts = [`🔁 ${v.turn} turnos`, mins ? `⏱️ ${mins} min` : '', `🗺️ Mapa ${v.map === 'big' ? 'grande' : 'normal'}`, v.teams ? `👥 Meta del equipo: ${v.teams.target}` : `🏆 A ${Engine.winVP(v)} puntos`].filter(Boolean)
    .map((t) => `<span class="rchip">${t}</span>`).join('');
  // premios
  const best = (fn) => { let b = -1, bv = 0; v.players.forEach((p, i) => { const x = fn(i); if (x > bv) { bv = x; b = i; } }); return b >= 0 ? { i: b, n: bv } : null; };
  const aw = [];
  const add = (icon, title, r, txt) => { if (r) aw.push(`<div class="aw-card" style="--c:${v.players[r.i].color}"><span class="aw-ic">${icon}</span><span><b>${title}</b><small><i style="color:${v.players[r.i].color}">${esc(v.players[r.i].name)}</i> · ${txt(r.n)}</small></span></div>`); };
  add('🌾', 'Gran productor', best((i) => g(i, 'prod')), (n) => `${n} cartas producidas`);
  add('🦹', 'Mano larga', best((i) => g(i, 'stole')), (n) => `robó ${n} ${n === 1 ? 'carta' : 'cartas'}`);
  add('🎯', 'Diana del ladrón', best((i) => g(i, 'robbed')), (n) => `le robaron ${n} ${n === 1 ? 'carta' : 'cartas'}`);
  add('🤝', 'Comerciante', best((i) => g(i, 'trades') + g(i, 'bank')), (n) => `${n} intercambios`);
  add('🃏', 'Coleccionista', best((i) => g(i, 'devBought')), (n) => `${n} cartas de desarrollo`);
  add('🗑️', 'Manos llenas', best((i) => g(i, 'discarded')), (n) => `descartó ${n} cartas con el 7`);
  if (v.longestRoad.owner != null) aw.push(`<div class="aw-card" style="--c:${v.players[v.longestRoad.owner].color}"><span class="aw-ic">🛣️</span><span><b>Camino más largo</b><small><i style="color:${v.players[v.longestRoad.owner].color}">${esc(v.players[v.longestRoad.owner].name)}</i> · ${v.longestRoad.len} tramos</small></span></div>`);
  if (v.largestArmy.owner != null) aw.push(`<div class="aw-card" style="--c:${v.players[v.largestArmy.owner].color}"><span class="aw-ic">⚔️</span><span><b>Ejército más grande</b><small><i style="color:${v.players[v.largestArmy.owner].color}">${esc(v.players[v.largestArmy.owner].name)}</i> · ${v.largestArmy.size} caballeros</small></span></div>`);
  if (lucky) aw.push(`<div class="aw-card"><span class="aw-ic">🎲</span><span><b>Número de la suerte</b><small>El ${lucky} salió ${rolls[lucky]} veces</small></span></div>`);
  // gráfica de puntos por ronda
  const hist = (v.stats && v.stats.vpHist) || [];
  let chart = '';
  if (hist.length >= 2) {
    const W = 600, H = 210, L = 28, B = 22, T = 10, Rr = 10;
    const maxY = Math.max(v.teams ? 2 : Engine.winVP(v), ...hist.flat());
    const x = (k) => L + (k / (hist.length - 1)) * (W - L - Rr), y = (n) => T + (1 - n / maxY) * (H - T - B);
    let grid = '';
    for (let n = 0; n <= maxY; n += maxY > 12 ? 4 : 2) grid += `<line x1="${L}" x2="${W - Rr}" y1="${y(n)}" y2="${y(n)}" class="gl"/><text x="${L - 6}" y="${y(n) + 4}" class="gt" text-anchor="end">${n}</text>`;
    if (!v.teams) grid += `<line x1="${L}" x2="${W - Rr}" y1="${y(Engine.winVP(v))}" y2="${y(Engine.winVP(v))}" class="gl goal"/>`;
    const step = Math.max(1, Math.ceil(hist.length / 8));
    for (let k = 0; k < hist.length; k += step) grid += `<text x="${x(k)}" y="${H - 5}" class="gt" text-anchor="middle">${k + 1}</text>`;
    const lines = v.players.map((p, i) => `<polyline points="${hist.map((r, k) => `${x(k).toFixed(1)},${y(r[i] || 0).toFixed(1)}`).join(' ')}" fill="none" stroke="${p.color}" stroke-width="${i === v.winner ? 3.2 : 2}" stroke-linejoin="round" stroke-linecap="round" ${i === v.winner ? '' : 'opacity=".8"'}/>`).join('');
    chart = `<h4 class="tr-sub">Puntos ronda a ronda</h4><svg class="vp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de los puntos de cada jugador">${grid}${lines}</svg>
      <div class="vp-legend">${v.players.map((p) => `<span><i style="background:${p.color}"></i>${esc(p.name)}</span>`).join('')}</div>`;
  }
  // tabla
  const cols = [['PV', (p) => p.vp], ['Producidas', (p) => g(p.id, 'prod')], ['Robó', (p) => g(p.id, 'stole')], ['Le robaron', (p) => g(p.id, 'robbed')], ['Descartó', (p) => g(p.id, 'discarded')], ['Tratos', (p) => g(p.id, 'trades')], ['Banco', (p) => g(p.id, 'bank')], ['Cartas desarr.', (p) => g(p.id, 'devBought')], ['Caballeros', (p) => p.knights], ['Camino', (p) => p.roadLen]];
  const table = `<h4 class="tr-sub">Estadísticas</h4><div class="st-wrap"><table class="st-table"><thead><tr><th></th>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${order.map((p) => `<tr><td style="color:${p.color}">${esc(p.name)}</td>${cols.map((c) => `<td>${c[1](p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  // tiradas
  let tot = 0; for (let n = 2; n <= 12; n++) tot += rolls[n] || 0;
  let mx = 1; for (let n = 2; n <= 12; n++) mx = Math.max(mx, rolls[n] || 0, tot * ROLL_WAYS[n] / 36);
  let bars = ''; for (let n = 2; n <= 12; n++) { const c = rolls[n] || 0, red = n === 6 || n === 8 || n === 7; bars += `<div class="col" title="${n}: ${c} veces (esperado ${(tot * ROLL_WAYS[n] / 36).toFixed(1)})"><div class="area"><span class="cnt">${c || ''}</span><div class="bar ${red ? 'red' : ''}" style="height:${(c / mx) * 100}%"></div>${tot ? `<div class="exp" style="bottom:${(tot * ROLL_WAYS[n] / 36 / mx) * 100}%"></div>` : ''}</div><span class="lab ${red ? 'red' : ''}">${n}</span></div>`; }
  const dice = `<h4 class="tr-sub">Tiradas de dados <small class="muted">(${tot}; la línea marca lo esperado)</small></h4><div class="roll-chart go-rolls">${bars}</div>`;
  return `<div class="go-sum">${rank}<div class="rr-mini">${facts}</div>
    ${v.stalled ? '<p class="muted">Terminó porque nadie podía avanzar: gana quien más puntos tenía.</p>' : ''}
    ${aw.length ? `<h4 class="tr-sub">Premios</h4><div class="aw-grid">${aw.join('')}</div>` : ''}
    ${chart}${table}${dice}</div>`;
}

// ----- reglas de la partida -----
function handLimit(v) { return Engine.rulesOf(v).hand; }
function devReady(v, P, c) { return P.dev[c] - P.devNew[c]; }
function rulesSummary(R, n) {
  if (!R) return '';
  const big = Engine.mapKind(R, n) === 'big';
  const chips = [
    `<span class="rchip">🗺️ Mapa ${big ? 'grande' : 'normal'}${R.map === 'auto' ? ' (auto)' : ''}</span>`,
    `<span class="rchip">🏆 ${R.vp} puntos</span>`,
    ...(R.teams ? [`<span class="rchip sp">👥 ${R.teams === 2 ? 'Parejas' : 'Tríos'} · meta ${Engine.teamTarget(R.vp, R.teams)}</span>`] : []),
    ...(R.vp > 10 ? [`<span class="rchip" title="Piezas por jugador: poblados, ciudades y caminos">🏠 ${Engine.piecesFor(R.vp).settlements} · 🏙️ ${Engine.piecesFor(R.vp).cities} · 🛣️ ${Engine.piecesFor(R.vp).roads}</span>`] : []),
    `<span class="rchip">🃏 ${R.hand === 99 ? 'Sin límite de cartas' : 'Límite ' + R.hand + ' cartas'}</span>`,
  ];
  Engine.SPECIAL_RULES.filter((x) => R[x.key]).forEach((x) => chips.push(`<span class="rchip sp" title="${esc(x.desc)}">${x.icon} ${x.name}</span>`));
  if (!Engine.SPECIAL_RULES.some((x) => R[x.key])) chips.push('<span class="rchip dim">Sin normas especiales</span>');
  return chips.join('');
}
function piecesTxt(vp) {
  const p = Engine.piecesFor(vp);
  return `Cada jugador tiene <b>${p.settlements} poblados, ${p.cities} ciudades y ${p.roads} caminos</b>${vp > 10 ? ' (más de lo normal para poder llegar)' : ''}.`;
}
function rulesDetail(R, n, map) {
  const sp = Engine.SPECIAL_RULES.filter((x) => R[x.key]);
  const pc = Engine.piecesFor(R.vp);
  return `<div class="rr-mini"><span class="rchip">🗺️ Mapa ${(map || Engine.mapKind(R, n)) === 'big' ? 'grande' : 'normal'}</span><span class="rchip">🏆 ${R.vp} puntos</span>${R.teams ? `<span class="rchip sp">👥 ${R.teams === 2 ? 'Parejas' : 'Tríos'} · meta del equipo ${Engine.teamTarget(R.vp, R.teams)}</span>` : ''}<span class="rchip">🏠 ${pc.settlements} · 🏙️ ${pc.cities} · 🛣️ ${pc.roads}</span><span class="rchip">🃏 ${R.hand === 99 ? 'Sin límite de cartas' : 'Límite ' + R.hand + ' cartas con el 7'}</span></div>
    ${sp.length ? `<ul class="rr-ul">${sp.map((x) => `<li><b>${x.icon} ${x.name}:</b> ${x.desc}</li>`).join('')}</ul>` : '<p class="muted">Sin normas especiales.</p>'}`;
}
$('#btn-room-rules').onclick = () => { Sfx.click(); openModal({ kind: 'roomRules' }); };

function renderRoomChat() {
  const html = App.chat.slice(-30).map((m) => m.sys ? `<div class="sys">» ${esc(m.text)}</div>` : `<div><b style="color:${m.color}">${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('');
  const el = $('#room-chat'); el.innerHTML = html; el.scrollTop = el.scrollHeight;
}

// ================= MENSAJES =================
function onMsg(m) {
  switch (m.t) {
    case 'rooms': if (App.screen === 'lobby') renderRoomList(m.list); break;
    case 'joined':
      if (App.mode === 'online' || App.mode === 'p2p') history.replaceState(null, '', '?sala=' + m.code);
      break;
    case 'room': {
      if (m.spectator && !App.spectator) toast('👁 Estás mirando como espectador', true);
      App.room = m.room; App.you = m.you; App.chat = m.chat || []; App.spectator = !!m.spectator;
      if (!m.room.started || m.room.over) {
        if (!m.room.started) { App.view = null; App.queue = []; App.busy = false; if (App.screen !== 'room') show('room'); }
        else if (App.screen === 'game') renderHUD();
      } else if (App.screen === 'game') renderHUD();
      renderRoom();
      if (App.ui.modal && (App.ui.modal.kind === 'roomRules' || App.ui.modal.kind === 'gameover')) renderModal();
      break;
    }
    case 'chat':
      App.chat.push(m.msg); if (App.chat.length > 60) App.chat.shift();
      renderRoomChat(); if (App.screen === 'game') { renderChatSide(); if (!m.msg.sys && m.msg.seat >= 0) chatBubble(m.msg.seat, m.msg.text); }
      if (!m.msg.sys && App.screen === 'game') Sfx.hover();
      break;
    case 'state': enqueue(m.view, m.events || []); break;
    case 'save': Saves.set(App.token, m.code, m.blob); break;
    case 'profile': case 'profileBad': case 'profileUpdate': case 'friends': handleProfileMsg(m); break;
    case 'restored': toast('Partida recuperada: seguimos donde lo dejasteis', true); break;
    case 'restoreFail': Saves.set(App.token, m.code, null); break;
    case 'error': toast(m.msg); Sfx.error(); break;
    case 'joinFail': App.room = null; if (App.mode === 'p2p') P2P.close(); show('lobby'); $('#net-status').textContent = m.msg || 'No se pudo entrar en la sala'; break;
    case 'roomClosed': {
      if (m.fromList) { closeModal(); toast('🗑 Sala eliminada', true); break; } // eliminada desde la lista: te quedas en la lista
      // la sala ya no existe: todos vuelven al menú principal
      closeModal();
      Saves.set(App.token, m.code, null);
      App.room = null; App.view = null; App.queue = []; App.busy = false; App.spectator = false;
      history.replaceState(null, '', location.pathname);
      const ws = App.ws; App.ws = null; App.mode = null;
      if (ws) { try { ws.close(); } catch (e) { /* */ } }
      show('menu');
      toast(m.byMe ? '🗑 Sala eliminada' : 'El anfitrión ha eliminado la sala', !!m.byMe);
      break;
    }
    case 'kicked': toast('Te han expulsado de la sala'); App.room = null; if (App.mode === 'p2p') P2P.close(); show('lobby'); if (App.mode === 'online') send({ t: 'listRooms' }); break;
  }
}

// ================= COLA DE ESTADOS =================
function enqueue(view, events) { App.queue.push({ view, events }); pump(); }
function pump() {
  if (App.busy) return;
  // si se acumulan muchos estados (bots muy rápidos), saltar animaciones intermedias
  while (App.queue.length > 6) {
    const skip = App.queue.shift();
    const keep = skip.events.filter((e) => ['win', 'start', 'discardStart'].includes(e.type));
    applyState(skip.view, keep);
  }
  const it = App.queue.shift(); if (!it) return;
  const roll = it.events.find((e) => e.type === 'roll');
  if (roll && App.queue.length < 4) {
    App.busy = true; Sfx.dice();
    if (App.screen !== 'game') applyState(it.view, []);
    let done = false;
    const finish = () => { if (done) return; done = true; applyState(it.view, it.events); setTimeout(() => { App.busy = false; pump(); }, 120); };
    fx.rollDice(roll.dice, finish, roll.pid === App.me ? bigDicePos() : smallDicePos());
    setTimeout(finish, 800); // por si la pestaña está en segundo plano (sin requestAnimationFrame)
  } else {
    applyState(it.view, it.events);
    if (App.queue.length) { App.busy = true; setTimeout(() => { App.busy = false; pump(); }, 60); }
  }
}

// tus dados: grandes en el centro del tablero
function bigDicePos() {
  const c = boardCenter();
  const size = Math.round(Math.min(84, Math.max(48, c.w * 0.12)));
  return { cx: c.x, cy: c.y - size * 0.4, size, small: false };
}
// dónde salen los dados cuando tira otro jugador: encima de la gráfica y los costes
function smallDicePos() {
  const W = innerWidth;
  const size = Math.round(Math.min(46, Math.max(30, W * 0.035)) * Prefs.ui);
  if (W <= 800) {
    const pb = $('#players').getBoundingClientRect().bottom;
    return { cx: W - size * 2.6, cy: pb + size * 1.1, size, small: true };
  }
  const info = $('#info').getBoundingClientRect();
  return { cx: info.left + info.width / 2, cy: info.top - size * 0.95, size, small: true };
}

function applyState(view, events) {
  view.boardKey = view.board.hexes.map((h) => h.res[0] + h.num).join('') + view.board.robber * 0 + view.players.length;
  const prev = App.view;
  if (events.some((e) => e.type === 'start') || (prev && prev.boardKey !== view.boardKey)) { App.ui.build = null; closeModal(); }
  App.view = view; App.me = view.me;
  if (App.screen !== 'game') show('game');
  board.setView(view, events, App.me);
  if (view.phase !== 'main' || view.current !== App.me) App.ui.build = null;
  autoModals();
  renderHUD();
  handleEvents(events, prev);
  updateTargets();
  if (typeof maybeTutorial === 'function') maybeTutorial();
}

// ================= EVENTOS / ANIMACIONES =================
function elCenter(el) { if (!el) return { x: innerWidth / 2, y: innerHeight / 2 }; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
// tarjeta o línea de un jugador (en modo espectador se usan las tarjetas grandes de la izquierda)
function plEl(pid) { return isSpec() ? $('#spc-' + pid) : $('#pl-' + pid); }
function isSpec() { return App.screen === 'game' && App.me < 0 && !!App.view; }
function targetFor(pid, res) { return pid === App.me ? $('#rc-' + res) || $('#hand') : plEl(pid); }
function bump(el) { if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

function handleEvents(events, prev) {
  const v = App.view, me = App.me;
  let chipN = 0;
  for (const e of events) {
    switch (e.type) {
      case 'start': bigMsg('¡A JUGAR!'); Sfx.turn(); App.lastGain = null; break;
      case 'build': {
        const p = e.kind === 'road' ? midEdge(e.e) : board.vertexScreen(e.v);
        const col = v.players[e.pid].color;
        fx.burst(p.x, p.y, col, e.kind === 'road' ? 10 : 26, e.kind === 'city' ? 6 : 4);
        if (e.kind === 'road') Sfx.road();
        else { e.kind === 'city' ? Sfx.city() : Sfx.build(); fx.text('+1', p.x, p.y - 20, '#f2c14e', 16); }
        break;
      }
      case 'produce':
        for (const g of e.gains) {
          const from = g.hex != null ? board.hexScreen(g.hex) : boardCenter();
          for (let k = 0; k < g.n; k++) {
            const d = chipN++ * 90;
            const to = elCenter(targetFor(g.pid, g.res));
            fx.fly(Sprites.get(g.res, 4), from, to, d, () => { bump(targetFor(g.pid, g.res)); if (g.pid === me) Sfx.coin(); }, g.pid === me ? 34 : 24);
          }
        }
        if (!e.setup && !e.gains.length && e.roll !== 7) fx.text('SIN PRODUCCIÓN', boardCenter().x, boardCenter().y - 90, '#95a8bd', 12);
        break;
      case 'roll':
        renderDiceMini(e.dice);
        if (e.sum === 7) { board.shake(); fx.doFlash('#e5484d'); bigMsg('¡LADRÓN!', '#e5484d'); Sfx.robber(); }
        break;
      case 'robber': Sfx.robber(); break;
      case 'steal': {
        const from = elCenter(plEl(e.from)), to = elCenter(e.pid === me ? $('#hand') : plEl(e.pid));
        fx.fly(Sprites.get(e.res || 'card', 4), from, to, 300, () => bump(e.pid === me ? $('#hand') : plEl(e.pid)), 30);
        if (e.pid === me && e.res) toast(`Robaste ${RN[e.res]} a ${v.players[e.from].name}`, true);
        if (e.from === me && e.res) toast(`${v.players[e.pid].name} te robó ${RN[e.res]}`);
        break;
      }
      case 'turn':
        if (e.pid === me) { bigMsg('¡TU TURNO!'); Sfx.turn(); }
        break;
      case 'setupNext': if (e.pid === me) Sfx.turn(); break;
      case 'longestRoad': if (e.pid != null) { bigMsg('CAMINO MÁS LARGO', v.players[e.pid].color); Sfx.bonus(); } break;
      case 'largestArmy': bigMsg('EJÉRCITO MÁS GRANDE', v.players[e.pid].color); Sfx.bonus(); break;
      case 'buyDev':
        Sfx.card();
        if (e.pid === me && e.card) toast(`Carta: ${Engine.DEV_NAMES[e.card]}`, true);
        fx.fly(Sprites.get('card', 4), elCenter($('#actions')), elCenter(e.pid === me ? $('#devs') : plEl(e.pid)), 0, null, 30);
        break;
      case 'playDev':
        Sfx.card();
        if (e.pid !== me) toast(`${v.players[e.pid].name} juega ${Engine.DEV_NAMES[e.card]}`, true);
        break;
      case 'gain': for (const r of e.res) fx.fly(Sprites.get(r, 4), { x: boardCenter().x, y: boardCenter().y }, elCenter(targetFor(e.pid, r)), chipN++ * 120, () => Sfx.coin(), 30); break;
      case 'monopoly':
        e.takes.forEach((t, i) => fx.fly(Sprites.get(e.res, 4), elCenter(plEl(t.from)), elCenter(targetFor(e.pid, e.res)), i * 150, () => Sfx.coin(), 30));
        bigMsg('¡MONOPOLIO!', v.players[e.pid].color);
        break;
      case 'trade': case 'bankTrade': Sfx.trade(); if (e.type === 'trade' && (e.with === me || e.pid === me)) toast('¡Trato cerrado!', true); break;
      case 'offer': if (e.pid !== me) Sfx.card(); break;
      case 'tradeCancel': break;
      case 'gift': if (e.to === me) { Sfx.coin(); toast(`🎁 ${v.players[e.pid].name} te regala ${e.n} ${e.n === 1 ? 'carta' : 'cartas'}`, true); } break;
      case 'discard':
        if (e.split) {
          const mine = e.split.find((x) => x.to === me);
          if (mine && e.pid !== me) { Sfx.coin(); toast(`🧤 Recibes ${mine.n} ${mine.n === 1 ? 'carta' : 'cartas'} del descarte de ${v.players[e.pid].name}`, true); }
          break;
        }
        break;
      case 'win':
        fx.confetti();
        if (e.team != null) {
          if (me >= 0 && Engine.teamOf(v, me) === e.team) { bigMsg('¡VICTORIA DEL EQUIPO!'); Sfx.win(); } else { bigMsg(`¡GANA EL EQUIPO ${Engine.TEAM_NAMES[e.team]}!`, Engine.TEAM_COLORS[e.team]); if (me >= 0) Sfx.lose(); else Sfx.win(); }
        } else if (e.pid === me) { bigMsg('¡VICTORIA!'); Sfx.win(); } else { bigMsg(`¡GANA ${v.players[e.pid].name}!`, v.players[e.pid].color); Sfx.lose(); }
        setTimeout(() => openModal({ kind: 'gameover' }), 1600);
        break;
    }
  }
}
function midEdge(id) { const e = App.view.board.edges[id]; const a = board.vertexScreen(e.a), b = board.vertexScreen(e.b); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function renderDiceMini(d) {
  const el = $('#dice-mini');
  if (!d) { setHTML(el, ''); return; }
  const seven = d[0] + d[1] === 7 ? ' seven' : '';
  setHTML(el, `<div class="d${seven}">${d[0]}</div><div class="d${seven}">${d[1]}</div>`);
}

// ================= OBJETIVOS EN EL TABLERO =================
function updateTargets() {
  const v = App.view, me = App.me;
  if (!v || me < 0 || v.phase === 'gameOver' || App.screen !== 'game') { board.setTargets(null); return; }
  const P = v.players[me];
  let t = null;
  if (v.current === me) {
    if (v.phase === 'setup') t = v.setup.step === 'settlement' ? { type: 'vertex', ids: Engine.legalSettlements(v, me, true) } : { type: 'edge', ids: Engine.legalRoads(v, me, v.setup.last) };
    else if (v.phase === 'robber') t = { type: 'hex', ids: v.board.hexes.filter((h) => Engine.robberHexOk(v, me, h.id)).map((h) => h.id) };
    else if (v.phase === 'roadBuilding') t = { type: 'edge', ids: Engine.legalRoads(v, me) };
    else if (v.phase === 'main' && App.ui.build) {
      const b = App.ui.build;
      if (b === 'road') t = { type: 'edge', ids: Engine.legalRoads(v, me) };
      if (b === 'settlement') t = { type: 'vertex', ids: Engine.legalSettlements(v, me, false) };
      if (b === 'city') t = { type: 'vertex', ids: Engine.legalCities(v, me) };
    }
  }
  board.setTargets(t && t.ids.length ? { type: t.type, ids: new Set(t.ids), color: P.color } : null);
}

function act(a) { Sfx.click(); send({ t: 'action', action: a }); }

function onPick(type, id) {
  const v = App.view; if (!v) return;
  const me = App.me;
  if (type === 'vertex') {
    if (v.phase === 'setup') act({ type: 'placeSettlement', v: id });
    else if (App.ui.build === 'settlement') act({ type: 'placeSettlement', v: id });
    else if (App.ui.build === 'city') act({ type: 'placeCity', v: id });
  } else if (type === 'edge') {
    act({ type: 'placeRoad', e: id });
  } else if (type === 'hex') {
    const victims = Engine.robberVictims(v, me, id);
    if (victims.length > 1) openModal({ kind: 'victim', hex: id, victims, picks: [null, null] });
    else act({ type: 'moveRobber', hex: id, victim: victims[0] });
  }
  App.ui.build = null;
  board.setTargets(null);
}

function setBuild(kind) {
  const v = App.view;
  if (!v || v.phase !== 'main' || v.current !== App.me) return;
  App.ui.build = App.ui.build === kind ? null : kind;
  Sfx.click();
  renderActions(); renderBuild(); renderBanner(); updateTargets();
}

// ================= HUD =================
function renderHUD() {
  if (!App.view || App.screen !== 'game') return;
  const spec = isSpec();
  if (document.body.classList.contains('spec') !== spec) { document.body.classList.toggle('spec', spec); if (spec) { App.ui.stab = App.ui.stab || 'chat'; $('#spec-qc').innerHTML = qcHTML(); } setTimeout(layout, 0); }
  if (spec) renderSpecCards();
  renderPlayers(); renderHand(); renderBuild(); renderActions(); renderBanner(); renderLog(); renderOffer(); renderInfo();
  if (App.view.dice) renderDiceMini(App.view.dice);
  if (App.ui.modal) renderModal();
  layoutIfNeeded();
}

function renderPlayers() {
  const v = App.view, me = App.me;
  const T = v.trade;
  const seatInfo = App.room ? App.room.seats : [];
  const open = App.ui.plOpen || (App.ui.plOpen = new Set());
  setHTML($('#players'), v.players.map((p, i) => {
    const cur = v.current === i && v.phase !== 'gameOver';
    let tag = '';
    if (T && i in T.responses) {
      const r = T.responses[i];
      tag = r === 'accept' ? '<span class="pl-tag ok">Acepta</span>' : r === 'reject' ? '<span class="pl-tag no">Rechaza</span>' : '<span class="pl-tag wait">Pensando…</span>';
    }
    if (v.phase === 'discard' && v.pendingDiscard && v.pendingDiscard[i]) tag = `<span class="pl-tag wait">Descarta ${v.pendingDiscard[i]}</span>`;
    const off = seatInfo[i] && seatInfo[i].kind === 'human' && !seatInfo[i].connected ? '<span class="pl-off">Desconectado</span>' : '';
    const lr = v.longestRoad.owner === i, la = v.largestArmy.owner === i;
    const who = i === me ? 'Tú' : p.bot ? `Bot ${stars(p.bot)}` : 'Jugador';
    const pct = Math.min(100, (p.vp / Engine.winVP(v)) * 100);
    const many = p.resCount > handLimit(v);
    const isOpen = open.has(i);
    const line = `<div class="pl-line ${cur ? 'cur' : ''} ${i === me ? 'me' : ''} ${isOpen ? 'open' : ''}" id="pl-${i}" data-pl="${i}" title="Pulsa para ${isOpen ? 'plegar' : 'desplegar'} los datos de ${esc(p.name)}">
        <span class="nm">${cur ? '<i class="turn">▶</i>' : ''}${esc(p.name)}</span>
        <span class="li vp" title="Puntos de victoria"><img src="${Sprites.url('trophy', 3)}" alt=""><b>${p.vp}</b></span>
        <span class="li ${lr ? 'gold' : ''}" title="Camino más largo propio${lr ? ' · tiene el Camino más largo' : ''}"><img src="${Sprites.url('road', 3, p.color)}" alt=""><b>${p.roadLen}</b></span>
        <span class="li ${la ? 'gold' : ''}" title="Caballeros jugados${la ? ' · tiene el Ejército más grande' : ''}"><img src="${Sprites.url('knight', 3)}" alt=""><b>${p.knights}</b></span>
        <span class="li ${many ? 'warn' : ''}" title="Cartas de recurso${many ? ` (¡más de ${handLimit(v)}!)` : ''}"><img src="${Sprites.url('card', 3)}" alt=""><b>${p.resCount}</b></span>
        <span class="li" title="Cartas de desarrollo"><img src="${Sprites.url('devcard', 3)}" alt=""><b>${p.devCount}</b></span>
        <span class="chev">${isOpen ? '▴' : '▾'}</span>
        ${tag}${off}
      </div>`;
    const big = isOpen ? `<div class="pl-pop"><div class="pl ${cur ? 'cur' : ''} ${i === me ? 'me' : ''}" style="--c:${p.color}">
        <div class="pl-head">
          <div class="pl-id"><span class="nm">${esc(p.name)}</span><span class="who">${who}${cur ? ' · <b>su turno</b>' : ''}</span></div>
          <div class="pl-vp" title="Puntos de victoria visibles (se gana con ${Engine.winVP(v)})"><b>${p.vp}</b><small>/${Engine.winVP(v)} PV</small></div>
        </div>
        <div class="vpbar"><i style="width:${pct}%"></i></div>
        <div class="pl-stats">
          <div class="ps ${many ? 'warn' : ''}" title="Cartas de recurso en la mano"><img src="${Sprites.url('card', 3)}"><b>${p.resCount}</b><small>Cartas</small></div>
          <div class="ps" title="Cartas de desarrollo sin jugar"><img src="${Sprites.url('devcard', 3)}"><b>${p.devCount}</b><small>Desarr.</small></div>
          <div class="ps ${la ? 'gold' : ''}" title="Caballeros jugados"><img src="${Sprites.url('knight', 3)}"><b>${p.knights}</b><small>Caball.</small></div>
          <div class="ps ${lr ? 'gold' : ''}" title="Camino continuo más largo"><img src="${Sprites.url('road', 3, p.color)}"><b>${p.roadLen}</b><small>Camino</small></div>
        </div>
        ${lr || la ? `<div class="pl-awards">${lr ? '<span class="aw">🛣️ Camino más largo</span>' : ''}${la ? '<span class="aw">⚔️ Ejército</span>' : ''}</div>` : ''}
        ${many ? '<p class="pl-note">¡Tiene más de ${handLimit(v)} cartas! Si sale un 7 descarta la mitad.</p>' : ''}
        <button class="btn small ghost pl-more" data-plmore="${i}">Ver ficha completa</button>
      </div></div>` : '';
    const tt = v.teams ? `<span class="tm-tag" style="--tc:${Engine.TEAM_COLORS[Engine.teamOf(v, i)]}" title="Equipo ${Engine.TEAM_NAMES[Engine.teamOf(v, i)]}">${Engine.TEAM_NAMES[Engine.teamOf(v, i)]}</span>` : '';
    return `<div class="plw" style="--c:${p.color}">${line.replace('<span class="nm">', tt + '<span class="nm">')}${big}</div>`;
  }).join('') + teamBarHTML(v));
  $('#players').querySelectorAll('[data-pl]').forEach((el) => (el.onclick = () => {
    const i = +el.dataset.pl; Sfx.click();
    if (open.has(i)) open.delete(i); else open.add(i);
    renderPlayers();
  }));
  $('#players').querySelectorAll('[data-plmore]').forEach((el) => (el.onclick = (e) => { e.stopPropagation(); Sfx.click(); openModal({ kind: 'player', pid: +el.dataset.plmore }); }));
}

const PIPS_OF = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
function playerDetails(v, pid) {
  const B = v.board, P = v.players[pid];
  const prod = {}; RES.forEach((r) => (prod[r] = { pips: 0, nums: [] }));
  const ports = new Set();
  let blocked = 0;
  for (const V of B.vertices) {
    if (!V.b || V.b.owner !== pid) continue;
    const m = V.b.type === 'city' ? 2 : 1;
    if (V.port) ports.add(V.port);
    for (const h of V.hexes) {
      const H = B.hexes[h];
      if (H.res === 'desert') continue;
      if (h === B.robber) { blocked += PIPS_OF[H.num] * m; continue; }
      prod[H.res].pips += PIPS_OF[H.num] * m;
      prod[H.res].nums.push(H.num + (m === 2 ? '×2' : ''));
    }
  }
  const pc = Engine.piecesOf(v);
  return { settlements: pc.settlements - P.settlements, cities: pc.cities - P.cities, prod, ports: [...ports], blocked };
}
function renderHand() {
  const v = App.view, me = App.me;
  if (me < 0) { setHTML($('#hand'), ''); setHTML($('#devs'), ''); return; }
  const P = v.players[me];
  setHTML($('#hand'), RES.map((r) => `<div class="rc ${P.res[r] ? '' : 'zero'}" id="rc-${r}" style="--rc:${CARD_BG[r]}" title="${RN[r]}"><span class="art"><img src="${Sprites.url(r, 5)}"></span><span class="lbl">${RN[r]}</span><span class="n">${P.res[r]}</span></div>`).join(''));
  const canPlayNow = v.current === me && (v.phase === 'roll' || v.phase === 'main') && !v.devPlayed;
  const cards = Object.keys(P.dev).filter((c) => P.dev[c] > 0);
  setHTML($('#devs'), cards.map((c) => {
    const ready = devReady(v, P, c);
    const play = c !== 'vp' && canPlayNow && ready > 0;
    return `<div class="dc ${play ? 'play' : ''} ${ready <= 0 && c !== 'vp' ? 'new' : ''}" data-dev="${c}" title="${Engine.DEV_NAMES[c]}${c === 'vp' ? ' (cuenta automáticamente)' : ready <= 0 ? ' (podrás jugarla el próximo turno)' : play ? ' — ¡clic para jugar!' : ''}">
      <span class="art"><img src="${Sprites.url(DEV_ICON[c], 5, DEV_ICON[c] === 'road' ? '#c9a46a' : undefined)}"></span><span class="t">${DEV_SHORT[c]}</span>${P.dev[c] > 1 ? `<span class="n">${P.dev[c]}</span>` : ''}</div>`;
  }).join(''));
  $('#devs').querySelectorAll('.dc').forEach((d) => (d.onclick = () => { Sfx.click(); openModal({ kind: 'devinfo', card: d.dataset.dev }); }));
}

const DEV_TEXT = {
  knight: 'Mueve el ladrón a otra casilla y roba una carta al azar a un jugador que tenga un poblado o ciudad junto a ella. Con 3 o más caballeros jugados consigues el Ejército más grande (+2 PV) si nadie tiene más.',
  vp: 'Vale 1 punto de victoria. No hace falta jugarla: cuenta sola y los rivales no la ven hasta el final de la partida.',
  roadBuilding: 'Construye 2 caminos gratis (sin pagar recursos), siguiendo las reglas normales de colocación.',
  yop: 'Coge del banco 2 cartas de recurso a tu elección (pueden ser del mismo tipo).',
  monopoly: 'Elige un recurso: todos los rivales te entregan todas las cartas que tengan de ese recurso.',
};
const ROLL_WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
function renderInfo() {
  const v = App.view;
  const rolls = (v.stats && v.stats.rolls) || [];
  let tot = 0; for (let n = 2; n <= 12; n++) tot += rolls[n] || 0;
  let max = 1; for (let n = 2; n <= 12; n++) max = Math.max(max, rolls[n] || 0, tot * ROLL_WAYS[n] / 36);
  const last = v.dice ? v.dice[0] + v.dice[1] : null;
  let h = '';
  for (let n = 2; n <= 12; n++) {
    const c = rolls[n] || 0, red = n === 6 || n === 8 || n === 7;
    const exp = tot * ROLL_WAYS[n] / 36;
    h += `<div class="col" title="${n}: ${c} veces (esperado ${exp.toFixed(1)})"><div class="area"><span class="cnt">${c || ''}</span><div class="bar ${red ? 'red' : ''} ${n === last ? 'last' : ''}" style="height:${(c / max) * 100}%"></div>${tot ? `<div class="exp" style="bottom:${(exp / max) * 100}%"></div>` : ''}</div><span class="lab ${red ? 'red' : ''}">${n}</span></div>`;
  }
  setHTML($('#roll-chart'), h);
  setHTML($('#roll-chart').previousElementSibling, `Tiradas <small title="La línea punteada marca lo esperado por probabilidad">${tot} en total</small>`);
  if ($('#cost-card') && !$('#cost-card').dataset.ready) {
    const row = (n, c, pv) => `<div class="crow"><span class="cname">${n}${pv ? `<small>${pv}</small>` : ''}</span>${costHTML(c)}</div>`;
    setHTML($('#cost-card'), row('Camino', COST.road) + row('Poblado', COST.settlement, '1 PV') + row('Ciudad', COST.city, '2 PV') + row('Carta', COST.dev, '?'));
    $('#cost-card').dataset.ready = '1';
  }
}
function devPlayable(c) {
  const v = App.view, me = App.me; if (!v || me < 0) return false;
  const P = v.players[me];
  return c !== 'vp' && v.current === me && (v.phase === 'roll' || v.phase === 'main') && !v.devPlayed && devReady(v, P, c) > 0 && !v.trade;
}
function playDev(c) {
  if (c === 'knight' || c === 'roadBuilding') act({ type: 'playDev', card: c });
  else if (c === 'yop') openModal({ kind: 'yop', sel: [] });
  else if (c === 'monopoly') openModal({ kind: 'monopoly' });
}

function costHTML(cost) { return `<span class="cost">${Object.keys(cost).map((r) => Array(cost[r]).fill(`<img src="${Sprites.url(r, 2)}">`).join('')).join('')}</span>`; }

function renderActions() {
  const v = App.view, me = App.me, el = $('#actions');
  if (me < 0) { setHTML(el, ''); return; }
  const P = v.players[me];
  const mine = v.current === me;
  const b = App.ui.build;
  if (v.phase === 'gameOver') { setHTML(el, `<button class="btn yellow wide" id="a-results">Resultados</button>`); $('#a-results').onclick = () => openModal({ kind: 'gameover' }); return; }
  if (mine && v.phase === 'roll') {
    setHTML(el, `<button class="btn yellow wide glow" id="a-roll">🎲 Tirar dados <span class="k">espacio</span></button>`);
    $('#a-roll').onclick = () => act({ type: 'roll' });
    return;
  }
  if (mine && v.phase === 'roadBuilding') {
    setHTML(el, `<button class="btn wide" id="a-endrb">Terminar caminos gratis</button>`);
    $('#a-endrb').onclick = () => act({ type: 'endRoadBuilding' });
    return;
  }
  const main = mine && v.phase === 'main' && !v.trade;
  setHTML(el, `
    <button class="btn cyan" id="a-trade" ${main ? '' : 'disabled'}><span class="k">T</span>Comercio<span class="cost">⇄</span></button>
    <button class="btn pink" id="a-end" ${mine && v.phase === 'main' ? '' : 'disabled'}><span class="k">esp</span>Fin de turno<span class="cost">▶</span></button>`);
  $('#a-trade').onclick = () => {
    Sfx.click();
    openModal({ kind: 'trade', want: {}, give: {} });
  };
  $('#a-end').onclick = () => act({ type: 'endTurn' });
}

// fichas que puedes construir (debajo del tablero)
function renderBuild() {
  const v = App.view, me = App.me, el = $('#build');
  if (me < 0 || v.phase === 'gameOver') { setHTML(el, ''); el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const P = v.players[me];
  const main = v.current === me && v.phase === 'main' && !v.trade;
  const b = App.ui.build;
  const items = [
    { k: 'road', key: 1, nm: 'Camino', icon: Sprites.url('road', 5, P.color), cost: COST.road, left: P.roads,
      ok: main && P.roads > 0 && Engine.has(P.res, COST.road) && Engine.legalRoads(v, me).length > 0 },
    { k: 'settlement', key: 2, nm: 'Poblado', icon: Sprites.url('settlement', 5, P.color), cost: COST.settlement, left: P.settlements,
      ok: main && P.settlements > 0 && Engine.has(P.res, COST.settlement) && Engine.legalSettlements(v, me, false).length > 0 },
    { k: 'city', key: 3, nm: 'Ciudad', icon: Sprites.url('city', 4, P.color), cost: COST.city, left: P.cities,
      ok: main && P.cities > 0 && Engine.has(P.res, COST.city) && Engine.legalCities(v, me).length > 0 },
    { k: 'dev', key: 4, nm: 'Carta', icon: Sprites.url('card', 5), cost: COST.dev, left: v.devDeck,
      ok: main && v.devDeck > 0 && Engine.has(P.res, COST.dev) },
  ];
  // cuántas se pueden hacer con los materiales actuales (sin pasar de las piezas que quedan)
  const howMany = (cost, left) => Math.max(0, Math.min(left, ...Object.keys(cost).map((r) => Math.floor(P.res[r] / cost[r]))));
  setHTML(el, items.map((it) => {
    const can = howMany(it.cost, it.left);
    const why = it.ok ? 'Puedes construirlo' : it.left <= 0 ? (it.k === 'dev' ? 'No quedan cartas' : 'No te quedan piezas') : !main ? 'Solo en tu turno, después de tirar' : !Engine.has(P.res, it.cost) ? 'Te faltan recursos' : 'No hay sitio donde ponerlo';
    return `<button class="bp ${it.ok ? 'ok' : ''} ${b === it.k ? 'on' : ''}" data-bp="${it.k}" ${it.ok ? '' : 'disabled'} title="${it.nm}: ${why}">
      <span class="k">${it.key}</span><span class="can ${can ? '' : 'zero'}" title="Con tus materiales actuales puedes ${it.k === 'dev' ? 'comprar' : 'construir'} ${can}">${can}</span>
      <img class="pc" src="${it.icon}" alt=""><span class="nm">${it.nm}</span>${costHTML(it.cost)}
      <span class="left" title="${it.k === 'dev' ? 'Cartas que quedan en el mazo' : 'Piezas que te quedan'}">Quedan ${it.left}</span></button>`;
  }).join(''));
  el.querySelectorAll('[data-bp]').forEach((x) => (x.onclick = () => { const k = x.dataset.bp; if (k === 'dev') act({ type: 'buyDev' }); else setBuild(k); }));
}

function renderBanner() {
  const v = App.view, me = App.me, el = $('#banner');
  const cur = v.players[v.current];
  const mine = v.current === me;
  let t = '', m = false;
  const name = `<span style="color:${cur.color}">${esc(cur.name)}</span>`;
  switch (v.phase) {
    case 'setup':
      if (mine) { m = true; t = v.setup.step === 'settlement' ? `Coloca un poblado (${v.setup.idx < v.players.length ? '1ª' : '2ª'} ronda)` : 'Coloca un camino junto a tu poblado'; }
      else t = `${name} está colocando ${v.setup.step === 'settlement' ? 'un poblado' : 'un camino'}…`;
      break;
    case 'roll': if (mine) { m = true; t = 'Tira los dados'; } else t = `Turno de ${name}`; break;
    case 'discard': {
      const p = v.pendingDiscard || {};
      t = p[me] ? `¡Descarta ${p[me]} cartas!` : 'Esperando descartes…'; m = !!p[me];
      break;
    }
    case 'robber': if (mine) { m = true; t = 'Mueve el ladrón a otra casilla'; } else t = `${name} mueve al ladrón…`; break;
    case 'roadBuilding': if (mine) { m = true; t = `Caminos gratis: ${v.roadBuilding}`; } else t = `${name} construye caminos gratis…`; break;
    case 'main':
      if (mine) {
        m = true;
        if (App.ui.build) t = { road: 'Elige dónde poner el camino', settlement: 'Elige dónde poner el poblado', city: 'Elige qué poblado mejorar' }[App.ui.build] + ' · Esc cancela';
        else if (v.trade) t = 'Oferta en curso…';
        else t = 'Tu turno · construye, comercia o termina';
      } else t = `Turno de ${name}`;
      break;
    case 'gameOver': t = v.winTeam != null ? `🏆 Gana el equipo ${Engine.TEAM_NAMES[v.winTeam]}` : `🏆 ${esc(v.players[v.winner].name)} gana`; m = true; break;
  }
  if (me < 0 && v.phase !== 'gameOver') t = `<span class="spec-tag">👁 Espectador</span> ${t}`;
  setHTML(el, t); el.classList.toggle('me', m);
}

function renderLog() {
  const v = App.view;
  if (isSpec()) return renderSpecSide();
  $('#log').classList.remove('hidden');
  const el = $('#log');
  setHTML(el, v.log.slice(-40).map((l) => `<div>${esc(l)}</div>`).join('') + App.chat.slice(-8).filter((c) => !c.sys).map((c) => `<div class="chat" style="--c:${c.color}"><b>${esc(c.name)}:</b> ${esc(c.text)}</div>`).join(''));
  el.scrollTop = el.scrollHeight;
  const hasChat = App.mode === 'online' || App.mode === 'p2p';
  $('#chat-wrap').classList.toggle('hidden', !hasChat);
  $('#btn-qchat').classList.toggle('hidden', !hasChat);
}
function renderChatSide() { if (App.view) renderLog(); }
$('#chat-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendFromInput('#chat-in'); e.stopPropagation(); });
$('#chat-send').onclick = () => sendFromInput('#chat-in');
$('#qchat-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') { sendFromInput('#qchat-in'); toggleQChat(false); } e.stopPropagation(); });
$('#qchat-send').onclick = () => { sendFromInput('#qchat-in'); toggleQChat(false); };
$('#btn-qchat').onclick = () => { Sfx.click(); toggleQChat(); };
function toggleQChat(on) {
  const p = $('#qchat-pop');
  const show = on != null ? on : p.classList.contains('hidden');
  p.classList.toggle('hidden', !show); $('#btn-qchat').classList.toggle('on', show);
  if (show) { $('#size-pop').classList.add('hidden'); $('#btn-size').classList.remove('on'); }
}

// ----- chat rápido: emotes y frases -----
const QC_EMOTES = ['👍', '👎', '😂', '😎', '😭', '😡', '🤔', '😱', '🔥', '🎉', '👏', '🙏', '🦹', '🎲', '🤝', '😴'];
const QC_PHRASES = ['¡Buen trato!', '¿Alguien tiene madera?', '¿Alguien tiene ladrillo?', '¿Quién me da trigo?', 'Cambio lana por lo que sea', '¡El ladrón no, por favor!', '¡Te toca!', 'Bien jugado 👏', 'Nooo 😭', '¡Casi lo tengo!', 'Gracias 🙏', '¿Revancha?'];
function qcHTML() {
  return `<div class="qc-emotes">${QC_EMOTES.map((e) => `<button class="qc-e" data-qc="${e}">${e}</button>`).join('')}</div>
    <div class="qc-phrases">${QC_PHRASES.map((t) => `<button class="qc-p" data-qc="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
}
$('#qc-game').innerHTML = qcHTML();
$('#qc-room').innerHTML = qcHTML();
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-qc]'); if (!b) return;
  if (sendChat(b.dataset.qc)) { Sfx.click(); if (b.closest('#qchat-pop')) toggleQChat(false); }
});
function sendChat(text) {
  text = String(text || '').trim(); if (!text) return false;
  const now = Date.now();
  if (now - (App.lastChat || 0) < 800) { toast('Espera un momento antes de enviar otro mensaje'); return false; }
  App.lastChat = now;
  send({ t: 'chat', text });
  return true;
}
function sendFromInput(sel) { const el = $(sel); if (sendChat(el.value)) el.value = ''; }
// bocadillo encima del jugador que habla
const EMOJI_ONLY = /^(\p{Extended_Pictographic}|\uFE0F|\u200D|\s)+$/u;
function chatBubble(seat, text) {
  const line = plEl(seat); if (!line) return;
  App.bubbles = App.bubbles || {};
  if (App.bubbles[seat]) App.bubbles[seat].remove();
  const r = line.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'chat-bubble' + (EMOJI_ONLY.test(text) ? ' big' : '');
  b.style.setProperty('--c', App.view && App.view.players[seat] ? App.view.players[seat].color : '#fff');
  b.textContent = text;
  if (isSpec() && innerWidth > 800) { b.style.left = (r.right + 8) + 'px'; b.style.top = (r.top + 8) + 'px'; }
  else { b.style.left = Math.max(6, Math.min(innerWidth - 240, r.left)) + 'px'; b.style.top = (r.bottom + 6) + 'px'; }
  document.body.appendChild(b);
  App.bubbles[seat] = b;
  setTimeout(() => { b.classList.add('out'); setTimeout(() => { b.remove(); if (App.bubbles[seat] === b) delete App.bubbles[seat]; }, 400); }, 3600);
}

function chips(o) { return `<span class="chips">${RES.filter((r) => o[r]).map((r) => `<span class="chip"><img src="${Sprites.url(r, 3)}">${o[r]}</span>`).join('')}</span>`; }

function renderOffer() {
  const v = App.view, me = App.me, el = $('#offer-pop');
  const T = v.trade;
  if (!T || me < 0) { el.classList.add('hidden'); return; }
  const from = v.players[T.from];
  if (T.from === me) {
    const allNo = Object.values(T.responses).every((x) => x === 'reject');
    const rows = Object.keys(T.responses).map(Number).map((pid) => {
      const r = T.responses[pid], p = v.players[pid];
      const st = r === 'accept' ? `<button class="btn small green" data-confirm="${pid}">✔ Cerrar trato</button>` : r === 'reject' ? '<span class="of-st no">No acepta</span>' : '<span class="of-st wait">Pensando…</span>';
      return `<div class="resp" style="--c:${p.color}"><span class="grow" style="color:${p.color}">${esc(p.name)}</span>${st}</div>`;
    }).join('');
    setHTML(el, `<span class="who">Tu oferta</span>
      <div class="of-line"><div class="of-side give"><small>Das</small>${chips(T.give)}</div><span class="of-arrow">⇄</span><div class="of-side get"><small>Pides</small>${chips(T.get)}</div></div>
      <div class="resp-list" style="width:100%">${rows}</div>
      ${allNo ? '<span class="of-st no">Nadie ha aceptado</span><div class="row gap"><button class="btn small yellow" id="o-edit">✎ Cambiar la oferta</button><button class="btn small ghost" id="o-cancel">Cerrar</button></div>' : '<button class="btn small ghost" id="o-cancel">Cancelar oferta</button>'}`);
    el.querySelectorAll('[data-confirm]').forEach((b) => (b.onclick = () => act({ type: 'confirmTrade', with: +b.dataset.confirm })));
    $('#o-cancel').onclick = () => act({ type: 'cancelTrade' });
    if ($('#o-edit')) $('#o-edit').onclick = () => {
      const offer = { give: Object.assign({}, T.give), get: Object.assign({}, T.get) };
      act({ type: 'cancelTrade' });
      setTimeout(() => openModal({ kind: 'trade', want: offer.get, give: offer.give }), 150);
    };
  } else if (me in T.responses) {
    const r = T.responses[me];
    const P = v.players[me];
    const canAcc = Engine.has(P.res, T.get);
    const have = RES.filter((x) => T.get[x]).map((x) => `${RN[x]}: tienes ${P.res[x]}`).join(' · ');
    setHTML(el, `<span class="who"><span style="color:${from.color}">${esc(from.name)}</span> te propone un trato</span>
      <div class="of-line"><div class="of-side get"><small>Recibes</small>${chips(T.give)}</div><span class="of-arrow">⇄</span><div class="of-side give"><small>Das</small>${chips(T.get)}</div></div>
      <span class="of-have ${canAcc ? '' : 'no'}">${canAcc ? have : 'No tienes esas cartas'}</span>
      ${r === null ? `<div class="row gap"><button class="btn green" id="o-acc" ${canAcc ? '' : 'disabled'}>✔ Aceptar</button><button class="btn red" id="o-rej">✕ Rechazar</button></div>`
        : `<span class="of-st ${r === 'accept' ? 'ok' : 'no'}">${r === 'accept' ? 'Has aceptado · esperando a que cierre el trato…' : 'Has rechazado'}</span>`}`);
    if (r === null) {
      if ($('#o-acc')) $('#o-acc').onclick = () => act({ type: 'respondTrade', id: T.id, accept: true });
      $('#o-rej').onclick = () => act({ type: 'respondTrade', id: T.id, accept: false });
    }
  } else { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
}

// ================= MODO ESPECTADOR =================
// quien mira ve el tablero, las tarjetas de todos (sin sus cartas) y el chat completo a la derecha
function renderSpecCards() {
  const v = App.view, T = v.trade, seats = (App.room && App.room.seats) || [];
  const goal = Engine.winVP(v);
  setHTML($('#spec-cards'), `<div class="spc-title">👁 Estás mirando · ${App.room ? esc(App.room.name) : ''}</div>` + (v.teams ? teamBarHTML(v) : '') + v.players.map((p, i) => {
    const cur = v.current === i && v.phase !== 'gameOver', seat = seats[i] || {};
    const lr = v.longestRoad.owner === i, la = v.largestArmy.owner === i;
    let tag = '';
    if (T && i in T.responses) tag = T.responses[i] === 'accept' ? '<span class="pl-tag ok">Acepta</span>' : T.responses[i] === 'reject' ? '<span class="pl-tag no">Rechaza</span>' : '<span class="pl-tag wait">Pensando…</span>';
    if (T && T.from === i) tag = '<span class="pl-tag wait">Ofrece un trato</span>';
    if (v.phase === 'discard' && v.pendingDiscard && v.pendingDiscard[i]) tag = `<span class="pl-tag wait">Descarta ${v.pendingDiscard[i]}</span>`;
    if (v.phase === 'gameOver' && v.winner === i) tag = '<span class="pl-tag ok">🏆 Gana</span>';
    const who = p.bot ? `Bot ${stars(p.bot)}` : seat.prof ? profBadge(seat.prof) : 'Jugador';
    const off = seat.kind === 'human' && !seat.connected ? ' <span class="pl-off">Desconectado</span>' : '';
    const st = (img, n, t, cls = '') => `<span class="spc-s ${cls}" title="${t}"><img src="${img}" alt=""><b>${n}</b></span>`;
    return `<div class="spc ${cur ? 'cur' : ''}" id="spc-${i}" data-spc="${i}" style="--c:${p.color}">
      <div class="spc-head"><span class="nm">${v.teams ? `<span class="tm-tag" style="--tc:${Engine.TEAM_COLORS[Engine.teamOf(v, i)]}">${Engine.TEAM_NAMES[Engine.teamOf(v, i)]}</span>` : ''}${cur ? '<i class="turn">▶</i>' : ''}${esc(p.name)}</span><span class="spc-vp"><b>${p.vp}</b><small>/${goal}</small></span></div>
      <div class="spc-who">${who}${off}</div>
      <div class="vpbar"><i style="width:${Math.min(100, (p.vp / goal) * 100)}%"></i></div>
      <div class="spc-stats">${st(Sprites.url('card', 3), p.resCount, 'Cartas de recurso en la mano', p.resCount > handLimit(v) ? 'warn' : '')}${st(Sprites.url('devcard', 3), p.devCount, 'Cartas de desarrollo sin jugar')}${st(Sprites.url('knight', 3), p.knights, 'Caballeros jugados', la ? 'gold' : '')}${st(Sprites.url('road', 3, p.color), p.roadLen, 'Camino más largo propio', lr ? 'gold' : '')}</div>
      ${lr || la || tag ? `<div class="spc-aw">${lr ? '<span class="aw">🛣️ Camino</span>' : ''}${la ? '<span class="aw">⚔️ Ejército</span>' : ''}${tag}</div>` : ''}
    </div>`;
  }).join(''));
  $('#spec-cards').querySelectorAll('[data-spc]').forEach((el) => (el.onclick = () => { Sfx.click(); openModal({ kind: 'player', pid: +el.dataset.spc }); }));
}
function renderSpecSide() {
  const v = App.view, tab = App.ui.stab || 'chat';
  document.querySelectorAll('[data-stab]').forEach((b) => b.classList.toggle('on', b.dataset.stab === tab));
  $('#log').classList.toggle('hidden', tab !== 'log');
  $('#chatlog').classList.toggle('hidden', tab !== 'chat');
  $('#spec-qc').classList.toggle('hidden', tab !== 'chat');
  $('#chat-wrap').classList.toggle('hidden', tab !== 'chat');
  $('#btn-qchat').classList.add('hidden');
  if (tab === 'log') {
    const el = $('#log'); setHTML(el, v.log.map((l) => `<div>${esc(l)}</div>`).join('')); el.scrollTop = el.scrollHeight;
  } else {
    const el = $('#chatlog');
    setHTML(el, App.chat.length ? App.chat.map((c) => c.sys ? `<div class="sys">» ${esc(c.text)}</div>` : `<div class="chat" style="--c:${c.color}"><b>${esc(c.name)}:</b> ${esc(c.text)}</div>`).join('') : '<div class="sys">Todavía no hay mensajes. ¡Saluda!</div>');
    el.scrollTop = el.scrollHeight;
  }
}
document.querySelectorAll('[data-stab]').forEach((b) => (b.onclick = () => { Sfx.click(); App.ui.stab = b.dataset.stab; renderSpecSide(); }));
function specRegion() {
  const W = innerWidth, H = innerHeight, ui = Prefs.ui;
  const tr = $('#topright').getBoundingClientRect(), side = $('#side'), cards = $('#spec-cards'), bn = $('#banner');
  if (W > 800) {
    side.style.top = Math.round(tr.bottom + 8) + 'px'; side.style.bottom = '10px';
    const cr = cards.getBoundingClientRect(), sr = side.getBoundingClientRect();
    bn.style.top = Math.round(10 / ui) + 'px';
    const top = 10 + (bn.offsetHeight ? bn.getBoundingClientRect().height + 10 : 30);
    const x = cr.right + 10;
    return { x, y: top, w: Math.max(120, sr.left - 10 - x), h: Math.max(120, H - top - 10) };
  }
  cards.style.top = Math.round(tr.bottom + 6) + 'px';
  side.style.top = ''; side.style.bottom = '';
  const cr = cards.getBoundingClientRect(), sr = side.getBoundingClientRect();
  bn.style.top = Math.round((cr.bottom + 6) / ui) + 'px';
  const top = cr.bottom + 6 + (bn.offsetHeight ? bn.getBoundingClientRect().height + 6 : 0);
  return { x: 6, y: top, w: W - 12, h: Math.max(120, sr.top - 6 - top) };
}

// ================= MODALES =================
function openModal(m) { App.ui.modal = m; renderModal(); }
function closeModal() { App.ui.modal = null; $('#modal').classList.add('hidden'); }
// pulsar fuera del recuadro cierra la ventana y vuelve al tablero (salvo las que hay que contestar sí o sí)
$('#modal').addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.modal-box') && App.ui.modal && !['discard', 'victim'].includes(App.ui.modal.kind)) { e.preventDefault(); closeModal(); }
});

function autoModals() {
  const v = App.view, me = App.me, m = App.ui.modal;
  const needDiscard = v.phase === 'discard' && v.pendingDiscard && v.pendingDiscard[me];
  if (needDiscard && (!m || m.kind !== 'discard')) openModal({ kind: 'discard', sel: Engine.emptyRes() });
  if (!needDiscard && m && m.kind === 'discard') closeModal();
  if (m && m.kind === 'trade' && (v.phase !== 'main' || v.current !== me)) closeModal();
  if (m && m.kind === 'victim' && v.phase !== 'robber') closeModal();
  if (m && (m.kind === 'yop' || m.kind === 'monopoly') && (v.current !== me || v.devPlayed)) closeModal();
}

// cartas que ofrecer a cambio: lo que te sobra después de pagar 'cost' (sin tocar lo que pides)
function suggestGive(res, want, cost) {
  const nW = Engine.total(want); if (!nW) return {};
  const spare = RES.filter((r) => !want[r]).map((r) => ({ r, n: res[r] - (cost[r] || 0) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const give = {}; let left = nW;
  for (const sp of spare) { if (!left) break; const k = Math.min(sp.n, left); give[sp.r] = k; left -= k; }
  return give;
}
function fmtList(o) { return RES.filter((r) => o[r]).map((r) => `${o[r]} ${RN[r]}`).join(', '); }
// qué cambios con el banco/puertos hacen falta para pagar un coste (sin gastar lo que el coste necesita)
function bankPlan(res, cost, ratios, bank) {
  const hand = Object.assign({}, res);
  const plan = [];
  for (let guard = 0; guard < 12; guard++) {
    const miss = RES.find((r) => (cost[r] || 0) > hand[r]);
    if (!miss) return plan;
    let best = null, bestScore = -1;
    for (const g of RES) {
      if (g === miss) continue;
      const spare = hand[g] - (cost[g] || 0);
      if (spare >= ratios[g]) { const sc = spare / ratios[g]; if (sc > bestScore) { bestScore = sc; best = g; } }
    }
    if (!best || bank[miss] - plan.filter((t) => t.get === miss).length < 1) return null;
    hand[best] -= ratios[best]; hand[miss] += 1;
    const last = plan.find((t) => t.give === best && t.get === miss);
    if (last) last.n++; else plan.push({ give: best, get: miss, n: 1 });
  }
  return null;
}
function resCard(r, extra = '', attrs = '', cls = '', style = '') {
  return `<div class="rc ${cls}" style="--rc:${CARD_BG[r]};${style}" ${attrs}><span class="art"><img src="${Sprites.url(r, 5)}"></span><span class="lbl">${RN[r]}</span>${extra}</div>`;
}

function renderModal() {
  const m = App.ui.modal; const box = $('#modal-box');
  if (!m) return closeModal();
  $('#modal').classList.remove('hidden');
  const v = App.view, me = App.me;
  const P = v && me >= 0 ? v.players[me] : null;
  let h = '';
  switch (m.kind) {
    case 'trade': {
      // una sola pantalla: 1) qué quieres  2) qué das  3) con quién (banco, jugadores o compañero)
      const ratios = Engine.tradeRatios(v, me);
      const BUILDS = [['road', 'Camino', COST.road], ['settlement', 'Poblado', COST.settlement], ['city', 'Ciudad', COST.city], ['dev', 'Carta', COST.dev]];
      const mates = v.teams ? v.players.filter((q) => q.id !== me && Engine.sameTeam(v, q.id, me)) : [];
      const W = m.want || (m.want = {}), G = m.give || (m.give = {});
      const nW = Engine.total(W), nG = Engine.total(G);
      // banco: el mejor cambio para conseguir lo que quieres (con tus puertos)
      const bankCost = {}; RES.forEach((r) => { if (W[r]) bankCost[r] = P.res[r] + W[r]; });
      const plan = nW ? bankPlan(P.res, bankCost, ratios, v.bank) : null;
      const planTxt = plan ? plan.map((t) => `<b>${t.n * ratios[t.give]} ${RN[t.give]}</b>${ratios[t.give] < 4 ? ' <small>(puerto ' + ratios[t.give] + ':1)</small>' : ''}`).join(' + ') : '';
      const wantTxt = fmtList(W), giveTxt = fmtList(G);
      const card = (k, r) => {
        const n = (k === 'want' ? W : G)[r] || 0;
        const max = k === 'give' ? P.res[r] : 9;
        const off = k === 'give' && !P.res[r];
        return `<div class="tw-card ${n ? 'sel' : ''} ${off ? 'off' : ''}" style="--rc:${CARD_BG[r]}">
          <button class="tw-add" data-tw="${k}:${r}:1" ${n >= max || off ? 'disabled' : ''} title="${k === 'want' ? 'Quiero' : 'Doy'} 1 ${RN[r]}"><img src="${Sprites.url(r, 5)}"><span>${RN[r]}</span>${k === 'give' ? `<small>tienes ${P.res[r]}</small>` : ''}${n ? `<b class="tw-n">${n}</b>` : ''}</button>
          ${n ? `<button class="tw-sub" data-tw="${k}:${r}:-1" title="Quitar 1">−</button>` : ''}</div>`;
      };
      const quick = BUILDS.map(([k, nm, cost]) => {
        const miss = RES.reduce((a, r) => a + Math.max(0, (cost[r] || 0) - P.res[r]), 0);
        return `<button class="tw-quick" data-twneed="${k}" ${miss ? '' : 'disabled'} title="${miss ? 'Pide lo que te falta para ' + nm.toLowerCase() : 'Ya lo puedes pagar'}">${nm}${miss ? ` <small>falta ${miss}</small>` : ' ✓'}</button>`;
      }).join('');
      const rates = RES.filter((r) => ratios[r] < 4).map((r) => `<span class="chip port"><img src="${Sprites.url(r, 3)}">${ratios[r]}:1</span>`).join('');
      // opciones
      const bankOpt = !nW ? '<small>Elige arriba qué quieres</small>'
        : plan ? `<small>Das ${planTxt}<br>y recibes <b>${wantTxt}</b></small>`
        : '<small>No te llega: el banco pide 4 cartas iguales por 1 (menos con puerto)</small>';
      const overlap = RES.some((r) => W[r] && G[r]);
      const playersOk = nW && nG && !overlap;
      const playersOpt = !nW ? '<small>Elige qué quieres</small>' : !nG ? '<small>Elige qué das a cambio <button class="link-btn" id="tw-suggest">(sugerir)</button></small>' : `<small>Ofreces <b>${giveTxt}</b><br>por <b>${wantTxt}</b></small>`;
      const giftOk = mates.length && nG && !nW;
      const giftOpt = mates.length ? (nW ? '<small>Para regalar, deja vacío «Qué quieres»</small>' : nG ? `<small>Le das <b>${giveTxt}</b> sin pedir nada</small>` : '<small>Elige qué le das</small>') : '';
      h = `<div class="row between"><h2>⇄ Comerciar</h2><button class="btn small ghost" data-close>✕</button></div>
        <div class="tr-hand"><span>Tienes:</span>${RES.map((r) => `<span class="chip ${P.res[r] ? '' : 'dim'}"><img src="${Sprites.url(r, 3)}">${P.res[r]}</span>`).join('')}${rates ? `<span class="tw-ports">Tus puertos:</span>${rates}` : ''}</div>
        <div class="tw-step"><h4><span class="tw-num">1</span>¿Qué quieres?</h4><div class="tw-quicks"><span>Lo que me falta para:</span>${quick}</div><div class="tw-row">${RES.map((r) => card('want', r)).join('')}</div></div>
        <div class="tw-step"><h4><span class="tw-num">2</span>¿Qué das a cambio? <small class="muted">(para el banco no hace falta)</small></h4><div class="tw-row">${RES.map((r) => card('give', r)).join('')}</div></div>
        <div class="tw-step"><h4><span class="tw-num">3</span>¿Con quién?</h4>
          <div class="tw-opts ${mates.length ? 'three' : ''}">
            <button class="tw-opt o-bank" id="tw-bank" ${plan ? '' : 'disabled'}><b>🏦 Con el banco</b>${bankOpt}<span class="tw-go">Cambiar ya</span></button>
            <button class="tw-opt o-players" id="tw-players" ${playersOk ? '' : 'disabled'}><b>🤝 Con los jugadores</b>${playersOpt}<span class="tw-go">Ofrecer a todos</span></button>
            ${mates.length ? `<button class="tw-opt o-gift" id="tw-gift" ${giftOk ? '' : 'disabled'}><b>🎁 A tu compañero</b>${giftOpt}<span class="tw-go">Regalar a ${esc(mates[0].name)}</span></button>` : ''}
          </div></div>
        ${nW || nG ? '<div class="row" style="justify-content:flex-end"><button class="btn small ghost" id="tw-clear">Empezar de nuevo</button></div>' : ''}`;
      box.innerHTML = h;
      box.querySelectorAll('[data-tw]').forEach((x) => (x.onclick = () => {
        const [k, r, d] = x.dataset.tw.split(':');
        const T = k === 'want' ? W : G, O = k === 'want' ? G : W;
        T[r] = Math.max(0, (T[r] || 0) + +d); if (!T[r]) delete T[r];
        if (+d > 0) delete O[r]; // no se puede pedir y dar lo mismo
        Sfx.click(); renderModal();
      }));
      box.querySelectorAll('[data-twneed]').forEach((x) => (x.onclick = () => {
        const cost = BUILDS.find((b) => b[0] === x.dataset.twneed)[2];
        m.want = {}; RES.forEach((r) => { const d = Math.max(0, (cost[r] || 0) - P.res[r]); if (d) m.want[r] = d; });
        m.give = suggestGive(P.res, m.want, cost);
        Sfx.click(); renderModal();
      }));
      if ($('#tw-suggest')) $('#tw-suggest').onclick = (e) => { e.stopPropagation(); m.give = suggestGive(P.res, W, {}); if (!Engine.total(m.give)) toast('No te sobran cartas para ofrecer'); Sfx.click(); renderModal(); };
      $('#tw-bank').onclick = () => {
        if (!plan) return;
        plan.forEach((t, i) => setTimeout(() => act({ type: 'bankTrade', give: t.give, get: t.get, n: t.n }), i * 120));
        toast(`Cambio hecho: recibes ${fmtList(W)}`, true);
        m.want = {}; m.give = {};
        setTimeout(() => { if (App.ui.modal === m) renderModal(); }, plan.length * 120 + 250);
      };
      $('#tw-players').onclick = () => { if (!playersOk) return; act({ type: 'offerTrade', give: G, get: W }); closeModal(); };
      if ($('#tw-gift')) $('#tw-gift').onclick = () => { if (!giftOk) return; act({ type: 'gift', to: mates[0].id, cards: G }); closeModal(); };
      if ($('#tw-clear')) $('#tw-clear').onclick = () => { m.want = {}; m.give = {}; Sfx.click(); renderModal(); };
      break;
    }
    case 'discard': {
      if (!v.pendingDiscard || !v.pendingDiscard[me]) { closeModal(); return; }
      const need = v.pendingDiscard[me];
      const tot = Engine.total(m.sel);
      h = `<h2>¡EL LADRÓN! DESCARTA ${need}</h2><p class="muted">Tienes más de ${handLimit(v)} cartas. Elige ${need} para ${Engine.rulesOf(v).doubleSteal ? 'repartir a partes iguales entre los demás jugadores (norma «Ladrón codicioso»)' : 'devolver al banco'}.</p>
        <div class="steppers">${RES.map((r) => `<div class="stp">${resCard(r, `<span class="n">${P.res[r] - m.sel[r]}</span>`)}<div class="ctl"><button data-d="${r}:-1">-</button><span class="val">${m.sel[r]}</span><button data-d="${r}:1">+</button></div></div>`).join('')}</div>
        <button class="btn yellow" id="d-ok" ${tot === need ? '' : 'disabled'}>DESCARTAR (${tot}/${need})</button>`;
      box.innerHTML = h;
      box.querySelectorAll('[data-d]').forEach((x) => (x.onclick = () => {
        const [r, d] = x.dataset.d.split(':');
        const nv = m.sel[r] + +d;
        if (nv < 0 || nv > P.res[r] || (d > 0 && tot >= need)) return;
        m.sel[r] = nv; Sfx.click(); renderModal();
      }));
      $('#d-ok').onclick = () => act({ type: 'discard', cards: m.sel });
      break;
    }
    case 'yop': {
      h = `<h2>AÑO DE ABUNDANCIA</h2><p class="muted">Elige 2 recursos del banco (pueden repetirse).</p>
        <div class="res-pick">${RES.map((r) => resCard(r, `<span class="n">${m.sel.filter((x) => x === r).length}</span>`, `data-y="${r}"`, '', v.bank[r] < 1 ? 'opacity:.3;pointer-events:none' : '')).join('')}</div>
        <div class="row gap between"><button class="btn small ghost" id="y-reset">BORRAR</button><button class="btn yellow" id="y-ok" ${m.sel.length === 2 ? '' : 'disabled'}>COGER</button></div>`;
      box.innerHTML = h;
      box.querySelectorAll('[data-y]').forEach((x) => (x.onclick = () => { if (m.sel.length < 2) m.sel.push(x.dataset.y); Sfx.click(); renderModal(); }));
      $('#y-reset').onclick = () => { m.sel = []; renderModal(); };
      $('#y-ok').onclick = () => { act({ type: 'playDev', card: 'yop', res: m.sel }); closeModal(); };
      break;
    }
    case 'monopoly': {
      h = `<h2>MONOPOLIO</h2><p class="muted">Todos los rivales te darán todas sus cartas de este recurso.</p>
        <div class="res-pick">${RES.map((r) => resCard(r, '', `data-m="${r}"`)).join('')}</div><button class="btn small ghost" data-close>CANCELAR</button>`;
      box.innerHTML = h;
      box.querySelectorAll('[data-m]').forEach((x) => (x.onclick = () => { act({ type: 'playDev', card: 'monopoly', res: x.dataset.m }); closeModal(); }));
      break;
    }
    case 'victim': {
      if (Engine.rulesOf(v).doubleSteal) {
        // ladrón codicioso: elige a quién quitar cada una de las 2 cartas
        const pk = m.picks;
        const row = (k) => `<div class="vs-row"><span class="vs-lbl">${k + 1}ª carta</span><div class="vs-opts">${m.victims.map((pid) => { const p = v.players[pid]; return `<button class="vs-opt ${pk[k] === pid ? 'on' : ''}" style="--c:${p.color}" data-vk="${k}:${pid}">${esc(p.name)}<small>${p.resCount} cartas</small></button>`; }).join('')}</div></div>`;
        h = `<h2>¿A QUIÉN ROBAS?</h2><p class="muted">🧤 Ladrón codicioso: robas 2 cartas. Elige a quién quitar cada una (puede ser la misma persona).</p>
          ${row(0)}${row(1)}
          <div class="row gap between"><button class="btn small ghost" id="v-back">ELEGIR OTRA CASILLA</button><button class="btn pink" id="v-go" ${pk[0] != null && pk[1] != null ? '' : 'disabled'}>ROBAR</button></div>`;
        box.innerHTML = h;
        box.querySelectorAll('[data-vk]').forEach((x) => (x.onclick = () => { const [k, pid] = x.dataset.vk.split(':').map(Number); pk[k] = pid; if (k === 0 && pk[1] == null) pk[1] = pid; Sfx.click(); renderModal(); }));
        $('#v-go').onclick = () => { act({ type: 'moveRobber', hex: m.hex, victims: pk }); closeModal(); };
        $('#v-back').onclick = () => { closeModal(); updateTargets(); };
        break;
      }
      h = `<h2>¿A QUIÉN ROBAS?</h2><div class="resp-list">${m.victims.map((pid) => { const p = v.players[pid]; return `<div class="resp" style="--c:${p.color}"><span class="grow" style="color:${p.color}">${esc(p.name)} · ${p.resCount} cartas</span><button class="btn small pink" data-v="${pid}">ROBAR</button></div>`; }).join('')}</div>
        <button class="btn small ghost" id="v-back">ELEGIR OTRA CASILLA</button>`;
      box.innerHTML = h;
      box.querySelectorAll('[data-v]').forEach((x) => (x.onclick = () => { act({ type: 'moveRobber', hex: m.hex, victim: +x.dataset.v }); closeModal(); }));
      $('#v-back').onclick = () => { closeModal(); updateTargets(); };
      break;
    }
    case 'gameover': {
      h = `<h2>🏆 FIN DE LA PARTIDA</h2>${me >= 0 ? gainHTML() : ''}${gameSummaryHTML(v)}
        ${rematchHTML()}`;
      box.innerHTML = h;
      $('#g-menu').onclick = () => { closeModal(); leaveRoom(); };
      if ($('#g-vote')) $('#g-vote').onclick = () => { Sfx.click(); send({ t: 'rematch' }); };
      if ($('#g-force')) $('#g-force').onclick = () => { Sfx.click(); closeModal(); send({ t: 'start' }); };
      break;
    }
    case 'profile': case 'pcard': renderProfileModal(m, box); break;
    case 'ranking': renderRanking(m, box); break;
    case 'roomRules': {
      const r = App.room; if (!r) { closeModal(); return; }
      const R = r.rules, host = isHost(), n = r.seats.length;
      const dis = host ? '' : 'disabled';
      const seg = (attr, opts, cur) => `<div class="seg rr-seg">${opts.map(([val, lbl, tip]) => `<button data-${attr}="${val}" class="${cur === val ? 'on' : ''}" ${dis} ${tip ? `title="${tip}"` : ''}>${lbl}</button>`).join('')}</div>`;
      const autoTxt = `Automático · ahora ${Engine.mapKind(R, n) === 'big' ? 'grande' : 'normal'}`;
      const forced = n >= Engine.BIG_ONLY;
      const warn = forced ? `<p class="rr-warn">Con ${n} jugadores solo se puede jugar en el mapa grande.</p>` : R.map === 'normal' && n > 4 ? '<p class="rr-warn">Con 5 jugadores el mapa normal queda muy apretado: mejor el grande.</p>' : '';
      const shownMap = forced && R.map === 'normal' ? 'big' : R.map;
      const specials = Engine.SPECIAL_RULES.map((x) => `<button class="rr-sp ${R[x.key] ? 'on' : ''}" data-rsp="${x.key}" ${dis}>
          <span class="ic">${x.icon}</span><span class="tx"><b>${x.name}</b><small>${x.desc}</small></span><span class="sw"><i></i></span></button>`).join('');
      const nOn = Engine.SPECIAL_RULES.filter((x) => R[x.key]).length;
      h = `<div class="row between"><h2>📜 Reglas de la partida</h2><button class="btn small ghost" data-close>Cerrar</button></div>
        ${host ? '' : '<p class="muted">Solo el anfitrión puede cambiarlas. Se aplican al empezar la partida.</p>'}
        <div class="rr">
          <div class="rr-row"><div class="rr-lbl"><b>Mapa</b><small>El grande tiene 30 casillas, 11 puertos y más cartas.</small></div>
            ${seg('rmap', [['auto', autoTxt, 'Normal hasta 4 jugadores, grande con 5 o más'], ['normal', 'Normal (2-5)', forced ? 'Con 6 o más jugadores no se puede elegir' : ''], ['big', 'Grande (5-7)']], shownMap).replace('data-rmap="normal"', forced ? 'data-rmap="normal" disabled data-off="1"' : 'data-rmap="normal"')}</div>
          ${warn}
          <div class="rr-row"><div class="rr-lbl"><b>Puntos para ganar</b><small>Lo normal son 10 (de 5 a 16). ${piecesTxt(R.vp)}</small></div>
            <div class="rr-step"><button data-rvp="-1" ${dis}>−</button><b>${R.vp}</b><button data-rvp="1" ${dis}>+</button></div></div>
          <div class="rr-row"><div class="rr-lbl"><b>Equipos</b><small>${R.teams ? `Meta del equipo: ${Engine.teamTarget(R.vp, R.teams)} puntos sumando a todos. Los compañeros se sientan alternos, ven sus cartas, pueden regalárselas y no se roban.` : 'Cada uno juega por su cuenta.'}</small></div>
            ${seg('rteams', [['0', 'Sin equipos'], ['2', 'Parejas (4 o 6)'], ['3', 'Tríos (6)']], String(R.teams || 0))}</div>
          ${Engine.teamsError(R, n) ? `<p class="rr-warn">${Engine.teamsError(R, n)} (ahora sois ${n}).</p>` : ''}
          <div class="rr-row"><div class="rr-lbl"><b>Límite de cartas al salir un 7</b><small>Quien tenga más descarta la mitad.</small></div>
            ${seg('rhand', Engine.HAND_OPTS.map((x) => [String(x), x === 99 ? 'Sin límite' : String(x)]), String(R.hand))}</div>
          <div class="rr-sub"><h4>Normas especiales <span class="muted">(${nOn} activas)</span></h4>
            ${host ? '<div class="row gap"><button class="btn small yellow" id="rr-random">🎲 Normas al azar</button><button class="btn small ghost" id="rr-none">Quitar todas</button></div>' : ''}</div>
          <div class="rr-list">${specials}</div>
        </div>
        <div class="row gap between">${host ? '<button class="btn small ghost" id="rr-reset">Restablecer todo</button>' : '<span></span>'}<button class="btn pink" data-close>Listo</button></div>`;
      box.innerHTML = h;
      if (host) {
        const put = (patch) => { Sfx.click(); send({ t: 'setRules', rules: Object.assign({}, App.room.rules, patch) }); };
        box.querySelectorAll('[data-rmap]').forEach((b) => (b.onclick = () => put({ map: b.dataset.rmap })));
        box.querySelectorAll('[data-rhand]').forEach((b) => (b.onclick = () => put({ hand: +b.dataset.rhand })));
        box.querySelectorAll('[data-rteams]').forEach((b) => (b.onclick = () => put({ teams: +b.dataset.rteams })));
        box.querySelectorAll('[data-rvp]').forEach((b) => (b.onclick = () => { const nv = R.vp + +b.dataset.rvp; if (nv >= 5 && nv <= 16) put({ vp: nv }); }));
        box.querySelectorAll('[data-rsp]').forEach((b) => (b.onclick = () => {
          const k = b.dataset.rsp, on = !R[k];
          const patch = { [k]: on };
          put(patch);
        }));
        $('#rr-none').onclick = () => put(Object.fromEntries(Engine.SPECIAL_RULES.map((x) => [x.key, false])));
        $('#rr-random').onclick = () => {
          const keys = Engine.SPECIAL_RULES.map((x) => x.key).sort(() => Math.random() - 0.5);
          const k = 2 + Math.floor(Math.random() * 2);
          const pickd = Object.fromEntries(keys.map((key, i) => [key, i < k]));
          put(pickd);
          toast('🎲 Normas sorpresa elegidas', true);
        };
        $('#rr-reset').onclick = () => put(Object.assign({}, Engine.DEFAULT_RULES));
      }
      break;
    }
    case 'help': {
      const row = (n, c, d) => `<span class="lbl-px">${n}</span>${chips(c)}<span class="muted">${d}</span>`;
      h = `<h2>COSTES</h2><div class="costs">${row('CAMINO', COST.road, '—')}${row('POBLADO', COST.settlement, '1 PV')}${row('CIUDAD', COST.city, '2 PV')}${row('CARTA', COST.dev, '?')}</div>
        <p class="muted">Gana quien llegue a <b>${Engine.winVP(v)} PV</b> en su turno. Camino más largo (5+) y ejército más grande (3+ caballeros) dan 2 PV.</p>
        <h4 class="tr-sub">Reglas de esta partida</h4>${rulesDetail(Engine.rulesOf(v), v.players.length, v.map)}
        <p class="muted">Atajos: ESPACIO tirar/terminar · 1-4 construir · T comercio · ESC cancelar</p>
        ${App.me >= 0 ? '<button class="btn small cyan" id="h-tut">▶ Ver el tutorial</button>' : ''}
        <button class="btn small ghost" data-close>CERRAR</button>`;
      box.innerHTML = h;
      if ($('#h-tut')) $('#h-tut').onclick = () => startTutorial();
      break;
    }
    case 'rules': {
      h = `<h2>CÓMO SE JUEGA</h2><div class="rules">
        <p>Cada partida genera una <b>isla aleatoria</b>: 19 casillas en el mapa normal (2-5 jugadores) o 30 en el grande (5-7 jugadores; con 6 o 7 es obligatorio). Hay bosque (madera), cantera (ladrillo), pradera (lana), campo (trigo), montaña (mineral) y desierto.</p>
        <p><b>Inicio:</b> cada jugador coloca 2 poblados y 2 caminos (orden de ida y vuelta). El segundo poblado da recursos.</p>
        <p><b>Turno:</b> tira los dados → las casillas con ese número producen para los poblados (1) y ciudades (2) que las tocan. Después construye, comercia con el banco (4:1 o mejor con puertos) o con otros jugadores, y juega una carta de desarrollo.</p>
        <p><b>7:</b> quien tenga más de 7 cartas descarta la mitad y el jugador mueve al <b>ladrón</b>, que bloquea una casilla y roba una carta.</p>
        <p><b>Puntos:</b> poblado 1, ciudad 2, camino más largo 2, ejército más grande 2, cartas de punto 1. ¡Primero en llegar a <b>10</b> gana!</p>
        <p><b>Equipos:</b> en parejas o tríos los compañeros se sientan alternos, suman sus puntos, ven sus cartas, pueden regalárselas y no se roban entre ellos.</p>
        <p><b>Tutorial:</b> sale solo en tu primera partida; puedes repetirlo con el botón <b>?</b> durante la partida.</p>
        <p><b>Reglas de la partida:</b> en la sala, el anfitrión pulsa <b>Cambiar reglas</b> para elegir el mapa, los puntos para ganar, el límite de cartas con un 7 y normas especiales (por ejemplo, que el ladrón se quede las cartas descartadas).</p>
        <p><b>Bots:</b> ★ Novato · ★★ Normal · ★★★ Difícil · ★★★★ Experto (planifica, cuenta cartas y juega a ganar).</p></div>
        <button class="btn small ghost" data-close>CERRAR</button>`;
      box.innerHTML = h;
      break;
    }
    case 'devinfo': {
      const c = m.card;
      if (!P || !P.dev[c]) { closeModal(); return; }
      const ready = devReady(v, P, c);
      const play = devPlayable(c);
      let st;
      if (c === 'vp') st = '<span class="state ok">Ya cuenta: +' + P.dev.vp + ' PV</span>';
      else if (play) st = '<span class="state ok">Puedes jugarla ahora</span>';
      else if (ready <= 0) st = '<span class="state no">Comprada este turno: podrás jugarla en tu próximo turno</span>';
      else if (v.current !== me) st = '<span class="state no">Solo puedes jugarla en tu turno</span>';
      else if (v.devPlayed) st = '<span class="state no">Ya has jugado una carta este turno</span>';
      else st = '<span class="state no">No se puede jugar en este momento</span>';
      h = `<div class="devinfo"><div class="dc"><span class="art"><img src="${Sprites.url(DEV_ICON[c], 6)}"></span><span class="t">${DEV_SHORT[c]}</span>${P.dev[c] > 1 ? `<span class="n">${P.dev[c]}</span>` : ''}</div>
        <div class="txt"><h2>${Engine.DEV_NAMES[c]}</h2><div class="what">${DEV_TEXT[c]}</div>${st}
        ${c !== 'vp' ? '<div class="rule">Solo una carta de desarrollo por turno, nunca el mismo turno en que la compras. Puedes jugarla antes o después de tirar los dados.</div>' : ''}</div></div>
        <div class="row gap between"><button class="btn ghost" data-close>Cerrar</button>${c !== 'vp' ? `<button class="btn yellow" id="dv-play" ${play ? '' : 'disabled'}>Jugar carta</button>` : ''}</div>`;
      box.innerHTML = h;
      if ($('#dv-play')) $('#dv-play').onclick = () => { closeModal(); playDev(c); };
      break;
    }
    case 'player': {
      const p = v.players[m.pid];
      if (!p) { closeModal(); return; }
      const d = playerDetails(v, m.pid);
      const lr = v.longestRoad.owner === m.pid, la = v.largestArmy.owner === m.pid;
      const mine = m.pid === me;
      const hiddenVp = mine && p.dev ? p.dev.vp : 0;
      const row = (label, val, extra = '') => `<div class="pd-row"><span>${label}</span><b>${val}</b>${extra}</div>`;
      const prodRows = RES.map((r) => {
        const x = d.prod[r];
        const pct = Math.round((x.pips / 36) * 100);
        return `<div class="pd-prod ${x.pips ? '' : 'none'}"><img src="${Sprites.url(r, 3)}"><span class="pn">${RN[r]}</span><span class="nums">${x.nums.length ? x.nums.join(', ') : '—'}</span><span class="pb"><i style="width:${Math.min(100, x.pips * 5)}%"></i></span><span class="pp" title="Probabilidad de recibirlo en cada tirada">${x.pips ? pct + '%' : ''}</span></div>`;
      }).join('');
      const portTxt = d.ports.length ? d.ports.map((t) => t === 'any' ? '<span class="chip">3:1 cualquiera</span>' : `<span class="chip"><img src="${Sprites.url(t, 3)}">2:1 ${RN[t]}</span>`).join(' ') : '<span class="muted">Ninguno</span>';
      h = `<div class="pd-head" style="--c:${p.color}"><div><h2 style="color:${p.color}">${esc(p.name)}</h2><span class="muted">${mine ? 'Tú' : p.bot ? 'Bot ' + LVL_NAME[p.bot].toLowerCase() + ' ' + stars(p.bot) : 'Jugador'}${v.current === m.pid && v.phase !== 'gameOver' ? ' · está jugando su turno' : ''}</span></div><div class="pd-vp"><b>${p.vp}</b><small>PV visibles</small></div></div>
        ${(() => { const seat = App.room && App.room.seats[m.pid]; const q = seat && seat.prof; return q ? `<button class="pd-prof" id="pd-prof">${emblemHTML(q)}<span><b>${Profile.rankOf(Profile.levelOf(q.xp)).name} · Nivel ${Profile.levelOf(q.xp)}</b><small>${q.games} partidas · ${q.wins} victorias · ${q.ach.length} logros</small></span><span class="pc-go">Ver perfil ›</span></button>` : ''; })()}
        <div class="pd-grid">
          <div class="pd-box"><h4>Puntos</h4>
            ${row('Poblados', d.settlements, ' <small>×1</small>')}${row('Ciudades', d.cities, ' <small>×2</small>')}
            ${row('Camino más largo', lr ? '+2' : '—')}${row('Ejército más grande', la ? '+2' : '—')}
            ${mine ? row('Cartas de punto (ocultas)', hiddenVp ? '+' + hiddenVp : '—') : '<p class="muted small">Puede tener cartas de punto ocultas.</p>'}
          </div>
          ${!mine && p.res && v.phase !== 'gameOver' ? `<div class="pd-box"><h4>Sus cartas <small>(es tu compañero)</small></h4><div class="tr-hand">${RES.map((r) => `<span class="chip ${p.res[r] ? '' : 'dim'}"><img src="${Sprites.url(r, 3)}">${p.res[r]}</span>`).join('')}</div></div>` : ''}
          <div class="pd-box"><h4>En la mesa</h4>
            ${row('Cartas de recurso', p.resCount, p.resCount > 7 ? ' <small class="warn">¡más de 7!</small>' : '')}
            ${row('Cartas de desarrollo', p.devCount)}${row('Caballeros jugados', p.knights)}${row('Camino más largo propio', p.roadLen)}
          </div>
          <div class="pd-box"><h4>Piezas que le quedan</h4>
            ${row('Caminos', p.roads + ' / ' + Engine.piecesOf(v).roads)}${row('Poblados', p.settlements + ' / ' + Engine.piecesOf(v).settlements)}${row('Ciudades', p.cities + ' / ' + Engine.piecesOf(v).cities)}
          </div>
          <div class="pd-box"><h4>Puertos</h4><div class="pd-ports">${portTxt}</div></div>
        </div>
        <div class="pd-box"><h4>Qué produce <small>(números de sus casillas)</small></h4>${prodRows}${d.blocked ? '<p class="muted small">El ladrón le está bloqueando parte de su producción.</p>' : ''}</div>
        <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Cerrar</button></div>`;
      box.innerHTML = h;
      if ($('#pd-prof')) $('#pd-prof').onclick = () => { Sfx.click(); openModal({ kind: 'pcard', prof: App.room.seats[m.pid].prof }); };
      break;
    }
    case 'hostleave': {
      h = `<h2>¿Salir de la sala?</h2><p class="muted">Eres quien la creó. Puedes dejarla abierta (otra persona pasa a ser anfitriona) o eliminarla: entonces todos los que están dentro vuelven al menú.</p>
        <div class="col gap"><button class="btn" id="hl-leave">✕ Salir y dejar la sala abierta</button><button class="btn red" id="hl-del">🗑 Eliminar la sala para todos</button><button class="btn small ghost" data-close>Cancelar</button></div>`;
      box.innerHTML = h;
      $('#hl-leave').onclick = () => { closeModal(); leaveRoom(); };
      $('#hl-del').onclick = () => { Sfx.click(); closeModal(); send({ t: 'closeRoom' }); };
      break;
    }
    case 'delroom': {
      // desde dentro de la sala o desde la lista de salas (m.code)
      const R = m.code ? { name: m.name, code: m.code, started: m.started, over: false } : App.room;
      if (!R) { closeModal(); return; }
      const others = m.code ? Math.max(0, m.people || 0) : R.seats.filter((s, i) => s.kind === 'human' && i !== App.you).length + (R.spectators || []).length;
      h = `<h2>🗑 ¿Eliminar la sala?</h2>
        <p>La sala <b>${esc(R.name)}</b> (${esc(R.code)}) se cerrará${others ? ` para todos: ${others === 1 ? 'la otra persona vuelve' : `las otras ${others} personas vuelven`} al menú` : ''}.${R.started && !R.over ? ' <b>La partida en curso se perderá.</b>' : ''} No se puede deshacer.</p>
        <div class="row gap between"><button class="btn ghost" data-close>Cancelar</button><button class="btn red" id="dr-ok">🗑 Eliminar la sala</button></div>`;
      box.innerHTML = h;
      $('#dr-ok').onclick = () => { Sfx.click(); closeModal(); send({ t: 'closeRoom', code: R.code }); };
      break;
    }
    case 'quit': {
      if (App.me < 0) {
        h = `<h2>¿DEJAR DE MIRAR?</h2><p class="muted">Estás viendo la partida como espectador. Puedes volver a entrar cuando quieras.</p>
          <div class="row gap between"><button class="btn ghost" data-close>SEGUIR MIRANDO</button><button class="btn red" id="q-ok">SALIR</button></div>`;
        box.innerHTML = h;
        $('#q-ok').onclick = () => { closeModal(); leaveRoom(); };
        break;
      }
      h = `<h2>¿SALIR DE LA PARTIDA?</h2><p class="muted">${App.mode === 'online' ? 'Un bot jugará en tu lugar. Puedes volver cuando quieras desde la lista de salas (↩ Volver).' : App.mode === 'p2p' && P2P.role === 'host' ? 'Eres el anfitrión: si sales, la partida termina para todos.' : App.mode === 'p2p' ? 'Un bot jugará en tu lugar.' : 'Se perderá la partida.'}</p>
        <div class="row gap between"><button class="btn ghost" data-close>SEGUIR JUGANDO</button>${isHost() && App.mode === 'online' ? '<button class="btn small trash" id="q-del" title="Cerrar la sala para todos">🗑 Eliminar la sala</button>' : ''}<button class="btn red" id="q-ok">SALIR</button></div>`;
      box.innerHTML = h;
      $('#q-ok').onclick = () => { closeModal(); leaveRoom(); };
      if ($('#q-del')) $('#q-del').onclick = () => openModal({ kind: 'delroom' });
      break;
    }
  }
  box.querySelectorAll('[data-close]').forEach((x) => (x.onclick = () => { Sfx.click(); closeModal(); }));
}

// ================= CONTROLES =================
$('#btn-mute').onclick = () => { const m = Sfx.toggle(); $('#btn-mute').textContent = m ? '✕♪' : '♪'; };
$('#btn-mute').textContent = Sfx.muted ? '✕♪' : '♪';
$('#btn-size').onclick = () => { Sfx.click(); const p = $('#size-pop'); p.classList.toggle('hidden'); $('#btn-size').classList.toggle('on', !p.classList.contains('hidden')); };
document.querySelectorAll('[data-sz]').forEach((b) => (b.onclick = () => {
  const [what, d] = b.dataset.sz.split(':'); Sfx.click();
  if (what === 'ui') stepUi(+d);
  else if (what === 'rc') stepRc(+d);
  else board.setZoom(board.zoom * (+d > 0 ? 1.2 : 1 / 1.2));
}));
$('#sz-reset').onclick = () => { Sfx.click(); Prefs.ui = 1; store.set('hx_ui', 1); Prefs.rc = 1; store.set('hx_rc', 1); applyRcScale(); Prefs.build = 'right'; store.set('hx_build', 'right'); applyBuildPos(); applyUiScale(); board.resetCamera(); };
document.querySelectorAll('[data-bpos]').forEach((b) => (b.onclick = () => { Sfx.click(); Prefs.build = b.dataset.bpos; store.set('hx_build', Prefs.build); applyBuildPos(); }));
$('#sz-center').onclick = () => { Sfx.click(); board.setPan(0, 0); };
$('#btn-help').onclick = () => { Sfx.click(); openModal({ kind: 'help' }); };
$('#btn-quit').onclick = () => { Sfx.click(); openModal({ kind: 'quit' }); };
$('#btn-side').onclick = () => {
  App.ui.side = !App.ui.side;
  const s = $('#side');
  if (innerWidth > 1100) s.classList.toggle('closed', !App.ui.side ? false : true);
  else s.classList.toggle('open', App.ui.side);
  layout();
};

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (typeof Tut !== 'undefined' && Tut.on) { if (e.key === 'Escape') endTutorial(); return; }
  const v = App.view;
  if (App.screen === 'game' && (e.key === '+' || e.key === '=')) { board.setZoom(board.zoom * 1.2); return; }
  if (App.screen === 'game' && (e.key === '-' || e.key === '_')) { board.setZoom(board.zoom / 1.2); return; }
  if (e.key === 'Escape' && App.ui.plOpen && App.ui.plOpen.size && !App.ui.modal) { App.ui.plOpen.clear(); renderPlayers(); return; }
  if (e.key === 'Escape') {
    if (!$('#size-pop').classList.contains('hidden')) { $('#size-pop').classList.add('hidden'); $('#btn-size').classList.remove('on'); return; }
    if (App.ui.modal && !['discard'].includes(App.ui.modal.kind)) closeModal();
    else if (App.ui.build) { App.ui.build = null; renderActions(); renderBuild(); renderBanner(); updateTargets(); }
    return;
  }
  if (App.screen !== 'game' || !v || v.current !== App.me || App.ui.modal) return;
  if (e.code === 'Space' || e.key === 'Enter') {
    e.preventDefault();
    if (v.phase === 'roll') act({ type: 'roll' });
    else if (v.phase === 'main' && !App.ui.build && !v.trade) act({ type: 'endTurn' });
  }
  const map = { 1: 'road', 2: 'settlement', 3: 'city' };
  if (map[e.key]) { const btn = document.querySelector(`[data-bp="${map[e.key]}"]`); if (btn && !btn.disabled) setBuild(map[e.key]); }
  if (e.key === '4') { const b = document.querySelector('[data-bp="dev"]'); if (b && !b.disabled) b.click(); }
  if (e.key.toLowerCase() === 't') { const b = $('#a-trade'); if (b && !b.disabled) b.click(); }
});

// ================= LAYOUT Y BUCLE =================
let lastLayoutKey = '';
function computeRegion() {
  const W = innerWidth, H = innerHeight;
  if (App.screen !== 'game') return { x: 0, y: 0, w: W, h: H };
  if (document.body.classList.contains('spec')) return specRegion();
  if (W > 800) {
    // las líneas de jugadores llegan hasta los botones de arriba a la derecha; el registro empieza debajo
    $('#players').style.right = Math.round(W - $('#topright').getBoundingClientRect().left + 10) + 'px';
  } else $('#players').style.right = '';
  const pb = $('#players').getBoundingClientRect().bottom;
  if (W > 1100) $('#side').style.top = Math.round(Math.max(pb, $('#topright').getBoundingClientRect().bottom) + 8) + 'px';
  else $('#side').style.top = '';
  let top = pb + 6;
  if (W > 800) {
    const bn = $('#banner');
    bn.style.top = Math.round((pb + 8) / Prefs.ui) + 'px';
    top = pb + 8 + (bn.offsetHeight ? bn.getBoundingClientRect().height + 8 : 20);
  } else $('#banner').style.top = '';
  if (W <= 800) {
    const bottomH = $('#bottom').getBoundingClientRect().height + 14;
    return { x: 10, y: top, w: W - 20, h: Math.max(120, H - top - bottomH) };
  }
  // columna derecha (gráfica, costes y acciones) + registro encima
  const rc = document.querySelector('.rightcol').getBoundingClientRect();
  // hueco entre el registro y la gráfica para los dados de los demás jugadores
  $('#side').style.bottom = Math.round(rc.height + 20 + 78 * Prefs.ui) + 'px';
  const cc = $('#centercol').getBoundingClientRect();
  const leftH = (innerHeight - cc.top) + 14;
  const right = rc.width + 30;
  return { x: 10, y: top, w: W - right - 20, h: Math.max(120, H - top - leftH) };
}
function layout() {
  const region = computeRegion();
  lastLayoutKey = JSON.stringify(region);
  board.resize(region); fx.resize();
  placeOverlays(region);
}
// avisos (ofertas de comercio, mensajes cortos y cartel de turno) centrados sobre el tablero
function placeOverlays(r) {
  const ui = Prefs.ui;
  const offer = $('#offer-pop'), toastEl = $('#toast'), bn = $('#banner');
  if (App.screen !== 'game' || !r || r.w < 50) { offer.style.left = offer.style.top = toastEl.style.left = toastEl.style.top = bn.style.left = ''; return; }
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  offer.style.left = Math.round(cx / ui) + 'px';
  offer.style.top = Math.round(cy / ui) + 'px';
  toastEl.style.left = Math.round(cx / ui) + 'px';
  toastEl.style.top = Math.round((r.y + r.h * 0.18) / ui) + 'px';
  bn.style.left = innerWidth > 800 ? Math.round(cx / ui) + 'px' : '';
}
function layoutIfNeeded() {
  if (JSON.stringify(computeRegion()) !== lastLayoutKey) layout();
}
window.addEventListener('resize', () => layout());
// iPhone/iPad: impedir que Safari amplíe la página entera al pellizcar (el zoom lo hace el tablero)
['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

function loop(now) {
  board.frame(now); fx.frame(now);
  requestAnimationFrame(loop);
}

// ================= ARRANQUE =================
(function boot() {
  const q = new URLSearchParams(location.search);
  const code = (q.get('sala') || '').toUpperCase();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (App.view || App.demo) board.buildCaches(); });
  show('menu');
  requestAnimationFrame(loop);
  loadConfig();
  document.documentElement.style.setProperty("--rc", Prefs.rc); $("#sz-rc").textContent = Math.round(Prefs.rc * 100) + "%";
  applyUiScale();
  applyBuildPos();
  renderResume();
  if (/^[A-Z0-9]{4}$/.test(code)) {
    // si en este navegador hay una partida guardada de esa sala, volvemos con la misma identidad
    const sv = Saves.latest(code); if (sv && sv[0] !== App.token && !Saves.mine()) Saves.adopt(sv[0]);
    $('#invite-code').textContent = code;
    $('#invite').classList.remove('hidden');
    const b = $('#btn-invite');
    b.textContent = '▶ UNIRSE A LA SALA ' + code;
    b.classList.remove('hidden');
    b.onclick = () => { Sfx.unlock(); Sfx.click(); goOnline(code); };
    $('#in-name').focus(); $('#in-name').select();
  }
})();
