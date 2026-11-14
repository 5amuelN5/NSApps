#!/usr/bin/env node
// Validates public/maps/*.json + index.json. Exit code 1 on any error. No dependencies.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '..', 'public', 'maps');
const ORDER = ['clasico', 'europa', 'africa', 'americas', 'asia', 'espana', 'eeuu'];
const MAX_BYTES = 450 * 1024;
let errors = 0, warnings = 0;
const err = (m, s) => { errors++; console.log(`  ERROR [${m}] ${s}`); };
const warn = (m, s) => { warnings++; console.log(`  warn  [${m}] ${s}`); };

function parsePath(d) {
  // only M, L, Z with absolute coordinates; returns rings
  const rings = [];
  let cur = null;
  const re = /([MLZ])|(-?\d+(?:\.\d+)?)/g;
  const nums = [];
  let cmd = null, m, bad = false;
  const flush = () => {
    if (nums.length % 2) bad = true;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const p = [nums[i], nums[i + 1]];
      if (cmd === 'M' && i === 0) { cur = [p]; rings.push(cur); } else if (cur) cur.push(p); else bad = true;
    }
    nums.length = 0;
  };
  const stripped = d.replace(/[MLZ,\s\d.-]/g, '');
  if (stripped.length) bad = true;
  while ((m = re.exec(d))) {
    if (m[1]) { flush(); cmd = m[1]; if (cmd === 'Z') cur = null; }
    else nums.push(parseFloat(m[2]));
  }
  flush();
  return { rings, bad };
}
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; }
function pip(pt, rings) {
  let inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function edgeDist(p, rings) {
  let m = Infinity;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) m = Math.min(m, segDist(p, r[j], r[i]));
  return m;
}

const CLASICO_BONUS = { na: 5, sa: 2, eu: 5, af: 3, as: 7, oc: 2 };
const SLUG = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

// index
let index = [];
try { index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch (e) { err('index', 'cannot read index.json: ' + e.message); }
if (JSON.stringify(index.map((e) => e.id)) !== JSON.stringify(ORDER)) err('index', `order/ids ${index.map((e) => e.id)} != ${ORDER}`);

const rows = [];
for (const id of ORDER) {
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) { err(id, 'missing file'); continue; }
  const bytes = fs.statSync(file).size;
  console.log(`\n${id}.json`);
  let m;
  try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { err(id, 'invalid JSON'); continue; }
  const keys = Object.keys(m).sort().join(',');
  if (keys !== 'decor,description,height,id,links,name,regions,territories,width') err(id, `unexpected top-level keys: ${keys}`);
  if (m.id !== id) err(id, `id mismatch ${m.id}`);
  if (m.width !== 1600) err(id, 'width must be 1600');
  if (!Number.isInteger(m.height) || m.height <= 0) err(id, 'height must be a positive int');
  if (typeof m.name !== 'string' || !m.name || typeof m.description !== 'string' || !m.description) err(id, 'name/description');
  if (typeof m.decor !== 'string') err(id, 'decor must be a string');
  if (bytes >= MAX_BYTES) err(id, `file too large: ${bytes} bytes`);

  const ie = index.find((e) => e.id === id);
  if (ie) {
    if (ie.name !== m.name || ie.description !== m.description) err(id, 'index name/description mismatch');
    if (ie.territories !== m.territories.length || ie.regions !== m.regions.length) err(id, 'index counts mismatch');
    if (ie.recommendedPlayers !== '2-6') err(id, 'index recommendedPlayers');
  }

  // regions
  const R = new Map();
  for (const r of m.regions) {
    if (!SLUG.test(r.id)) err(id, `bad region id ${r.id}`);
    if (R.has(r.id)) err(id, `duplicate region ${r.id}`);
    R.set(r.id, r);
    if (!r.name) err(id, `region ${r.id} without name`);
    if (!Number.isInteger(r.bonus) || r.bonus < 1) err(id, `region ${r.id} bad bonus ${r.bonus}`);
    if (!/^#[0-9a-f]{6}$/i.test(r.color)) err(id, `region ${r.id} bad color ${r.color}`);
  }

  // territories
  const T = new Map();
  let minClear = Infinity, minClearId = '';
  for (const t of m.territories) {
    if (!SLUG.test(t.id)) err(id, `bad territory id "${t.id}"`);
    if (T.has(t.id)) err(id, `duplicate territory ${t.id}`);
    T.set(t.id, t);
    const tk = Object.keys(t).sort().join(',');
    if (tk !== 'adj,cx,cy,id,name,path,region') err(id, `${t.id}: unexpected keys ${tk}`);
    if (!t.name) err(id, `${t.id}: empty name`);
    if (!R.has(t.region)) err(id, `${t.id}: unknown region ${t.region}`);
    const { rings, bad } = parsePath(t.path);
    if (bad || !rings.length) { err(id, `${t.id}: unparsable path`); continue; }
    if (/\d\.\d\d/.test(t.path)) err(id, `${t.id}: path has more than 1 decimal`);
    for (const r of rings) {
      if (r.length < 3) err(id, `${t.id}: ring with <3 points`);
      for (const [x, y] of r) if (x < 0 || y < 0 || x > m.width || y > m.height) { err(id, `${t.id}: point outside viewBox ${x},${y}`); break; }
    }
    if (typeof t.cx !== 'number' || typeof t.cy !== 'number') { err(id, `${t.id}: cx/cy`); continue; }
    if (!pip([t.cx, t.cy], rings)) err(id, `${t.id}: label point (${t.cx},${t.cy}) outside territory`);
    const clear = edgeDist([t.cx, t.cy], rings);
    if (clear < minClear) { minClear = clear; minClearId = t.id; }
    // label must be inside the largest polygon (outer ring with the largest area)
    const outers = rings.filter((r) => ringArea(r) > 0).sort((a, b) => ringArea(b) - ringArea(a));
    if (outers.length && !pip([t.cx, t.cy], [outers[0]])) warn(id, `${t.id}: label not in largest polygon`);
  }
  for (const r of R.keys()) if (![...T.values()].some((t) => t.region === r)) err(id, `empty region ${r}`);

  // adjacency
  let edges = 0;
  for (const t of T.values()) {
    if (!Array.isArray(t.adj) || !t.adj.length) { err(id, `${t.id}: no neighbours`); continue; }
    if (new Set(t.adj).size !== t.adj.length) err(id, `${t.id}: duplicate neighbours`);
    for (const o of t.adj) {
      if (o === t.id) err(id, `${t.id}: self adjacency`);
      else if (!T.has(o)) err(id, `${t.id}: unknown neighbour ${o}`);
      else if (!T.get(o).adj.includes(t.id)) err(id, `asymmetric adjacency ${t.id} -> ${o}`);
      if (t.id < o) edges++;
    }
  }
  // links
  const LS = new Set();
  for (const l of m.links) {
    const lk = Object.keys(l).sort().join(',');
    if (lk !== 'a,b' && lk !== 'a,b,wrap') err(id, `link with unexpected keys ${lk}`);
    if (!T.has(l.a) || !T.has(l.b)) { err(id, `link to unknown id ${l.a}-${l.b}`); continue; }
    const k = [l.a, l.b].sort().join('|');
    if (LS.has(k)) err(id, `duplicate link ${k}`);
    LS.add(k);
    if (!T.get(l.a).adj.includes(l.b)) err(id, `link ${k} not in adjacency`);
    if ('wrap' in l && l.wrap !== true) err(id, `link ${k} wrap must be true when present`);
  }
  // connectivity
  const start = m.territories[0]?.id;
  const seen = new Set([start]);
  const st = [start];
  while (st.length) for (const o of T.get(st.pop())?.adj || []) if (!seen.has(o)) { seen.add(o); st.push(o); }
  if (seen.size !== T.size) err(id, `graph not connected: reached ${seen.size}/${T.size}`);

  // bonus rule
  for (const r of R.values()) {
    const ts = [...T.values()].filter((t) => t.region === r.id);
    if (id === 'clasico') {
      if (CLASICO_BONUS[r.id] !== r.bonus) err(id, `official bonus for ${r.id} should be ${CLASICO_BONUS[r.id]}`);
    } else {
      const b = ts.filter((t) => t.adj.some((o) => T.get(o)?.region !== r.id)).length;
      const want = Math.max(1, Math.floor((ts.length + b) / 2.5));
      if (want !== r.bonus) err(id, `region ${r.id} bonus ${r.bonus} != formula ${want}`);
    }
  }
  if (id === 'clasico') {
    if (T.size !== 42) err(id, `classic map must have 42 territories (has ${T.size})`);
    if (edges !== 83) err(id, `classic map must have 83 borders (has ${edges})`);
  }
  if (minClear < 3) warn(id, `tight label: ${minClearId} has ${minClear.toFixed(1)}px to its border`);

  console.log(`  ${T.size} territories, ${edges} borders (${m.links.length} sea links${m.links.some((l) => l.wrap) ? ', wrap' : ''}), ${(bytes / 1024).toFixed(1)} KB, ${m.width}x${m.height}, decor ${m.decor ? 'yes' : 'no'}`);
  console.log('  regions: ' + m.regions.map((r) => `${r.name} (${[...T.values()].filter((t) => t.region === r.id).length}) +${r.bonus}`).join(', '));
  rows.push([id, T.size, R.size, m.links.length, (bytes / 1024).toFixed(1) + ' KB']);
}

console.log('\nSUMMARY');
for (const r of rows) console.log(`  ${r[0].padEnd(9)} territories ${String(r[1]).padStart(3)}  regions ${String(r[2]).padStart(2)}  links ${String(r[3]).padStart(2)}  ${r[4]}`);
console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
