/* HEXÓPOLIS — inteligencia artificial de los bots (4 niveles) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'));
  else root.Bots = factory(root.Engine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';
  const { RES, COST, PIPS } = E;

  const LEVELS = {
    1: { name: 'Novato', stars: 1 },
    2: { name: 'Normal', stars: 2 },
    3: { name: 'Difícil', stars: 3 },
    4: { name: 'Experto', stars: 4 },
  };
  const BOT_NAMES = ['R0B0', 'PIXEL', 'BYTE', 'NEÓN', 'CHIP', 'GLITCH', 'TURBO', 'ZAPP', 'KILO', 'NOVA', 'VOLT', 'RETRO'];

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const zero = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
  const tot = E.total;
  const deckLeft = (s) => (Array.isArray(s.devDeck) ? s.devDeck.length : s.devDeck);

  // ---------- análisis del tablero ----------
  function hexPips(s, h) { const x = s.board.hexes[h]; return x.res === 'desert' || !x.num ? 0 : PIPS[x.num]; }
  function vertexProd(s, v, robberFactor = 1) {
    const out = zero();
    for (const h of s.board.vertices[v].hexes) {
      const x = s.board.hexes[h];
      if (x.res === 'desert') continue;
      out[x.res] += PIPS[x.num] * (h === s.board.robber ? robberFactor : 1);
    }
    return out;
  }
  function playerProd(s, pid, robberFactor = 0) {
    const out = zero();
    for (const V of s.board.vertices) {
      if (!V.b || V.b.owner !== pid) continue;
      const m = V.b.type === 'city' ? 2 : 1;
      const p = vertexProd(s, V.id, robberFactor);
      for (const r of RES) out[r] += p[r] * m;
    }
    return out;
  }
  function boardPips(s) {
    const out = zero();
    for (const h of s.board.hexes) if (h.res !== 'desert') out[h.res] += PIPS[h.num];
    return out;
  }
  function maxVP(s, exclude) {
    let m = 0;
    s.players.forEach((p, i) => { if (i !== exclude) m = Math.max(m, E.vp(s, i, false)); });
    return m;
  }

  function weights(s, pid, level) {
    const myVP = E.vp(s, pid, true);
    const late = Math.min(1, myVP / 7);
    const w = {
      wood: 1.1 - 0.25 * late, brick: 1.1 - 0.25 * late, sheep: 0.85, wheat: 1.05 + 0.15 * late, ore: 0.9 + 0.3 * late,
    };
    if (level >= 3) {
      const bp = boardPips(s);
      const avg = RES.reduce((a, r) => a + bp[r], 0) / 5;
      for (const r of RES) w[r] *= Math.max(0.75, Math.min(1.4, Math.sqrt(avg / Math.max(1, bp[r]))));
    }
    return w;
  }

  function spotScore(s, pid, v, level, ctx) {
    const prod = vertexProd(s, v, level >= 3 ? 0.6 : 1);
    let sc = 0;
    for (const r of RES) {
      if (!prod[r]) continue;
      sc += prod[r] * ctx.w[r];
      if (level >= 2 && ctx.myProd[r] === 0) sc += level >= 3 ? 2.2 * ctx.w[r] : 1.2;
      if (level >= 3 && ctx.myProd[r] > 9) sc -= 0.12 * prod[r];
    }
    const pt = s.board.vertices[v].port;
    if (pt && level >= 2) {
      if (pt === 'any') sc += level >= 3 ? 1.3 : 0.5;
      else sc += (ctx.myProd[pt] + prod[pt]) * (level >= 3 ? 0.3 : 0.12);
    }
    if (level >= 4) {
      // potencial de expansión: mejores huecos a 2 aristas
      let best = 0;
      for (const a of s.board.vertices[v].adj) for (const b of s.board.vertices[a].adj) {
        if (b === v || !E.canSettle(s, pid, b, true)) continue;
        const p = vertexProd(s, b, 0.6);
        let x = 0; for (const r of RES) x += p[r] * ctx.w[r];
        if (x > best) best = x;
      }
      sc += 0.18 * best;
    }
    if (level === 1) sc = sc * 0.35 + Math.random() * 9;
    return sc;
  }

  function context(s, pid, level) {
    return { w: weights(s, pid, level), myProd: playerProd(s, pid, 1) };
  }

  // ---------- colocación inicial ----------
  function setupSettlement(s, pid, level) {
    const cands = E.legalSettlements(s, pid, true);
    const ctx = context(s, pid, level);
    const round2 = s.setup.idx >= s.players.length;
    let best = null, bs = -1e9;
    for (const v of cands) {
      let sc = spotScore(s, pid, v, level, ctx);
      if (level >= 3 && round2) {
        const p = vertexProd(s, v);
        const after = zero(); RES.forEach((r) => (after[r] = ctx.myProd[r] + p[r]));
        if (after.wood > 0 && after.brick > 0) sc += 2;
        if (after.wheat > 0 && after.ore > 0) sc += 1.2;
        if (RES.filter((r) => after[r] > 0).length >= 5) sc += 1.5;
        // cartas iniciales
        for (const h of s.board.vertices[v].hexes) { const x = s.board.hexes[h]; if (x.res !== 'desert') sc += 0.3 * ctx.w[x.res]; }
      }
      if (level >= 4 && !round2) {
        // reservar: valor de un segundo poblado complementario que probablemente quede libre
        const p = vertexProd(s, v);
        let second = 0, count = 0;
        const scores = [];
        for (const u of cands) {
          if (u === v || s.board.vertices[v].adj.includes(u)) continue;
          const q = vertexProd(s, u);
          let x = 0; for (const r of RES) x += q[r] * ctx.w[r] + (p[r] === 0 && q[r] > 0 ? 1.5 : 0);
          scores.push(x);
        }
        scores.sort((a, b) => b - a);
        const k = Math.min(scores.length - 1, (s.players.length - 1) * 2);
        for (let i = Math.max(0, k - 2); i <= k && i < scores.length; i++) { second += scores[i]; count++; }
        if (count) sc += 0.25 * (second / count);
      }
      if (sc > bs) { bs = sc; best = v; }
    }
    return { type: 'placeSettlement', v: best != null ? best : cands[0] };
  }

  function setupRoad(s, pid, level) {
    const v = s.setup.last;
    const roads = E.legalRoads(s, pid, v);
    if (level === 1) return { type: 'placeRoad', e: pick(roads) };
    const ctx = context(s, pid, level);
    let best = roads[0], bs = -1e9;
    for (const e of roads) {
      const Ed = s.board.edges[e];
      const u = Ed.a === v ? Ed.b : Ed.a;
      let sc = 0;
      for (const w of s.board.vertices[u].adj) {
        if (w === v || !E.canSettle(s, pid, w, true)) continue;
        sc = Math.max(sc, spotScore(s, pid, w, Math.min(level, 3), ctx));
      }
      if (s.board.vertices[u].hexes.length < 2) sc -= 1; // evitar la costa
      sc += Math.random() * 0.5;
      if (sc > bs) { bs = sc; best = e; }
    }
    return { type: 'placeRoad', e: best };
  }

  // ---------- planificación ----------
  function rollsToAfford(s, pid, cost, prod, ratios) {
    const P = s.players[pid];
    const miss = zero(), sur = zero();
    let missing = 0, units = 0;
    for (const r of RES) {
      const need = cost[r] || 0;
      miss[r] = Math.max(0, need - P.res[r]);
      sur[r] = Math.max(0, P.res[r] - need);
      missing += miss[r];
      units += Math.floor(sur[r] / ratios[r]);
    }
    if (!missing) return 0;
    if (units >= missing) return 0.5;
    const totalRate = RES.reduce((a, r) => a + prod[r], 0) / 36;
    let T = 0;
    let left = units;
    const order = RES.filter((r) => miss[r]).sort((a, b) => prod[a] - prod[b]);
    for (const r of order) {
      let m = miss[r];
      const cover = Math.min(left, m); m -= cover; left -= cover;
      if (!m) continue;
      const rate = prod[r] / 36 + totalRate / 4 * 0.6 + 0.01;
      T = Math.max(T, m / rate);
    }
    return T;
  }

  function roadTargets(s, pid, maxDepth) {
    // BFS desde mi red de caminos/edificios hacia vértices libres donde poder construir
    const Vs = s.board.vertices, Es = s.board.edges;
    const start = new Set();
    for (const V of Vs) {
      if (V.b && V.b.owner === pid) start.add(V.id);
      else if (!V.b && V.edges.some((e) => Es[e].road === pid)) start.add(V.id);
    }
    const dist = new Map(), prev = new Map();
    const q = [];
    for (const v of start) { dist.set(v, 0); q.push(v); }
    const out = [];
    while (q.length) {
      const v = q.shift();
      const d = dist.get(v);
      if (d > 0 && E.canSettle(s, pid, v, true)) {
        const path = []; let x = v;
        while (prev.has(x)) { const [pv, e] = prev.get(x); path.unshift(e); x = pv; }
        out.push({ v, path });
      }
      if (d >= maxDepth) continue;
      if (d > 0 && Vs[v].b && Vs[v].b.owner !== pid) continue;
      for (const eid of Vs[v].edges) {
        const e = Es[eid];
        if (e.road !== null) continue;
        const u = e.a === v ? e.b : e.a;
        if (dist.has(u)) continue;
        if (Vs[u].b && Vs[u].b.owner !== pid) continue;
        dist.set(u, d + 1); prev.set(u, [v, eid]); q.push(u);
      }
    }
    return out;
  }

  function buildGoals(s, pid, level, ctx) {
    const P = s.players[pid];
    const goals = [];
    const leader = maxVP(s, pid);
    const K = 0.085 * Math.max(0.25, 1 - Math.max(leader, E.vp(s, pid, true)) / 13);
    const valOf = (v) => spotScore(s, pid, v, Math.min(level, 4), ctx);

    if (P.cities > 0) for (const v of E.legalCities(s, pid)) {
      const p = vertexProd(s, v, 0.7);
      let x = 0; for (const r of RES) x += p[r] * ctx.w[r];
      goals.push({ kind: 'city', v, cost: COST.city, step: COST.city, value: 1 + x * K * 1.1 });
    }
    if (P.settlements > 0) {
      for (const v of E.legalSettlements(s, pid, false)) goals.push({ kind: 'settlement', v, cost: COST.settlement, step: COST.settlement, value: 1.05 + valOf(v) * K });
      if (P.roads > 0) {
        const tg = roadTargets(s, pid, level >= 3 ? 3 : 2).filter((t) => t.path.length > 0 && t.path.length <= P.roads);
        for (const t of tg) {
          const L = t.path.length;
          const cost = { wood: 1 + L, brick: 1 + L, sheep: 1, wheat: 1 };
          goals.push({ kind: 'road', v: t.v, e: t.path[0], path: t.path, cost, step: COST.road, value: (1.05 + valOf(t.v) * K) * Math.pow(0.82, L) });
        }
      }
    }
    // camino más largo
    if (level >= 3 && P.roads > 0) {
      const lr = s.longestRoad;
      const myLen = P.roadLen || 0;
      const target = lr.owner === pid ? null : Math.max(5, (lr.owner != null ? lr.len : 4) + 1);
      if (target && target - myLen <= 2 && myLen >= 3) {
        const e = bestExtension(s, pid, myLen);
        if (e != null) goals.push({ kind: 'lroad', e, cost: { wood: target - myLen, brick: target - myLen }, step: COST.road, value: 2 / (target - myLen) * (level >= 4 ? 1.1 : 0.9) });
      }
    }
    if (deckLeft(s) > 0) {
      let v = level >= 3 ? 0.5 : 0.4;
      const la = s.largestArmy;
      const myK = P.knights + P.dev.knight;
      if (level >= 3 && myK + 1 >= 3 && la.owner !== pid && myK + 1 >= la.size) v += 0.35;
      if (!E.legalSettlements(s, pid, false).length && P.settlements > 0 && level >= 2) v += 0.1;
      if (P.cities === 0 && P.settlements === 0) v += 0.4;
      goals.push({ kind: 'dev', cost: COST.dev, step: COST.dev, value: v });
    }
    const prod = playerProd(s, pid, level >= 3 ? 0 : 1);
    const ratios = E.tradeRatios(s, pid);
    for (const g of goals) {
      g.T = rollsToAfford(s, pid, g.cost, prod, ratios);
      g.score = g.value / (1 + g.T * (level >= 3 ? 0.35 : 0.25));
      if (level === 1) g.score = Math.random();
    }
    goals.sort((a, b) => b.score - a.score);
    return goals;
  }

  function bestExtension(s, pid, myLen) {
    let best = null, bl = myLen;
    for (const e of E.legalRoads(s, pid)) {
      s.board.edges[e].road = pid;
      const l = E.longestRoadFor(s, pid);
      s.board.edges[e].road = null;
      if (l > bl) { bl = l; best = e; }
    }
    return best;
  }

  function actionFor(g) {
    if (g.kind === 'city') return { type: 'placeCity', v: g.v };
    if (g.kind === 'settlement') return { type: 'placeSettlement', v: g.v };
    if (g.kind === 'road' || g.kind === 'lroad') return { type: 'placeRoad', e: g.e };
    if (g.kind === 'dev') return { type: 'buyDev' };
  }

  // trueque con el banco: solo entrega excedentes respecto al coste objetivo
  function bankTradeToward(s, pid, cost) {
    const P = s.players[pid];
    const ratios = E.tradeRatios(s, pid);
    const miss = RES.filter((r) => (cost[r] || 0) > P.res[r] && s.bank[r] > 0);
    if (!miss.length) return null;
    let totalMiss = 0, units = 0;
    for (const r of RES) {
      totalMiss += Math.max(0, (cost[r] || 0) - P.res[r]);
      units += Math.floor(Math.max(0, P.res[r] - (cost[r] || 0)) / ratios[r]);
    }
    if (units < totalMiss) return null; // no completamos el objetivo, no merece la pena
    let give = null, best = -1;
    for (const r of RES) {
      const sur = P.res[r] - (cost[r] || 0);
      if (sur >= ratios[r]) { const sc = sur / ratios[r] + (ratios[r] === 2 ? 1 : 0); if (sc > best) { best = sc; give = r; } }
    }
    if (!give) return null;
    const get = miss.sort((a, b) => ((cost[b] || 0) - P.res[b]) - ((cost[a] || 0) - P.res[a]))[0];
    return { type: 'bankTrade', give, get };
  }

  function domesticOffer(s, pid, level, cost, mem) {
    const P = s.players[pid];
    const miss = RES.filter((r) => (cost[r] || 0) > P.res[r]);
    if (!miss.length) return null;
    const sur = RES.filter((r) => P.res[r] - (cost[r] || 0) > 0).sort((a, b) => (P.res[b] - (cost[b] || 0)) - (P.res[a] - (cost[a] || 0)));
    if (!sur.length) return null;
    for (const get of miss) {
      for (const give of sur) {
        const key = give + '>' + get;
        if (mem.offerKeys.includes(key)) continue;
        mem.offerKeys.push(key);
        const extra = P.res[give] - (cost[give] || 0);
        const n = level >= 4 && extra >= 3 && mem.offerKeys.length > 1 ? 2 : 1;
        return { type: 'offerTrade', give: { [give]: n }, get: { [get]: 1 } };
      }
    }
    return null;
  }

  // ---------- respuesta a ofertas ----------
  function handValue(s, pid, hand, level) {
    const ctx = context(s, pid, level);
    const goals = buildGoals(s, pid, level, ctx).slice(0, 3);
    const need = zero();
    goals.forEach((g, i) => { for (const r in g.cost) need[r] = Math.max(need[r], g.cost[r] * (i === 0 ? 1 : 0.6)); });
    let v = 0;
    for (const r of RES) {
      const n = hand[r];
      const useful = Math.min(n, Math.ceil(need[r]));
      v += useful * (1.6 + 0.2 * ctx.w[r]) + (n - useful) * 0.55 * ctx.w[r];
    }
    return v;
  }

  function respond(s, pid, level) {
    const T = s.trade;
    const P = s.players[pid];
    if (!E.has(P.res, T.get)) return false;
    if (level === 1) return Math.random() < 0.35;
    const propVP = E.vp(s, T.from, false);
    if (level >= 3 && propVP >= (level >= 4 ? 8 : 9)) return false;
    if (level >= 4 && propVP >= E.vp(s, pid, true) + 3) return false;
    const after = Object.assign({}, P.res);
    for (const r in T.get) after[r] -= T.get[r];
    for (const r in T.give) after[r] += T.give[r];
    if (level === 2) return tot(T.give) >= tot(T.get) && RES.some((r) => T.give[r] && P.res[r] === 0);
    const before = handValue(s, pid, P.res, level);
    const aft = handValue(s, pid, after, level);
    return aft - before > (level >= 4 ? 0.35 : 0.1);
  }

  // ---------- ladrón ----------
  function chooseRobber(s, pid, level) {
    let best = null, bs = -1e9;
    for (const h of s.board.hexes) {
      if (h.id === s.board.robber) continue;
      const victims = E.robberVictims(s, pid, h.id);
      let sc = 0;
      const pips = hexPips(s, h.id);
      for (const v of h.v) {
        const b = s.board.vertices[v].b;
        if (!b) continue;
        const m = b.type === 'city' ? 2 : 1;
        if (b.owner === pid) sc -= pips * m * 2.2;
        else sc += pips * m * (level >= 3 ? 1 + 0.22 * E.vp(s, b.owner, false) : 1);
      }
      if (victims.length) sc += 2.5;
      if (level === 1) sc = Math.random() * 5 + (victims.length ? 4 : 0) + (sc < 0 ? -5 : 0);
      if (sc > bs) { bs = sc; best = h.id; }
    }
    const victims = E.robberVictims(s, pid, best);
    let victim = null;
    if (victims.length) {
      if (level === 1) victim = pick(victims);
      else victim = victims.sort((a, b) => score(b) - score(a))[0];
    }
    function score(o) { const p = s.players[o]; return (level >= 3 ? E.vp(s, o, false) * 2 : 0) + tot(p.res) * 0.6; }
    return { type: 'moveRobber', hex: best, victim };
  }

  // ---------- descarte ----------
  function chooseDiscard(s, pid, level) {
    const P = s.players[pid];
    const n = s.pendingDiscard[pid];
    const hand = Object.assign({}, P.res);
    const out = zero();
    let need = zero();
    if (level >= 2) {
      const ctx = context(s, pid, level);
      const g = buildGoals(s, pid, level, ctx);
      g.slice(0, 2).forEach((x) => { for (const r in x.cost) need[r] = Math.max(need[r], x.cost[r]); });
    }
    for (let i = 0; i < n; i++) {
      let best = null, bs = -1e9;
      for (const r of RES) {
        if (hand[r] <= 0) continue;
        const sc = level === 1 ? Math.random() : hand[r] - need[r] + Math.random() * 0.1;
        if (sc > bs) { bs = sc; best = r; }
      }
      hand[best]--; out[best]++;
    }
    return { type: 'discard', cards: out };
  }

  // ---------- cartas de desarrollo ----------
  function considerDev(s, pid, level, mem, goals) {
    if (s.devPlayed) return null;
    const P = s.players[pid];
    const can = (c) => P.dev[c] - P.devNew[c] > 0;
    const myVP = E.vp(s, pid, true);

    if (can('knight')) {
      const rh = s.board.hexes[s.board.robber];
      let onMe = 0;
      for (const v of rh.v) { const b = s.board.vertices[v].b; if (b && b.owner === pid) onMe += hexPips(s, rh.id) * (b.type === 'city' ? 2 : 1); }
      const la = s.largestArmy;
      const armyGain = P.knights + 1 >= 3 && la.owner !== pid && P.knights + 1 > la.size;
      const winNow = armyGain && myVP + 2 >= E.WIN_VP;
      let play = false;
      if (level === 1) play = Math.random() < 0.3;
      else if (level === 2) play = onMe >= 3 && s.phase === 'roll';
      else if (level === 3) play = onMe >= 3 || armyGain;
      else play = winNow || onMe >= 2 || armyGain || (s.phase === 'roll' && P.dev.knight - P.devNew.knight >= 2) || (la.owner !== pid && la.owner != null && P.knights + 2 > la.size && Math.random() < 0.5);
      if (play) return { type: 'playDev', card: 'knight' };
    }
    if (s.phase !== 'main') return null;
    const g = goals[0];
    if (can('roadBuilding') && level >= 2 && P.roads >= 1 && E.legalRoads(s, pid).length) {
      if (goals.some((x) => x.kind === 'road' || x.kind === 'lroad') || level === 1) return { type: 'playDev', card: 'roadBuilding' };
    }
    if (can('yop') && g) {
      const miss = [];
      for (const r of RES) for (let i = P.res[r]; i < (g.step[r] || 0); i++) miss.push(r);
      if (level === 1 || (miss.length >= 1 && miss.length <= 2)) {
        while (miss.length < 2) {
          const w = weights(s, pid, level);
          const r = RES.slice().sort((a, b) => w[b] / (1 + P.res[b]) - w[a] / (1 + P.res[a]))[0];
          miss.push(r);
        }
        const need = {}; miss.forEach((r) => (need[r] = (need[r] || 0) + 1));
        if (E.has(s.bank, need)) return { type: 'playDev', card: 'yop', res: miss.slice(0, 2) };
      }
    }
    if (can('monopoly') && level >= 2) {
      let best = null, bs = 0;
      for (const r of RES) {
        let cnt = 0;
        s.players.forEach((o) => {
          if (o.id === pid) return;
          if (level >= 4) cnt += o.res[r];
          else cnt += playerProd(s, o.id, 0)[r] / 36 * 2.5;
        });
        const needBonus = g && (g.step[r] || 0) > P.res[r] ? 1.5 : 1;
        if (cnt * needBonus > bs) { bs = cnt * needBonus; best = r; }
      }
      const thr = level >= 4 ? 4 : 3.5;
      if (best && (bs >= thr || level === 1)) return { type: 'playDev', card: 'monopoly', res: best };
    }
    return null;
  }

  // ---------- turno principal ----------
  function mainAction(s, pid, level, mem) {
    const P = s.players[pid];
    mem.steps = (mem.steps || 0) + 1;
    if (mem.steps > 45) return { type: 'endTurn' };
    const ctx = context(s, pid, level);
    const goals = buildGoals(s, pid, level, ctx);

    const dev = considerDev(s, pid, level, mem, goals);
    if (dev) return dev;

    if (level === 1) {
      const opts = [];
      if (P.cities > 0 && E.has(P.res, COST.city) && E.legalCities(s, pid).length) opts.push({ type: 'placeCity', v: pick(E.legalCities(s, pid)) });
      if (P.settlements > 0 && E.has(P.res, COST.settlement)) { const l = E.legalSettlements(s, pid, false); if (l.length) opts.push({ type: 'placeSettlement', v: pick(l) }); }
      if (P.roads > 0 && E.has(P.res, COST.road) && Math.random() < 0.55) { const l = E.legalRoads(s, pid); if (l.length) opts.push({ type: 'placeRoad', e: pick(l) }); }
      if (E.has(P.res, COST.dev) && deckLeft(s) > 0 && Math.random() < 0.35) opts.push({ type: 'buyDev' });
      if (opts.length) return opts[0];
      if (!mem.traded && tot(P.res) >= 6) {
        mem.traded = true;
        const ratios = E.tradeRatios(s, pid);
        const give = RES.find((r) => P.res[r] >= ratios[r]);
        const get = RES.filter((r) => r !== give && P.res[r] === 0 && s.bank[r] > 0);
        if (give && get.length) return { type: 'bankTrade', give, get: pick(get) };
      }
      return { type: 'endTurn' };
    }

    // ejecutar el mejor objetivo asequible entre los primeros
    const topN = level >= 3 ? 2 : 1;
    for (const g of goals.slice(0, topN)) {
      if (E.has(P.res, g.step)) return actionFor(g);
    }
    // intentar completar el objetivo principal con el banco/puertos
    const g = goals[0];
    if (g) {
      const bt = bankTradeToward(s, pid, g.step);
      if (bt) return bt;
      if (level >= 3 && (mem.offers || 0) < (level >= 4 ? 3 : 2)) {
        const off = domesticOffer(s, pid, level, g.step, mem);
        if (off) { mem.offers = (mem.offers || 0) + 1; return off; }
      }
    }
    // segunda opción: cualquier objetivo asequible con buen valor
    for (const x of goals.slice(topN)) {
      if (E.has(P.res, x.step) && (x.score > (g ? g.score * 0.55 : 0) || tot(P.res) > 7)) return actionFor(x);
    }
    // con más de 7 cartas, intentar gastar
    if (level >= 3 && tot(P.res) > 7) {
      for (const x of goals) {
        const bt = bankTradeToward(s, pid, x.step);
        if (bt) return bt;
      }
      if (E.has(P.res, COST.road) && P.roads > 0 && level >= 4) {
        const l = E.legalRoads(s, pid);
        if (l.length) {
          const tg = roadTargets(s, pid, 3).filter((t) => t.path.length);
          return { type: 'placeRoad', e: tg.length ? tg[0].path[0] : l[0] };
        }
      }
    }
    return { type: 'endTurn' };
  }

  // ---------- quién debe actuar ----------
  function whoActs(s) {
    if (!s || s.phase === 'gameOver') return [];
    if (s.phase === 'discard') return Object.keys(s.pendingDiscard || {}).map(Number);
    if (s.trade) {
      const pend = Object.keys(s.trade.responses).map(Number).filter((p) => s.trade.responses[p] === null);
      const anyAccept = Object.values(s.trade.responses).includes('accept');
      return anyAccept || !pend.length ? [s.trade.from, ...pend] : pend;
    }
    return [s.current];
  }

  function decide(s, pid, level, mem) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'discard') return s.pendingDiscard && s.pendingDiscard[pid] ? chooseDiscard(s, pid, level) : null;
    if (s.trade) {
      const T = s.trade;
      if (T.from !== pid) {
        if (T.responses[pid] === null) return { type: 'respondTrade', id: T.id, accept: respond(s, pid, level) };
        return null;
      }
      const acc = Object.keys(T.responses).map(Number).filter((p) => T.responses[p] === 'accept');
      if (acc.length) {
        acc.sort((a, b) => E.vp(s, a, false) - E.vp(s, b, false));
        return { type: 'confirmTrade', with: acc[0] };
      }
      if (Object.values(T.responses).every((x) => x !== null)) return { type: 'cancelTrade' };
      return null;
    }
    if (s.current !== pid) return null;
    switch (s.phase) {
      case 'setup': return s.setup.step === 'settlement' ? setupSettlement(s, pid, level) : setupRoad(s, pid, level);
      case 'roll': {
        if (level >= 2) {
          const ctx = context(s, pid, level);
          const d = considerDev(s, pid, level, mem, buildGoals(s, pid, level, ctx));
          if (d && d.card === 'knight') return d;
        } else if (Math.random() < 0.15) {
          const P = s.players[pid];
          if (!s.devPlayed && P.dev.knight - P.devNew.knight > 0) return { type: 'playDev', card: 'knight' };
        }
        return { type: 'roll' };
      }
      case 'robber': return chooseRobber(s, pid, level);
      case 'roadBuilding': {
        const ctx = context(s, pid, level);
        const goals = buildGoals(s, pid, level, ctx).filter((g) => g.kind === 'road' || g.kind === 'lroad');
        if (goals.length) return { type: 'placeRoad', e: goals[0].e };
        const l = E.legalRoads(s, pid);
        return l.length ? { type: 'placeRoad', e: pick(l) } : { type: 'endRoadBuilding' };
      }
      case 'main': return mainAction(s, pid, level, mem);
    }
    return null;
  }

  // acción de emergencia si la decisión falló
  function fallback(s, pid) {
    if (s.phase === 'discard' && s.pendingDiscard && s.pendingDiscard[pid]) return chooseDiscard(s, pid, 1);
    if (s.trade) {
      if (s.trade.from === pid) return { type: 'cancelTrade' };
      return { type: 'respondTrade', id: s.trade.id, accept: false };
    }
    if (s.current !== pid) return null;
    switch (s.phase) {
      case 'setup':
        return s.setup.step === 'settlement' ? { type: 'placeSettlement', v: E.legalSettlements(s, pid, true)[0] } : { type: 'placeRoad', e: E.legalRoads(s, pid, s.setup.last)[0] };
      case 'roll': return { type: 'roll' };
      case 'robber': return chooseRobber(s, pid, 1);
      case 'roadBuilding': return { type: 'endRoadBuilding' };
      case 'main': return { type: 'endTurn' };
    }
    return null;
  }

  return { LEVELS, BOT_NAMES, decide, fallback, whoActs };
});
