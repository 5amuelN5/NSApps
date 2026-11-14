/* HEXÓPOLIS — perfil de jugador: niveles, rangos, emblemas, logros y experiencia (compartido servidor/navegador) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'));
  else root.Profile = factory(root.Engine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  // experiencia total necesaria para llegar a cada nivel: 0, 100, 300, 600, 1000…
  const xpFor = (lvl) => 50 * lvl * (lvl - 1);
  function levelOf(xp) { let l = 1; while (xpFor(l + 1) <= (xp || 0)) l++; return l; }
  function progress(xp) {
    const l = levelOf(xp), a = xpFor(l), b = xpFor(l + 1);
    return { lvl: l, into: xp - a, need: b - a, pct: Math.round(((xp - a) / (b - a)) * 100), next: b };
  }

  const RANKS = [
    { lvl: 1, name: 'Colono', color: '#9fb3c8' },
    { lvl: 3, name: 'Explorador', color: '#3dff8b' },
    { lvl: 6, name: 'Mercader', color: '#2ec5ff' },
    { lvl: 10, name: 'Constructor', color: '#b57bff' },
    { lvl: 15, name: 'Gobernador', color: '#ffc21e' },
    { lvl: 20, name: 'Leyenda', color: '#ff3b6b' },
  ];
  function rankOf(lvl) { let r = RANKS[0]; for (const x of RANKS) if (lvl >= x.lvl) r = x; return r; }

  const EMBLEMS = [
    { e: '🏠', lvl: 1 }, { e: '🌲', lvl: 1 }, { e: '🐑', lvl: 2 }, { e: '🌾', lvl: 3 }, { e: '🧱', lvl: 4 }, { e: '⛰️', lvl: 5 },
    { e: '⚓', lvl: 6 }, { e: '🎲', lvl: 7 }, { e: '🦹', lvl: 8 }, { e: '⚔️', lvl: 10 }, { e: '🏰', lvl: 12 }, { e: '👑', lvl: 15 }, { e: '🐉', lvl: 18 }, { e: '🌟', lvl: 20 },
  ];
  function emblemOk(e, lvl) { const x = EMBLEMS.find((y) => y.e === e); return !!x && lvl >= x.lvl; }

  const ACH = [
    { key: 'first_game', icon: '🎮', name: 'Primeros pasos', desc: 'Juega tu primera partida.' },
    { key: 'first_win', icon: '🏆', name: 'Primera victoria', desc: 'Gana una partida.' },
    { key: 'streak3', icon: '🔥', name: 'Imparable', desc: 'Gana 3 partidas seguidas.' },
    { key: 'wins10', icon: '🥇', name: 'Campeón', desc: 'Gana 10 partidas.' },
    { key: 'games25', icon: '🎖️', name: 'Veterano', desc: 'Juega 25 partidas.' },
    { key: 'beat_expert', icon: '🤖', name: 'Doma al experto', desc: 'Gana una partida con un bot ★★★★ en la mesa.' },
    { key: 'beat_friends', icon: '👑', name: 'Rey de la mesa', desc: 'Gana una partida con al menos 2 personas más.' },
    { key: 'pure', icon: '🧘', name: 'Sin ayuda', desc: 'Gana sin el camino más largo ni el ejército más grande.' },
    { key: 'comeback', icon: '🚀', name: 'Remontada', desc: 'Gana yendo último a mitad de partida.' },
    { key: 'marathon', icon: '🏃', name: 'Maratón', desc: 'Gana una partida a 14 puntos o más.' },
    { key: 'monopolist', icon: '💰', name: 'Monopolista', desc: 'Llévate 8 cartas o más con un Monopolio.' },
    { key: 'thief', icon: '🦹', name: 'Mano larga', desc: 'Roba 6 cartas o más en una partida.' },
    { key: 'producer', icon: '🌾', name: 'Granero lleno', desc: 'Produce 60 cartas o más en una partida.' },
    { key: 'trader', icon: '🤝', name: 'Negociante', desc: 'Cierra 8 tratos con jugadores en una partida.' },
    { key: 'urbanist', icon: '🏙️', name: 'Urbanista', desc: 'Construye 4 ciudades en una partida.' },
    { key: 'big_table', icon: '🎪', name: 'Casa llena', desc: 'Juega una partida de 7 jugadores.' },
  ];

  function newProfile(id, name) {
    const now = Date.now();
    return { v: 1, id, name: name || 'Jugador', emblem: '🏠', xp: 0, games: 0, wins: 0, streak: 0, best: 0, prod: 0, stole: 0, robbed: 0, trades: 0, vpTotal: 0, ach: [], created: now, updated: now };
  }

  // experiencia y logros de una partida terminada
  // ctx: { state, pid, humansOthers, botLevels: [niveles de los bots rivales], left }
  function applyGame(prof, ctx) {
    const s = ctx.state, pid = ctx.pid, P = s.players[pid];
    const p = JSON.parse(JSON.stringify(prof));
    const before = p.xp, lvlFrom = levelOf(before);
    const st = (s.stats && s.stats.pl && s.stats.pl[pid]) || {};
    const won = !ctx.left && (s.winTeam != null ? E.teamOf(s, pid) === s.winTeam : s.winner === pid);
    const vp = E.vp(s, pid, true), target = E.winVP(s);
    const from = [];
    let xp = 0;
    if (!ctx.left) {
      xp += 25; from.push(['Partida jugada', 25]);
      const byVp = Math.round(Math.min(1, vp / target) * 40); xp += byVp; from.push([`${vp} puntos`, byVp]);
      if (won) { xp += 60; from.push(['Victoria', 60]); }
      // premios del resumen (sin empates)
      const bestOf = (fn) => { const vals = s.players.map((_, i) => fn(i)); const m = Math.max(...vals); return m > 0 && vals.filter((x) => x === m).length === 1 ? vals.indexOf(m) : -1; };
      const pl = (i, k) => (s.stats && s.stats.pl && s.stats.pl[i] && s.stats.pl[i][k]) || 0;
      let aw = 0;
      if (bestOf((i) => pl(i, 'prod')) === pid) aw++;
      if (bestOf((i) => pl(i, 'stole')) === pid) aw++;
      if (bestOf((i) => pl(i, 'trades') + pl(i, 'bank')) === pid) aw++;
      if (s.longestRoad.owner === pid) aw++;
      if (s.largestArmy.owner === pid) aw++;
      if (aw) { xp += aw * 8; from.push([`${aw} ${aw === 1 ? 'premio' : 'premios'}`, aw * 8]); }
      // contra bots se gana menos; más puntos para ganar → algo más de experiencia
      let mult = Math.max(0.6, Math.min(1.3, target / 10));
      if (!ctx.humansOthers) {
        const avg = ctx.botLevels.length ? ctx.botLevels.reduce((a, b) => a + b, 0) / ctx.botLevels.length : 1;
        mult *= 0.3 + 0.15 * avg;
      }
      xp = Math.round(xp * mult);
    }
    p.xp += xp; p.games++;
    if (won) { p.wins++; p.streak++; p.best = Math.max(p.best, p.streak); } else p.streak = 0;
    p.prod += st.prod || 0; p.stole += st.stole || 0; p.robbed += st.robbed || 0; p.trades += st.trades || 0; p.vpTotal += vp;
    // logros
    const got = new Set(p.ach), newAch = [];
    const give = (k, cond) => { if (cond && !got.has(k)) { got.add(k); newAch.push(k); } };
    give('first_game', p.games >= 1);
    give('first_win', won);
    give('streak3', p.streak >= 3);
    give('wins10', p.wins >= 10);
    give('games25', p.games >= 25);
    give('beat_expert', won && ctx.botLevels.includes(4));
    give('beat_friends', won && ctx.humansOthers >= 2);
    give('pure', won && s.longestRoad.owner !== pid && s.largestArmy.owner !== pid);
    const hist = (s.stats && s.stats.vpHist) || [];
    if (won && hist.length >= 4) { const mid = hist[Math.floor(hist.length / 2)]; give('comeback', mid[pid] < Math.min(...mid.filter((_, i) => i !== pid))); }
    give('marathon', won && target >= 14);
    give('monopolist', !ctx.left && (st.monopoly || 0) >= 8);
    give('thief', !ctx.left && (st.stole || 0) >= 6);
    give('producer', !ctx.left && (st.prod || 0) >= 60);
    give('trader', !ctx.left && (st.trades || 0) >= 8);
    give('urbanist', !ctx.left && E.piecesOf(s).cities - P.cities >= 4);
    give('big_table', !ctx.left && s.players.length >= 7);
    p.ach = ACH.map((a) => a.key).filter((k) => got.has(k));
    p.updated = Date.now();
    return { profile: p, gain: { xp, from, total: p.xp, lvlFrom, lvlTo: levelOf(p.xp), newAch, won } };
  }

  return { xpFor, levelOf, progress, RANKS, rankOf, EMBLEMS, emblemOk, ACH, newProfile, applyGame };
});
