// DOMINIUM — inteligencia artificial de los bots
// Cuatro niveles: recluta (fácil), soldado (normal), general (difícil), mariscal (experto).
// botStep() ejecuta UNA acción del bot y devuelve true si actuó.

import { territoriesOf, winProbability, validSets, bestSet, canFortify, reachable, regionsHeld, canAttackPlayer, sameTeam } from './engine.js';

const LEVELS = {
  recluta: { name: 'recluta', random: 0.55, threshold: 0.75, maxAttacks: 3, tradeEarly: false, defend: 0, fortify: 0.35, focus: 0.3, cardHunt: false, hunt: 0, mission: 0 },
  soldado: { name: 'soldado', random: 0.3, threshold: 0.72, maxAttacks: 6, tradeEarly: true, defend: 0, fortify: 0.7, focus: 0.5, cardHunt: true, hunt: 2, mission: 0.5 },
  general: { name: 'general', random: 0.03, threshold: 0.58, maxAttacks: 40, tradeEarly: true, defend: 0.4, fortify: 1, focus: 1, cardHunt: true, hunt: 8, mission: 1 },
  mariscal: { name: 'mariscal', random: 0, threshold: 0.62, maxAttacks: 60, tradeEarly: true, defend: 0.45, fortify: 1, focus: 1.2, cardHunt: true, hunt: 14, mission: 1.5, compact: 1 },
};
export const levelParams = (id) => LEVELS[id] || LEVELS.soldado;

function mem(game, p) {
  game.botMem = game.botMem || {};
  const key = `${p}:${game.state.turn}`;
  if (!game.botMem[key]) {
    for (const k of Object.keys(game.botMem)) if (k.startsWith(`${p}:`)) delete game.botMem[k];
    game.botMem[key] = { attacks: 0, failed: new Set(), plan: null };
  }
  return game.botMem[key];
}

const pickRandom = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// enemigo de verdad: ni yo, ni mi equipo, ni alguien con quien tengo pacto
const foe = (s, p, o) => o !== p && o >= 0 && canAttackPlayer(s, p, o);
function isBorder(g, s, t) { const p = s.owners[t]; return g.adj[t].some((n) => foe(s, p, s.owners[n])); }

function threatOn(g, s, t) {
  const p = s.owners[t];
  let sum = 0;
  for (const n of g.adj[t]) {
    const o = s.owners[n];
    if (o === p || o < 0 || sameTeam(s, p, o)) continue;
    sum += s.players[o].neutral ? 0 : s.armies[n] - 1;
  }
  return sum;
}

function missionBoost(g, s, p, L) {
  const boost = new Array(g.n).fill(0);
  const m = s.players[p].mission;
  if (!m || !L.mission) return boost;
  if (m.type === 'regions') {
    for (const r of m.regions) for (const t of g.regions[r].members) boost[t] += 3 * L.mission;
  } else if (m.type === 'destroy') {
    for (let t = 0; t < g.n; t++) if (s.owners[t] === m.target) boost[t] += 4 * L.mission;
  } else if (m.type === 'territories') {
    for (let t = 0; t < g.n; t++) boost[t] += 0.8 * L.mission;
  }
  return boost;
}

function regionScores(g, s, p, L) {
  return g.regions.map((r) => {
    const n = r.members.length;
    let k = 0, E = 0, O = 0;
    for (const t of r.members) {
      if (s.owners[t] === p) { k++; O += s.armies[t]; } else E += s.armies[t];
    }
    const frac = k / n;
    const value = (r.bonus + 0.5) / Math.sqrt(n);
    return value * (0.25 + frac * frac * 2) * (1 + L.focus) / (1 + E / (O + 4)) * (k === n ? 0.5 : 1);
  });
}

// Puntuación de conquistar el territorio enemigo e
function targetScore(g, s, p, L, e, rs, mb) {
  const o = s.owners[e];
  let sc = rs[g.regionOf[e]] * 2 + mb[e];
  if (s.capitals && s.capitals.includes(e)) sc += 6 * L.focus;            // capitales: el objetivo de la partida
  if (s.settings.objective === 'porcentaje') sc += 1.2;                   // 60 %: cada territorio cuenta
  if (o >= 0) {
    const op = s.players[o];
    if (op.neutral) sc -= 1;
    else {
      // romper una región enemiga
      const r = g.regions[g.regionOf[e]];
      if (r.members.every((t) => s.owners[t] === o)) sc += r.bonus * 1.5 * L.focus;
      // cazar jugadores débiles (para robar sus cartas)
      const terr = territoriesOf(s, o).length;
      if (L.hunt && terr <= 4) sc += (L.hunt * (op.cards.length + 1)) / terr;
    }
  }
  // completar región propia
  const reg = g.regions[g.regionOf[e]];
  const missing = reg.members.filter((t) => s.owners[t] !== p).length;
  if (missing === 1) sc += reg.bonus * 2 * L.focus;
  if (L.compact) {
    // frente compacto: premia cerrar huecos y penaliza abrir frentes contra ejércitos grandes
    let ownN = 0, enemyArm = 0;
    for (const n of g.adj[e]) {
      if (s.owners[n] === p) ownN++;
      else if (s.owners[n] >= 0 && s.owners[n] !== o && !s.players[s.owners[n]].neutral) enemyArm += s.armies[n];
    }
    sc += ownN * 0.6 * L.compact - enemyArm * 0.08 * L.compact;
  }
  return sc;
}

// ---------------------------------------------------------------- colocación
function planPlacement(game, p, L, amount) {
  const g = game.graph, s = game.state, rng = game.rng;
  const own = territoriesOf(s, p);
  const border = own.filter((t) => isBorder(g, s, t));
  const cands = border.length ? border : own;
  const plan = new Map();
  const add = (t, n) => plan.set(t, (plan.get(t) || 0) + n);
  if (rng() < L.random) {
    let left = amount;
    while (left > 0) { const n = Math.min(left, 1 + Math.floor(rng() * 3)); add(pickRandom(cands, rng), n); left -= n; }
    return [...plan].map(([t, n]) => ({ t, n }));
  }
  let left = amount;
  // defensa de regiones completas
  if (s.capitals && s.capitals[p] >= 0 && s.owners[s.capitals[p]] === p && L.name !== 'recluta') {
    const cap = s.capitals[p];
    const deficit = threatOn(g, s, cap) - s.armies[cap] + 3;
    if (deficit > 0) { const n = Math.min(left, deficit, Math.ceil(amount * 0.5)); if (n > 0) { add(cap, n); left -= n; } }
  }
  if (L.defend > 0) {
    const held = regionsHeld(g, s, p);
    let budget = Math.floor(amount * L.defend);
    const needs = [];
    for (const ri of held) for (const t of g.regions[ri].members) {
      if (!isBorder(g, s, t)) continue;
      const deficit = threatOn(g, s, t) - s.armies[t] + 2;
      if (deficit > 0) needs.push({ t, deficit });
    }
    needs.sort((a, b) => b.deficit - a.deficit);
    for (const nd of needs) {
      if (budget <= 0) break;
      const n = Math.min(budget, nd.deficit, left);
      add(nd.t, n); budget -= n; left -= n;
    }
  }
  if (left > 0) {
    const rs = regionScores(g, s, p, L);
    const mb = missionBoost(g, s, p, L);
    let best = cands[0], bestSc = -Infinity;
    for (const c of cands) {
      let sc = -Infinity;
      for (const e of g.adj[c]) {
        if (!foe(s, p, s.owners[e])) continue;
        const ts = targetScore(g, s, p, L, e, rs, mb);
        const wp = winProbability(s.armies[c] - 1 + left, s.armies[e]);
        sc = Math.max(sc, ts * (0.4 + wp) - s.armies[e] * 0.05);
      }
      if (sc === -Infinity) sc = threatOn(g, s, c) * 0.1;
      if (sc > bestSc) { bestSc = sc; best = c; }
    }
    add(best, left);
  }
  return [...plan].map(([t, n]) => ({ t, n })).filter((x) => x.n > 0);
}

function chooseClaim(game, p, L) {
  const g = game.graph, s = game.state, rng = game.rng;
  const free = [...Array(g.n).keys()].filter((t) => s.owners[t] === -1);
  if (rng() < L.random) return pickRandom(free, rng);
  let best = free[0], bestSc = -Infinity;
  for (const t of free) {
    const r = g.regions[g.regionOf[t]];
    const mine = r.members.filter((x) => s.owners[x] === p).length;
    const others = r.members.filter((x) => s.owners[x] >= 0 && s.owners[x] !== p).length;
    const adjOwn = g.adj[t].filter((n) => s.owners[n] === p).length;
    const sc = (mine * 2 - others * 1.2) / r.members.length * 10 + adjOwn + r.bonus / r.members.length * 2 + rng() * 0.5;
    if (sc > bestSc) { bestSc = sc; best = t; }
  }
  return best;
}

// ---------------------------------------------------------------- ataque
function chooseAttack(game, p, L, m) {
  const g = game.graph, s = game.state, rng = game.rng;
  if (m.attacks >= L.maxAttacks) return null;
  const own = territoriesOf(s, p);
  const rs = regionScores(g, s, p, L);
  const mb = missionBoost(g, s, p, L);
  const opts = [];
  for (const c of own) {
    if (s.armies[c] < 2) continue;
    for (const e of g.adj[c]) {
      if (!foe(s, p, s.owners[e])) continue;
      if (m.failed.has(`${c}>${e}`)) continue;
      const wp = winProbability(s.armies[c] - 1, s.armies[e]);
      const ts = targetScore(g, s, p, L, e, rs, mb);
      opts.push({ from: c, to: e, wp, ts });
    }
  }
  if (!opts.length) return null;
  if (L.name === 'recluta') {
    const ok = opts.filter((o) => s.armies[o.from] > s.armies[o.to] + 1);
    if (!ok.length || rng() < 0.3) return null;
    return pickRandom(ok, rng);
  }
  // umbral más bajo para objetivos valiosos, más alto para irrelevantes
  const good = opts.filter((o) => {
    let th = L.threshold - Math.min(0.15, o.ts * 0.01);
    if (L.cardHunt && !s.conquered) th = Math.min(th, 0.6);
    return o.wp >= th && s.armies[o.from] >= 3 - (s.armies[o.to] === 1 ? 1 : 0);
  });
  if (!good.length) return null;
  good.sort((a, b) => (b.ts * (0.5 + b.wp)) - (a.ts * (0.5 + a.wp)));
  // Tras conseguir la carta del turno, los niveles bajos se contienen
  if (s.conquered && L.name === 'soldado' && good[0].wp < 0.8 && good[0].ts < 3) return null;
  return good[0];
}

function chooseMove(game, p, L) {
  const g = game.graph, s = game.state;
  const { from, to, min, max } = s.pending;
  if (L.name === 'recluta') return Math.max(min, Math.min(max, Math.round((min + max) / 2)));
  const fromThreat = threatOn(g, s, from);
  const toThreat = threatOn(g, s, to);
  const fromHasTargets = g.adj[from].some((n) => n !== to && foe(s, p, s.owners[n]));
  if (!fromHasTargets) return max;
  // reparte según amenaza
  const total = max + 1;
  const ratio = (toThreat + 2) / (toThreat + fromThreat + 4);
  return Math.max(min, Math.min(max, Math.round(total * ratio)));
}

// ---------------------------------------------------------------- fortificación
function chooseFortify(game, p, L) {
  const g = game.graph, s = game.state, rng = game.rng;
  if (rng() > L.fortify) return null;
  const own = territoriesOf(s, p);
  const interior = own.filter((t) => s.armies[t] > 1 && !isBorder(g, s, t)).sort((a, b) => s.armies[b] - s.armies[a]);
  const borders = own.filter((t) => isBorder(g, s, t));
  if (!borders.length) return null;
  const need = (t) => threatOn(g, s, t) - s.armies[t] + regionsHeld(g, s, p).includes(g.regionOf[t]) * 3;
  for (const src of interior) {
    const reach = s.settings.fortify === 'adyacente' ? new Set(g.adj[src].filter((n) => s.owners[n] === p)) : reachable(g, s, src);
    let best = null, bestNeed = -Infinity;
    for (const b of borders) {
      if (!reach.has(b)) continue;
      const nd = need(b);
      if (nd > bestNeed) { bestNeed = nd; best = b; }
    }
    if (best == null && s.settings.fortify === 'adyacente') {
      // acerca tropas al frente aunque no llegue a la frontera
      const step = g.adj[src].find((n) => s.owners[n] === p);
      if (step != null) return { from: src, to: step, n: s.armies[src] - 1 };
      continue;
    }
    if (best != null) return { from: src, to: best, n: s.armies[src] - 1 };
  }
  if (L.name === 'general' || L.name === 'mariscal') {
    // rebalancea entre fronteras: del menos amenazado con muchas tropas al más amenazado
    let best = null;
    for (const a of borders) {
      if (s.armies[a] < 4) continue;
      const surplus = s.armies[a] - 1 - threatOn(g, s, a);
      if (surplus < 3) continue;
      for (const b of borders) {
        if (a === b || !canFortify(g, s, a, b)) continue;
        const nb = need(b);
        if (nb > 2 && (!best || nb > best.score)) best = { from: a, to: b, n: Math.min(surplus, nb), score: nb };
      }
    }
    if (best) return { from: best.from, to: best.to, n: best.n };
  }
  return null;
}

// ---------------------------------------------------------------- paso principal
export function botStep(game, p, level) {
  const s = game.state, g = game.graph;
  const L = levelParams(level);
  if (s.phase === 'over' || !game.actors().includes(p)) return false;
  const m = mem(game, p);
  const act = (a) => {
    const r = game.apply(p, a);
    if (!r.ok) throw new Error(`Bot ${p} (${s.phase}) acción ${JSON.stringify(a)} falló: ${r.error}`);
    return r;
  };
  try {
    switch (s.phase) {
      case 'claim':
        act({ type: 'claim', t: chooseClaim(game, p, L) });
        return true;
      case 'setup': {
        if (s.settings.setup === 'rapido') {
          const amount = s.pool[p];
          const plan = planPlacement(game, p, L, Math.min(amount, Math.max(1, Math.ceil(amount / 3))));
          for (const x of plan) act({ type: 'setup', t: x.t, n: x.n });
        } else {
          const plan = planPlacement(game, p, L, 1);
          act({ type: 'setup', t: plan[0].t, n: 1 });
        }
        return true;
      }
      case 'reinforce': {
        const hand = s.players[p].cards;
        if (hand.length >= 5 || (L.tradeEarly && !s.midTurnTrade && validSets(hand).length)) {
          const set = bestSet(hand, s.settings.cards, s.owners, p);
          if (set) { act({ type: 'trade', cards: set }); return true; }
        }
        if (s.reinforcements > 0) {
          const plan = planPlacement(game, p, L, s.reinforcements);
          act({ type: 'place', t: plan[0].t, n: plan[0].n });
          return true;
        }
        act({ type: 'toAttack' });
        return true;
      }
      case 'attack': {
        const choice = chooseAttack(game, p, L, m);
        if (choice) {
          m.attacks++;
          const r = act({ type: 'attack', from: choice.from, to: choice.to, dice: Math.min(3, s.armies[choice.from] - 1), blitz: true });
          if (!r.conquered) m.failed.add(`${choice.from}>${choice.to}`);
          return true;
        }
        const f = chooseFortify(game, p, L);
        if (f) { act({ type: 'fortify', ...f }); return true; }
        act({ type: 'endTurn' });
        return true;
      }
      case 'conquer':
        act({ type: 'move', n: chooseMove(game, p, L) });
        return true;
      case 'fortify': {
        const f = chooseFortify(game, p, L);
        if (f) act({ type: 'fortify', ...f }); else act({ type: 'endTurn' });
        return true;
      }
    }
  } catch (e) {
    // red de seguridad: si algo falla, el bot termina su parte de forma segura
    console.error('[bot]', e.message);
    game.autoFinish(p);
    return true;
  }
  return false;
}

// ¿Acepta el bot un pacto de no agresión? Rechaza al líder si es listo; acepta si va por detrás.
export function botAnswerPact(game, p, from, level) {
  const s = game.state, L = levelParams(level);
  const cnt = (i) => s.owners.filter((o) => o === i).length;
  const leader = s.players.map((_, i) => i).filter((i) => s.players[i].alive && !s.players[i].neutral).sort((a, b) => cnt(b) - cnt(a))[0];
  if (L.name === 'recluta') return game.rng() < 0.7;
  if (from === leader && L.name !== 'soldado') return false;
  if (cnt(p) < cnt(from)) return true;
  return game.rng() < 0.45;
}
