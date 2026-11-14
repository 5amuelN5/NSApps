// Map build pipeline:
//   lon/lat atoms -> projected planar rings -> shared-arc topology -> merge per territory
//   -> drop small islands -> fit to 1600 px -> strong Visvalingam + Chaikin smoothing (arc level, gap free)
//   -> land adjacency from shared arcs -> sea links (hand + automatic fallback) -> JSON
import { geoPath } from 'd3-geo';
import { topology } from 'topojson-server';
import { mergeArcs, neighbors } from 'topojson-client';
import { presimplify } from 'topojson-simplify';
import polylabel from 'polylabel';
import { ringArea, polyArea, pointInRing, closeRing, rewindD3, fixTJunctions, pc } from './geo.mjs';

const WIDTH = 1600;
const PAD = 20;

// ---------------------------------------------------------------- projection
function projectRings(proj, mp) {
  const rings = [];
  let cur = null;
  const ctx = {
    moveTo(x, y) { cur = [[x, y]]; rings.push(cur); },
    lineTo(x, y) { cur.push([x, y]); },
    closePath() { cur = null; },
    arc() {},
    beginPath() {},
  };
  geoPath(proj, ctx)({ type: 'MultiPolygon', coordinates: mp });
  return rings;
}

const SNAP = 256;
const snap = (v) => Math.round(v * SNAP) / SNAP;

function nestRings(rawRings) {
  const items = [];
  for (let r of rawRings) {
    r = r.map(([x, y]) => [snap(x), snap(y)]);
    // dedupe consecutive
    const d = [r[0]];
    for (let i = 1; i < r.length; i++) if (r[i][0] !== d[d.length - 1][0] || r[i][1] !== d[d.length - 1][1]) d.push(r[i]);
    closeRing(d);
    if (d.length < 4) continue;
    const a = Math.abs(ringArea(d));
    if (a < 1e-4) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of d) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    items.push({ r: d, a, bb: [x0, y0, x1, y1], depth: 0, poly: null });
  }
  items.sort((u, v) => v.a - u.a);
  const polys = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let parent = null;
    for (let j = i - 1; j >= 0; j--) {
      const o = items[j];
      if (o.bb[0] > it.bb[0] || o.bb[1] > it.bb[1] || o.bb[2] < it.bb[2] || o.bb[3] < it.bb[3]) continue;
      // majority vote over a few vertices (robust to touching boundaries)
      let votes = 0, tests = 0;
      const n = it.r.length - 1;
      for (const k of [0, Math.floor(n / 3), Math.floor((2 * n) / 3)]) { tests++; if (pointInRing(it.r[k], o.r)) votes++; }
      if (votes * 2 > tests) { parent = o; break; }
    }
    it.depth = parent ? parent.depth + 1 : 0;
    if (it.depth % 2 === 0) { it.poly = [it.r]; polys.push(it.poly); }
    else { it.poly = parent.poly; parent.poly.push(it.r); }
  }
  return polys;
}

// ---------------------------------------------------------------- arcs helpers
function ringCoords(arcs, ring) {
  const out = [];
  ring.forEach((ai, k) => {
    const a = ai >= 0 ? arcs[ai] : arcs[~ai].slice().reverse();
    for (let i = k === 0 ? 0 : 1; i < a.length; i++) out.push([a[i][0], a[i][1]]);
  });
  return out;
}

function chaikin(arc) {
  if (arc.length < 3) return arc;
  const n = arc.length - 1;
  const out = [arc[0]];
  for (let i = 0; i < n; i++) {
    const p = arc[i], q = arc[i + 1];
    if (i > 0) out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
    if (i < n - 1) out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
  }
  out.push(arc[n]);
  return out;
}

// ---------------------------------------------------------------- output helpers
const r1 = (v) => Math.round(v * 10) / 10;

function cleanRing(r) {
  const out = [];
  for (const [x0, y0] of r) {
    const x = r1(x0), y = r1(y0);
    const l = out[out.length - 1];
    if (!l || l[0] !== x || l[1] !== y) out.push([x, y]);
  }
  while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  // drop collinear duplicates (spikes of zero width)
  return out;
}

function ringsToPath(polys) {
  let s = '';
  for (const p of polys) for (const r of p) {
    s += 'M' + r.map(([x, y]) => `${x},${y}`).join('L') + 'Z';
  }
  return s;
}

function orient(poly) {
  return poly.map((r, i) => {
    const a = ringArea(r); // y-down screen: positive = clockwise on screen
    const wantPos = i === 0;
    return (wantPos ? a < 0 : a > 0) ? r.slice().reverse() : r;
  });
}

// ---------------------------------------------------------------- colours
const PALETTE = [
  '#b5651d', '#7d8f4e', '#c9a227', '#4f6d7a', '#a14a3b', '#8b6f9c', '#d08c60', '#5f8a8b',
  '#8b5a83', '#9c7b3c', '#c2b280', '#6b5b4b', '#5d6b8a', '#9e5a63', '#a3a380', '#7a9e7e',
  '#a86f4c', '#b8a05a', '#5b7553', '#c48f65', '#6e7f80', '#8c7b5b', '#b07d62', '#6f8f5f',
];
function hexRgb(h) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function cdist(a, b) {
  const [r1_, g1, b1] = hexRgb(a), [r2, g2, b2] = hexRgb(b);
  const rm = (r1_ + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1_ - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}
function assignColors(regions, regionAdj) {
  const used = new Set();
  const order = regions.slice().sort((a, b) => (regionAdj.get(b.id)?.size || 0) - (regionAdj.get(a.id)?.size || 0));
  for (const reg of order) {
    if (reg.color) { used.add(reg.color); continue; }
    let best = null, bestScore = -1;
    for (const c of PALETTE) {
      if (used.has(c) && used.size < PALETTE.length) continue;
      let m = 1e9, g = 1e9;
      for (const nb of regionAdj.get(reg.id) || []) {
        const o = regions.find((r) => r.id === nb);
        if (o && o.color) m = Math.min(m, cdist(c, o.color));
      }
      for (const o of regions) if (o.color) g = Math.min(g, cdist(c, o.color));
      const score = Math.min(m, 400) + 0.6 * Math.min(g, 400);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    reg.color = best;
    used.add(best);
  }
}

// ---------------------------------------------------------------- distances
function vertsOf(polys) { const v = []; for (const p of polys) for (const [x, y] of p[0]) v.push(x, y); return v; }
function bbOf(v) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < v.length; i += 2) { if (v[i] < x0) x0 = v[i]; if (v[i] > x1) x1 = v[i]; if (v[i + 1] < y0) y0 = v[i + 1]; if (v[i + 1] > y1) y1 = v[i + 1]; } return [x0, y0, x1, y1]; }
function bbDist(a, b) { const dx = Math.max(0, a[0] - b[2], b[0] - a[2]); const dy = Math.max(0, a[1] - b[3], b[1] - a[3]); return Math.hypot(dx, dy); }
function minDist(va, vb, best = Infinity) {
  let m = best * best;
  for (let i = 0; i < va.length; i += 2) for (let j = 0; j < vb.length; j += 2) {
    const dx = va[i] - vb[j], dy = va[i + 1] - vb[j + 1];
    const d = dx * dx + dy * dy;
    if (d < m) m = d;
  }
  return Math.sqrt(m);
}

// ---------------------------------------------------------------- main
export function buildMap(def) {
  const log = (...a) => console.log(`[${def.id}]`, ...a);
  const projs = def.projections;
  for (const p of Object.values(projs)) if (p.precision) p.precision(0);
  const tMeta = new Map(def.territories.map((t) => [t.id, t]));
  for (const a of def.atoms) if (!tMeta.has(a.tid)) throw new Error(`${def.id}: atom for unknown territory ${a.tid}`);

  // 1) base fit: x-range of all atoms -> [PAD, WIDTH-PAD]
  const atoms = def.atoms.filter((a) => a.mp && a.mp.length).map((a) => ({ ...a, mp: rewindD3(a.mp) }));
  const decor = (def.decor || []).filter((a) => a.mp && a.mp.length).map((a) => ({ ...a, mp: rewindD3(a.mp), tid: '__decor' }));
  {
    const all = [...atoms, ...decor];
    const fixed = fixTJunctions(all.map((a) => a.mp), def.tjunction || {});
    all.forEach((a, i) => { a.mp = fixed[i]; });
  }
  {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity;
    for (const a of atoms) {
      const b = geoPath(projs[a.proj || 'main']).bounds({ type: 'MultiPolygon', coordinates: a.mp });
      if (!isFinite(b[0][0])) continue;
      x0 = Math.min(x0, b[0][0]); x1 = Math.max(x1, b[1][0]); y0 = Math.min(y0, b[0][1]);
    }
    const f = (WIDTH - 2 * PAD) / (x1 - x0);
    for (const p of Object.values(projs)) {
      const s = p.scale(), t = p.translate();
      p.scale(s * f);
      p.translate([(t[0] - x0) * f + PAD, (t[1] - y0) * f + PAD]);
    }
  }

  // 2) project
  const features = [];
  for (const a of [...atoms, ...decor]) {
    const polys = nestRings(projectRings(projs[a.proj || 'main'], a.mp));
    if (!polys.length) continue;
    features.push({ type: 'Feature', properties: { tid: a.tid }, geometry: { type: 'MultiPolygon', coordinates: polys } });
  }

  // 3) topology + merge per territory
  const topo = topology({ atoms: { type: 'FeatureCollection', features } });
  const byTid = new Map();
  for (const g of topo.objects.atoms.geometries) {
    if (!g.type) continue;
    const tid = g.properties.tid;
    if (!byTid.has(tid)) byTid.set(tid, []);
    byTid.get(tid).push(g);
  }
  const terrGeoms = [];
  for (const t of def.territories) {
    const list = byTid.get(t.id);
    if (!list) throw new Error(`${def.id}: territory ${t.id} has no geometry`);
    const m = mergeArcs(topo, list);
    m.id = t.id;
    terrGeoms.push(m);
  }
  const decorGeom = byTid.has('__decor') ? mergeArcs(topo, byTid.get('__decor')) : null;
  let arcs = topo.arcs;

  // 4) island filtering on merged polygons (base px ~ final px)
  const islandMin = def.islandMin ?? 40;
  const polyAreaArcs = (poly) => {
    let a = Math.abs(ringArea(ringCoords(arcs, poly[0])));
    for (let i = 1; i < poly.length; i++) a -= Math.abs(ringArea(ringCoords(arcs, poly[i])));
    return a;
  };
  const keepIsland = def.keepIsland || (() => false);
  const attachedMin = def.attachedMin ?? 8;
  // arc -> set of geometries using it (to tell true islands from pieces touching a neighbour)
  const arcUsers = new Map();
  [...terrGeoms, ...(decorGeom ? [decorGeom] : [])].forEach((g, gi) => {
    for (const poly of g.arcs) for (const ring of poly) for (const ai of ring) {
      const k = ai < 0 ? ~ai : ai;
      if (!arcUsers.has(k)) arcUsers.set(k, new Set());
      arcUsers.get(k).add(gi);
    }
  });
  for (const [gi, g] of terrGeoms.entries()) {
    const areas = g.arcs.map(polyAreaArcs);
    const maxA = Math.max(...areas);
    const attached = (poly) => poly[0].some((ai) => [...arcUsers.get(ai < 0 ? ~ai : ai)].some((u) => u !== gi));
    g.arcs = g.arcs.filter((poly, i) => areas[i] === maxA || areas[i] >= islandMin || (areas[i] >= attachedMin && attached(poly)) || keepIsland(g.id, ringCoords(arcs, poly[0])));
    g.arcs = g.arcs.map((poly) => [poly[0], ...poly.slice(1).filter((h) => Math.abs(ringArea(ringCoords(arcs, h))) >= islandMin)]);
    g.area = g.arcs.reduce((s, p) => s + polyAreaArcs(p), 0);
  }
  if (decorGeom) {
    const dMin = def.decorMin ?? islandMin * 2;
    decorGeom.arcs = decorGeom.arcs
      .filter((poly) => polyAreaArcs(poly) >= dMin)
      .map((poly) => [poly[0], ...poly.slice(1).filter((h) => Math.abs(ringArea(ringCoords(arcs, h))) >= dMin)]);
  }

  // 5) final fit from surviving territory polygons
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  const usedArcs = new Set();
  for (const g of terrGeoms) for (const poly of g.arcs) for (const ring of poly) for (const ai of ring) usedArcs.add(ai < 0 ? ~ai : ai);
  for (const ai of usedArcs) for (const [x, y] of arcs[ai]) { if (x < X0) X0 = x; if (x > X1) X1 = x; if (y < Y0) Y0 = y; if (y > Y1) Y1 = y; }
  const f = (WIDTH - 2 * PAD) / (X1 - X0);
  const H = Math.ceil((Y1 - Y0) * f + 2 * PAD);
  const T = ([x, y]) => [(x - X0) * f + PAD, (y - Y0) * f + PAD];
  arcs = arcs.map((a) => a.map(T));
  for (const g of terrGeoms) g.area *= f * f;
  // Re-build the topology from the merged territories so arcs are only cut where territories meet
  // (atom junctions such as merged provinces or Voronoi cells would otherwise pin every vertex).
  {
    const geoms = [...terrGeoms, ...(decorGeom ? [decorGeom] : [])];
    const fc = { type: 'FeatureCollection', features: geoms.map((g, i) => ({ type: 'Feature', properties: { i }, geometry: { type: 'MultiPolygon', coordinates: g.arcs.map((poly) => poly.map((ring) => ringCoords(arcs, ring))) } })) };
    const t2 = topology({ g: fc });
    t2.objects.g.geometries.forEach((og, i) => {
      geoms[i].arcs = og.type === 'Polygon' ? [og.arcs] : og.type === 'MultiPolygon' ? og.arcs : [];
    });
    arcs = t2.arcs;
  }
  const ftopo = { type: 'Topology', arcs, objects: {} };

  // 6) simplification: Visvalingam with per-arc threshold, then Chaikin
  const W = def.simplify ?? 12;
  const smallK = def.smallK ?? 0.012;
  const arcThr = new Float64Array(arcs.length).fill(def.decorSimplify ?? W * 1.5);
  const terrArcThr = new Map();
  for (const g of terrGeoms) {
    const thr = Math.min(W, Math.max(0.05, g.area * smallK));
    for (const poly of g.arcs) for (const ring of poly) for (const ai of ring) {
      const k = ai < 0 ? ~ai : ai;
      terrArcThr.set(k, Math.min(terrArcThr.get(k) ?? Infinity, thr));
    }
  }
  for (const [k, v] of terrArcThr) arcThr[k] = v;
  const pre = presimplify({ type: 'Topology', arcs, objects: {} });
  arcs = pre.arcs.map((arc, k) => {
    const thr = arcThr[k];
    let out = arc.filter((p) => p[2] >= thr);
    const closed = arc.length > 3 && arc[0][0] === arc[arc.length - 1][0] && arc[0][1] === arc[arc.length - 1][1];
    if (closed && out.length < 5) {
      // keep the 4 most significant interior points so the island stays a polygon
      const inner = arc.slice(1, -1).map((p, i) => ({ p, i })).sort((a, b) => b.p[2] - a.p[2]).slice(0, 4).sort((a, b) => a.i - b.i);
      out = [arc[0], ...inner.map((o) => o.p), arc[arc.length - 1]];
    }
    out = out.map((p) => [p[0], p[1]]);
    for (let s = 0; s < (def.smooth ?? 1); s++) out = chaikin(out);
    return out;
  });
  ftopo.arcs = arcs;

  // 7) land adjacency
  const nb = neighbors(terrGeoms.map((g) => ({ type: 'MultiPolygon', arcs: g.arcs })));
  const landAdj = new Set();
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  nb.forEach((list, i) => list.forEach((j) => landAdj.add(key(terrGeoms[i].id, terrGeoms[j].id))));

  // 8) geometry output
  const terrOut = [];
  const grown = [];
  for (const g of terrGeoms) {
    const polys = [];
    for (const poly of g.arcs) {
      const rings = poly.map((ring) => cleanRing(ringCoords(arcs, ring))).filter((r) => r.length >= 3);
      if (!rings.length || rings[0].length < 3) continue;
      if (Math.abs(ringArea(rings[0])) < 1) continue;
      polys.push(orient([rings[0], ...rings.slice(1).filter((r) => Math.abs(ringArea(r)) >= 1)]));
    }
    if (!polys.length) throw new Error(`${def.id}: territory ${g.id} lost its geometry`);
    polys.sort((a, b) => polyArea(b) - polyArea(a));
    const lp = polylabel(polys[0], 0.5);
    const meta = tMeta.get(g.id);
    terrOut.push({ id: g.id, name: meta.name, region: meta.region, polys, cx: r1(lp[0]), cy: r1(lp[1]), labelR: lp.distance });
  }

  // 8b) enlarge tiny territories that have no land border with another territory (islands, enclaves
  //     like Ceuta/Melilla) so they are clickable; never overlap another territory or leave the frame.
  const growTo = def.growTo ?? 600;
  if (growTo > 0) {
    const hasLand = new Set();
    for (const k of landAdj) { const [a, b] = k.split('|'); hasLand.add(a); hasLand.add(b); }
    const bbP = (polys) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of polys) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
    const scaleP = (polys, c, k) => polys.map((p) => p.map((r) => r.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k])));
    for (const t of terrOut) {
      if (hasLand.has(t.id)) continue;
      const area = t.polys.reduce((s, p) => s + polyArea(p), 0);
      if (area >= growTo) continue;
      const c = [t.cx, t.cy];
      const kMax = Math.min(def.growMax ?? 4, Math.sqrt(growTo / area));
      const others = terrOut.filter((o) => o !== t);
      const ok = (k) => {
        const sp = scaleP(t.polys, c, k * 1.15); // 15% clearance
        const b = bbP(sp);
        if (b[0] < 2 || b[1] < 2 || b[2] > WIDTH - 2 || b[3] > H - 2) return false;
        for (const o of others) {
          const ob = o._bb || (o._bb = bbP(o.polys));
          if (ob[0] > b[2] || ob[2] < b[0] || ob[1] > b[3] || ob[3] < b[1]) continue;
          try { if (pc.intersection(sp, o.polys).length) return false; } catch { return false; }
        }
        return true;
      };
      let lo = 1, hi = kMax;
      if (ok(hi)) lo = hi;
      else for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
      if (lo > 1.05) {
        t.polys = scaleP(t.polys, c, lo).map((p) => p.map((r) => cleanRing(r)));
        t._bb = null;
        const lp = polylabel(t.polys[0], 0.5);
        t.cx = r1(lp[0]); t.cy = r1(lp[1]); t.labelR = lp.distance;
        grown.push(`${t.id}x${lo.toFixed(1)}`);
      }
    }
    if (grown.length) log('enlarged:', grown.join(' '));
  }

  // decor
  let decorPath = '';
  if (decorGeom && decorGeom.arcs.length) {
    let dpolys = decorGeom.arcs.map((poly) => poly.map((ring) => ringCoords(arcs, ring)));
    const frame = [[[0, 0], [WIDTH, 0], [WIDTH, H], [0, H], [0, 0]]];
    try {
      dpolys = pc.intersection(dpolys, frame);
      if (def.decorHoles) {
        const holes = def.decorHoles(terrOut);
        if (holes.length) dpolys = pc.difference(dpolys, ...holes);
      }
    } catch (e) { log('decor clip failed', e.message); }
    const dMin = def.decorMin ?? islandMin * 2;
    const out = [];
    for (const p of dpolys) {
      const rings = p.map(cleanRing).filter((r) => r.length >= 3);
      if (!rings.length || Math.abs(ringArea(rings[0])) < dMin) continue;
      out.push(orient([rings[0], ...rings.slice(1).filter((r) => Math.abs(ringArea(r)) >= dMin)]));
    }
    decorPath = ringsToPath(out);
  }

  // 9) adjacency + links
  const ids = terrOut.map((t) => t.id);
  const idSet = new Set(ids);
  const adj = new Map(ids.map((i) => [i, new Set()]));
  const links = [];
  const linkSet = new Set();
  const wrapSet = new Set((def.wrap || []).map(([a, b]) => key(a, b)));
  const addAdj = (a, b) => { adj.get(a).add(b); adj.get(b).add(a); };
  const addLink = (a, b, why) => {
    if (!idSet.has(a) || !idSet.has(b)) throw new Error(`${def.id}: link with unknown id ${a}-${b}`);
    const k = key(a, b);
    if (a === b || landAdj.has(k) || linkSet.has(k)) return false;
    linkSet.add(k);
    const l = { a, b };
    if (wrapSet.has(k)) l.wrap = true;
    links.push(l);
    addAdj(a, b);
    if (why) log(`auto link ${a} - ${b} (${why})`);
    return true;
  };

  if (def.adjacency) {
    const official = new Set(def.adjacency.map(([a, b]) => key(a, b)));
    for (const [a, b] of def.adjacency) {
      if (!idSet.has(a) || !idSet.has(b)) throw new Error(`bad official adjacency ${a}-${b}`);
      addAdj(a, b);
      if (!landAdj.has(key(a, b))) addLink(a, b);
    }
    for (const k of landAdj) if (!official.has(k)) log(`WARNING: geometric border not in official adjacency: ${k}`);
  } else {
    for (const k of landAdj) { const [a, b] = k.split('|'); addAdj(a, b); }
    for (const [a, b] of def.links || []) {
      if (landAdj.has(key(a, b))) log(`note: hand link ${a}-${b} is already a land border`);
      addLink(a, b);
    }
    // fallback: isolated territories
    const verts = new Map(terrOut.map((t) => [t.id, vertsOf(t.polys)]));
    const bbs = new Map(ids.map((i) => [i, bbOf(verts.get(i))]));
    const nearest = (id, exclude) => {
      const cands = ids.filter((o) => o !== id && !exclude.has(o)).map((o) => ({ o, bd: bbDist(bbs.get(id), bbs.get(o)) })).sort((a, b) => a.bd - b.bd);
      let best = [];
      for (const c of cands) {
        if (best.length >= 2 && c.bd > best[1].d) break;
        const d = minDist(verts.get(id), verts.get(c.o));
        best.push({ o: c.o, d });
        best.sort((a, b) => a.d - b.d);
        best = best.slice(0, 2);
      }
      return best;
    };
    for (const id of ids) {
      if (adj.get(id).size) continue;
      const best = nearest(id, new Set());
      if (best[0]) addLink(id, best[0].o, 'isolated');
      if (best[1] && best[1].d < best[0].d * 1.6 + 15) addLink(id, best[1].o, 'isolated-2');
    }
    // fallback: join components
    for (;;) {
      const comp = new Map();
      let n = 0;
      for (const id of ids) {
        if (comp.has(id)) continue;
        const st = [id]; comp.set(id, n);
        while (st.length) { const c = st.pop(); for (const o of adj.get(c)) if (!comp.has(o)) { comp.set(o, n); st.push(o); } }
        n++;
      }
      if (n <= 1) break;
      const sizes = new Array(n).fill(0);
      for (const c of comp.values()) sizes[c]++;
      const small = sizes.indexOf(Math.min(...sizes));
      let best = null;
      for (const a of ids) {
        if (comp.get(a) !== small) continue;
        for (const b of ids) {
          if (comp.get(b) === small) continue;
          if (best && bbDist(bbs.get(a), bbs.get(b)) > best.d) continue;
          const d = minDist(verts.get(a), verts.get(b), best ? best.d : Infinity);
          if (!best || d < best.d) best = { a, b, d };
        }
      }
      addLink(best.a, best.b, 'component join');
    }
  }

  // 10) regions + bonus + colours
  const regions = def.regions.map((r) => ({ ...r }));
  const regionAdj = new Map(regions.map((r) => [r.id, new Set()]));
  for (const t of terrOut) {
    if (!regionAdj.has(t.region)) throw new Error(`${def.id}: territory ${t.id} has unknown region ${t.region}`);
    for (const o of adj.get(t.id)) {
      const ro = tMeta.get(o).region;
      if (ro !== t.region) { regionAdj.get(t.region).add(ro); regionAdj.get(ro).add(t.region); }
    }
  }
  for (const r of regions) {
    const ts = terrOut.filter((t) => t.region === r.id);
    if (!ts.length) throw new Error(`${def.id}: empty region ${r.id}`);
    if (r.bonus == null) {
      const n = ts.length;
      const b = ts.filter((t) => [...adj.get(t.id)].some((o) => tMeta.get(o).region !== r.id)).length;
      r.bonus = Math.max(1, Math.floor((n + b) / 2.5));
    }
  }
  assignColors(regions, regionAdj);

  const out = {
    id: def.id,
    name: def.name,
    description: def.description,
    width: WIDTH,
    height: H,
    territories: terrOut.map((t) => ({
      id: t.id, name: t.name, region: t.region, path: ringsToPath(t.polys), cx: t.cx, cy: t.cy,
      adj: [...adj.get(t.id)].sort(),
    })),
    regions: regions.map((r) => ({ id: r.id, name: r.name, bonus: r.bonus, color: r.color })),
    links,
    decor: decorPath,
  };
  for (const t of terrOut) if (t.labelR < (def.warnLabel ?? 4)) log(`small label room: ${t.id} r=${t.labelR.toFixed(1)}`);
  return out;
}
