// DOMINIUM — perfil de jugador: niveles, rangos, emblemas, logros y experiencia (compartido servidor/navegador)
// Funciona igual que el perfil de Hexópolis: el servidor firma el perfil y el navegador lo guarda.

// experiencia total para cada nivel: 0, 100, 300, 600, 1000… (+100 por nivel hasta el 25; después 2500 por nivel)
export const MAX_LVL = 100;
const SOFT = 25;
export const xpFor = (lvl) => (lvl <= SOFT ? 50 * lvl * (lvl - 1) : 50 * SOFT * (SOFT - 1) + (lvl - SOFT) * 2500);
export function levelOf(xp) { let l = 1; while (l < MAX_LVL && xpFor(l + 1) <= (xp || 0)) l++; return l; }
export function progress(xp) {
  xp = xp || 0;
  const l = levelOf(xp);
  if (l >= MAX_LVL) return { lvl: l, into: xp - xpFor(l), need: 0, pct: 100, next: null, max: true };
  const a = xpFor(l), b = xpFor(l + 1);
  return { lvl: l, into: xp - a, need: b - a, pct: Math.round(((xp - a) / (b - a)) * 100), next: b, max: false };
}

export const RANKS = [
  { lvl: 1, name: 'Recluta', color: '#9fb3c8' },
  { lvl: 3, name: 'Cabo', color: '#46b37b' },
  { lvl: 6, name: 'Sargento', color: '#3f8cf0' },
  { lvl: 10, name: 'Teniente', color: '#9a6cea' },
  { lvl: 15, name: 'Capitán', color: '#f2b33d' },
  { lvl: 20, name: 'Comandante', color: '#e2564d' },
  { lvl: 25, name: 'Coronel', color: '#ee8a3a' },
  { lvl: 30, name: 'General', color: '#2bb8bd' },
  { lvl: 40, name: 'Mariscal', color: '#b8e04a' },
  { lvl: 50, name: 'Gran Mariscal', color: '#e2609f' },
  { lvl: 75, name: 'Emperador', color: '#ffe066' },
  { lvl: 100, name: 'Señor del Mundo', color: '#ffffff' },
];
export function rankOf(lvl) { let r = RANKS[0]; for (const x of RANKS) if (lvl >= x.lvl) r = x; return r; }

export const EMBLEMS = [
  { e: '🪖', lvl: 1 }, { e: '🚩', lvl: 1 }, { e: '🛡️', lvl: 2 }, { e: '🧭', lvl: 3 }, { e: '🗺️', lvl: 4 }, { e: '🐎', lvl: 5 },
  { e: '💣', lvl: 6 }, { e: '🎲', lvl: 7 }, { e: '🎯', lvl: 8 }, { e: '⚔️', lvl: 10 }, { e: '🏰', lvl: 12 }, { e: '🎖️', lvl: 15 }, { e: '🦅', lvl: 18 }, { e: '👑', lvl: 20 },
  { e: '🐉', lvl: 25 }, { e: '🔱', lvl: 30 }, { e: '🌋', lvl: 35 }, { e: '🌍', lvl: 40 }, { e: '☄️', lvl: 50 }, { e: '🏛️', lvl: 60 }, { e: '🗿', lvl: 75 }, { e: '💎', lvl: 100 },
];
export function emblemOk(e, lvl) { const x = EMBLEMS.find((y) => y.e === e); return !!x && lvl >= x.lvl; }

export const ACH = [
  { key: 'first_game', icon: '🎮', name: 'Primeros pasos', desc: 'Juega tu primera partida.' },
  { key: 'first_win', icon: '🏆', name: 'Primera victoria', desc: 'Gana una partida.' },
  { key: 'streak3', icon: '🔥', name: 'Imparable', desc: 'Gana 3 partidas seguidas.' },
  { key: 'wins10', icon: '🥇', name: 'Campeón', desc: 'Gana 10 partidas.' },
  { key: 'games25', icon: '🎖️', name: 'Veterano', desc: 'Juega 25 partidas.' },
  { key: 'beat_expert', icon: '🤖', name: 'Doma al Mariscal', desc: 'Gana una partida con un bot Mariscal en la mesa.' },
  { key: 'beat_friends', icon: '👑', name: 'Rey de la mesa', desc: 'Gana una partida con al menos 2 personas más.' },
  { key: 'conqueror', icon: '🗡️', name: 'Conquistador', desc: 'Conquista 20 territorios o más en una partida.' },
  { key: 'exterminator', icon: '☠️', name: 'Exterminador', desc: 'Elimina a 3 jugadores en una misma partida.' },
  { key: 'comeback', icon: '🚀', name: 'Remontada', desc: 'Gana yendo último en territorios a mitad de partida.' },
  { key: 'blitz', icon: '⚡', name: 'Guerra relámpago', desc: 'Gana una partida en 8 rondas o menos.' },
  { key: 'spy', icon: '🕵️', name: 'Agente secreto', desc: 'Gana cumpliendo tu misión secreta.' },
  { key: 'collector', icon: '🃏', name: 'Coleccionista', desc: 'Canjea cartas 3 veces en una partida.' },
  { key: 'fortress', icon: '🏯', name: 'Fortaleza', desc: 'Termina una partida con 30 ejércitos o más en un territorio.' },
  { key: 'globetrotter', icon: '✈️', name: 'Trotamundos', desc: 'Termina partidas en 5 mapas distintos.' },
  { key: 'big_table', icon: '🎪', name: 'Casa llena', desc: 'Juega una partida de 8 jugadores.' },
];

export const MODE_KEYS = ['dominacion', 'misiones', 'capitales', 'porcentaje', 'equipos', 'bots'];
const BOT_RANK = { recluta: 1, soldado: 2, general: 3, mariscal: 4 };

export function newProfile(id, name) {
  const now = Date.now();
  return { v: 1, id, name: name || 'Comandante', emblem: '🪖', xp: 0, games: 0, wins: 0, streak: 0, best: 0, conq: 0, kills: 0, destroyed: 0, trades: 0, maps: [], ach: [], modes: {}, created: now, updated: now };
}

function emptyMode() { return { games: 0, wins: 0, streak: 0, best: 0, conq: 0, kills: 0, destroyed: 0, trades: 0 }; }
function addTo(M, won, st) {
  M.games++;
  if (won) { M.wins++; M.streak++; M.best = Math.max(M.best, M.streak); } else M.streak = 0;
  M.conq += st.conquered || 0; M.kills += st.kills || 0; M.destroyed += st.battlesWon || 0; M.trades += st.trades || 0;
}

// Experiencia y logros de una partida terminada.
// ctx: { state, pid, mapId, left, humansOthers, botLevels: ['recluta'…] }
export function applyGame(prof, ctx) {
  const s = ctx.state, pid = ctx.pid;
  const p = JSON.parse(JSON.stringify(prof));
  p.modes = p.modes || {}; p.maps = p.maps || []; p.ach = p.ach || [];
  const lvlFrom = levelOf(p.xp);
  const st = (s.players[pid] && s.players[pid].stats) || {};
  const won = !ctx.left && (s.winner === pid || (s.winTeam != null && s.players[pid] && s.players[pid].team === s.winTeam));
  const T = s.owners.length;
  const mine = s.owners.filter((o) => o === pid).length;
  const from = [];
  let xp = 0;
  if (!ctx.left) {
    xp += 25; from.push(['Partida jugada', 25]);
    const byShare = Math.round((won ? 1 : Math.min(1, mine / T)) * 40); xp += byShare; from.push([won ? 'Todo el mapa' : `${mine} de ${T} territorios`, byShare]);
    if (won) { xp += 60; from.push(['Victoria', 60]); }
    // premios de la partida (sin empates)
    const bestOf = (k) => { const v = s.players.map((x) => (x.neutral ? -1 : (x.stats && x.stats[k]) || 0)); const m = Math.max(...v); return m > 0 && v.filter((y) => y === m).length === 1 ? v.indexOf(m) : -1; };
    let aw = 0;
    if (bestOf('conquered') === pid) aw++;
    if (bestOf('kills') === pid) aw++;
    if (bestOf('battlesWon') === pid) aw++;
    if (aw) { xp += aw * 8; from.push([`${aw} ${aw === 1 ? 'premio' : 'premios'}`, aw * 8]); }
    // contra bots se gana menos (más cuanto mejores sean los bots)
    if (!ctx.humansOthers) {
      const lv = ctx.botLevels.map((b) => BOT_RANK[b] || 2);
      const avg = lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : 1;
      xp = Math.round(xp * (0.3 + 0.15 * avg));
    }
  }
  p.xp += xp;
  addTo(p, won, st);
  const objective = ['misiones', 'capitales', 'porcentaje'].includes(s.settings && s.settings.objective) ? s.settings.objective : 'dominacion';
  addTo(p.modes[objective] || (p.modes[objective] = emptyMode()), won, st);
  if (s.settings && s.settings.teams === 'si') addTo(p.modes.equipos || (p.modes.equipos = emptyMode()), won, st);
  if (!ctx.humansOthers) addTo(p.modes.bots || (p.modes.bots = emptyMode()), won, st);
  if (!ctx.left && ctx.mapId && !p.maps.includes(ctx.mapId)) p.maps.push(ctx.mapId);

  // logros
  const got = new Set(p.ach), newAch = [];
  const give = (k, cond) => { if (cond && !got.has(k)) { got.add(k); newAch.push(k); } };
  give('first_game', p.games >= 1);
  give('first_win', won);
  give('streak3', p.streak >= 3);
  give('wins10', p.wins >= 10);
  give('games25', p.games >= 25);
  give('beat_expert', won && ctx.botLevels.includes('mariscal'));
  give('beat_friends', won && ctx.humansOthers >= 2);
  give('conqueror', !ctx.left && (st.conquered || 0) >= 20);
  give('exterminator', !ctx.left && (st.kills || 0) >= 3);
  const H = s.history || [];
  if (won && H.length >= 6) {
    const mid = H[Math.floor(H.length / 2)];
    const others = mid.filter((_, i) => i !== pid && !s.players[i].neutral && mid[i] > 0);
    give('comeback', others.length > 0 && mid[pid] < Math.min(...others));
  }
  give('blitz', won && (s.round || 99) <= 8);
  give('spy', won && /Misión/.test(s.winReason || ''));
  give('collector', !ctx.left && (st.trades || 0) >= 3);
  give('fortress', !ctx.left && s.armies.some((a, t) => s.owners[t] === pid && a >= 30));
  give('globetrotter', p.maps.length >= 5);
  give('big_table', !ctx.left && s.players.filter((x) => !x.neutral).length >= 8);
  p.ach = ACH.map((a) => a.key).filter((k) => got.has(k));
  p.updated = Date.now();
  return { profile: p, gain: { xp, from, total: p.xp, lvlFrom, lvlTo: levelOf(p.xp), newAch, won } };
}
