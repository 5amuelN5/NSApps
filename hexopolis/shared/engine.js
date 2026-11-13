/* HEXÓPOLIS — motor de reglas (compartido servidor/navegador) */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.Engine = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const RES_NAMES = { wood: 'Madera', brick: 'Ladrillo', sheep: 'Lana', wheat: 'Trigo', ore: 'Mineral', desert: 'Desierto' };
  const COST = {
    road: { wood: 1, brick: 1 },
    settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
    city: { wheat: 2, ore: 3 },
    dev: { sheep: 1, wheat: 1, ore: 1 },
  };
  const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  const DEV_NAMES = { knight: 'Caballero', vp: 'Punto de victoria', roadBuilding: 'Construcción de caminos', yop: 'Año de abundancia', monopoly: 'Monopolio' };
  const COLORS = ['#ff3b6b', '#2ec5ff', '#ffc21e', '#3dff8b', '#b57bff', '#f2efe6'];
  const WIN_VP = 10;
  const MAX_PLAYERS = 6;

  // ---------- reglas de la partida ----------
  const DEFAULT_RULES = {
    map: 'auto', vp: 10, hand: 7,
    robberKeeps: false, doubleSteal: false, friendlyRobber: false, peaceStart: false, doublesBonus: false,
    goldRain: false, fastStart: false, chaosNumbers: false,
  };
  // normas especiales (activables una a una)
  const SPECIAL_RULES = [
    { key: 'robberKeeps', icon: '🦹', name: 'El ladrón se queda el botín', desc: 'Cuando sale un 7, las cartas que descartan los demás no vuelven al banco: se las queda quien ha sacado el 7.' },
    { key: 'doubleSteal', icon: '🧤', name: 'Ladrón codicioso', desc: 'Al mover el ladrón robas 2 cartas en lugar de 1.' },
    { key: 'friendlyRobber', icon: '🕊️', name: 'Ladrón amable', desc: 'No se puede poner el ladrón junto a quien tenga 2 puntos o menos, ni robarle.' },
    { key: 'peaceStart', icon: '🌱', name: 'Comienzo en paz', desc: 'Durante las 2 primeras rondas no sale el 7: si sale, se vuelven a tirar los dados.' },
    { key: 'doublesBonus', icon: '🎯', name: 'Dobles dorados', desc: 'Si los dos dados sacan el mismo número, todas las casillas producen el doble.' },
    { key: 'goldRain', icon: '🌧️', name: 'Lluvia de oro', desc: 'Al sacar un 2 o un 12, todos los jugadores reciben 1 carta al azar del banco.' },
    { key: 'fastStart', icon: '🚀', name: 'Arranque rápido', desc: 'Recibes recursos de tus dos poblados iniciales, no solo del segundo.' },
    { key: 'chaosNumbers', icon: '🌀', name: 'Mapa caótico', desc: 'Los números del mapa se reparten sin restricciones: el 6 y el 8 pueden quedar juntos.' },
  ];
  const HAND_OPTS = [5, 7, 9, 12, 99];
  function normRules(r) {
    r = r && typeof r === 'object' ? r : {};
    const o = Object.assign({}, DEFAULT_RULES);
    if (['auto', 'normal', 'big'].includes(r.map)) o.map = r.map;
    if (r.vp != null && Number.isFinite(+r.vp)) o.vp = Math.max(5, Math.min(16, Math.round(+r.vp)));
    if (HAND_OPTS.includes(r.hand | 0)) o.hand = r.hand | 0;
    for (const x of SPECIAL_RULES) o[x.key] = !!r[x.key];
    return o;
  }
  function R(s) { return s.rules || DEFAULT_RULES; }
  // piezas por jugador: más puntos para ganar → más poblados, ciudades y caminos
  function piecesFor(vpTarget) {
    const d = Math.max(0, (vpTarget || 10) - 10);
    return { settlements: 5 + Math.ceil(d / 2), cities: 4 + Math.ceil(d / 2), roads: 15 + 2 * d };
  }
  function piecesOf(s) { return s.pieces || { settlements: 5, cities: 4, roads: 15 }; }
  function winVP(s) { return R(s).vp; }

  // ---------- utilidades ----------
  function rand(s) {
    let a = (s.rng = (s.rng + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(s, n) { return Math.floor(rand(s) * n); }
  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = randInt(s, i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  function emptyRes() { return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }; }
  function total(r) { if (!r) return 0; let t = 0; for (const k in r) t += r[k] || 0; return t; }
  function has(res, cost) { for (const k in cost) if ((res[k] || 0) < cost[k]) return false; return true; }
  function validResObj(o) {
    if (!o || typeof o !== 'object') return false;
    for (const k in o) { if (!RES.includes(k)) return false; const n = o[k]; if (!Number.isInteger(n) || n < 0 || n > 30) return false; }
    return true;
  }

  // ---------- tablero ----------
  const HEX_COORDS = [];
  for (let r = -2; r <= 2; r++) for (let q = -2; q <= 2; q++) if (Math.abs(q + r) <= 2) HEX_COORDS.push({ q, r });
  // mapa grande (5-6 jugadores): filas de 3-4-5-6-5-4-3 casillas
  const HEX_COORDS_BIG = [];
  for (let r = -3; r <= 3; r++) {
    const w = 6 - Math.abs(r), q0 = 0.5 - (w - 1) / 2 - r / 2;
    for (let q = q0; q < q0 + w; q++) HEX_COORDS_BIG.push({ q, r });
  }
  const MAPS = {
    normal: {
      coords: HEX_COORDS,
      tiles: { wood: 4, sheep: 4, wheat: 4, brick: 3, ore: 3, desert: 1 },
      nums: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
      ports: ['any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'wheat', 'ore'],
      bank: 19, deck: { knight: 14, vp: 5, roadBuilding: 2, yop: 2, monopoly: 2 },
    },
    big: {
      coords: HEX_COORDS_BIG,
      tiles: { wood: 6, sheep: 6, wheat: 6, brick: 5, ore: 5, desert: 2 },
      nums: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
      ports: ['any', 'any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'sheep', 'wheat', 'ore'],
      bank: 24, deck: { knight: 20, vp: 5, roadBuilding: 3, yop: 3, monopoly: 3 },
    },
  };
  function mapKind(rules, n) { return rules.map === 'big' || (rules.map === 'auto' && n > 4) ? 'big' : 'normal'; }

  function buildBoard(s, kind) {
    const M = MAPS[kind] || MAPS.normal;
    const chaos = R(s).chaosNumbers;
    const SQ3 = Math.sqrt(3);
    const hexes = M.coords.map((c, i) => ({ id: i, q: c.q, r: c.r, x: SQ3 * (c.q + c.r / 2), y: 1.5 * c.r, res: null, num: null, v: [], e: [], nb: [] }));
    // centrar el mapa en el origen
    const cx = hexes.reduce((a, h) => a + h.x, 0) / hexes.length, cy = hexes.reduce((a, h) => a + h.y, 0) / hexes.length;
    hexes.forEach((h) => { h.x = Math.round((h.x - cx) * 1e6) / 1e6; h.y = Math.round((h.y - cy) * 1e6) / 1e6; });
    const vertices = [], edges = [];
    const vmap = new Map(), emap = new Map();
    const vid = (x, y) => {
      const k = Math.round(x * 1000) + ',' + Math.round(y * 1000);
      if (!vmap.has(k)) { vmap.set(k, vertices.length); vertices.push({ id: vertices.length, x, y, hexes: [], adj: [], edges: [], b: null, port: null }); }
      return vmap.get(k);
    };
    for (const h of hexes) {
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 180) * (60 * i - 30);
        const id = vid(h.x + Math.cos(ang), h.y + Math.sin(ang));
        h.v.push(id); vertices[id].hexes.push(h.id);
      }
    }
    for (const h of hexes) {
      for (let i = 0; i < 6; i++) {
        const a = Math.min(h.v[i], h.v[(i + 1) % 6]), b = Math.max(h.v[i], h.v[(i + 1) % 6]);
        const k = a + '-' + b;
        if (!emap.has(k)) { emap.set(k, edges.length); edges.push({ id: edges.length, a, b, hexes: [], road: null }); }
        const eid = emap.get(k);
        edges[eid].hexes.push(h.id); h.e.push(eid);
      }
    }
    for (const e of edges) {
      vertices[e.a].adj.push(e.b); vertices[e.b].adj.push(e.a);
      vertices[e.a].edges.push(e.id); vertices[e.b].edges.push(e.id);
      if (e.hexes.length === 2) { hexes[e.hexes[0]].nb.push(e.hexes[1]); hexes[e.hexes[1]].nb.push(e.hexes[0]); }
    }

    // recursos
    const tiles = [];
    for (const k in M.tiles) for (let i = 0; i < M.tiles[k]; i++) tiles.push(k);
    shuffle(s, tiles);
    // evitar grupos de 3+ casillas iguales conectadas
    for (let tries = 0; tries < 600; tries++) {
      let bad = false;
      for (const h of hexes) {
        const same = h.nb.filter((n) => tiles[n] === tiles[h.id]).length;
        if (same >= 2 && tiles[h.id] !== 'desert') { bad = true; break; }
      }
      if (!bad) break;
      shuffle(s, tiles);
    }
    hexes.forEach((h, i) => (h.res = tiles[i]));

    // números
    const nums = M.nums.slice();
    const land = hexes.filter((h) => h.res !== 'desert');
    let ok = false;
    const maxTries = chaos ? 1 : kind === 'big' ? 20000 : 3000;
    for (let tries = 0; tries < maxTries && !ok; tries++) {
      shuffle(s, nums);
      land.forEach((h, i) => (h.num = nums[i]));
      ok = true;
      if (chaos) break;
      for (const h of land) {
        for (const n of h.nb) {
          const o = hexes[n];
          if (!o.num) continue;
          const red = (x) => x === 6 || x === 8;
          if (red(h.num) && red(o.num)) { ok = false; break; }
          if (tries < maxTries / 2 && h.num === o.num) { ok = false; break; }
        }
        if (!ok) break;
      }
    }
    const desert = hexes.find((h) => h.res === 'desert');

    // puertos
    const coast = edges.filter((e) => e.hexes.length === 1).map((e) => {
      const mx = (vertices[e.a].x + vertices[e.b].x) / 2, my = (vertices[e.a].y + vertices[e.b].y) / 2;
      return { e, ang: Math.atan2(my, mx), mx, my };
    }).sort((a, b) => a.ang - b.ang);
    const types = shuffle(s, M.ports.slice());
    const NP = types.length;
    let pat;
    if (kind === 'normal') {
      const pattern = [3, 3, 4, 3, 3, 4, 3, 3, 4];
      const rot = randInt(s, pattern.length);
      pat = pattern.slice(rot).concat(pattern.slice(0, rot));
    } else {
      // reparto uniforme a lo largo de la costa
      pat = [];
      for (let i = 0; i < NP; i++) pat.push(Math.floor(((i + 1) * coast.length) / NP) - Math.floor((i * coast.length) / NP));
    }
    let idx = randInt(s, coast.length);
    const ports = [];
    for (let i = 0; i < NP; i++) {
      const c = coast[idx % coast.length];
      const h = hexes[c.e.hexes[0]];
      const dx = c.mx - h.x, dy = c.my - h.y, d = Math.hypot(dx, dy);
      const type = types[i];
      ports.push({ edge: c.e.id, type, ratio: type === 'any' ? 3 : 2, x: c.mx + (dx / d) * 0.55, y: c.my + (dy / d) * 0.55, ax: vertices[c.e.a].x, ay: vertices[c.e.a].y, bx: vertices[c.e.b].x, by: vertices[c.e.b].y });
      vertices[c.e.a].port = type; vertices[c.e.b].port = type;
      idx += pat[i];
    }

    return { hexes, vertices, edges, ports, robber: desert.id };
  }

  // ---------- partida ----------
  function createGame(cfg, opts = {}) {
    const n = cfg.length;
    const rules = normRules(opts.rules);
    const kind = mapKind(rules, n);
    const M = MAPS[kind];
    const pc = piecesFor(rules.vp);
    const s = {
      rules, map: kind, pieces: pc,
      rng: (opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31)) | 0,
      seq: 0,
      players: cfg.map((c, i) => ({
        id: i, name: c.name, color: c.color || COLORS[i], bot: c.bot || 0,
        res: emptyRes(), dev: { knight: 0, vp: 0, roadBuilding: 0, yop: 0, monopoly: 0 }, devNew: { knight: 0, vp: 0, roadBuilding: 0, yop: 0, monopoly: 0 },
        knights: 0, roads: pc.roads, settlements: pc.settlements, cities: pc.cities, lr: false, la: false, roadLen: 0,
      })),
      bank: { wood: M.bank, brick: M.bank, sheep: M.bank, wheat: M.bank, ore: M.bank },
      devDeck: [],
      board: null,
      phase: 'setup',
      setup: null,
      first: 0,
      current: 0,
      turn: 0,
      rolled: false,
      devPlayed: false,
      dice: null,
      pendingDiscard: null,
      roadBuilding: 0,
      returnPhase: null,
      trade: null,
      tradeSeq: 0,
      longestRoad: { owner: null, len: 0 },
      largestArmy: { owner: null, size: 0 },
      winner: null,
      log: [],
      stats: { rolls: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    };
    s.board = buildBoard(s, kind);
    const deck = [];
    for (const k in M.deck) for (let i = 0; i < M.deck[k]; i++) deck.push(k);
    s.devDeck = shuffle(s, deck);
    s.first = randInt(s, n);
    const order = [];
    for (let i = 0; i < n; i++) order.push((s.first + i) % n);
    s.setup = { order: order.concat(order.slice().reverse()), idx: 0, step: 'settlement', last: null };
    s.current = s.setup.order[0];
    log(s, `Empieza ${s.players[s.current].name}. ¡Coloca tus primeros poblados!`);
    return s;
  }

  function log(s, msg) { s.log.push(msg); if (s.log.length > 80) s.log.shift(); }
  function nm(s, pid) { return s.players[pid].name; }

  // ---------- legalidad ----------
  function canSettle(s, pid, v, setup) {
    const V = s.board.vertices[v];
    if (!V || V.b) return false;
    for (const a of V.adj) if (s.board.vertices[a].b) return false;
    if (setup) return true;
    return V.edges.some((e) => s.board.edges[e].road === pid);
  }
  function canRoad(s, pid, eid, mustV) {
    const E = s.board.edges[eid];
    if (!E || E.road !== null) return false;
    if (mustV != null) return E.a === mustV || E.b === mustV;
    for (const x of [E.a, E.b]) {
      const V = s.board.vertices[x];
      if (V.b && V.b.owner === pid) return true;
      if (V.b && V.b.owner !== pid) continue;
      if (V.edges.some((o) => o !== eid && s.board.edges[o].road === pid)) return true;
    }
    return false;
  }
  function legalSettlements(s, pid, setup) {
    const out = [];
    for (const V of s.board.vertices) if (canSettle(s, pid, V.id, setup)) out.push(V.id);
    return out;
  }
  function legalRoads(s, pid, mustV) {
    const out = [];
    for (const E of s.board.edges) if (canRoad(s, pid, E.id, mustV)) out.push(E.id);
    return out;
  }
  function legalCities(s, pid) {
    return s.board.vertices.filter((V) => V.b && V.b.owner === pid && V.b.type === 'settlement').map((V) => V.id);
  }
  function tradeRatios(s, pid) {
    const r = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 };
    for (const V of s.board.vertices) {
      if (!V.b || V.b.owner !== pid || !V.port) continue;
      if (V.port === 'any') { for (const k of RES) r[k] = Math.min(r[k], 3); }
      else r[V.port] = 2;
    }
    return r;
  }
  function vp(s, pid, hidden) {
    const P = s.players[pid];
    const pc = piecesOf(s);
    let v = (pc.settlements - P.settlements) + 2 * (pc.cities - P.cities);
    if (s.longestRoad.owner === pid) v += 2;
    if (s.largestArmy.owner === pid) v += 2;
    if (hidden && P.dev) v += P.dev.vp;
    return v;
  }

  // ---------- caminos y ejército ----------
  function longestRoadFor(s, pid) {
    const Es = s.board.edges, Vs = s.board.vertices;
    let best = 0;
    const used = new Set();
    const blocked = (v) => Vs[v].b && Vs[v].b.owner !== pid;
    function dfs(v, len) {
      if (len > best) best = len;
      if (len > 0 && blocked(v)) return;
      for (const eid of Vs[v].edges) {
        const e = Es[eid];
        if (e.road !== pid || used.has(eid)) continue;
        used.add(eid);
        dfs(e.a === v ? e.b : e.a, len + 1);
        used.delete(eid);
      }
    }
    for (const e of Es) if (e.road === pid) { dfs(e.a, 0); dfs(e.b, 0); }
    return best;
  }
  function updateLongest(s, ev) {
    const lens = s.players.map((p) => longestRoadFor(s, p.id));
    s.players.forEach((p, i) => (p.roadLen = lens[i]));
    const cur = s.longestRoad.owner;
    let owner = null;
    const max = Math.max(...lens);
    if (cur != null && lens[cur] >= 5 && lens[cur] === max) owner = cur;
    else if (max >= 5) {
      const c = lens.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0);
      owner = c.length === 1 ? c[0] : null;
    }
    s.longestRoad = { owner, len: owner != null ? lens[owner] : 0 };
    s.players.forEach((p) => (p.lr = p.id === owner));
    if (owner !== cur) {
      ev.push({ type: 'longestRoad', pid: owner, prev: cur });
      if (owner != null) log(s, `🛣️ ${nm(s, owner)} consigue el CAMINO MÁS LARGO (${lens[owner]})`);
      else log(s, `🛣️ Nadie tiene ahora el camino más largo`);
    }
  }
  function updateArmy(s, pid, ev) {
    const P = s.players[pid];
    const LA = s.largestArmy;
    if (LA.owner === pid) { LA.size = P.knights; return; }
    if (P.knights >= 3 && P.knights > LA.size) {
      const prev = LA.owner;
      s.largestArmy = { owner: pid, size: P.knights };
      s.players.forEach((p) => (p.la = p.id === pid));
      ev.push({ type: 'largestArmy', pid, prev });
      log(s, `⚔️ ${nm(s, pid)} consigue el EJÉRCITO MÁS GRANDE (${P.knights})`);
    }
  }
  function checkWin(s, ev) {
    if (s.winner != null) return;
    const p = s.current;
    if (vp(s, p, true) >= winVP(s)) {
      s.winner = p; s.phase = 'gameOver'; s.trade = null;
      ev.push({ type: 'win', pid: p });
      log(s, `🏆 ¡${nm(s, p)} GANA LA PARTIDA con ${vp(s, p, true)} puntos!`);
    }
  }

  // ---------- producción ----------
  function produce(s, roll, ev, mult = 1) {
    const want = {}; RES.forEach((r) => (want[r] = {}));
    const gains = [];
    for (const h of s.board.hexes) {
      if (h.num !== roll || h.id === s.board.robber || h.res === 'desert') continue;
      for (const v of h.v) {
        const b = s.board.vertices[v].b;
        if (!b) continue;
        const n = (b.type === 'city' ? 2 : 1) * mult;
        want[h.res][b.owner] = (want[h.res][b.owner] || 0) + n;
        gains.push({ pid: b.owner, res: h.res, n, hex: h.id });
      }
    }
    const final = [];
    for (const r of RES) {
      const owners = Object.keys(want[r]).map(Number);
      if (!owners.length) continue;
      const tot = owners.reduce((a, o) => a + want[r][o], 0);
      if (tot <= s.bank[r]) {
        for (const o of owners) { s.players[o].res[r] += want[r][o]; s.bank[r] -= want[r][o]; }
        gains.filter((g) => g.res === r).forEach((g) => final.push(g));
      } else if (owners.length === 1) {
        const o = owners[0], give = s.bank[r];
        s.players[o].res[r] += give; s.bank[r] = 0;
        if (give > 0) final.push({ pid: o, res: r, n: give, hex: gains.find((g) => g.res === r).hex });
        log(s, `El banco se queda sin ${RES_NAMES[r]}`);
      } else {
        log(s, `¡No hay suficiente ${RES_NAMES[r]} en el banco! Nadie la recibe`);
      }
    }
    ev.push({ type: 'produce', gains: final, roll });
  }

  function pay(s, P, cost) { for (const k in cost) { P.res[k] -= cost[k]; s.bank[k] += cost[k]; } }

  function nextTurn(s, ev) {
    const P = s.players[s.current];
    for (const k in P.devNew) P.devNew[k] = 0;
    s.trade = null;
    s.current = (s.current + 1) % s.players.length;
    s.turn++;
    s.rolled = false; s.devPlayed = false; s.dice = null;
    s.phase = 'roll';
    ev.push({ type: 'turn', pid: s.current });
    checkWin(s, ev);
    checkStall(s, ev);
  }
  // salvaguarda: si en 12 rondas nadie suma puntos ni construye, gana quien más puntos tenga
  const STALL_ROUNDS = 12;
  function checkStall(s, ev) {
    if (s.winner != null) return;
    let sig = s.devDeck.length * 1000;
    const pc = piecesOf(s);
    s.players.forEach((p) => { sig += vp(s, p.id, true) * 7 + (pc.roads - p.roads) * 3 + (pc.settlements - p.settlements); });
    if (sig !== s.stallSig) { s.stallSig = sig; s.stallTurn = s.turn; return; }
    if (s.turn - s.stallTurn < STALL_ROUNDS * s.players.length) return;
    let best = 0;
    s.players.forEach((p) => { if (vp(s, p.id, true) > vp(s, best, true)) best = p.id; });
    s.winner = best; s.phase = 'gameOver'; s.trade = null; s.stalled = true;
    ev.push({ type: 'win', pid: best });
    log(s, `🔒 Nadie puede avanzar desde hace ${STALL_ROUNDS} rondas: gana ${nm(s, best)} con ${vp(s, best, true)} puntos`);
  }

  // ---------- acciones ----------
  function apply(s, pid, a) {
    const ev = [];
    if (!a || typeof a.type !== 'string') return { ok: false, error: 'Acción inválida' };
    let err;
    try { err = act(s, pid, a, ev); } catch (e) { return { ok: false, error: 'Error: ' + e.message }; }
    if (err) return { ok: false, error: err };
    s.seq++;
    return { ok: true, events: ev };
  }

  function act(s, pid, a, ev) {
    if (s.phase === 'gameOver') return 'La partida ha terminado';
    const P = s.players[pid];
    if (!P) return 'Jugador inválido';
    const isCur = s.current === pid;
    const B = s.board;

    switch (a.type) {
      case 'placeSettlement': {
        const V = B.vertices[a.v];
        if (!V) return 'Vértice inválido';
        if (s.phase === 'setup') {
          if (!isCur || s.setup.step !== 'settlement') return 'No es tu momento';
          if (!canSettle(s, pid, a.v, true)) return 'No puedes construir ahí';
          V.b = { owner: pid, type: 'settlement' }; P.settlements--;
          ev.push({ type: 'build', kind: 'settlement', pid, v: a.v });
          log(s, `🏠 ${P.name} coloca un poblado`);
          if (s.setup.idx >= s.players.length || R(s).fastStart) {
            const gains = [];
            for (const h of V.hexes) {
              const hx = B.hexes[h];
              if (hx.res === 'desert' || s.bank[hx.res] <= 0) continue;
              P.res[hx.res]++; s.bank[hx.res]--;
              gains.push({ pid, res: hx.res, n: 1, hex: h });
            }
            ev.push({ type: 'produce', gains, setup: true });
          }
          s.setup.step = 'road'; s.setup.last = a.v;
          updateLongest(s, ev);
          return;
        }
        if (s.phase !== 'main' || !isCur) return 'No puedes construir ahora';
        if (P.settlements <= 0) return 'No te quedan poblados';
        if (!has(P.res, COST.settlement)) return 'Recursos insuficientes';
        if (!canSettle(s, pid, a.v, false)) return 'No puedes construir ahí';
        pay(s, P, COST.settlement);
        V.b = { owner: pid, type: 'settlement' }; P.settlements--;
        ev.push({ type: 'build', kind: 'settlement', pid, v: a.v });
        log(s, `🏠 ${P.name} construye un poblado`);
        updateLongest(s, ev);
        checkWin(s, ev);
        return;
      }
      case 'placeRoad': {
        const Ed = B.edges[a.e];
        if (!Ed) return 'Arista inválida';
        if (s.phase === 'setup') {
          if (!isCur || s.setup.step !== 'road') return 'No es tu momento';
          if (!canRoad(s, pid, a.e, s.setup.last)) return 'El camino debe tocar tu poblado';
          Ed.road = pid; P.roads--;
          ev.push({ type: 'build', kind: 'road', pid, e: a.e });
          s.setup.idx++;
          if (s.setup.idx >= s.setup.order.length) {
            s.phase = 'roll'; s.current = s.first; s.turn = 1; s.setup.step = null;
            ev.push({ type: 'turn', pid: s.current });
            log(s, `¡Comienza la partida! Turno de ${nm(s, s.current)}`);
          } else {
            s.current = s.setup.order[s.setup.idx]; s.setup.step = 'settlement'; s.setup.last = null;
            ev.push({ type: 'setupNext', pid: s.current });
          }
          updateLongest(s, ev);
          return;
        }
        if (!isCur) return 'No es tu turno';
        if (s.phase === 'roadBuilding') {
          if (!canRoad(s, pid, a.e)) return 'No puedes construir ahí';
          Ed.road = pid; P.roads--; s.roadBuilding--;
          ev.push({ type: 'build', kind: 'road', pid, e: a.e, free: true });
          if (s.roadBuilding <= 0 || P.roads <= 0 || legalRoads(s, pid).length === 0) { s.phase = s.returnPhase; s.roadBuilding = 0; }
          updateLongest(s, ev);
          checkWin(s, ev);
          return;
        }
        if (s.phase !== 'main') return 'No puedes construir ahora';
        if (P.roads <= 0) return 'No te quedan caminos';
        if (!has(P.res, COST.road)) return 'Recursos insuficientes';
        if (!canRoad(s, pid, a.e)) return 'No puedes construir ahí';
        pay(s, P, COST.road);
        Ed.road = pid; P.roads--;
        ev.push({ type: 'build', kind: 'road', pid, e: a.e });
        updateLongest(s, ev);
        checkWin(s, ev);
        return;
      }
      case 'endRoadBuilding': {
        if (!isCur || s.phase !== 'roadBuilding') return 'No aplica';
        s.phase = s.returnPhase; s.roadBuilding = 0;
        return;
      }
      case 'placeCity': {
        if (s.phase !== 'main' || !isCur) return 'No puedes construir ahora';
        const V = B.vertices[a.v];
        if (!V || !V.b || V.b.owner !== pid || V.b.type !== 'settlement') return 'Necesitas un poblado tuyo';
        if (P.cities <= 0) return 'No te quedan ciudades';
        if (!has(P.res, COST.city)) return 'Recursos insuficientes';
        pay(s, P, COST.city);
        V.b.type = 'city'; P.cities--; P.settlements++;
        ev.push({ type: 'build', kind: 'city', pid, v: a.v });
        log(s, `🏙️ ${P.name} construye una ciudad`);
        checkWin(s, ev);
        return;
      }
      case 'roll': {
        if (!isCur || s.phase !== 'roll') return 'No puedes tirar ahora';
        const RU = R(s);
        let d1 = 1 + randInt(s, 6), d2 = 1 + randInt(s, 6);
        let rerolled = false;
        if (RU.peaceStart && s.turn <= s.players.length * 2) {
          while (d1 + d2 === 7) { d1 = 1 + randInt(s, 6); d2 = 1 + randInt(s, 6); rerolled = true; }
        }
        const sum = d1 + d2;
        s.dice = [d1, d2]; s.rolled = true; s.stats.rolls[sum]++;
        ev.push({ type: 'roll', pid, dice: [d1, d2], sum });
        if (rerolled) log(s, `🌱 Comienzo en paz: salió un 7 y se repite la tirada`);
        log(s, `🎲 ${P.name} saca ${sum}`);
        if (sum === 7) {
          const pend = {};
          s.players.forEach((p) => { const t = total(p.res); if (t > RU.hand) pend[p.id] = Math.floor(t / 2); });
          s.returnPhase = 'main';
          if (Object.keys(pend).length) { s.pendingDiscard = pend; s.phase = 'discard'; ev.push({ type: 'discardStart', pend }); }
          else s.phase = 'robber';
        } else {
          const dbl = RU.doublesBonus && d1 === d2;
          if (dbl) log(s, `🎯 ¡Dobles dorados! Todo produce el doble`);
          produce(s, sum, ev, dbl ? 2 : 1);
          if (RU.goldRain && (sum === 2 || sum === 12)) goldRain(s, ev);
          s.phase = 'main';
        }
        return;
      }
      case 'discard': {
        if (s.phase !== 'discard' || !s.pendingDiscard || !s.pendingDiscard[pid]) return 'No tienes que descartar';
        if (!validResObj(a.cards)) return 'Cartas inválidas';
        if (total(a.cards) !== s.pendingDiscard[pid]) return `Debes descartar ${s.pendingDiscard[pid]} cartas`;
        if (!has(P.res, a.cards)) return 'No tienes esas cartas';
        const to = s.current;
        if (R(s).robberKeeps && to !== pid) {
          const T = s.players[to];
          for (const k in a.cards) { P.res[k] -= a.cards[k]; T.res[k] += a.cards[k]; }
          log(s, `🦹 ${P.name} entrega ${total(a.cards)} cartas a ${T.name}`);
          ev.push({ type: 'discard', pid, n: total(a.cards), to });
        } else {
          pay(s, P, a.cards);
          log(s, `${P.name} descarta ${total(a.cards)} cartas`);
          ev.push({ type: 'discard', pid, n: total(a.cards) });
        }
        delete s.pendingDiscard[pid];
        if (!Object.keys(s.pendingDiscard).length) { s.pendingDiscard = null; s.phase = 'robber'; }
        return;
      }
      case 'moveRobber': {
        if (!isCur || s.phase !== 'robber') return 'No puedes mover el ladrón ahora';
        const H = B.hexes[a.hex];
        if (!H || H.id === B.robber) return 'Elige otra casilla';
        if (!robberHexOk(s, pid, H.id)) return 'Ladrón amable: no puedes molestar a quien tiene 2 puntos o menos';
        const victims = robberVictims(s, pid, H.id);
        let victim = null;
        if (victims.length) {
          victim = a.victim != null ? a.victim : victims.length === 1 ? victims[0] : null;
          if (!victims.includes(victim)) return 'Elige a quién robar';
        }
        const from = B.robber;
        B.robber = H.id;
        ev.push({ type: 'robber', pid, hex: H.id, from });
        if (victim != null) {
          const V = s.players[victim];
          const times = R(s).doubleSteal ? 2 : 1;
          let got = 0;
          for (let k = 0; k < times; k++) {
            const pool = [];
            RES.forEach((r) => { for (let i = 0; i < V.res[r]; i++) pool.push(r); });
            if (!pool.length) break;
            const r = pool[randInt(s, pool.length)];
            V.res[r]--; P.res[r]++; got++;
            ev.push({ type: 'steal', pid, from: victim, res: r, private: [pid, victim] });
          }
          log(s, `🦹 ${P.name} roba ${got === 1 ? 'una carta' : got + ' cartas'} a ${V.name}`);
        } else log(s, `🦹 ${P.name} mueve el ladrón`);
        s.phase = s.returnPhase || 'main';
        return;
      }
      case 'buyDev': {
        if (!isCur || s.phase !== 'main') return 'No puedes comprar ahora';
        if (!s.devDeck.length) return 'No quedan cartas de desarrollo';
        if (!has(P.res, COST.dev)) return 'Recursos insuficientes';
        pay(s, P, COST.dev);
        const c = s.devDeck.pop();
        P.dev[c]++; P.devNew[c]++;
        ev.push({ type: 'buyDev', pid, card: c, private: [pid] });
        log(s, `🃏 ${P.name} compra una carta de desarrollo`);
        checkWin(s, ev);
        return;
      }
      case 'playDev': {
        const c = a.card;
        if (!isCur || (s.phase !== 'roll' && s.phase !== 'main')) return 'No puedes jugar cartas ahora';
        if (!['knight', 'roadBuilding', 'yop', 'monopoly'].includes(c)) return 'Carta inválida';
        if (s.devPlayed) return 'Solo una carta de desarrollo por turno';
        if (P.dev[c] - P.devNew[c] <= 0) return 'No tienes esa carta disponible';
        const useNew = () => { if (P.devNew[c] > P.dev[c] - 1) P.devNew[c] = Math.max(0, P.dev[c] - 1); };
        if (c === 'knight') {
          useNew(); P.dev.knight--; P.knights++; s.devPlayed = true;
          s.returnPhase = s.phase; s.phase = 'robber';
          ev.push({ type: 'playDev', pid, card: c });
          log(s, `⚔️ ${P.name} juega un Caballero`);
          updateArmy(s, pid, ev);
          checkWin(s, ev);
          return;
        }
        if (c === 'roadBuilding') {
          if (P.roads <= 0 || !legalRoads(s, pid).length) return 'No puedes construir caminos';
          useNew(); P.dev.roadBuilding--; s.devPlayed = true;
          s.returnPhase = s.phase; s.phase = 'roadBuilding'; s.roadBuilding = Math.min(2, P.roads);
          ev.push({ type: 'playDev', pid, card: c });
          log(s, `🛠️ ${P.name} juega Construcción de caminos`);
          return;
        }
        if (c === 'yop') {
          const rs = a.res;
          if (!Array.isArray(rs) || rs.length !== 2 || !rs.every((r) => RES.includes(r))) return 'Elige dos recursos';
          const need = {}; rs.forEach((r) => (need[r] = (need[r] || 0) + 1));
          if (!has(s.bank, need)) return 'El banco no tiene esos recursos';
          useNew(); P.dev.yop--; s.devPlayed = true;
          for (const r of rs) { P.res[r]++; s.bank[r]--; }
          ev.push({ type: 'playDev', pid, card: c, res: rs });
          ev.push({ type: 'gain', pid, res: rs });
          log(s, `🌾 ${P.name} juega Año de abundancia (${rs.map((r) => RES_NAMES[r]).join(' + ')})`);
          return;
        }
        if (c === 'monopoly') {
          const r = a.res;
          if (!RES.includes(r)) return 'Elige un recurso';
          useNew(); P.dev.monopoly--; s.devPlayed = true;
          let got = 0;
          const takes = [];
          s.players.forEach((o) => { if (o.id !== pid && o.res[r] > 0) { got += o.res[r]; takes.push({ from: o.id, n: o.res[r] }); P.res[r] += o.res[r]; o.res[r] = 0; } });
          ev.push({ type: 'playDev', pid, card: c, res: r });
          ev.push({ type: 'monopoly', pid, res: r, takes, got });
          log(s, `💰 ${P.name} juega Monopolio de ${RES_NAMES[r]} y se lleva ${got}`);
          return;
        }
        return 'Carta inválida';
      }
      case 'bankTrade': {
        if (!isCur || s.phase !== 'main') return 'No puedes comerciar ahora';
        const { give, get } = a;
        const n = Math.max(1, Math.min(10, a.n | 0 || 1));
        if (!RES.includes(give) || !RES.includes(get) || give === get) return 'Intercambio inválido';
        const ratio = tradeRatios(s, pid)[give];
        if (P.res[give] < ratio * n) return `Necesitas ${ratio * n} de ${RES_NAMES[give]}`;
        if (s.bank[get] < n) return 'El banco no tiene ese recurso';
        P.res[give] -= ratio * n; s.bank[give] += ratio * n;
        P.res[get] += n; s.bank[get] -= n;
        ev.push({ type: 'bankTrade', pid, give, get, ratio, n });
        log(s, `🏦 ${P.name} cambia ${ratio * n} ${RES_NAMES[give]} por ${n} ${RES_NAMES[get]}`);
        return;
      }
      case 'offerTrade': {
        if (!isCur || s.phase !== 'main') return 'No puedes comerciar ahora';
        if (s.trade) return 'Ya hay una oferta en curso';
        if (!validResObj(a.give) || !validResObj(a.get)) return 'Oferta inválida';
        const give = clean(a.give), get = clean(a.get);
        if (!total(give) || !total(get)) return 'La oferta debe tener cartas en ambos lados';
        if (RES.some((r) => give[r] && get[r])) return 'No puedes dar y pedir el mismo recurso';
        if (!has(P.res, give)) return 'No tienes esas cartas';
        const responses = {};
        // quien no tiene las cartas pedidas rechaza automáticamente
        s.players.forEach((o) => { if (o.id !== pid) responses[o.id] = has(o.res, get) ? null : 'reject'; });
        s.trade = { id: ++s.tradeSeq, from: pid, give, get, responses };
        ev.push({ type: 'offer', pid });
        log(s, `🤝 ${P.name} ofrece ${fmtRes(give)} por ${fmtRes(get)}`);
        return;
      }
      case 'respondTrade': {
        const T = s.trade;
        if (!T || T.from === pid || !(pid in T.responses)) return 'No hay oferta para ti';
        if (a.id != null && a.id !== T.id) return 'Esa oferta ya no existe';
        if (a.accept && !has(P.res, T.get)) return 'No tienes esas cartas';
        T.responses[pid] = a.accept ? 'accept' : 'reject';
        ev.push({ type: 'tradeResponse', pid, accept: !!a.accept });
        return;
      }
      case 'confirmTrade': {
        const T = s.trade;
        if (!T || T.from !== pid) return 'No hay oferta';
        const w = a.with;
        if (T.responses[w] !== 'accept') return 'Ese jugador no aceptó';
        const O = s.players[w];
        if (!has(P.res, T.give)) return 'Ya no tienes esas cartas';
        if (!has(O.res, T.get)) { T.responses[w] = 'reject'; return `${O.name} ya no tiene esas cartas`; }
        for (const r in T.give) { P.res[r] -= T.give[r]; O.res[r] += T.give[r]; }
        for (const r in T.get) { O.res[r] -= T.get[r]; P.res[r] += T.get[r]; }
        ev.push({ type: 'trade', pid, with: w, give: T.give, get: T.get });
        log(s, `🤝 ${P.name} comercia con ${O.name}`);
        s.trade = null;
        return;
      }
      case 'cancelTrade': {
        if (!s.trade || s.trade.from !== pid) return 'No hay oferta';
        s.trade = null;
        ev.push({ type: 'tradeCancel', pid });
        return;
      }
      case 'endTurn': {
        if (!isCur || s.phase !== 'main') return 'No puedes terminar el turno ahora';
        nextTurn(s, ev);
        if (s.phase !== 'gameOver') log(s, `— Turno de ${nm(s, s.current)} —`);
        return;
      }
    }
    return 'Acción desconocida';
  }

  function clean(o) { const r = {}; for (const k of RES) if (o[k]) r[k] = o[k]; return r; }
  function fmtRes(o) { return RES.filter((r) => o[r]).map((r) => `${o[r]} ${RES_NAMES[r]}`).join(', '); }

  // ladrón amable: protegido quien tenga 2 puntos visibles o menos
  function protectedPlayer(s, o) { return !!R(s).friendlyRobber && vp(s, o, false) <= 2; }
  function hexTouchesProtected(s, pid, hex) {
    return s.board.hexes[hex].v.some((v) => { const b = s.board.vertices[v].b; return b && b.owner !== pid && protectedPlayer(s, b.owner); });
  }
  function robberHexOk(s, pid, hex) {
    if (hex === s.board.robber || !s.board.hexes[hex]) return false;
    if (!R(s).friendlyRobber || !hexTouchesProtected(s, pid, hex)) return true;
    // si no queda ninguna casilla libre de protegidos, se permite cualquiera
    return !s.board.hexes.some((h) => h.id !== s.board.robber && !hexTouchesProtected(s, pid, h.id));
  }
  function goldRain(s, ev) {
    const got = [];
    s.players.forEach((p) => {
      const pool = RES.filter((r) => s.bank[r] > 0);
      if (!pool.length) return;
      const r = pool[randInt(s, pool.length)];
      p.res[r]++; s.bank[r]--;
      got.push({ pid: p.id, res: r, n: 1, hex: null });
    });
    if (got.length) { ev.push({ type: 'produce', gains: got, rain: true }); log(s, `🌧️ ¡Lluvia de oro! Todos reciben una carta`); }
  }
  function robberVictims(s, pid, hex) {
    const out = new Set();
    for (const v of s.board.hexes[hex].v) {
      const b = s.board.vertices[v].b;
      if (b && b.owner !== pid && !protectedPlayer(s, b.owner)) {
        const P = s.players[b.owner];
        const cnt = P.res ? total(P.res) : P.resCount;
        if (cnt > 0) out.add(b.owner);
      }
    }
    return [...out];
  }

  // ---------- vistas ----------
  function viewFor(s, pid) {
    const v = JSON.parse(JSON.stringify(s));
    delete v.rng;
    v.devDeck = s.devDeck.length;
    v.me = pid;
    v.players.forEach((p, i) => {
      p.resCount = total(s.players[i].res);
      p.devCount = total(s.players[i].dev);
      p.vp = vp(s, i, i === pid || s.phase === 'gameOver');
      if (i !== pid && s.phase !== 'gameOver') { p.res = null; p.dev = null; p.devNew = null; }
    });
    return v;
  }
  function filterEvents(events, pid) {
    return events.map((e) => {
      if (!e.private || e.private.includes(pid)) return e;
      const c = Object.assign({}, e);
      delete c.res; delete c.card;
      return c;
    });
  }

  return {
    RES, RES_NAMES, COST, PIPS, DEV_NAMES, COLORS, WIN_VP, MAX_PLAYERS, DEFAULT_RULES, SPECIAL_RULES, HAND_OPTS,
    normRules, winVP, rulesOf: R, piecesFor, piecesOf, robberHexOk, mapKind,
    createGame, apply, viewFor, filterEvents,
    canSettle, canRoad, legalSettlements, legalRoads, legalCities, tradeRatios, robberVictims,
    vp, total, has, emptyRes, longestRoadFor, fmtRes,
  };
});
