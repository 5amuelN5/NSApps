// Simulación headless: partidas bot vs bot para validar reglas e IA
const E = require('./shared/engine');
const B = require('./shared/bots');
const N = +process.argv[2] || 200;
const levels = (process.argv[3] || '1,2,3,4').split(',').map(Number);
const wins = {}; let turns = 0, stuck = 0, errors = 0;
for (let g = 0; g < N; g++) {
  // rotar asientos para evitar ventaja de posición
  const lv = levels.map((_, i) => levels[(i + g) % levels.length]);
  const s = E.createGame(lv.map((l, i) => ({ name: 'L' + l + '_' + i, bot: l })), { seed: g * 7919 + 1 });
  const mem = lv.map(() => ({ offerKeys: [] }));
  let steps = 0, lastTurn = -1;
  while (s.phase !== 'gameOver' && steps < 20000) {
    steps++;
    if (s.turn !== lastTurn) { lastTurn = s.turn; mem.forEach((m, i) => (mem[i] = { offerKeys: [] })); }
    const actors = B.whoActs(s);
    let acted = false;
    for (const pid of actors) {
      let a = B.decide(s, pid, s.players[pid].bot, mem[pid]);
      if (!a) continue;
      let r = E.apply(s, pid, a);
      if (!r.ok) { errors++; if (errors < 15) console.log('ERR', s.phase, JSON.stringify(a), r.error); a = B.fallback(s, pid); r = a ? E.apply(s, pid, a) : { ok: false }; }
      if (r.ok) { acted = true; break; }
    }
    if (!acted) { stuck++; console.log('STUCK', s.phase, actors, JSON.stringify(s.trade)); break; }
  }
  if (s.winner != null) { const l = s.players[s.winner].bot; wins[l] = (wins[l] || 0) + 1; turns += s.turn; }
  else console.log('no winner game', g, s.phase, s.turn);
}
console.log('wins by level', wins, 'avg turns', (turns / N).toFixed(1), 'stuck', stuck, 'errors', errors);
