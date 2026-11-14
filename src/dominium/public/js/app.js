// DOMINIUM — cliente
import {
  buildGraph, reachable, canFortify, reinforcementBreakdown, validSets, bestSet, isValidSet, tradeValue,
  missionText, winProbability, territoriesOf, CARD_KINDS, BOT_LEVELS, PLAYER_COLORS,
} from '../shared/engine.js';
import { MapView, renderPreview } from './mapview.js';
import { sfx } from './sound.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* */ } },
};

// ------------------------------------------------------------ identidad y red
let CID = store.get('dom.cid');
if (!CID || !/^[a-zA-Z0-9-]{8,64}$/.test(CID)) {
  CID = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-zA-Z0-9-]/g, '');
  store.set('dom.cid', CID);
}
const myName = () => ($('#inp-name').value.trim() || 'Comandante').slice(0, 16);

// Servidor de salas: en GitHub Pages viene de config.json (Render); en local es el mismo origen.
let CONFIG = {};
try { CONFIG = await fetch('config.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})); } catch { CONFIG = {}; }
const API = String(CONFIG.server || '').replace(/\/$/, '');

// El plan gratuito de Render duerme el servidor si nadie juega: si una petición tarda, avisamos.
let wakeShown = false;
async function api(path, body) {
  const slow = setTimeout(() => {
    if (wakeShown) return;
    wakeShown = true;
    toast('Despertando el servidor. La primera conexión puede tardar hasta un minuto.', true);
  }, 2500);
  let r;
  try { r = await fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); }
  catch { throw new Error('No se puede conectar con el servidor. Inténtalo de nuevo en unos segundos.'); }
  finally { clearTimeout(slow); }
  let data = {};
  try { data = await r.json(); } catch { /* */ }
  if (!r.ok) throw new Error(data.error || 'Error de conexión');
  return data;
}

let ROOM = null;   // código de sala
let S = null;      // último snapshot
let es = null;     // EventSource
let serverOffset = 0;

function send(msg) {
  if (!ROOM) return Promise.resolve();
  return api('/api/action', { code: ROOM, cid: CID, msg }).catch((e) => { toast(e.message); sfx.error(); throw e; });
}
const act = (action) => send({ type: 'game', action }).catch(() => {});

function connect(code) {
  if (es) es.close();
  ROOM = code;
  store.set('dom.room', code);
  history.replaceState(null, '', `${location.pathname}?sala=${code}`);
  es = new EventSource(`${API}/api/stream?code=${code}&cid=${encodeURIComponent(CID)}`);
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'kicked') { leaveToMenu('Te han expulsado de la sala'); return; }
    if (msg.type === 'room') onSnapshot(msg);
  };
  es.onerror = () => {
    if (es && es.readyState === 2) leaveToMenu('Se perdió la conexión con la sala');
  };
}

function leaveToMenu(msg) {
  if (es) es.close();
  es = null; ROOM = null; S = null;
  store.set('dom.room', '');
  history.replaceState(null, '', location.pathname);
  closeModal();
  showScreen('menu');
  refreshRooms();
  if (msg) toast(msg);
}

// ------------------------------------------------------------ utilidades UI
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${id}`));
}
let toastT;
function toast(text, info) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.toggle('info', !!info);
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2600);
}
function openModal(html, { dismiss = true, onClose } = {}) {
  const m = $('#modal');
  $('#modal-card').innerHTML = html;
  m.hidden = false;
  m.onclick = (e) => { if (dismiss && e.target === m) closeModal(); };
  m._dismiss = dismiss;
  m._onClose = onClose;
  return $('#modal-card');
}
function closeModal() {
  const m = $('#modal');
  if (m.hidden) return;
  m.hidden = true;
  $('#modal-card').innerHTML = '';
  const cb = m._onClose; m._onClose = null;
  cb && cb();
  modalKind = null;
}
let modalKind = null;

// ------------------------------------------------------------ mapas
let MAP_INDEX = [];
const mapCache = new Map();
async function getMap(id) {
  if (mapCache.has(id)) return mapCache.get(id);
  const p = fetch(`maps/${id}.json`, { cache: 'no-cache' }).then((r) => r.json()).then((m) => ({ map: m, graph: buildGraph(m) }));
  mapCache.set(id, p);
  return p;
}

// ------------------------------------------------------------ MENÚ
$('#inp-name').value = store.get('dom.name', '');
$('#inp-name').addEventListener('change', () => store.set('dom.name', myName()));
$('#inp-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('#inp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-join').click(); });

async function createRoom(isPublic, bots = 0) {
  sfx.unlock(); sfx.click();
  store.set('dom.name', myName());
  try {
    const { code } = await api('/api/create', { cid: CID, name: myName(), public: isPublic });
    connect(code);
    if (bots) {
      ROOM = code;
      for (let i = 0; i < bots; i++) await send({ type: 'addBot', level: 'soldado' });
    }
  } catch (e) { toast(e.message); }
}
$('#btn-create').onclick = () => createRoom(true);
$('#btn-solo').onclick = () => createRoom(false, 3);
$('#btn-join').onclick = () => joinRoom($('#inp-code').value);
$('#btn-refresh').onclick = () => refreshRooms();
$('#btn-rules').onclick = () => showRules();

async function joinRoom(code) {
  sfx.unlock(); sfx.click();
  code = String(code || '').toUpperCase().trim();
  if (code.length < 4) { toast('Introduce el código de la sala'); return; }
  store.set('dom.name', myName());
  try {
    const r = await api('/api/join', { cid: CID, name: myName(), code });
    connect(r.code);
    if (r.spectator) toast('La partida ya empezó: entras como espectador', true);
  } catch (e) { toast(e.message); sfx.error(); }
}

async function refreshRooms() {
  if (ROOM) return;
  try {
    const list = await api('/api/rooms');
    const box = $('#room-list');
    if (!list.length) { box.innerHTML = '<div class="empty">No hay salas abiertas ahora mismo. Crea una y comparte el código con tus amigos.</div>'; return; }
    box.innerHTML = list.map((r) => `
      <div class="room-item" data-code="${esc(r.code)}">
        <b>${esc(r.name)}</b><span class="code">${esc(r.code)}</span>
        <small>${esc(r.mapName || r.mapId)} · ${r.players}/${r.max} jugadores</small>
        <small>${r.status === 'lobby' ? 'Esperando jugadores' : 'En partida, puedes mirar'}</small>
      </div>`).join('');
    $$('.room-item', box).forEach((d) => (d.onclick = () => joinRoom(d.dataset.code)));
  } catch { $('#room-list').innerHTML = '<div class="empty">No se puede conectar con el servidor. Comprueba que está en marcha.</div>'; }
}
setInterval(() => { if (!ROOM && $('#screen-menu').classList.contains('active')) refreshRooms(); }, 5000);

function showRules() {
  openModal(`<h3>Cómo se juega</h3><div class="rules">
    <p><b>Objetivo:</b> conquistar todos los territorios eliminando a los demás jugadores (o cumplir tu misión secreta si se juega con misiones).</p>
    <h4>Preparación</h4><ul>
      <li><b>Reparto aleatorio:</b> los territorios se reparten al azar con 1 ejército y todos despliegan a la vez el resto.</li>
      <li><b>Clásico:</b> por turnos se elige un territorio libre; después se coloca 1 ejército por turno hasta agotar la reserva.</li>
      <li>Con 2 jugadores se añade un ejército <b>neutral</b> que no ataca pero defiende.</li></ul>
    <h4>1 · Refuerzos</h4><ul>
      <li>Recibes territorios ÷ 3 (mínimo 3) + el bonus de cada región que controles por completo.</li>
      <li>Canjea 3 cartas (3 iguales, 1 de cada tipo o con comodín). Con 5 o más cartas el canje es obligatorio.</li>
      <li>Progresivo: 4, 6, 8, 10, 12, 15 y luego +5. Fijo: 4 infantería, 6 caballería, 8 artillería, 10 una de cada.</li>
      <li>Si una carta canjeada muestra un territorio tuyo, recibes +2 ejércitos allí.</li></ul>
    <h4>2 · Ataque</h4><ul>
      <li>Ataca a un vecino desde un territorio con al menos 2 ejércitos. El atacante tira hasta 3 dados (uno menos que sus ejércitos) y el defensor hasta 2.</li>
      <li>Se comparan los dados más altos por parejas: el mayor gana y <b>los empates los gana el defensor</b>.</li>
      <li>Al conquistar, mueves como mínimo tantos ejércitos como dados lanzaste.</li>
      <li><b>Asalto total</b> repite el ataque automáticamente hasta conquistar o quedarte con 1 ejército.</li>
      <li>Si eliminas a un jugador te quedas con sus cartas; si llegas a 6 o más, canjeas al momento.</li></ul>
    <h4>3 · Fortificación</h4><ul>
      <li>Un único movimiento de ejércitos entre dos territorios tuyos conectados (o vecinos, según las reglas de la sala). Después termina tu turno.</li>
      <li>Si conquistaste al menos un territorio en el turno, robas una carta.</li></ul>
    <h4>Controles</h4><ul>
      <li>Rueda/pellizco para zoom, arrastra para mover el mapa.</li>
      <li>Atajos: <b>Espacio</b> atacar · <b>A</b> asalto total · <b>F</b> fortificar · <b>E</b> terminar turno · <b>C</b> cartas · <b>Esc</b> cancelar.</li></ul>
    </div><div class="modal-actions"><button class="btn btn-gold" id="m-ok">Entendido</button></div>`);
  $('#m-ok').onclick = closeModal;
}

// ------------------------------------------------------------ SNAPSHOTS
let lobbyMapShown = null;
let lobbySig = '';
function onSnapshot(snap) {
  S = snap;
  serverOffset = snap.serverTime - Date.now();
  const you = snap.you;
  document.body.classList.toggle('is-host', !!you.isHost);
  document.body.classList.toggle('is-guest', !you.isHost && !you.spectator);
  if (snap.room.status === 'lobby') {
    if (!$('#screen-lobby').classList.contains('active')) { showScreen('lobby'); closeModal(); game.reset(); }
    renderLobby();
  } else {
    if (!$('#screen-game').classList.contains('active')) { showScreen('game'); closeModal(); }
    game.onSnapshot(snap);
  }
}

// ------------------------------------------------------------ LOBBY
const MAP_GROUPS = [
  ['El mundo', ['clasico']],
  ['Continentes', ['europa', 'africa', 'americas', 'asia']],
  ['Países', ['espana', 'eeuu']],
  ['Otros', null],
];
const SETTING_DEFS = [
  ['setup', 'Despliegue', [['rapido', 'Reparto aleatorio'], ['clasico', 'Clásico (elegir territorios)']]],
  ['objective', 'Objetivo', [['dominacion', 'Dominación mundial'], ['misiones', 'Misiones secretas']]],
  ['cards', 'Cartas', [['progresivo', 'Progresivo (4·6·8·10·12·15…)'], ['fijo', 'Fijo (4/6/8/10)']]],
  ['fortify', 'Fortificar', [['conectado', 'Por territorios conectados'], ['adyacente', 'Solo a un vecino']]],
  ['turnTime', 'Tiempo/turno', [[0, 'Sin límite'], [45, '45 s'], [60, '1 min'], [90, '1:30 min'], [120, '2 min'], [180, '3 min'], [300, '5 min']]],
  ['botSpeed', 'Vel. bots', [['lenta', 'Lenta'], ['normal', 'Normal'], ['rapida', 'Rápida']]],
];

$('#sel-bot-level').innerHTML = BOT_LEVELS.map((l) => `<option value="${l.id}" ${l.id === 'soldado' ? 'selected' : ''}>${l.name} (${l.desc})</option>`).join('');
$('#btn-add-bot').onclick = () => { sfx.click(); send({ type: 'addBot', level: $('#sel-bot-level').value }); };
$('#btn-lobby-leave').onclick = async () => { await send({ type: 'leave' }).catch(() => {}); leaveToMenu(); };
$('#btn-copy').onclick = async () => {
  const link = `${location.origin}${location.pathname}?sala=${ROOM}`;
  try { await navigator.clipboard.writeText(link); toast('Enlace copiado: compártelo con tus amigos', true); }
  catch { toast(link, true); }
};
$('#chk-public').onchange = (e) => send({ type: 'setSettings', public: e.target.checked });
$('#inp-room-name').onchange = (e) => send({ type: 'setSettings', name: e.target.value });
$('#btn-start').onclick = async () => {
  sfx.click();
  try { await api('/api/action', { code: ROOM, cid: CID, msg: { type: 'start' } }); }
  catch (e) {
    if (e.message.startsWith('Esperando')) {
      openModal(`<h3>Hay jugadores sin confirmar</h3><p>${esc(e.message)}. Puedes esperar a que marquen «Estoy listo» o empezar ya.</p>
        <div class="modal-actions"><button class="btn" id="m-no">Esperar</button><button class="btn btn-gold" id="m-yes">Empezar ya</button></div>`);
      $('#m-no').onclick = closeModal;
      $('#m-yes').onclick = () => { closeModal(); send({ type: 'start', force: true }); };
    } else { toast(e.message); sfx.error(); }
  }
};
$('#btn-join-lobby').onclick = () => joinRoom(ROOM);
$('#btn-ready').onclick = () => {
  sfx.click();
  const me = S?.room.slots[S.you.slot];
  send({ type: 'ready', ready: !me?.ready });
};
function bindChat(form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('input', form);
    if (!inp.value.trim()) return;
    send({ type: 'chat', text: inp.value });
    inp.value = '';
  });
}
bindChat($('#lobby-chat-form'));
bindChat($('#game-chat-form'));

function renderChat(box, chat) {
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = chat.map((m) => m.sys
    ? `<div class="sys">— ${esc(m.text)}</div>`
    : `<div><b style="color:${esc(m.color)}">${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('');
  if (atBottom) box.scrollTop = box.scrollHeight;
}

async function renderLobby() {
  const { room, you } = S;
  const host = you.isHost;
  $('#room-code').textContent = room.code;
  const rn = $('#inp-room-name');
  if (document.activeElement !== rn) rn.value = room.name;
  rn.disabled = !host;
  $('#chk-public').checked = room.public;
  $('#chk-public').disabled = !host;
  $('#slot-count').textContent = `${room.slots.length}/8`;
  $('#btn-add-bot').disabled = room.slots.length >= 8;

  const sig = JSON.stringify([room.slots, room.settings, room.mapId, host, you.slot, MAP_INDEX.length]);
  const focusInLobby = document.activeElement && document.activeElement.matches('#slot-list select, #settings select');
  const rebuild = sig !== lobbySig && !focusInLobby;
  if (rebuild) lobbySig = sig;
  if (rebuild) $('#slot-list').innerHTML = room.slots.map((s, i) => {
    const mine = i === you.slot;
    const lvl = s.kind === 'bot'
      ? (host ? `<select data-lvl="${i}">${BOT_LEVELS.map((l) => `<option value="${l.id}" ${l.id === s.level ? 'selected' : ''}>${l.name}</option>`).join('')}</select>`
        : `<span class="tag">${esc(BOT_LEVELS.find((l) => l.id === s.level)?.name || 'Bot')}</span>`)
      : '';
    const tags = s.kind === 'human'
      ? `${s.isHost ? '<span class="tag host">Anfitrión</span>' : s.ready ? '<span class="tag ready">Listo</span>' : '<span class="tag">Esperando</span>'}${!s.connected ? '<span class="tag off">Sin conexión</span>' : ''}`
      : '<span class="tag">Bot</span>';
    const kick = host && !mine ? `<button class="x" data-kick="${i}" title="Quitar de la sala" aria-label="Quitar">×</button>` : '';
    return `<li class="slot ${mine ? 'me' : ''}"><span class="sw" style="background:${s.color}" data-color="${i}" title="Cambiar color"></span>
      <span class="nm">${esc(s.name)}${mine ? ' (tú)' : ''}</span>${tags}${lvl}${kick}</li>`;
  }).join('') + (room.slots.length < 2 ? '<li class="muted">Añade bots o invita amigos con el código.</li>' : '');
  $$('[data-lvl]').forEach((s) => (s.onchange = () => send({ type: 'botLevel', slot: Number(s.dataset.lvl), level: s.value })));
  $$('[data-kick]').forEach((b) => (b.onclick = () => send({ type: 'removeSlot', slot: Number(b.dataset.kick) })));
  $$('[data-color]').forEach((b) => (b.onclick = () => {
    const i = Number(b.dataset.color);
    if (i !== you.slot && !host) return;
    pickColor(i);
  }));

  if (!MAP_INDEX.length) { try { MAP_INDEX = await api('/api/maps'); lobbySig = ''; } catch { /* */ } }
  const card = (m) => `<button class="map-card ${m.id === room.mapId ? 'sel' : ''}" data-map="${m.id}" ${host ? '' : 'disabled'}>
    <b>${esc(m.name)}</b><small>${m.territories} territorios · ${m.regions} regiones</small></button>`;
  $('#map-pick').innerHTML = MAP_GROUPS.map(([title, ids]) => {
    const maps = MAP_INDEX.filter((m) => (ids ? ids.includes(m.id) : !MAP_GROUPS.some(([, x]) => x && x.includes(m.id))));
    return maps.length ? `<div class="map-group">${title}</div>${maps.map(card).join('')}` : '';
  }).join('');
  $$('[data-map]').forEach((b) => (b.onclick = () => { sfx.click(); send({ type: 'setMap', mapId: b.dataset.map }); }));
  if (lobbyMapShown !== room.mapId) {
    lobbyMapShown = room.mapId;
    const id = room.mapId;
    getMap(id).then(({ map }) => { if (lobbyMapShown === id) renderPreview($('#map-preview'), map); });
  }

  if (rebuild) $('#settings').innerHTML = SETTING_DEFS.map(([k, label, opts]) => `<label for="set-${k}">${label}</label>
    <select id="set-${k}" data-set="${k}" ${host ? '' : 'disabled'}>${opts.map(([v, t]) => `<option value="${v}" ${String(room.settings[k]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`).join('');
  $$('[data-set]').forEach((sel) => (sel.onchange = () => {
    const k = sel.dataset.set;
    const v = k === 'turnTime' ? Number(sel.value) : sel.value;
    send({ type: 'setSettings', settings: { [k]: v } });
  }));
  const me = room.slots[you.slot];
  $('#btn-join-lobby').hidden = you.slot >= 0 || room.slots.length >= 8;
  $('#btn-ready').textContent = me?.ready ? 'Listo (pulsa para cancelar)' : 'Estoy listo';
  $('#btn-ready').className = `btn big guest-only ${me?.ready ? 'btn-green' : 'btn-red'}`;
  $('#btn-start').disabled = room.slots.length < 2;
  renderChat($('#lobby-chat'), room.chat);
}

function pickColor(slot) {
  const used = new Map(S.room.slots.map((s, i) => [s.color, i]));
  openModal(`<h3>Elige un color</h3><p>Si otro jugador lo tiene, os intercambiáis los colores.</p><div class="color-grid">
    ${PLAYER_COLORS.map((c) => `<button style="background:${c.hex}" data-c="${c.hex}">${c.name}${used.has(c.hex) && used.get(c.hex) !== slot ? ' (en uso)' : ''}</button>`).join('')}
    </div>`);
  $$('[data-c]').forEach((b) => (b.onclick = () => { send({ type: 'color', color: b.dataset.c, slot }); closeModal(); }));
}

// ------------------------------------------------------------ PARTIDA
const KIND_ICON = ['🪖', '🐎', '💣', '⭐'];
const IC = (name) => `<svg class="ic"><use href="#i-${name}"/></svg>`;
const PHASE_TXT = { claim: 'Reclamar', setup: 'Despliegue', reinforce: 'Refuerzo', attack: 'Ataque', conquer: 'Conquista', fortify: 'Fortificar', over: 'Fin' };

const game = {
  view: null, map: null, graph: null, mapId: null, loading: null,
  lastSeq: 0, startedAt: null,
  ui: { sel: -1, target: -1, dice: 3, amount: '1', regions: false, chatSeen: 0, hoverT: -1 },

  reset() { this.startedAt = null; this.lastSeq = 0; this.ui.sel = -1; this.ui.target = -1; },

  get g() { return S?.game; },
  get me() { return S && !S.you.spectator ? S.you.slot : -1; },

  isMyTurn() {
    const g = this.g; const me = this.me;
    if (!g || me < 0 || g.phase === 'over') return false;
    if (!g.players[me]?.alive) return false;
    if (g.phase === 'setup' && g.settings.setup === 'rapido') return g.pool[me] > 0;
    return g.current === me;
  },

  async onSnapshot(snap) {
    const g = snap.game;
    if (!g) return;
    if (this.mapId !== snap.room.mapId || !this.view) {
      if (this.loading !== snap.room.mapId) {
        this.loading = snap.room.mapId;
        let loaded;
        try { loaded = await getMap(snap.room.mapId); }
        catch { mapCache.delete(snap.room.mapId); this.loading = null; toast('No se pudo cargar el mapa. Reintentando…'); setTimeout(() => S && this.onSnapshot(S), 2000); return; }
        const { map, graph } = loaded;
        this.map = map; this.graph = graph; this.mapId = snap.room.mapId;
        if (!this.view) {
          this.view = new MapView($('#map-svg'), $('#map-area'), {
            onClick: (t) => this.clickTerritory(t),
            onHover: (t, x, y) => this.hover(t, x, y),
          });
        }
        this.view.load(map);
        $('#map-label').textContent = map.name;
        this.loading = null;
        this.render(true);
      }
      return;
    }
    this.render(false);
  },

  render(fresh) {
    const g = this.g; if (!g || !this.view) return;
    if (this.startedAt !== g.startedAt) {
      this.startedAt = g.startedAt; this.lastSeq = g.seq; this.ui.sel = -1; this.ui.target = -1;
      if (!fresh) this.view.fit();
    }
    this.view.setPlayers(g.players);
    const newEvents = g.events.filter((e) => e.seq > this.lastSeq);
    this.lastSeq = g.seq;
    this.validateSelection();
    this.view.update(g, g.players);
    this.processEvents(newEvents);
    this.renderTop();
    this.renderPlayers();
    this.renderLog();
    this.renderRegions();
    this.renderChat();
    this.renderActionBar();
    this.applyHighlights();
    this.maybeModals();
  },

  validateSelection() {
    const g = this.g, ui = this.ui, me = this.me;
    if (!this.isMyTurn() || !['attack', 'fortify'].includes(g.phase)) { ui.sel = -1; ui.target = -1; return; }
    if (ui.sel >= 0 && (g.owners[ui.sel] !== me || g.armies[ui.sel] < 2)) { ui.sel = -1; ui.target = -1; }
    if (ui.target >= 0) {
      if (g.phase === 'attack' && (g.owners[ui.target] === me || !this.graph.adj[ui.sel]?.includes(ui.target))) ui.target = -1;
      if (g.phase === 'fortify') ui.target = -1;
    }
  },

  // ---------------------------------------------------------- eventos/animaciones
  processEvents(evs) {
    if (!evs.length) return;
    const g = this.g, me = this.me;
    const recent = evs.slice(-8);
    for (const ev of recent) {
      switch (ev.type) {
        case 'battle': {
          this.showDice(ev);
          sfx.dice();
          setTimeout(() => {
            if (ev.aLoss) this.floater(ev.from, `-${ev.aLoss}`, 'neg');
            if (ev.dLoss) this.floater(ev.to, `-${ev.dLoss}`, 'neg');
            sfx.hit();
            if (ev.conquered) {
              this.view.flash(ev.to);
              this.floater(ev.to, 'Conquistado', 'big');
              if (ev.def === me) { sfx.lose(); $('#map-area').classList.remove('shake'); void $('#map-area').offsetWidth; $('#map-area').classList.add('shake'); }
              else sfx.conquer();
            }
          }, 420);
          break;
        }
        case 'place': if (ev.n) { this.floater(ev.t, `+${ev.n}`, 'pos'); if (ev.p === me) sfx.place(); } break;
        case 'claim': this.view.flash(ev.t); if (ev.p === me) sfx.place(); break;
        case 'move': if (ev.p === me) { this.ui.sel = g.armies[ev.to] >= 2 && this.graph.adj[ev.to].some((n) => g.owners[n] !== me) ? ev.to : (g.armies[ev.from] >= 2 ? ev.from : -1); this.ui.target = -1; } break;
        case 'fortify': this.floater(ev.to, `+${ev.n}`, 'pos'); this.floater(ev.from, `-${ev.n}`, 'neg'); if (ev.p === me) sfx.place(); break;
        case 'trade': this.banner(`${g.players[ev.p].name} canjea cartas: +${ev.value} ejércitos`, false); sfx.trade(); if (ev.bonusT >= 0) this.floater(ev.bonusT, '+2', 'pos'); break;
        case 'card': if (ev.p === me) { toast('Has ganado una carta', true); sfx.card(); } break;
        case 'turn': {
          const mine = ev.p === me;
          this.banner(mine ? `Tu turno: recibes ${ev.reinforcements} refuerzos` : `Turno de ${g.players[ev.p].name}`, true);
          if (mine) { sfx.turn(); this.focusMine(); }
          break;
        }
        case 'eliminated': this.banner(`${g.players[ev.p].name} ha sido eliminado`, true); sfx.eliminated(); break;
        case 'win': sfx.win(); break;
      }
    }
  },

  focusMine() {
    const g = this.g;
    const own = territoriesOf(g, this.me);
    const border = own.find((t) => this.graph.adj[t].some((n) => g.owners[n] !== this.me));
    if (border != null && this.view.s / this.view.fitS > 1.2) this.view.centerOn(border);
  },

  floater(t, text, cls) {
    if (t == null || t < 0) return;
    const p = this.view.screenPos(t);
    const d = document.createElement('div');
    d.className = `floater ${cls || ''}`;
    d.textContent = text;
    d.style.left = `${p.x}px`; d.style.top = `${p.y - 6}px`;
    $('#floaters').appendChild(d);
    setTimeout(() => d.remove(), 1400);
  },

  banner(text, big) {
    const b = $('#banner');
    b.textContent = text;
    b.classList.remove('big'); void b.offsetWidth;
    if (big) b.classList.add('big');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.textContent = ''; this.renderBannerHint(); }, 2300);
  },

  renderBannerHint() {
    // banner persistente para fases de preparación
    const b = $('#banner');
    if (b.textContent) return;
  },

  showDice(ev) {
    const g = this.g;
    const last = ev.rolls[ev.rolls.length - 1];
    const pips = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    const die = (v, cls, res) => `<div class="die ${cls} ${res}">${Array.from({ length: 9 }, (_, i) => (pips[v].includes(i) ? '<i></i>' : '<span></span>')).join('')}</div>`;
    const pairs = Math.min(last.a.length, last.d.length);
    const aDice = last.a.map((v, i) => die(v, 'att', i < pairs ? (v > last.d[i] ? 'win' : 'lose') : '')).join('');
    const dDice = last.d.map((v, i) => die(v, 'def', i < pairs ? (v >= last.a[i] ? 'win' : 'lose') : '')).join('');
    const defName = g.players[ev.def]?.name || '';
    const tray = $('#dice-tray');
    tray.innerHTML = `<div class="dice-side"><div class="who" style="color:${g.players[ev.p].color}">${esc(g.players[ev.p].name)}</div><div class="dice-row">${aDice}</div></div>
      <div class="dice-res"><div class="dice-vs">VS</div>${ev.nRolls > 1 ? `${ev.nRolls} tiradas<br>` : ''}-${ev.aLoss} / -${ev.dLoss}</div>
      <div class="dice-side"><div class="who" style="color:${g.players[ev.def]?.color}">${esc(defName)}</div><div class="dice-row">${dDice}</div></div>`;
    tray.classList.add('show');
    clearTimeout(this.diceT);
    this.diceT = setTimeout(() => tray.classList.remove('show'), 1900);
  },

  // ---------------------------------------------------------- paneles
  renderTop() {
    const g = this.g;
    $('#turn-label').textContent = g.phase === 'claim' || g.phase === 'setup' ? PHASE_TXT[g.phase] : `Turno ${g.turn}, ronda ${g.round}`;
    const order = ['reinforce', 'attack', 'fortify'];
    const ph = g.phase === 'conquer' ? 'attack' : g.phase;
    const idx = order.indexOf(ph);
    $$('#phase-steps li').forEach((li, i) => {
      li.classList.toggle('on', i === idx);
      li.classList.toggle('done', idx >= 0 && i < idx);
    });
  },

  renderPlayers() {
    const g = this.g, graph = this.graph;
    const totalT = graph.n;
    const html = g.players.map((p, i) => {
      const terr = territoriesOf(g, i);
      const armies = terr.reduce((s, t) => s + g.armies[t], 0);
      const slot = S.room.slots[i];
      const isCur = (g.phase === 'setup' && g.settings.setup === 'rapido') ? g.pool[i] > 0 && !p.neutral : g.current === i && g.phase !== 'over';
      const tag = p.neutral ? 'Neutral' : p.bot ? (BOT_LEVELS.find((l) => l.id === p.bot)?.name || 'Bot')
        : slot?.left ? 'Se fue' : slot?.afk ? 'Ausente' : !slot?.connected ? 'Sin conexión' : i === this.me ? 'Tú' : '';
      const rb = p.alive ? reinforcementBreakdown(graph, g, i) : null;
      return `<div class="pcard ${isCur ? 'current' : ''} ${p.alive ? '' : 'dead'}" style="--pc:${p.color}" title="${esc(p.name)}">
        <div class="pn">${esc(p.name)} ${tag ? `<small>${tag}</small>` : ''}${p.alive ? '' : '<small>Eliminado</small>'}</div>
        <div class="ps"><span title="Territorios">${IC('flag')}${terr.length}</span><span title="Ejércitos">${IC('army')}${armies}</span>${p.neutral ? '' : `<span title="Cartas">${IC('card')}${p.cardCount}</span>`}${rb && !p.neutral && g.phase !== 'claim' && g.phase !== 'setup' ? `<span title="Refuerzos por turno">${IC('plusarmy')}${rb.total}</span>` : ''}${g.phase === 'setup' && !p.neutral && g.pool[i] > 0 ? `<span title="Por desplegar">${IC('hourglass')}${g.pool[i]}</span>` : ''}</div>
        <div class="bar"><i style="width:${(terr.length / totalT) * 100}%"></i></div></div>`;
    }).join('');
    $('#players-panel').innerHTML = html;
  },

  renderLog() {
    const g = this.g;
    const box = $('#game-log');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = g.log.slice(-80).map((l) => `<div style="--lc:${l.p != null && l.p >= 0 ? g.players[l.p]?.color : 'var(--parch-3)'}">${esc(l.text)}</div>`).join('');
    if (atBottom) box.scrollTop = box.scrollHeight;
  },

  renderRegions() {
    const g = this.g, graph = this.graph;
    const box = $('#region-list');
    box.innerHTML = graph.regions.map((r, ri) => {
      const counts = new Map();
      for (const t of r.members) counts.set(g.owners[t], (counts.get(g.owners[t]) || 0) + 1);
      const segs = [...counts].sort((a, b) => b[1] - a[1]).map(([o, c]) => `<i style="width:${(c / r.members.length) * 100}%;background:${o >= 0 ? g.players[o].color : '#d9c69a'}"></i>`).join('');
      const owner = counts.size === 1 && [...counts.keys()][0] >= 0 ? g.players[[...counts.keys()][0]] : null;
      return `<div class="reg" data-reg="${ri}"><div class="reg-h"><span>${esc(r.name)}</span><span class="bonus">+${r.bonus}</span></div>
        <div class="reg-bar">${segs}</div><small>${r.members.length} territorios${owner ? ` · dominada por <b style="color:${owner.color}">${esc(owner.name)}</b>` : ''}</small></div>`;
    }).join('');
    $$('.reg', box).forEach((d) => {
      const ri = Number(d.dataset.reg);
      d.onmouseenter = () => this.view.highlightSet(new Set(graph.regions[ri].members));
      d.onmouseleave = () => this.applyHighlights();
    });
  },

  renderChat() {
    const chat = S.room.chat;
    renderChat($('#game-chat'), chat);
    const active = $('[data-tab="chat"]').classList.contains('active') && ($('#side-right').classList.contains('open') || getComputedStyle($('#side-right')).position !== 'fixed');
    const last = chat.length ? chat[chat.length - 1].ts : 0;
    if (active) this.ui.chatSeen = last;
    $('#chat-badge').classList.toggle('on', last > this.ui.chatSeen && !chat[chat.length - 1]?.sys);
  },

  // ---------------------------------------------------------- barra de acciones
  renderActionBar() {
    const g = this.g, me = this.me, ui = this.ui;
    const center = $('#ab-center'), right = $('#ab-right');
    const myP = me >= 0 ? g.players[me] : null;
    const hand = myP?.cards || [];
    $('#cards-count').textContent = hand.length;
    $('#btn-cards').style.display = me >= 0 ? '' : 'none';
    const canTrade = this.isMyTurn() && g.phase === 'reinforce' && validSets(hand).length > 0;
    $('#btn-cards').classList.toggle('alert', canTrade);
    $('#btn-mission').hidden = !(myP?.mission && !myP.mission.hidden);
    const amountSel = (max) => `<div class="amount" role="group" aria-label="Cantidad por clic">${['1', '3', '5', 'all'].map((a) => `<button data-amount="${a}" class="${ui.amount === a ? 'on' : ''}">${a === 'all' ? `Todos (${max})` : a}</button>`).join('')}</div>`;
    let c = '', r = '';
    if (g.phase === 'over') {
      c = `<div class="ab-msg"><b>${esc(g.players[g.winner]?.name)}</b> ha ganado la partida</div>`;
      r = '<button class="btn btn-gold" id="ab-results">Resultados</button>';
    } else if (me < 0 || !myP) {
      c = `<div class="ab-msg">Estás mirando la partida. Turno de <b>${esc(g.players[g.current]?.name)}</b></div>`;
    } else if (!myP.alive) {
      c = '<div class="ab-msg">Te han eliminado. Puedes seguir mirando la partida.</div>';
    } else if (!this.isMyTurn()) {
      if (g.phase === 'setup' && g.settings.setup === 'rapido') c = '<div class="ab-msg">Esperando a que los demás terminen de desplegar…</div>';
      else c = `<div class="ab-msg">Turno de <b style="color:${g.players[g.current].color}">${esc(g.players[g.current].name)}</b> · ${PHASE_TXT[g.phase]}</div>`;
      const slot = S.room.slots[me];
      if (slot?.afk) r = '<button class="btn btn-gold pulse" id="ab-back">He vuelto</button>';
    } else {
      switch (g.phase) {
        case 'claim':
          c = '<div class="ab-msg">Elige un <b>territorio libre</b> en el mapa</div>'; break;
        case 'setup':
          c = `<div class="ab-msg">Despliega tus ejércitos: <b>${g.pool[me]}</b> restantes</div>${g.settings.setup === 'rapido' ? amountSel(g.pool[me]) : ''}`;
          if (g.settings.setup === 'rapido') r = '<button class="btn" id="ab-autoplace">Repartir solo</button>';
          break;
        case 'reinforce':
          if (hand.length >= 5) { c = '<div class="ab-msg">Tienes 5 o más cartas: <b>canjea antes de seguir</b></div>'; r = '<button class="btn btn-gold pulse" id="ab-cards">Canjear cartas</button>'; }
          else if (g.reinforcements > 0) c = `<div class="ab-msg">Coloca tus refuerzos: <b>${g.reinforcements}</b></div>${amountSel(g.reinforcements)}`;
          else { c = '<div class="ab-msg">Refuerzos colocados. Aún puedes canjear cartas.</div>'; r = '<button class="btn btn-gold pulse" id="ab-toattack">Pasar al ataque</button>'; }
          break;
        case 'attack':
          if (ui.sel >= 0 && ui.target >= 0) {
            const maxD = Math.min(3, g.armies[ui.sel] - 1);
            if (ui.dice > maxD) ui.dice = maxD;
            const wp = Math.round(winProbability(g.armies[ui.sel] - 1, g.armies[ui.target]) * 100);
            c = `<div class="ab-msg">${esc(this.graph.names[ui.sel])} contra <b>${esc(this.graph.names[ui.target])}</b> <small>${wp}% de conquista en asalto</small></div>
              <div class="dice-pick" role="group" aria-label="Dados">${[1, 2, 3].map((d) => `<button data-dice="${d}" class="${ui.dice === d ? 'on' : ''}" ${d > maxD ? 'disabled' : ''} title="${d} ${d === 1 ? 'dado' : 'dados'}">${d}</button>`).join('')}</div>
              <button class="btn btn-red" id="ab-attack">Atacar</button><button class="btn" id="ab-blitz">Asalto total</button>`;
          } else if (ui.sel >= 0) c = `<div class="ab-msg">Desde <b>${esc(this.graph.names[ui.sel])}</b>: elige un enemigo vecino</div>`;
          else c = '<div class="ab-msg">Elige un territorio tuyo con 2+ ejércitos para atacar</div>';
          r = '<button class="btn" id="ab-fortify">Fortificar</button><button class="btn" id="ab-end">Terminar turno</button>';
          break;
        case 'conquer':
          c = '<div class="ab-msg">Territorio conquistado. Elige cuántos ejércitos mover.</div>';
          r = '<button class="btn btn-gold" id="ab-move">Mover ejércitos</button>';
          break;
        case 'fortify':
          c = ui.sel >= 0 ? `<div class="ab-msg">Mover desde <b>${esc(this.graph.names[ui.sel])}</b>: elige destino</div>` : '<div class="ab-msg">Fortifica: elige origen (opcional) o termina</div>';
          r = '<button class="btn btn-gold" id="ab-end">Terminar turno</button>';
          break;
      }
    }
    center.innerHTML = c; right.innerHTML = r;
    $$('[data-amount]', center).forEach((b) => (b.onclick = () => { ui.amount = b.dataset.amount; sfx.click(); this.renderActionBar(); }));
    $$('[data-dice]', center).forEach((b) => (b.onclick = () => { ui.dice = Number(b.dataset.dice); sfx.click(); this.renderActionBar(); }));
    const on = (id, fn) => { const b = $(`#${id}`); if (b) b.onclick = fn; };
    on('ab-attack', () => this.doAttack(false));
    on('ab-blitz', () => this.doAttack(true));
    on('ab-fortify', () => { sfx.click(); ui.sel = -1; ui.target = -1; act({ type: 'endAttack' }); });
    on('ab-end', () => { sfx.click(); act({ type: 'endTurn' }); });
    on('ab-toattack', () => { sfx.click(); act({ type: 'toAttack' }); });
    on('ab-cards', () => this.openCards());
    on('ab-back', () => send({ type: 'back' }));
    on('ab-results', () => this.showGameOver(true));
    on('ab-autoplace', () => this.autoPlace());
    on('ab-move', () => this.openMove());
  },

  amountFor(max) {
    const a = this.ui.amount;
    return a === 'all' ? max : Math.min(max, Number(a));
  },

  autoPlace() {
    const g = this.g, me = this.me;
    const own = territoriesOf(g, me).filter((t) => this.graph.adj[t].some((n) => g.owners[n] !== me));
    if (!own.length) return;
    let left = g.pool[me];
    const per = Math.max(1, Math.ceil(left / Math.min(own.length, 4)));
    const shuffled = own.sort(() => Math.random() - 0.5).slice(0, 4);
    (async () => {
      for (const t of shuffled) { if (left <= 0) break; const n = Math.min(per, left); left -= n; await act({ type: 'setup', t, n }); }
    })();
  },

  doAttack(blitz) {
    const ui = this.ui, g = this.g;
    if (ui.sel < 0 || ui.target < 0) return;
    sfx.click();
    act({ type: 'attack', from: ui.sel, to: ui.target, dice: Math.min(ui.dice, g.armies[ui.sel] - 1), blitz });
  },

  // ---------------------------------------------------------- interacción con el mapa
  clickTerritory(t) {
    sfx.unlock();
    const g = this.g, me = this.me, ui = this.ui;
    if (!g || !this.isMyTurn()) {
      if (g && me >= 0 && g.phase !== 'over') toast('Espera a tu turno', true);
      return;
    }
    const own = g.owners[t] === me;
    switch (g.phase) {
      case 'claim':
        if (g.owners[t] !== -1) return toast('Ese territorio ya tiene dueño');
        act({ type: 'claim', t }); break;
      case 'setup':
        if (!own) return toast('Solo puedes desplegar en tus territorios');
        act({ type: 'setup', t, n: g.settings.setup === 'rapido' ? this.amountFor(g.pool[me]) : 1 }); break;
      case 'reinforce':
        if (g.players[me].cards.length >= 5) { this.openCards(); return; }
        if (!own) return toast('Solo puedes reforzar tus territorios');
        if (g.reinforcements <= 0) return;
        act({ type: 'place', t, n: this.amountFor(g.reinforcements) }); break;
      case 'attack':
        if (own) {
          if (ui.sel === t) { ui.sel = -1; ui.target = -1; }
          else if (g.armies[t] < 2) { toast('Necesitas al menos 2 ejércitos para atacar'); sfx.error(); return; }
          else { ui.sel = t; ui.target = -1; ui.dice = Math.min(3, g.armies[t] - 1); sfx.click(); }
        } else if (ui.sel >= 0) {
          if (!this.graph.adj[ui.sel].includes(t)) {
            // ¿hay otro territorio propio vecino con tropas? selecciónalo automáticamente
            const alt = this.graph.adj[t].filter((n) => g.owners[n] === me && g.armies[n] >= 2).sort((a, b) => g.armies[b] - g.armies[a])[0];
            if (alt == null) { toast('No es vecino de tu territorio seleccionado'); sfx.error(); return; }
            ui.sel = alt;
            ui.dice = Math.min(3, g.armies[alt] - 1);
          }
          if (ui.target === t) { this.doAttack(false); return; }
          ui.target = t; ui.dice = Math.min(3, g.armies[ui.sel] - 1); sfx.click();
        } else {
          const alt = this.graph.adj[t].filter((n) => g.owners[n] === me && g.armies[n] >= 2).sort((a, b) => g.armies[b] - g.armies[a])[0];
          if (alt == null) { toast('Ninguno de tus territorios vecinos puede atacar'); sfx.error(); return; }
          ui.sel = alt; ui.target = t; ui.dice = Math.min(3, g.armies[alt] - 1); sfx.click();
        }
        this.renderActionBar(); this.applyHighlights(); break;
      case 'fortify':
        if (!own) return;
        if (ui.sel < 0 || ui.sel === t) {
          if (ui.sel === t) { ui.sel = -1; }
          else if (g.armies[t] < 2) { toast('Ese territorio no tiene tropas que mover'); return; }
          else ui.sel = t;
          sfx.click();
        } else if (canFortify(this.graph, g, ui.sel, t)) {
          this.openFortify(ui.sel, t);
        } else if (g.armies[t] >= 2) { ui.sel = t; sfx.click(); }
        else { toast(g.settings.fortify === 'adyacente' ? 'Solo puedes mover a un vecino' : 'No están conectados por territorios tuyos'); return; }
        this.renderActionBar(); this.applyHighlights(); break;
    }
  },

  applyHighlights() {
    const g = this.g, ui = this.ui, me = this.me;
    if (!g || !this.view) return;
    if (!this.isMyTurn()) {
      const pend = g.phase === 'conquer' && g.pending ? g.pending : null;
      this.view.highlight({ sel: pend ? pend.from : -1, targets: pend ? [pend.to] : [] });
      return;
    }
    if (g.phase === 'attack') {
      const targets = ui.sel >= 0 ? this.graph.adj[ui.sel].filter((n) => g.owners[n] !== me) : [];
      this.view.highlight({ sel: ui.sel, targets: ui.target >= 0 ? [ui.target] : targets, dim: ui.sel >= 0 });
    } else if (g.phase === 'fortify') {
      let own = [];
      if (ui.sel >= 0) own = g.settings.fortify === 'adyacente' ? this.graph.adj[ui.sel].filter((n) => g.owners[n] === me) : [...reachable(this.graph, g, ui.sel)];
      this.view.highlight({ sel: ui.sel, own, dim: ui.sel >= 0 });
    } else if (g.phase === 'claim') {
      const free = []; g.owners.forEach((o, i) => o === -1 && free.push(i));
      this.view.highlight({ own: free });
    } else if (g.phase === 'conquer' && g.pending) {
      this.view.highlight({ sel: g.pending.from, own: [g.pending.to] });
    } else this.view.highlight({});
  },

  hover(t, x, y) {
    const tip = $('#tooltip');
    const g = this.g;
    if (t < 0 || !g) { tip.style.display = 'none'; return; }
    const o = g.owners[t];
    const reg = this.graph.regions[this.graph.regionOf[t]];
    let extra = '';
    if (g.phase === 'attack' && this.isMyTurn() && o !== this.me) {
      const from = this.ui.sel >= 0 && this.graph.adj[this.ui.sel].includes(t) ? this.ui.sel
        : this.graph.adj[t].filter((n) => g.owners[n] === this.me && g.armies[n] >= 2).sort((a, b) => g.armies[b] - g.armies[a])[0];
      if (from != null) extra = `<br>🎯 Prob. de conquista: <b>${Math.round(winProbability(g.armies[from] - 1, g.armies[t]) * 100)}%</b>`;
    }
    tip.innerHTML = `<b>${esc(this.graph.names[t])}</b>${esc(reg.name)} (+${reg.bonus})<br>${o >= 0 ? `<span style="color:${g.players[o].color};font-weight:800">${esc(g.players[o].name)}</span> · ⚔ ${g.armies[t]}` : 'Libre'}${extra}`;
    tip.style.display = 'block';
    const area = $('#map-area').getBoundingClientRect();
    tip.style.left = `${Math.min(x + 16, area.width - 230)}px`;
    tip.style.top = `${Math.min(y + 16, area.height - 90)}px`;
  },

  // ---------------------------------------------------------- modales de juego
  maybeModals() {
    const g = this.g;
    if (g.phase === 'conquer' && this.isMyTurn() && g.pending && modalKind !== 'move') this.openMove();
    if (g.phase !== 'conquer' && modalKind === 'move') closeModal();
    if (modalKind === 'fortify' && (!this.isMyTurn() || !['attack', 'fortify'].includes(g.phase))) closeModal();
    if (modalKind === 'cards' && g.phase === 'over') closeModal();
    if (g.phase === 'over' && !this.overShown) { this.overShown = true; setTimeout(() => this.showGameOver(true), 1200); }
    if (g.phase !== 'over') this.overShown = false;
    if (modalKind === 'cards') this.openCards(true);
  },

  openMove() {
    const g = this.g; const { from, to, min, max } = g.pending;
    modalKind = 'move';
    openModal(`<h3>Has conquistado ${esc(this.graph.names[to])}</h3>
      <p>Mueve ejércitos desde ${esc(this.graph.names[from])}. Mínimo ${min}, máximo ${max}.</p>
      <div class="range-row"><button class="btn tiny" id="mv-min">Mín.</button><input type="range" id="mv-r" min="${min}" max="${max}" value="${max}" aria-label="Ejércitos a mover"><output id="mv-o">${max}</output><button class="btn tiny" id="mv-max">Máx.</button></div>
      <div class="modal-actions"><button class="btn btn-gold big" id="mv-ok">Mover ejércitos</button></div>`, { dismiss: false });
    const r = $('#mv-r'), o = $('#mv-o');
    r.oninput = () => (o.textContent = r.value);
    $('#mv-min').onclick = () => { r.value = min; o.textContent = min; };
    $('#mv-max').onclick = () => { r.value = max; o.textContent = max; };
    $('#mv-ok').onclick = () => { const n = Number(r.value); closeModal(); act({ type: 'move', n }); };
  },

  openFortify(from, to) {
    const g = this.g; const max = g.armies[from] - 1;
    modalKind = 'fortify';
    openModal(`<h3>Fortificar</h3><p>Mueve ejércitos de ${esc(this.graph.names[from])} a ${esc(this.graph.names[to])}. Después termina tu turno.</p>
      <div class="range-row"><input type="range" id="fv-r" min="1" max="${max}" value="${max}" aria-label="Ejércitos a mover"><output id="fv-o">${max}</output></div>
      <div class="modal-actions"><button class="btn" id="fv-no">Cancelar</button><button class="btn btn-gold" id="fv-ok">Mover y terminar turno</button></div>`);
    const r = $('#fv-r'), o = $('#fv-o');
    r.oninput = () => (o.textContent = r.value);
    $('#fv-no').onclick = closeModal;
    $('#fv-ok').onclick = () => { const n = Number(r.value); closeModal(); this.ui.sel = -1; act({ type: 'fortify', from, to, n }); };
  },

  openCards(refresh) {
    const g = this.g, me = this.me;
    if (me < 0) return;
    const hand = g.players[me].cards || [];
    if (!refresh) this.cardSel = [];
    this.cardSel = (this.cardSel || []).filter((i) => i < hand.length);
    modalKind = 'cards';
    const sel = this.cardSel;
    const selCards = sel.map((i) => hand[i]);
    const valid = sel.length === 3 && isValidSet(selCards);
    const canTrade = this.isMyTurn() && g.phase === 'reinforce';
    const next = valid ? tradeValue(g.tradeCount, g.settings.cards, selCards) : (g.settings.cards === 'progresivo' ? tradeValue(g.tradeCount, 'progresivo') : null);
    const must = hand.length >= 5 && canTrade;
    openModal(`<h3>Tus cartas</h3>
      ${hand.length ? `<div class="hand">${hand.map((c, i) => `<div class="card ${sel.includes(i) ? 'on' : ''} ${c.k === 3 ? 'wild' : ''} ${c.t >= 0 && g.owners[c.t] === me ? 'mine' : ''}" data-card="${i}">
        <div class="kd">${CARD_KINDS[c.k]}</div><div class="ico">${KIND_ICON[c.k]}</div><div class="tn">${c.t >= 0 ? esc(this.graph.names[c.t]) : 'Comodín'}</div></div>`).join('')}</div>`
        : '<p>Aún no tienes cartas. Conquista al menos un territorio en tu turno para ganar una.</p>'}
      <div class="trade-scale">${g.settings.cards === 'progresivo' ? `Próximo canje: <b>${tradeValue(g.tradeCount, 'progresivo')}</b> ejércitos · canjes realizados: ${g.tradeCount}` : 'Valores: 🪖×3=4 · 🐎×3=6 · 💣×3=8 · uno de cada=10'}<br>
      Combinaciones: 3 iguales · una de cada · cualquiera con ⭐. +2 ejércitos si una carta es de un territorio tuyo.</div>
      ${must ? '<p style="text-align:center;color:#ff8a82;font-weight:600">Tienes 5 o más cartas: canjea antes de seguir.</p>' : ''}
      <div class="modal-actions">
        ${must ? '' : '<button class="btn" id="cd-close">Cerrar</button>'}
        <button class="btn" id="cd-best" ${validSets(hand).length && canTrade ? '' : 'disabled'}>Elegir la mejor</button>
        <button class="btn btn-gold" id="cd-trade" ${valid && canTrade ? '' : 'disabled'}>Canjear${valid ? ` (+${next})` : ''}</button>
      </div>`, { dismiss: !must, onClose: () => { modalKind = null; } });
    modalKind = 'cards';
    $$('[data-card]').forEach((d) => (d.onclick = () => {
      const i = Number(d.dataset.card);
      const k = this.cardSel.indexOf(i);
      if (k >= 0) this.cardSel.splice(k, 1); else if (this.cardSel.length < 3) this.cardSel.push(i);
      sfx.click(); this.openCards(true);
    }));
    const close = $('#cd-close'); if (close) close.onclick = closeModal;
    $('#cd-best').onclick = () => { this.cardSel = bestSet(hand, g.settings.cards, g.owners, me) || []; this.openCards(true); };
    $('#cd-trade').onclick = () => {
      const cards = [...this.cardSel];
      this.cardSel = [];
      act({ type: 'trade', cards }).then(() => {
        const h = this.g.players[this.me].cards || [];
        if (h.length < 5 && modalKind === 'cards' && !validSets(h).length) closeModal();
      });
    };
  },

  showMission() {
    const g = this.g, me = this.me;
    const m = g.players[me]?.mission;
    if (!m) return;
    openModal(`<h3>Tu misión secreta</h3><p style="font-size:19px;color:var(--text)">${esc(missionText(this.graph, g, m, me))}</p>
      <p>Ganas en cuanto la cumplas durante tu turno. También ganas si eliminas a todos los demás.</p>
      <div class="modal-actions"><button class="btn btn-gold" id="m-ok">Entendido</button></div>`);
    $('#m-ok').onclick = closeModal;
  },

  showGameOver(force) {
    const g = this.g;
    if (!g || g.phase !== 'over') return;
    if (modalKind && !force) return;
    const w = g.players[g.winner];
    const rows = g.players.map((p, i) => {
      const terr = territoriesOf(g, i).length;
      const m = p.mission && !p.mission.hidden ? missionText(this.graph, g, p.mission, i) : '';
      return `<tr><td><b style="color:${p.color}">${esc(p.name)}</b>${p.neutral ? ' (neutral)' : ''}${m ? `<br><small>${esc(m)}</small>` : ''}</td><td>${terr}</td><td>${p.stats.conquered}</td><td>${p.stats.kills}</td><td>${p.stats.battlesWon}/${p.stats.battlesLost}</td><td>${p.stats.trades}</td></tr>`;
    }).join('');
    const isWinner = g.winner === this.me;
    modalKind = 'over';
    openModal(`<div class="winner"><h3>${isWinner ? 'Has ganado' : `Gana ${esc(w.name)}`}</h3><p>${esc(g.winReason || '')}</p></div>
      <table class="stats"><tr><th>Jugador</th><th>Territorios</th><th>Conquistas</th><th>Eliminados</th><th>Bajas hechas / sufridas</th><th>Canjes</th></tr>${rows}</table>
      <div class="modal-actions"><button class="btn" id="go-map">Ver el mapa</button><button class="btn" id="go-menu">Salir al menú</button>${S.you.isHost ? '<button class="btn btn-gold" id="go-again">Jugar la revancha</button>' : ''}</div>`);
    $('#go-map').onclick = closeModal;
    $('#go-menu').onclick = async () => { await send({ type: 'leave' }).catch(() => {}); leaveToMenu(); };
    const again = $('#go-again'); if (again) again.onclick = () => send({ type: 'rematch' });
  },

  showMenu() {
    openModal(`<h3>Menú</h3><div class="btn-col">
      <button class="btn btn-gold" id="mm-close">Volver a la partida</button>
      <button class="btn" id="mm-rules">Cómo se juega</button>
      <button class="btn" id="mm-copy">Copiar enlace de la sala ${esc(ROOM)}</button>
      <button class="btn btn-red" id="mm-leave">Abandonar la partida</button></div>`);
    $('#mm-rules').onclick = showRules;
    $('#mm-copy').onclick = () => $('#btn-copy').click();
    $('#mm-close').onclick = closeModal;
    $('#mm-leave').onclick = () => {
      openModal(`<h3>¿Abandonar la partida?</h3><p>Un bot seguirá jugando con tus ejércitos. No podrás volver a esta partida como jugador.</p><div class="modal-actions"><button class="btn" id="lv-no">Seguir jugando</button><button class="btn btn-red" id="lv-yes">Abandonar</button></div>`);
      $('#lv-no').onclick = closeModal;
      $('#lv-yes').onclick = async () => { await send({ type: 'leave' }).catch(() => {}); leaveToMenu(); };
    };
  },
};

// ------------------------------------------------------------ controles de partida
$('#btn-cards').onclick = () => { sfx.click(); game.openCards(); };
$('#btn-mission').onclick = () => game.showMission();
$('#btn-menu').onclick = () => game.showMenu();
const setSoundIcon = () => { $('#btn-sound').innerHTML = IC(sfx.muted ? 'mute' : 'sound'); };
$('#btn-sound').onclick = () => { sfx.toggle(); setSoundIcon(); };
setSoundIcon();
$('#btn-regions').onclick = () => {
  game.ui.regions = !game.ui.regions;
  game.view?.setRegionMode(game.ui.regions);
  $('#btn-regions').classList.toggle('on', game.ui.regions);
};
$('#btn-side').onclick = () => { $('#side-right').classList.toggle('open'); game.renderChat?.(); };
$$('.tab').forEach((t) => (t.onclick = () => {
  $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $$('.tab-body').forEach((b) => b.classList.toggle('active', b.id === `tab-${t.dataset.tab}`));
  if (S?.game) game.renderChat();
}));
$$('[data-zoom]').forEach((b) => (b.onclick = () => game.view?.zoomButton(b.dataset.zoom)));

document.addEventListener('keydown', (e) => {
  if (!$('#screen-game').classList.contains('active')) return;
  if (e.target.matches('input, select, textarea')) return;
  const g = S?.game; if (!g) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (!$('#modal').hidden && $('#modal')._dismiss) closeModal(); game.ui.sel = -1; game.ui.target = -1; game.renderActionBar(); game.applyHighlights(); }
  if (!$('#modal').hidden) { if (k === 'enter' && modalKind === 'move') $('#mv-ok')?.click(); return; }
  if (!game.isMyTurn()) return;
  if ((k === ' ' || k === 'enter') && g.phase === 'attack') { e.preventDefault(); game.doAttack(false); }
  else if (k === 'a' && g.phase === 'attack') game.doAttack(true);
  else if (k === 'f' && g.phase === 'attack') act({ type: 'endAttack' });
  else if (k === 'e' && (g.phase === 'attack' || g.phase === 'fortify')) act({ type: 'endTurn' });
  else if (k === 'c') game.openCards();
});

// temporizador
setInterval(() => {
  if (!S || !S.game || !$('#screen-game').classList.contains('active')) return;
  const tm = $('#timer');
  const total = Number(S.room.settings.turnTime) || 0;
  if (!S.deadline || !total) { tm.style.visibility = 'hidden'; return; }
  tm.style.visibility = 'visible';
  const left = Math.max(0, (S.deadline - (Date.now() + serverOffset)) / 1000);
  const g = S.game;
  const span = g.phase === 'setup' && g.settings.setup === 'rapido' ? Math.max(60, total) : (g.phase === 'claim' || g.phase === 'setup') ? Math.max(15, Math.round(total / 4)) : total;
  $('#timer-fill').style.width = `${Math.min(100, (left / span) * 100)}%`;
  $('#timer-text').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  tm.classList.toggle('low', left < 10);
  if (left < 10 && left > 0 && game.isMyTurn() && Math.floor(left) !== game._lastTick) { game._lastTick = Math.floor(left); sfx.tick(); }
}, 250);

// ------------------------------------------------------------ fondo del menú
async function renderMenuBg() {
  try {
    const { map } = await getMap('clasico');
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `-40 -40 ${map.width + 80} ${map.height + 80}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    const all = map.territories.map((t) => t.path).join(' ');
    const tones = ['#2a3d56', '#2f4460', '#26384f', '#334a66', '#2c405a', '#30455f'];
    const regIdx = Object.fromEntries(map.regions.map((r, i) => [r.id, i]));
    svg.innerHTML = `<rect x="-40" y="-40" width="${map.width + 80}" height="${map.height + 80}" fill="#16233a"/>
      ${[30, 18, 8].map((w, i) => `<path d="${all}" fill="none" stroke="rgba(140,180,215,${0.05 + i * 0.03})" stroke-width="${w}" stroke-linejoin="round"/>`).join('')}
      ${map.territories.map((t) => `<path d="${t.path}" fill="${tones[regIdx[t.region] % tones.length]}" stroke="#16233a" stroke-width="1.2"/>`).join('')}`;
    $('#menu-bg').appendChild(svg);
  } catch { /* sin fondo */ }
}
renderMenuBg();

// ------------------------------------------------------------ arranque
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
const params = new URLSearchParams(location.search);
const startCode = params.get('sala');
if (startCode) {
  joinRoom(startCode);
} else {
  refreshRooms();
}
api('/api/maps').then((m) => (MAP_INDEX = m)).catch(() => {});
// mantiene despierto el servidor mientras hay una sala abierta
setInterval(() => { if (ROOM) fetch(`${API}/api/ping`).catch(() => {}); }, 4 * 60 * 1000);

// acceso para depuración desde la consola
window.DOMINIUM = { game };
