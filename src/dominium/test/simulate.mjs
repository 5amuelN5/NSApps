// Simulación masiva de partidas entre bots para validar reglas e invariantes.
// Uso: node test/simulate.mjs [partidasPorMapa]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph, Game, territoriesOf, reinforcementBreakdown, isValidSet, tradeValue, fixedSetValue, winProbability } from '../shared/engine.js';
import { botStep, botAnswerPact } from '../shared/bots.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = Number(process.argv[2] || 6);

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function syntheticMap() {
  const W = 7, H = 6, terr = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const adj = [];
    if (x > 0) adj.push(`t${y}_${x - 1}`); if (x < W - 1) adj.push(`t${y}_${x + 1}`);
    if (y > 0) adj.push(`t${y - 1}_${x}`); if (y < H - 1) adj.push(`t${y + 1}_${x}`);
    terr.push({ id: `t${y}_${x}`, name: `T${y}${x}`, region: `r${Math.floor(y / 2)}${Math.floor(x / 4)}`, adj });
  }
  const regions = [...new Set(terr.map((t) => t.region))].map((id) => ({ id, name: id, bonus: 3 }));
  return { id: 'sintetico', name: 'Sintético', territories: terr, regions, links: [] };
}

// --- comprobaciones unitarias de reglas
function assert(c, msg) { if (!c) { console.error('FALLO:', msg); process.exitCode = 1; throw new Error(msg); } }
assert(isValidSet([{ k: 0 }, { k: 0 }, { k: 0 }]), 'trío igual');
assert(isValidSet([{ k: 0 }, { k: 1 }, { k: 2 }]), 'uno de cada');
assert(!isValidSet([{ k: 0 }, { k: 0 }, { k: 1 }]), 'combinación inválida');
assert(isValidSet([{ k: 0 }, { k: 1 }, { k: 3 }]), 'con comodín');
assert([0, 1, 2, 3, 4, 5, 6, 7].map((i) => tradeValue(i, 'progresivo')).join() === '4,6,8,10,12,15,20,25', 'valores progresivos');
assert(fixedSetValue([{ k: 2 }, { k: 2 }, { k: 2 }]) === 8 && fixedSetValue([{ k: 0 }, { k: 1 }, { k: 2 }]) === 10, 'valores fijos');
assert(Math.abs(winProbability(1, 1) - 15 / 36) < 1e-9, 'prob 1v1');
assert(winProbability(10, 3) > 0.9, 'prob 10v3');

// --- prueba dirigida de combate y conquista
{
  const g = buildGraph(syntheticMap());
  const game = Game.create(g, [{ name: 'A' }, { name: 'B' }, { name: 'C' }], { setup: 'rapido' }, mulberry(1));
  const s = game.state;
  for (const p of [0, 1, 2]) while (s.pool[p] > 0) game.apply(p, { type: 'setup', t: territoriesOf(s, p)[0], n: s.pool[p] });
  assert(s.phase === 'reinforce', 'empieza la partida tras desplegar');
  const p = s.current;
  const rb = reinforcementBreakdown(g, s, p);
  assert(s.reinforcements === rb.total && rb.total >= 3, 'refuerzos correctos');
  assert(!game.apply(p, { type: 'attack', from: 0, to: 1 }).ok, 'no se puede atacar en refuerzo');
  const own = territoriesOf(s, p);
  game.apply(p, { type: 'place', t: own[0], n: s.reinforcements });
  assert(s.phase === 'attack', 'pasa a ataque');
  const other = (p + 1) % 3;
  assert(!game.apply(other, { type: 'endTurn' }).ok, 'solo el jugador activo actúa');
}

// --- partidas completas entre bots
const levels = ['recluta', 'soldado', 'general', 'mariscal'];
let maps = [];
const idx = path.join(root, 'public/maps/index.json');
if (fs.existsSync(idx)) {
  maps = JSON.parse(fs.readFileSync(idx, 'utf8')).map((m) => JSON.parse(fs.readFileSync(path.join(root, 'public/maps', `${m.id}.json`), 'utf8')));
}
maps.unshift(syntheticMap());

const wins = Object.fromEntries(levels.map((l) => [l, 0]));
let games = 0, totalTurns = 0;
for (const map of maps) {
  const g = buildGraph(map);
  const t0 = Date.now();
  for (let k = 0; k < N; k++) {
    const seed = 1000 + k * 7919 + map.id.length;
    const rng = mulberry(seed);
    const nPlayers = 2 + (k % 5);
    const players = Array.from({ length: nPlayers }, (_, i) => ({ name: `B${i}`, bot: levels[(i + k) % 4] }));
    const objectives = ['dominacion', 'misiones', 'capitales', 'porcentaje'];
    const teams = nPlayers >= 4 && k % 5 === 3 ? 'si' : 'no';
    if (teams === 'si') players.forEach((pl, i) => (pl.team = i % 2));
    const settings = {
      setup: k % 3 === 0 ? 'clasico' : 'rapido',
      cards: k % 2 ? 'fijo' : 'progresivo',
      fortify: k % 4 === 1 ? 'adyacente' : 'conectado',
      objective: objectives[k % 4],
      teams,
    };
    const game = Game.create(g, players, settings, rng);
    const s = game.state;
    let steps = 0;
    while (s.phase !== 'over' && steps < 200000 && s.turn < 1500) {
      const actors = game.actors();
      for (const p of actors) botStep(game, p, s.players[p].bot);
      steps++;
      // pactos entre bots de vez en cuando (y los ataques deben respetarlos)
      if (s.phase !== 'over' && steps % 37 === 0) {
        const alive = s.players.map((_, i) => i).filter((i) => s.players[i].alive && !s.players[i].neutral);
        const a = alive[Math.floor(rng() * alive.length)], b = alive[Math.floor(rng() * alive.length)];
        if (a !== b && game.apply(a, { type: 'pact', to: b, rounds: 3 }).ok) game.apply(b, { type: 'answerPact', from: a, accept: botAnswerPact(game, b, a, s.players[b].bot) });
      }
      // invariantes
      if (s.phase !== 'claim') {
        for (let t = 0; t < g.n; t++) {
          if (s.owners[t] < 0) throw new Error(`${map.id}: territorio ${t} sin dueño en fase ${s.phase}`);
          const pendingTo = s.pending && s.pending.to === t;
          if (s.armies[t] < 1 && !pendingTo) throw new Error(`${map.id}: territorio ${g.ids[t]} con ${s.armies[t]} ejércitos (fase ${s.phase})`);
        }
      }
      const lastBattle = s.events[s.events.length - 1];
      if (lastBattle && lastBattle.type === 'battle' && lastBattle.seq === s.seq && lastBattle.def >= 0 && lastBattle.def !== undefined) {
        const att = lastBattle.p, def = lastBattle.def;
        if (s.players[att].team != null && s.players[att].team === s.players[def].team) throw new Error(`${map.id}: ataque entre compañeros de equipo`);
      }
      for (const [i, pl] of s.players.entries()) {
        if (pl.alive && s.phase !== 'claim' && !pl.neutral && territoriesOf(s, i).length === 0) throw new Error(`${map.id}: jugador ${i} vivo sin territorios`);
        if (s.phase === 'reinforce' && s.current === i && pl.cards.length > 6 + 3) throw new Error('mano demasiado grande');
      }
    }
    games++;
    totalTurns += s.turn;
    if (s.phase !== 'over') {
      console.log(`  ${map.id} #${k}: sin ganador tras ${s.turn} turnos (${nPlayers} jugadores, ${JSON.stringify(settings)})`);
    } else {
      const w = s.players[s.winner];
      wins[w.bot]++;
      if (process.env.VERBOSE) console.log(`  ${map.id} #${k}: gana ${w.name} (${w.bot}) en ${s.turn} turnos — ${s.winReason}`);
    }
  }
  console.log(`✔ ${map.id.padEnd(10)} ${g.n} territorios — ${N} partidas en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
console.log(`\n${games} partidas, media ${(totalTurns / games).toFixed(0)} turnos. Victorias por nivel:`, wins);
