// "Tierras de Aeloria": original procedural fantasy continent (deterministic seed).
// Landmass = gaussian-ish blobs + fractal value noise; land is sampled with Lloyd-relaxed Voronoi cells;
// territories grow from farthest-point seeds with balanced round-robin growth; regions grow over the
// territory graph. Cells are fed to the normal pipeline (shared-arc topology -> smooth simplified borders).
import { Delaunay } from 'd3-delaunay';
import { geoIdentity } from 'd3-geo';
import { slug } from '../lib/names.mjs';

const SEED = 20261114;
const W = 1600, H = 1120, SPACING = 12, TERRITORIES = 43;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rng) {
  const N = 256, perm = new Uint16Array(N * 2), val = new Float64Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; val[i] = rng(); }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < N; i++) perm[N + i] = perm[i];
  const v = (x, y) => val[perm[(perm[x & 255] + y) & 511] & 255];
  const s = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    const u = s(xf), w = s(yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  return (x, y, oct = 5) => { let f = 0, amp = 0.5, fr = 1, norm = 0; for (let o = 0; o < oct; o++) { f += amp * noise(x * fr, y * fr); norm += amp; amp *= 0.5; fr *= 2.03; } return f / norm; };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function polyCentroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const f = poly[i][0] * poly[i + 1][1] - poly[i + 1][0] * poly[i][1];
    a += f; cx += (poly[i][0] + poly[i + 1][0]) * f; cy += (poly[i][1] + poly[i + 1][1]) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

// ------------------------------------------------------------------ names
const STARTS = ['Al', 'Bel', 'Cal', 'Dor', 'El', 'Fal', 'Gar', 'Hal', 'Ir', 'Kel', 'Lor', 'Mal', 'Nar', 'Or', 'Pel', 'Quel', 'Ros', 'Sal', 'Tal', 'Ul',
  'Val', 'Zar', 'Ar', 'Bran', 'Cor', 'Del', 'Est', 'Fen', 'Gal', 'Mor', 'Ner', 'Ost', 'Tor', 'Ves', 'Ald', 'Mir', 'Sel', 'Tir', 'Um', 'Lun', 'Ber', 'Cas', 'Elen', 'Sar'];
const MIDS = ['a', 'e', 'i', 'o', 'en', 'el', 'ir', 'on', 'ad', 'es', 'ul', 'ov'];
const ENDS = ['ia', 'ona', 'ena', 'ondo', 'ería', 'ado', 'eda', 'ín', 'illa', 'era', 'ino', 'osa', 'urna', 'ancia', 'ente', 'oria', 'ael', 'ión', 'umbre', 'ástor', 'eira', 'iel', 'ous', 'anda'];
const BLOCK = new Set(['Tirana', 'Verona', 'Valencia', 'Castilla', 'Galicia', 'Pelado', 'Salado', 'Cordel', 'Morena', 'Molina', 'Almería', 'Sevilla', 'Ruina', 'Malena', 'Elena', 'Marina']);
const THEMES = {
  norte: ['Picos de {}', 'Paso de {}', 'Fiordos de {}', 'Glaciar de {}', 'Montes de {}', 'Marca de {}'],
  costa: ['Puerto {}', 'Bahía de {}', 'Cabo {}', 'Costa de {}', 'Faro de {}', 'Acantilados de {}'],
  desierto: ['Dunas de {}', 'Oasis de {}', 'Salinas de {}', 'Erial de {}', 'Cañones de {}', 'Yermo de {}'],
  pantano: ['Ciénaga de {}', 'Marismas de {}', 'Fangal de {}', 'Juncales de {}', 'Brumas de {}', 'Charcas de {}'],
  bosque: ['Bosque de {}', 'Arboleda de {}', 'Selva de {}', 'Robledal de {}', 'Espesura de {}', 'Hayedo de {}'],
  llanura: ['Vega de {}', 'Campos de {}', 'Valle de {}', 'Llanos de {}', 'Colinas de {}', 'Trigales de {}'],
  isla: ['Isla de {}', 'Islas {}', 'Atolón de {}', 'Isla {}'],
};
const REGION_THEMES = [
  { dir: [-0.5, -1], name: 'Reino del Norte', theme: 'norte', color: '#4f6d7a' },
  { dir: [1, -0.1], name: 'Costa de Ámbar', theme: 'costa', color: '#d08c60' },
  { dir: [0.35, 1], name: 'Desierto de Sal', theme: 'desierto', color: '#c9b27c' },
  { dir: [-0.75, 0.75], name: 'Pantanos de Umbría', theme: 'pantano', color: '#7a6a8a' },
  { dir: [-1, 0.15], name: 'Bosques de Eldoria', theme: 'bosque', color: '#5b7553' },
];
const CENTER_THEME = { name: 'Llanuras de Valcor', theme: 'llanura', color: '#a14a3b' };

export function fantasiaDef() {
  const rng = mulberry32(SEED);
  const fbm = makeNoise(rng);
  const fbm2 = makeNoise(rng);

  // ---------------- landmass field (normalised coords: x in [0,1.43], y in [0,1])
  const AX = W / H;
  // main continent: a broad northern body, a western arm and a long south-eastern peninsula around a central gulf
  const blobs = [
    [0.52, 0.30, 0.20], [0.74, 0.24, 0.19], [0.95, 0.27, 0.16], [0.36, 0.44, 0.16], [0.34, 0.66, 0.15],
    [0.48, 0.80, 0.12], [1.04, 0.45, 0.14], [1.00, 0.64, 0.13], [0.86, 0.80, 0.12], [0.62, 0.50, 0.10],
  ];
  const gulfs = [[0.70, 0.62, 0.15], [0.20, 0.30, 0.07]];
  const islands = [[1.30, 0.18, 0.09, 0.05, 0.6], [0.12, 0.84, 0.10, 0.055, -0.5], [1.30, 0.84, 0.10, 0.06, 0.3], [0.16, 0.14, 0.075, 0.04, -0.2], [0.66, 0.95, 0.06, 0.03, 0.1]];
  const field = (px, py) => {
    const x = (px / W) * AX, y = py / H;
    let m = 0;
    for (const [bx, by, r] of blobs) m = Math.max(m, 1 - Math.hypot(x - bx, y - by) / r);
    for (const [bx, by, r] of gulfs) m -= Math.max(0, 1 - Math.hypot(x - bx, y - by) / r) * 1.2;
    let mi = 0;
    for (const [bx, by, rx, ry, a] of islands) { const dx = x - bx, dy = y - by, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a); mi = Math.max(mi, 1 - Math.hypot(u / rx, v / ry)); }
    const n = fbm(x * 3.2 + 11, y * 3.2 + 7) - 0.5;
    const n2 = fbm2(x * 9 + 3, y * 9 + 5, 3) - 0.5;
    const edge = Math.min(x, AX - x, y, 1 - y);
    const fall = edge < 0.06 ? (0.06 - edge) * 6 : 0;
    return Math.max(m + n * 0.75 + n2 * 0.12, mi * 1.3 + n * 0.6 + n2 * 0.2) - fall;
  };

  // ---------------- relaxed Voronoi cells
  let pts = [];
  for (let y = SPACING / 2; y < H; y += SPACING) for (let x = SPACING / 2; x < W; x += SPACING) pts.push([x + (rng() - 0.5) * SPACING * 0.9, y + (rng() - 0.5) * SPACING * 0.9]);
  let vor;
  for (let it = 0; it < 3; it++) {
    vor = Delaunay.from(pts).voronoi([0, 0, W, H]);
    if (it < 2) pts = pts.map((p, i) => { const c = vor.cellPolygon(i); return c ? polyCentroid(c) : p; });
  }
  const delaunay = vor.delaunay;
  const n = pts.length;
  const cells = Array.from({ length: n }, (_, i) => vor.cellPolygon(i));
  const nbrs = Array.from({ length: n }, (_, i) => [...delaunay.neighbors(i)]);
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i++) land[i] = cells[i] && field(pts[i][0], pts[i][1]) > 0.12 ? 1 : 0;

  // components (land or sea), drop tiny islands, fill lakes
  const comps = (want) => {
    const id = new Int32Array(n).fill(-1), list = [];
    for (let i = 0; i < n; i++) {
      if (land[i] !== want || id[i] >= 0) continue;
      const c = [i]; id[i] = list.length;
      for (let k = 0; k < c.length; k++) for (const j of nbrs[c[k]]) if (land[j] === want && id[j] < 0) { id[j] = list.length; c.push(j); }
      list.push(c);
    }
    return list;
  };
  for (const c of comps(0)) {
    const touchesEdge = c.some((i) => { const [x, y] = pts[i]; return x < SPACING * 2 || y < SPACING * 2 || x > W - SPACING * 2 || y > H - SPACING * 2; });
    if (!touchesEdge && c.length < 60) for (const i of c) land[i] = 1; // fill lakes
  }
  let landComps = comps(1).filter((c) => { if (c.length < 25) { for (const i of c) land[i] = 0; return false; } return true; });
  landComps.sort((a, b) => b.length - a.length);
  const totalLand = landComps.reduce((s, c) => s + c.length, 0);

  // ---------------- territories
  const avg = totalLand / TERRITORIES;
  const quota = landComps.map((c, k) => (k === 0 ? 0 : Math.max(1, Math.round(c.length / avg))));
  quota[0] = TERRITORIES - quota.slice(1).reduce((s, q) => s + q, 0);
  const owner = new Int32Array(n).fill(-1);
  const terr = []; // {seed, cells:[], comp}
  landComps.forEach((comp, ci) => {
    // farthest point seeds
    const seeds = [];
    const cen = comp.reduce((s, i) => [s[0] + pts[i][0], s[1] + pts[i][1]], [0, 0]).map((v) => v / comp.length);
    let first = comp[0], bd = Infinity;
    for (const i of comp) { const d = dist(pts[i], cen); if (d < bd) { bd = d; first = i; } }
    seeds.push(first);
    const dmin = new Float64Array(comp.length).fill(Infinity);
    while (seeds.length < quota[ci]) {
      const s = seeds[seeds.length - 1];
      let best = -1, bv = -1;
      comp.forEach((i, k) => { dmin[k] = Math.min(dmin[k], dist(pts[i], pts[s])); if (dmin[k] > bv) { bv = dmin[k]; best = i; } });
      seeds.push(best);
    }
    // move seeds one step inward-ish: Lloyd-like refinement of seeds (3 rounds of nearest-seed assignment)
    let S = seeds.map((i) => pts[i]);
    for (let r = 0; r < 4; r++) {
      const acc = S.map(() => [0, 0, 0]);
      for (const i of comp) { let b = 0, bdd = Infinity; S.forEach((s, k) => { const d = dist(pts[i], s); if (d < bdd) { bdd = d; b = k; } }); acc[b][0] += pts[i][0]; acc[b][1] += pts[i][1]; acc[b][2]++; }
      S = S.map((s, k) => (acc[k][2] ? [acc[k][0] / acc[k][2], acc[k][1] / acc[k][2]] : s));
    }
    const base = terr.length;
    S.forEach((s) => {
      let b = comp[0], bdd = Infinity;
      for (const i of comp) { if (owner[i] >= 0) continue; const d = dist(pts[i], s); if (d < bdd) { bdd = d; b = i; } }
      owner[b] = terr.length;
      terr.push({ seed: pts[b], cells: [b], comp: ci, frontier: [] });
    });
    // balanced growth: the smallest territory grabs its closest frontier cell
    const mine = terr.slice(base);
    const pushF = (t, i) => { for (const j of nbrs[i]) if (land[j] && owner[j] < 0) t.frontier.push([dist(pts[j], t.seed) * (0.85 + 0.3 * fbm2(pts[j][0] / 90, pts[j][1] / 90, 2)), j]); };
    mine.forEach((t) => pushF(t, t.cells[0]));
    let remaining = comp.length - mine.length;
    while (remaining > 0) {
      const active = mine.filter((t) => t.frontier.length).sort((a, b) => a.cells.length - b.cells.length);
      if (!active.length) break;
      const t = active[0];
      t.frontier.sort((a, b) => b[0] - a[0]);
      let got = -1;
      while (t.frontier.length) { const [, j] = t.frontier.pop(); if (owner[j] < 0) { got = j; break; } }
      if (got < 0) continue;
      owner[got] = terr.indexOf(t); t.cells.push(got); remaining--; pushF(t, got);
    }
  });
  for (let i = 0; i < n; i++) if (land[i] && owner[i] < 0) land[i] = 0; // safety

  // territory adjacency + centroids
  const T = terr.length;
  const tAdj = Array.from({ length: T }, () => new Set());
  for (let i = 0; i < n; i++) if (land[i]) for (const j of nbrs[i]) if (land[j] && owner[j] !== owner[i]) tAdj[owner[i]].add(owner[j]);
  const tCen = terr.map((t) => t.cells.reduce((s, i) => [s[0] + pts[i][0], s[1] + pts[i][1]], [0, 0]).map((v) => v / t.cells.length));
  const coastal = terr.map((t) => t.cells.some((i) => nbrs[i].some((j) => !land[j])));

  // ---------------- regions (6) grown over the mainland territory graph
  const R = 6;
  const main = terr.map((t, k) => k).filter((k) => terr[k].comp === 0);
  const rSeeds = [main.reduce((b, k) => (tAdj[k].size > tAdj[b].size ? k : b), main[0])];
  {
    // first seed: territory nearest the mainland centroid; then farthest-point
    const mc = main.reduce((s, k) => [s[0] + tCen[k][0], s[1] + tCen[k][1]], [0, 0]).map((v) => v / main.length);
    rSeeds[0] = main.reduce((b, k) => (dist(tCen[k], mc) < dist(tCen[b], mc) ? k : b), main[0]);
    while (rSeeds.length < R) {
      let best = -1, bv = -1;
      for (const k of main) { const d = Math.min(...rSeeds.map((s) => dist(tCen[k], tCen[s]))); if (d > bv) { bv = d; best = k; } }
      rSeeds.push(best);
    }
  }
  const region = new Int32Array(T).fill(-1);
  const rList = rSeeds.map((s, r) => { region[s] = r; return [s]; });
  let left = main.length - R;
  while (left > 0) {
    const order = rList.map((l, r) => r).sort((a, b) => rList[a].length - rList[b].length);
    let done = false;
    for (const r of order) {
      let best = -1, bd = Infinity;
      for (const k of rList[r]) for (const o of tAdj[k]) if (region[o] < 0 && terr[o].comp === 0) { const d = dist(tCen[o], tCen[rSeeds[r]]); if (d < bd) { bd = d; best = o; } }
      if (best >= 0) { region[best] = r; rList[r].push(best); left--; done = true; break; }
    }
    if (!done) break;
  }
  for (let k = 0; k < T; k++) if (region[k] < 0) {
    let b = -1, bd = Infinity;
    for (let o = 0; o < T; o++) if (region[o] >= 0 && terr[o].comp === 0) { const d = dist(tCen[k], tCen[o]); if (d < bd) { bd = d; b = o; } }
    region[k] = region[b]; rList[region[b]].push(k);
  }

  // region themes: centre region = seed 0; others by direction from the mainland centre
  const mc = main.reduce((s, k) => [s[0] + tCen[k][0], s[1] + tCen[k][1]], [0, 0]).map((v) => v / main.length);
  const rCen = rList.map((l) => l.filter((k) => terr[k].comp === 0).reduce((s, k, _, a) => [s[0] + tCen[k][0] / a.length, s[1] + tCen[k][1] / a.length], [0, 0]));
  const rTheme = new Array(R);
  rTheme[0] = CENTER_THEME;
  const pairsRT = [];
  for (let r = 1; r < R; r++) {
    const v = [rCen[r][0] - mc[0], rCen[r][1] - mc[1]], L = Math.hypot(...v) || 1;
    REGION_THEMES.forEach((th, ti) => { const Ld = Math.hypot(...th.dir); pairsRT.push([(v[0] * th.dir[0] + v[1] * th.dir[1]) / L / Ld, r, ti]); });
  }
  pairsRT.sort((a, b) => b[0] - a[0]);
  const usedT = new Set();
  for (const [, r, ti] of pairsRT) if (!rTheme[r] && !usedT.has(ti)) { rTheme[r] = REGION_THEMES[ti]; usedT.add(ti); }

  // ---------------- names
  const nrng = mulberry32(SEED ^ 0x5bd1e995);
  const usedNames = new Set();
  const root = () => {
    for (;;) {
      const s = STARTS[Math.floor(nrng() * STARTS.length)];
      const m = nrng() < 0.35 ? MIDS[Math.floor(nrng() * MIDS.length)] : '';
      let e = ENDS[Math.floor(nrng() * ENDS.length)];
      if (/[aeiouáéíóú]$/i.test(s + m) && /^[aeiouáéíóú]/i.test(e)) e = e.slice(1) || e;
      const r = s + m + e;
      if (r.length >= 5 && r.length <= 10 && !usedNames.has(r) && !BLOCK.has(r) && !/(.)\1\1/.test(r)) { usedNames.add(r); return r; }
    }
  };
  const deck = {};
  const pick = (theme) => {
    if (!deck[theme] || !deck[theme].length) {
      deck[theme] = THEMES[theme].slice();
      for (let i = deck[theme].length - 1; i > 0; i--) { const j = Math.floor(nrng() * (i + 1)); [deck[theme][i], deck[theme][j]] = [deck[theme][j], deck[theme][i]]; }
    }
    return deck[theme].pop();
  };
  const tName = terr.map((t, k) => {
    const theme = t.comp > 0 ? 'isla' : (coastal[k] && rTheme[region[k]].theme !== 'costa' && nrng() < 0.25 ? 'costa' : rTheme[region[k]].theme);
    const r = root();
    if (t.comp === 0 && nrng() < 0.3) return r;
    return pick(theme).replace('{}', r);
  });

  const regions = rTheme.map((th) => ({ id: slug(th.name), name: th.name, color: th.color }));
  const territories = terr.map((t, k) => ({ id: slug(tName[k]), name: tName[k], region: regions[region[k]].id }));
  const atoms = [];
  for (let i = 0; i < n; i++) if (land[i]) atoms.push({ tid: territories[owner[i]].id, mp: [[cells[i]]] });

  return {
    id: 'fantasia', name: 'Tierras de Aeloria',
    description: 'Un continente legendario de reinos, pantanos y desiertos, rodeado de islas misteriosas.',
    projections: { main: geoIdentity() },
    territories, regions, atoms,
    decor: [],
    links: [],
    tjunction: { cell: 40, eps: 1e-6, maxSeg: 1e9 },
    simplify: 110, smooth: 3, smallK: 0.006, islandMin: 300, growTo: 900,
  };
}
