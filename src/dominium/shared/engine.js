// DOMINIUM — motor de reglas (compartido entre servidor y cliente)
// Implementa las reglas clásicas del juego de conquista por turnos:
// reparto de territorios, colocación inicial, refuerzos (territorios/3, mínimo 3,
// bonus de región), canje de cartas (progresivo o fijo, +2 en territorio propio),
// ataque con dados (3 vs 2, empates para el defensor), movimiento tras conquista,
// eliminación con traspaso de cartas y canje obligatorio, fortificación, carta por
// conquista, misiones secretas y jugador neutral en partidas de 2.

export const CARD_KINDS = ['Infantería', 'Caballería', 'Artillería', 'Comodín'];
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;

export const PLAYER_COLORS = [
  { id: 'rojo', name: 'Rojo', hex: '#e2564d' },
  { id: 'azul', name: 'Azul', hex: '#3f8cf0' },
  { id: 'verde', name: 'Verde', hex: '#3fae78' },
  { id: 'amarillo', name: 'Amarillo', hex: '#e9bd2f' },
  { id: 'morado', name: 'Morado', hex: '#9a6cea' },
  { id: 'naranja', name: 'Naranja', hex: '#ee8a3a' },
  { id: 'cian', name: 'Turquesa', hex: '#2bb8bd' },
  { id: 'rosa', name: 'Rosa', hex: '#e2609f' },
];
export const NEUTRAL_COLOR = '#7d8899';

export const BOT_LEVELS = [
  { id: 'recluta', name: 'Recluta', desc: 'Fácil' },
  { id: 'soldado', name: 'Soldado', desc: 'Normal' },
  { id: 'general', name: 'General', desc: 'Difícil' },
  { id: 'mariscal', name: 'Mariscal', desc: 'Experto' },
];

export const DEFAULT_SETTINGS = {
  setup: 'rapido',        // 'rapido' (reparto aleatorio + colocación simultánea) | 'clasico' (elegir territorios por turnos)
  cards: 'progresivo',    // 'progresivo' (4,6,8,10,12,15,+5) | 'fijo' (4/6/8/10)
  fortify: 'conectado',   // 'conectado' (camino propio) | 'adyacente'
  objective: 'dominacion',// 'dominacion' | 'misiones'
  turnTime: 120,          // segundos por turno (0 = sin límite) — lo gestiona el servidor
  botSpeed: 'normal',     // 'lenta' | 'normal' | 'rapida'
};

// ---------------------------------------------------------------- grafo
export function buildGraph(map) {
  const ids = map.territories.map((t) => t.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const sets = ids.map(() => new Set());
  map.territories.forEach((t, i) => {
    for (const a of t.adj || []) {
      const j = index.get(a);
      if (j === undefined || j === i) continue;
      sets[i].add(j); sets[j].add(i);
    }
  });
  for (const l of map.links || []) {
    const i = index.get(l.a), j = index.get(l.b);
    if (i === undefined || j === undefined || i === j) continue;
    sets[i].add(j); sets[j].add(i);
  }
  const regions = map.regions.map((r) => ({ id: r.id, name: r.name, bonus: r.bonus, color: r.color, members: [] }));
  const rIndex = new Map(regions.map((r, i) => [r.id, i]));
  const regionOf = map.territories.map((t, i) => {
    const ri = rIndex.get(t.region);
    if (ri === undefined) throw new Error(`Territorio ${t.id} sin región válida`);
    regions[ri].members.push(i);
    return ri;
  });
  return {
    id: map.id, name: map.name, n: ids.length, ids, index,
    names: map.territories.map((t) => t.name),
    adj: sets.map((s) => [...s].sort((a, b) => a - b)),
    regions, regionOf,
  };
}

// ---------------------------------------------------------------- utilidades
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const rollDie = (rng) => 1 + Math.floor(rng() * 6);

export function tradeValue(tradeCount, mode, cards) {
  if (mode === 'fijo') return fixedSetValue(cards);
  const seq = [4, 6, 8, 10, 12, 15];
  return tradeCount < seq.length ? seq[tradeCount] : 15 + 5 * (tradeCount - 5);
}

export function isValidSet(cards) {
  if (!cards || cards.length !== 3) return false;
  const wild = cards.filter((c) => c.k === 3).length;
  if (wild > 0) return true;
  const kinds = new Set(cards.map((c) => c.k));
  return kinds.size === 1 || kinds.size === 3;
}

export function fixedSetValue(cards) {
  const vals = [4, 6, 8];
  const non = cards.filter((c) => c.k !== 3).map((c) => c.k);
  if (non.length === 3) return new Set(non).size === 1 ? vals[non[0]] : 10;
  if (non.length === 2) return non[0] === non[1] ? vals[non[0]] : 10;
  return 10;
}

// Devuelve todas las combinaciones válidas de 3 cartas (índices) de una mano
export function validSets(hand) {
  const out = [];
  for (let a = 0; a < hand.length; a++)
    for (let b = a + 1; b < hand.length; b++)
      for (let c = b + 1; c < hand.length; c++)
        if (isValidSet([hand[a], hand[b], hand[c]])) out.push([a, b, c]);
  return out;
}

// Mejor combinación según el valor (y que ahorre comodines y dé bonus de territorio)
export function bestSet(hand, mode, owners, p) {
  let best = null, bestScore = -Infinity;
  for (const s of validSets(hand)) {
    const cards = s.map((i) => hand[i]);
    let score = mode === 'fijo' ? fixedSetValue(cards) : 0;
    score -= cards.filter((c) => c.k === 3).length * 3;
    if (owners && cards.some((c) => c.t >= 0 && owners[c.t] === p)) score += 2;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

export function initialArmies(numPlayers, territories, hasNeutral) {
  const base = hasNeutral ? 40 : ({ 2: 40, 3: 35, 4: 30, 5: 25, 6: 20, 7: 18, 8: 16 }[numPlayers] || 16);
  const perPlayer = Math.ceil(territories / numPlayers);
  return Math.max(Math.round((base * territories) / 42), perPlayer + 3);
}

// ---------------------------------------------------------------- consultas puras
export function territoriesOf(state, p) {
  const out = [];
  for (let i = 0; i < state.owners.length; i++) if (state.owners[i] === p) out.push(i);
  return out;
}

export function regionsHeld(graph, state, p) {
  return graph.regions
    .map((r, i) => (r.members.every((t) => state.owners[t] === p) ? i : -1))
    .filter((i) => i >= 0);
}

export function reinforcementBreakdown(graph, state, p) {
  const count = territoriesOf(state, p).length;
  const base = Math.max(3, Math.floor(count / 3));
  const held = regionsHeld(graph, state, p);
  const bonus = held.reduce((s, ri) => s + graph.regions[ri].bonus, 0);
  return { territories: count, base, regions: held, bonus, total: base + bonus };
}

export function reachable(graph, state, from) {
  const p = state.owners[from];
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const t = q.shift();
    for (const n of graph.adj[t]) if (!seen.has(n) && state.owners[n] === p) { seen.add(n); q.push(n); }
  }
  seen.delete(from);
  return seen;
}

export function canFortify(graph, state, from, to) {
  if (state.owners[from] !== state.owners[to] || from === to) return false;
  if (state.settings.fortify === 'adyacente') return graph.adj[from].includes(to);
  return reachable(graph, state, from).has(to);
}

export function missionText(graph, state, m, p) {
  if (!m) return '';
  if (m.type === 'regions') {
    const names = m.regions.map((r) => graph.regions[r].name);
    const list = names.length > 2 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names.join(' y ');
    return `Conquista ${list}${m.plusOne ? ' y una región más a tu elección' : ''}.`;
  }
  if (m.type === 'territories') return m.minArmies > 1
    ? `Ocupa ${m.count} territorios con al menos ${m.minArmies} ejércitos en cada uno.`
    : `Conquista ${m.count} territorios.`;
  if (m.type === 'destroy') {
    const t = state.players[m.target];
    return `Destruye por completo a ${t ? t.name : 'tu objetivo'}. (Si otro lo elimina, deberás conquistar ${m.fallback} territorios.)`;
  }
  return '';
}

export function missionComplete(graph, state, p) {
  const m = state.players[p].mission;
  if (!m) return false;
  const own = territoriesOf(state, p);
  if (m.type === 'territories') {
    return own.filter((t) => state.armies[t] >= m.minArmies).length >= m.count;
  }
  if (m.type === 'regions') {
    const held = regionsHeld(graph, state, p);
    if (!m.regions.every((r) => held.includes(r))) return false;
    if (m.plusOne) return held.length >= m.regions.length + 1;
    return true;
  }
  if (m.type === 'destroy') {
    return !state.players[m.target].alive && state.players[m.target].killedBy === p;
  }
  return false;
}

// ---------------------------------------------------------------- probabilidades de batalla
const ODDS = {
  '3,2': [[2, 0, 2890 / 7776], [1, 1, 2611 / 7776], [0, 2, 2275 / 7776]],
  '3,1': [[1, 0, 855 / 1296], [0, 1, 441 / 1296]],
  '2,2': [[2, 0, 295 / 1296], [1, 1, 420 / 1296], [0, 2, 581 / 1296]],
  '2,1': [[1, 0, 125 / 216], [0, 1, 91 / 216]],
  '1,2': [[1, 0, 55 / 216], [0, 1, 161 / 216]],
  '1,1': [[1, 0, 15 / 36], [0, 1, 21 / 36]],
};
// [kills on defender, attacker losses, prob]
const winMemo = new Map();
// Probabilidad de que un ataque con `a` ejércitos atacantes (sin contar el que se queda)
// conquiste un territorio defendido por `d` ejércitos atacando hasta el final.
export function winProbability(a, d) {
  if (d <= 0) return 1;
  if (a <= 0) return 0;
  if (a > 60 || d > 60) {
    const s = Math.max(a, d) / 60;
    return winProbability(Math.round(a / s), Math.max(1, Math.round(d / s)));
  }
  const key = a * 100 + d;
  if (winMemo.has(key)) return winMemo.get(key);
  const ad = Math.min(3, a), dd = Math.min(2, d);
  let p = 0;
  for (const [dk, al, pr] of ODDS[`${ad},${dd}`]) p += pr * winProbability(a - al, d - dk);
  winMemo.set(key, p);
  return p;
}

// ---------------------------------------------------------------- misiones
const CLASSIC_MISSIONS = [
  ['as', 'sa'], ['as', 'af'], ['na', 'af'], ['na', 'oc'], ['eu', 'sa', '+'], ['eu', 'oc', '+'],
];
function buildMissionPool(graph, state, rng) {
  const T = graph.n;
  const pool = [];
  const big = Math.round((24 * T) / 42);
  const medium = Math.round((18 * T) / 42);
  pool.push({ type: 'territories', count: big, minArmies: 1 });
  pool.push({ type: 'territories', count: medium, minArmies: 2 });
  if (graph.id === 'clasico') {
    for (const m of CLASSIC_MISSIONS) {
      const regs = m.filter((x) => x !== '+').map((id) => graph.regions.findIndex((r) => r.id === id));
      if (regs.every((r) => r >= 0)) pool.push({ type: 'regions', regions: regs, plusOne: m.includes('+') });
    }
  } else {
    const R = graph.regions.length;
    const combos = [];
    for (let a = 0; a < R; a++) for (let b = a + 1; b < R; b++) {
      const n = graph.regions[a].members.length + graph.regions[b].members.length;
      combos.push({ regs: [a, b], frac: n / T });
    }
    let good = combos.filter((c) => c.frac >= 0.3 && c.frac <= 0.5);
    if (good.length < 4) {
      // regiones pequeñas: añade "+ una región más"
      good = combos.filter((c) => c.frac >= 0.18 && c.frac <= 0.45).map((c) => ({ ...c, plus: true }));
    }
    if (good.length < 4) {
      // muchas regiones pequeñas (p. ej. Mundo Completo): combinaciones de 3 a 6 regiones
      const seen = new Set();
      for (let tries = 0; tries < 400 && good.length < 8; tries++) {
        const size = 3 + Math.floor(rng() * 4);
        const regs = shuffle([...Array(R).keys()], rng).slice(0, size).sort((a, b) => a - b);
        const key = regs.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const frac = regs.reduce((t, r) => t + graph.regions[r].members.length, 0) / T;
        if (frac >= 0.25 && frac <= 0.42) good.push({ regs, frac, plus: false, many: true });
      }
    }
    shuffle(good, rng).slice(0, 6).forEach((c) => pool.push({ type: 'regions', regions: c.regs, plusOne: !c.many && (!!c.plus || c.frac < 0.3) }));
  }
  return { pool, big };
}

function dealMissions(graph, state, rng) {
  const { pool, big } = buildMissionPool(graph, state, rng);
  const active = state.players.map((pl, i) => i).filter((i) => !state.players[i].neutral);
  const usedTargets = new Set();
  const generic = shuffle(pool.slice(), rng);
  for (const p of active) {
    let mission = null;
    const others = active.filter((q) => q !== p && !usedTargets.has(q));
    if (active.length >= 3 && others.length && rng() < 0.35) {
      const target = others[Math.floor(rng() * others.length)];
      usedTargets.add(target);
      mission = { type: 'destroy', target, fallback: big };
    } else {
      mission = generic.length ? generic.shift() : { type: 'territories', count: big, minArmies: 1 };
    }
    state.players[p].mission = mission;
  }
}

// ---------------------------------------------------------------- partida
export class Game {
  constructor(graph, state, rng = Math.random) {
    this.graph = graph;
    this.state = state;
    this.rng = rng;
  }

  // players: [{name, color, bot}] ; bot = null | nivel
  static create(graph, players, settings = {}, rng = Math.random) {
    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('Número de jugadores no válido');
    const s = { ...DEFAULT_SETTINGS, ...settings };
    const plist = players.map((p, i) => ({
      name: p.name, color: p.color || PLAYER_COLORS[i % PLAYER_COLORS.length].hex, bot: p.bot || null,
      slot: p.slot ?? i, alive: true, neutral: false, cards: [], mission: null, killedBy: null,
      stats: { conquered: 0, lost: 0, kills: 0, trades: 0, battlesWon: 0, battlesLost: 0 },
    }));
    if (plist.length === 2) {
      plist.push({ name: 'Neutral', color: NEUTRAL_COLOR, bot: null, slot: -1, alive: true, neutral: true, cards: [], mission: null, killedBy: null,
        stats: { conquered: 0, lost: 0, kills: 0, trades: 0, battlesWon: 0, battlesLost: 0 } });
    }
    const n = graph.n;
    const deck = [];
    for (let t = 0; t < n; t++) deck.push({ t, k: t % 3 });
    deck.push({ t: -1, k: 3 }, { t: -1, k: 3 });
    shuffle(deck, rng);
    const hasNeutral = plist.some((p) => p.neutral);
    const init = initialArmies(plist.length, n, hasNeutral);
    const actives = plist.map((_, i) => i).filter((i) => !plist[i].neutral);
    const first = actives[Math.floor(rng() * actives.length)];
    const state = {
      v: 1, map: graph.id, settings: s, players: plist,
      owners: new Array(n).fill(-1), armies: new Array(n).fill(0),
      phase: 'claim', current: first, first, turn: 0, round: 0,
      pool: plist.map(() => init), initial: init,
      reinforcements: 0, conquered: false, pending: null, fortified: false,
      deck, discard: [], tradeCount: 0,
      log: [], events: [], seq: 0, winner: null, winReason: null, history: [],
      startedAt: Date.now(), turnStartedAt: Date.now(),
    };
    const g = new Game(graph, state, rng);
    if (s.objective === 'misiones') dealMissions(graph, state, rng);

    const order = g.turnOrderFrom(first, true);
    if (s.setup === 'rapido') {
      const terr = shuffle([...Array(n).keys()], rng);
      terr.forEach((t, i) => {
        const p = order[i % order.length];
        state.owners[t] = p; state.armies[t] = 1; state.pool[p]--;
      });
      g.placeNeutral();
      state.phase = 'setup';
      g.log(null, 'Territorios repartidos al azar. ¡Despliega tus ejércitos!');
    } else {
      if (hasNeutral) {
        // el neutral recibe un tercio de los territorios al azar
        const neutralIdx = plist.findIndex((p) => p.neutral);
        const terr = shuffle([...Array(n).keys()], rng).slice(0, Math.floor(n / 3));
        for (const t of terr) { state.owners[t] = neutralIdx; state.armies[t] = 1; state.pool[neutralIdx]--; }
      }
      state.phase = 'claim';
      g.log(null, 'Fase de reclamación: elegid territorios por turnos.');
    }
    g.pushEvent({ type: 'start' });
    return g;
  }

  // -------------------------------------------------------------- helpers
  get s() { return this.state; }
  log(p, text) {
    this.state.log.push({ p, text, turn: this.state.turn });
    if (this.state.log.length > 120) this.state.log.splice(0, this.state.log.length - 120);
  }
  pushEvent(ev) {
    this.state.seq++;
    ev.seq = this.state.seq;
    this.state.events.push(ev);
    if (this.state.events.length > 30) this.state.events.splice(0, this.state.events.length - 30);
  }
  name(p) { return this.state.players[p]?.name ?? '?'; }
  tname(t) { return this.graph.names[t]; }

  turnOrderFrom(start, includeNeutral = false) {
    const P = this.state.players.length;
    const out = [];
    for (let k = 0; k < P; k++) {
      const p = (start + k) % P;
      const pl = this.state.players[p];
      if (!pl.alive) continue;
      if (pl.neutral && !includeNeutral) continue;
      out.push(p);
    }
    return out;
  }

  nextActive(from) {
    const P = this.state.players.length;
    for (let k = 1; k <= P; k++) {
      const p = (from + k) % P;
      const pl = this.state.players[p];
      if (pl.alive && !pl.neutral) return p;
    }
    return from;
  }

  placeNeutral() {
    const s = this.state;
    const ni = s.players.findIndex((p) => p.neutral);
    if (ni < 0) return;
    const own = territoriesOf(s, ni);
    while (s.pool[ni] > 0 && own.length) {
      const t = own[Math.floor(this.rng() * own.length)];
      s.armies[t]++; s.pool[ni]--;
    }
    s.pool[ni] = 0;
  }

  activePlayers() { return this.state.players.map((_, i) => i).filter((i) => this.state.players[i].alive && !this.state.players[i].neutral); }

  // ¿quién debe actuar ahora? (lista de jugadores)
  actors() {
    const s = this.state;
    if (s.phase === 'over') return [];
    if (s.phase === 'setup' && s.settings.setup === 'rapido') {
      return s.players.map((_, i) => i).filter((i) => !s.players[i].neutral && s.pool[i] > 0);
    }
    return [s.current];
  }

  // -------------------------------------------------------------- acciones
  apply(p, action) {
    try {
      const r = this._apply(p, action || {});
      return r || { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  _apply(p, a) {
    const s = this.state;
    if (s.phase === 'over') throw new Error('La partida ha terminado');
    if (!this.actors().includes(p)) throw new Error('No es tu turno');
    switch (a.type) {
      case 'claim': return this.claim(p, a.t);
      case 'setup': return this.setupPlace(p, a.t, a.n ?? 1);
      case 'trade': return this.trade(p, a.cards);
      case 'place': return this.place(p, a.t, a.n ?? 1);
      case 'toAttack': return this.toAttack(p);
      case 'attack': return this.attack(p, a.from, a.to, a.dice, !!a.blitz);
      case 'move': return this.moveIn(p, a.n);
      case 'endAttack': return this.endAttack(p);
      case 'fortify': return this.fortify(p, a.from, a.to, a.n);
      case 'endTurn': return this.endTurn(p);
      default: throw new Error('Acción desconocida');
    }
  }

  checkT(t) {
    if (!Number.isInteger(t) || t < 0 || t >= this.graph.n) throw new Error('Territorio no válido');
  }

  claim(p, t) {
    const s = this.state;
    if (s.phase !== 'claim') throw new Error('No estás en la fase de reclamación');
    this.checkT(t);
    if (s.owners[t] !== -1) throw new Error('Ese territorio ya tiene dueño');
    s.owners[t] = p; s.armies[t] = 1; s.pool[p]--;
    this.pushEvent({ type: 'claim', p, t });
    if (s.owners.every((o) => o >= 0)) {
      this.placeNeutral();
      s.phase = 'setup';
      s.current = s.first;
      this.log(null, 'Todos los territorios reclamados. Colocad el resto de ejércitos de uno en uno.');
      this.advanceSetupTurn(true);
    } else {
      s.current = this.nextActive(p);
    }
  }

  setupPlace(p, t, n) {
    const s = this.state;
    if (s.phase !== 'setup') throw new Error('No estás en la fase de despliegue');
    this.checkT(t);
    if (s.owners[t] !== p) throw new Error('Solo puedes desplegar en tus territorios');
    n = Number(n);
    if (s.settings.setup !== 'rapido') n = 1;
    if (!Number.isInteger(n) || n < 1 || n > s.pool[p]) throw new Error('Cantidad no válida');
    s.armies[t] += n; s.pool[p] -= n;
    this.pushEvent({ type: 'place', p, t, n });
    if (s.settings.setup === 'rapido') {
      if (s.players.every((pl, i) => pl.neutral || s.pool[i] <= 0)) this.startPlay();
    } else {
      this.advanceSetupTurn(false);
    }
  }

  advanceSetupTurn(fromStart) {
    const s = this.state;
    if (s.players.every((pl, i) => pl.neutral || s.pool[i] <= 0)) return this.startPlay();
    let p = fromStart ? s.current : this.nextActive(s.current);
    for (let k = 0; k < s.players.length && s.pool[p] <= 0; k++) p = this.nextActive(p);
    s.current = p;
  }

  startPlay() {
    const s = this.state;
    s.round = 1;
    this.log(null, '¡Comienza la guerra!');
    this.beginTurn(s.first);
  }

  beginTurn(p) {
    const s = this.state;
    s.current = p;
    s.turn++;
    s.phase = 'reinforce';
    s.conquered = false;
    s.fortified = false;
    s.pending = null;
    s.tradeBonusUsed = false;
    s.midTurnTrade = false;
    const rb = reinforcementBreakdown(this.graph, s, p);
    s.reinforcements = rb.total;
    // historial de territorios por jugador (para la gráfica final)
    s.history = s.history || [];
    s.history.push(s.players.map((_, i) => territoriesOf(s, i).length));
    if (s.history.length > 600) s.history.splice(0, s.history.length - 600);
    s.turnStartedAt = Date.now();
    this.pushEvent({ type: 'turn', p, reinforcements: rb.total, base: rb.base, territories: rb.territories, regions: rb.regions });
    this.log(p, `Turno de ${this.name(p)}: recibe ${rb.total} refuerzos${rb.bonus ? ` (+${rb.bonus} por regiones)` : ''}.`);
  }

  mustTrade(p) { return this.state.players[p].cards.length >= 5; }

  trade(p, idxs) {
    const s = this.state;
    if (s.phase !== 'reinforce') throw new Error('Solo puedes canjear al comienzo del turno');
    const hand = s.players[p].cards;
    if (s.midTurnTrade && hand.length < 5) throw new Error('Ya tienes 4 cartas o menos: no puedes canjear más ahora');
    if (!Array.isArray(idxs) || idxs.length !== 3 || new Set(idxs).size !== 3 || idxs.some((i) => !Number.isInteger(i) || i < 0 || i >= hand.length))
      throw new Error('Selecciona 3 cartas');
    const cards = idxs.map((i) => hand[i]);
    if (!isValidSet(cards)) throw new Error('Esa combinación no es válida');
    const value = tradeValue(s.tradeCount, s.settings.cards, cards);
    s.tradeCount++;
    s.players[p].stats.trades++;
    s.players[p].cards = hand.filter((_, i) => !idxs.includes(i));
    s.discard.push(...cards);
    s.reinforcements += value;
    let bonusT = -1;
    if (!s.tradeBonusUsed) {
      // como máximo +2 ejércitos por turno por cartas de territorios propios
      for (const c of cards) if (c.t >= 0 && s.owners[c.t] === p) { bonusT = c.t; break; }
      if (bonusT >= 0) { s.armies[bonusT] += 2; s.tradeBonusUsed = true; }
    }
    this.pushEvent({ type: 'trade', p, value, bonusT, cards });
    this.log(p, `${this.name(p)} canjea cartas por ${value} ejércitos${bonusT >= 0 ? ` (+2 en ${this.tname(bonusT)})` : ''}.`);
  }

  place(p, t, n) {
    const s = this.state;
    if (s.phase !== 'reinforce') throw new Error('No estás en la fase de refuerzo');
    if (this.mustTrade(p)) throw new Error('Tienes 5 o más cartas: debes canjear antes de colocar');
    this.checkT(t);
    if (s.owners[t] !== p) throw new Error('Solo puedes reforzar tus territorios');
    n = Number(n);
    if (!Number.isInteger(n) || n < 1 || n > s.reinforcements) throw new Error('Cantidad no válida');
    s.armies[t] += n; s.reinforcements -= n;
    this.pushEvent({ type: 'place', p, t, n });
    if (s.reinforcements === 0 && (validSets(s.players[p].cards).length === 0 || (s.midTurnTrade && s.players[p].cards.length < 5))) {
      s.phase = 'attack';
      s.midTurnTrade = false;
      this.checkMission(p);
    }
  }

  toAttack(p) {
    const s = this.state;
    if (s.phase !== 'reinforce') throw new Error('No estás en la fase de refuerzo');
    if (s.reinforcements > 0) throw new Error('Aún te quedan refuerzos por colocar');
    if (this.mustTrade(p)) throw new Error('Debes canjear cartas');
    s.phase = 'attack';
    s.midTurnTrade = false;
    this.checkMission(p);
  }

  attack(p, from, to, dice, blitz) {
    const s = this.state;
    if (s.phase !== 'attack') throw new Error('No estás en la fase de ataque');
    this.checkT(from); this.checkT(to);
    if (s.owners[from] !== p) throw new Error('Debes atacar desde un territorio propio');
    if (s.owners[to] === p) throw new Error('No puedes atacar tu propio territorio');
    if (!this.graph.adj[from].includes(to)) throw new Error('Los territorios no son vecinos');
    if (s.armies[from] < 2) throw new Error('Necesitas al menos 2 ejércitos para atacar');
    const maxDice = Math.min(3, s.armies[from] - 1);
    dice = dice == null ? maxDice : Number(dice);
    if (!Number.isInteger(dice) || dice < 1 || dice > maxDice) throw new Error('Número de dados no válido');
    const def = s.owners[to];
    const rolls = [];
    let totalA = 0, totalD = 0, lastDice = dice;
    do {
      const ad = blitz ? Math.min(3, s.armies[from] - 1) : dice;
      lastDice = ad;
      const dd = Math.min(2, s.armies[to]);
      const A = Array.from({ length: ad }, () => rollDie(this.rng)).sort((x, y) => y - x);
      const D = Array.from({ length: dd }, () => rollDie(this.rng)).sort((x, y) => y - x);
      let aLoss = 0, dLoss = 0;
      for (let i = 0; i < Math.min(ad, dd); i++) { if (A[i] > D[i]) dLoss++; else aLoss++; }
      s.armies[from] -= aLoss; s.armies[to] -= dLoss;
      totalA += aLoss; totalD += dLoss;
      rolls.push({ a: A, d: D, aLoss, dLoss });
    } while (blitz && s.armies[to] > 0 && s.armies[from] >= 2);
    s.players[p].stats.battlesWon += totalD;
    s.players[p].stats.battlesLost += totalA;
    const conquered = s.armies[to] === 0;
    const ev = { type: 'battle', p, def, from, to, rolls: rolls.slice(-6), nRolls: rolls.length, aLoss: totalA, dLoss: totalD, conquered };
    if (!conquered) {
      this.pushEvent(ev);
      this.log(p, `${this.name(p)} ataca ${this.tname(to)} desde ${this.tname(from)}: pierde ${totalA}, el defensor pierde ${totalD}.`);
      return { ok: true, conquered: false };
    }
    // conquista
    s.owners[to] = p;
    s.conquered = true;
    s.players[p].stats.conquered++;
    s.players[def].stats.lost++;
    this.pushEvent(ev);
    this.log(p, `¡${this.name(p)} conquista ${this.tname(to)}${s.players[def].neutral ? '' : ` a ${this.name(def)}`}!`);
    let eliminated = false;
    if (territoriesOf(s, def).length === 0) {
      eliminated = true;
      const dp = s.players[def];
      dp.alive = false; dp.killedBy = p;
      s.players[p].stats.kills++;
      const got = dp.cards.length;
      s.players[p].cards.push(...dp.cards);
      dp.cards = [];
      this.pushEvent({ type: 'eliminated', p: def, by: p, cards: got });
      this.log(p, `☠ ${this.name(def)} ha sido eliminado por ${this.name(p)}${got ? ` (se lleva ${got} cartas)` : ''}.`);
      // misiones "destruir" que apuntaban a este jugador y no las cumple quien elimina
      for (const [i, pl] of s.players.entries()) {
        if (pl.mission?.type === 'destroy' && pl.mission.target === def && i !== p && pl.alive) {
          pl.mission = { type: 'territories', count: pl.mission.fallback, minArmies: 1 };
        }
      }
    }
    const min = Math.min(lastDice, s.armies[from] - 1);
    const max = s.armies[from] - 1;
    s.pending = { from, to, min: Math.max(1, min), max, eliminated };
    s.phase = 'conquer';
    if (this.checkVictory(p)) { this.autoMoveIn(); return { ok: true, conquered: true }; }
    if (s.pending.min >= s.pending.max) this.moveIn(p, s.pending.max);
    return { ok: true, conquered: true };
  }

  autoMoveIn() {
    const s = this.state;
    if (!s.pending) return;
    const { from, to, max } = s.pending;
    s.armies[to] = max; s.armies[from] -= max; s.pending = null;
  }

  moveIn(p, n) {
    const s = this.state;
    if (s.phase !== 'conquer' || !s.pending) throw new Error('No hay movimiento pendiente');
    const { from, to, min, max, eliminated } = s.pending;
    n = n == null ? min : Number(n);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Debes mover entre ${min} y ${max} ejércitos`);
    s.armies[from] -= n; s.armies[to] += n;
    s.pending = null;
    this.pushEvent({ type: 'move', p, from, to, n });
    if (eliminated && s.players[p].cards.length >= 6) {
      // canje obligatorio inmediato tras eliminar a un jugador
      s.phase = 'reinforce';
      s.reinforcements = 0;
      s.midTurnTrade = true;
      this.log(p, `${this.name(p)} debe canjear cartas hasta quedarse con 4 o menos.`);
      return;
    }
    s.phase = 'attack';
    this.checkMission(p);
  }

  endAttack(p) {
    const s = this.state;
    if (s.phase !== 'attack') throw new Error('No estás en la fase de ataque');
    s.phase = 'fortify';
  }

  fortify(p, from, to, n) {
    const s = this.state;
    if (s.phase !== 'fortify' && s.phase !== 'attack') throw new Error('No puedes fortificar ahora');
    this.checkT(from); this.checkT(to);
    if (s.owners[from] !== p || s.owners[to] !== p) throw new Error('Ambos territorios deben ser tuyos');
    if (!canFortify(this.graph, s, from, to)) throw new Error(s.settings.fortify === 'adyacente' ? 'Solo puedes mover a un territorio vecino' : 'No hay un camino de territorios propios');
    n = Number(n);
    if (!Number.isInteger(n) || n < 1 || n > s.armies[from] - 1) throw new Error('Cantidad no válida (deja al menos 1 ejército)');
    s.armies[from] -= n; s.armies[to] += n;
    this.pushEvent({ type: 'fortify', p, from, to, n });
    this.log(p, `${this.name(p)} fortifica ${this.tname(to)} con ${n} ejércitos.`);
    s.fortified = true;
    this.checkMission(p);
    if (s.phase !== 'over') this.finishTurn(p);
  }

  endTurn(p) {
    const s = this.state;
    if (s.phase !== 'attack' && s.phase !== 'fortify') throw new Error('No puedes terminar el turno ahora');
    this.finishTurn(p);
  }

  drawCard(p) {
    const s = this.state;
    if (!s.deck.length) { s.deck = shuffle(s.discard, this.rng); s.discard = []; }
    if (!s.deck.length) return null;
    const c = s.deck.pop();
    s.players[p].cards.push(c);
    return c;
  }

  finishTurn(p) {
    const s = this.state;
    if (s.conquered) {
      const c = this.drawCard(p);
      if (c) this.pushEvent({ type: 'card', p });
    }
    this.checkMission(p);
    if (s.phase === 'over') return;
    const next = this.nextActive(p);
    if (next <= p) s.round++;
    this.beginTurn(next);
  }

  checkVictory(p) {
    const s = this.state;
    const alive = this.activePlayers();
    if (alive.length === 1) {
      this.declareWinner(alive[0], s.settings.objective === 'misiones' ? 'Último superviviente' : 'Dominación mundial');
      return true;
    }
    return this.checkMission(p);
  }

  checkMission(p) {
    const s = this.state;
    if (s.phase === 'over') return true;
    if (s.settings.objective === 'misiones' && missionComplete(this.graph, s, p)) {
      this.declareWinner(p, `Misión cumplida: ${missionText(this.graph, s, s.players[p].mission, p)}`);
      return true;
    }
    return false;
  }

  declareWinner(p, reason) {
    const s = this.state;
    s.phase = 'over'; s.winner = p; s.winReason = reason; s.pending = s.pending || null;
    s.history = s.history || [];
    s.history.push(s.players.map((_, i) => territoriesOf(s, i).length));
    this.pushEvent({ type: 'win', p, reason });
    this.log(p, `🏆 ¡${this.name(p)} gana la partida! ${reason}`);
  }

  // -------------------------------------------------------------- jugada automática (tiempo agotado)
  // Completa lo imprescindible y pasa turno.
  autoFinish(p) {
    const s = this.state;
    let guard = 0;
    while (this.actors().includes(p) && s.phase !== 'over' && guard++ < 500) {
      const own = territoriesOf(s, p);
      const border = own.filter((t) => this.graph.adj[t].some((n) => s.owners[n] !== p));
      const pick = () => (border.length ? border : own)[Math.floor(this.rng() * (border.length || own.length))];
      if (s.phase === 'claim') {
        const free = [...Array(this.graph.n).keys()].filter((t) => s.owners[t] === -1);
        this.claim(p, free[Math.floor(this.rng() * free.length)]);
      } else if (s.phase === 'setup') {
        this.setupPlace(p, pick(), s.settings.setup === 'rapido' ? s.pool[p] : 1);
        if (s.settings.setup !== 'rapido') break;
      } else if (s.phase === 'reinforce') {
        if (this.mustTrade(p)) { this.trade(p, bestSet(s.players[p].cards, s.settings.cards, s.owners, p)); continue; }
        if (s.reinforcements > 0) { this.place(p, pick(), s.reinforcements); continue; }
        this.toAttack(p);
      } else if (s.phase === 'conquer') {
        this.moveIn(p, s.pending.max);
      } else if (s.phase === 'attack' || s.phase === 'fortify') {
        this.endTurn(p);
        break;
      } else break;
    }
  }
}

// Vista personalizada para un jugador (oculta cartas y misiones ajenas, y el mazo)
export function viewFor(state, p) {
  const over = state.phase === 'over';
  return {
    ...state,
    deck: undefined,
    deckCount: state.deck.length,
    discard: undefined,
    history: over ? state.history : undefined,
    players: state.players.map((pl, i) => ({
      ...pl,
      cards: i === p || over ? pl.cards : undefined,
      cardCount: pl.cards.length,
      mission: i === p || over ? pl.mission : (pl.mission ? { hidden: true } : null),
    })),
  };
}
