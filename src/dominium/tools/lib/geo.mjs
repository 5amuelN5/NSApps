// Planar / lon-lat geometry helpers used by the map builder.
// A "MP" here is MultiPolygon coordinates: Array<Polygon>, Polygon = Array<Ring>, Ring = Array<[x,y]>.
import pc from 'polygon-clipping';

export function ringArea(r) {
  // standard shoelace: positive = counter-clockwise in a y-up frame
  let a = 0;
  for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

export function polyArea(p) {
  let a = Math.abs(ringArea(p[0]));
  for (let i = 1; i < p.length; i++) a -= Math.abs(ringArea(p[i]));
  return a;
}

export function mpArea(mp) {
  return mp.reduce((s, p) => s + polyArea(p), 0);
}

export function ringCentroid(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const s = r.reduce((q, p) => [q[0] + p[0], q[1] + p[1]], [0, 0]);
    return [s[0] / r.length, s[1] / r.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInRing(pt, r) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPoly(pt, p) {
  if (!pointInRing(pt, p[0])) return false;
  for (let i = 1; i < p.length; i++) if (pointInRing(pt, p[i])) return false;
  return true;
}

export function pointInMP(pt, mp) {
  return mp.some((p) => pointInPoly(pt, p));
}

export function closeRing(r) {
  const a = r[0], b = r[r.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) r.push([a[0], a[1]]);
  return r;
}

export function geomToMP(g) {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(geomToMP);
  return [];
}

// Rewind for d3-geo (spherical): exterior rings clockwise in lon/lat (negative shoelace), holes ccw.
export function rewindD3(mp) {
  return mp.map((p) =>
    p.map((r, i) => {
      const a = ringArea(r);
      const wantNeg = i === 0;
      return (wantNeg ? a > 0 : a < 0) ? r.slice().reverse() : r;
    })
  );
}

// Shift negative longitudes by +360 (for Russia / Fiji which cross the antimeridian)
export function unwrapLon(mp) {
  return mp.map((p) => p.map((r) => r.map(([x, y]) => [x < 0 ? x + 360 : x, y])));
}

export function bboxOf(mp) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of mp) for (const [x, y] of p[0]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

// ---------- rectangles with globally aligned densification ----------
// All rect edges are densified at multiples of `step` plus every breakpoint in `brk`
// so collinear edges of different rects share exactly the same vertices.
function edgePoints(a, b, fixed, horizontal, step, brk) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const vals = new Set([a, b]);
  for (let v = Math.ceil(lo / step) * step; v < hi; v += step) if (v > lo) vals.add(+v.toFixed(6));
  for (const v of brk) if (v > lo && v < hi) vals.add(v);
  let arr = [...vals].sort((u, w) => u - w);
  if (a > b) arr = arr.reverse();
  return arr.map((v) => (horizontal ? [v, fixed] : [fixed, v]));
}

export function rectPoly([x0, y0, x1, y1], step = 0.25, brkX = [], brkY = []) {
  const pts = [];
  const push = (seg) => { for (let i = 0; i < seg.length - 1; i++) pts.push(seg[i]); };
  push(edgePoints(x0, x1, y0, true, step, brkX));
  push(edgePoints(y0, y1, x1, false, step, brkY));
  push(edgePoints(x1, x0, y1, true, step, brkX));
  push(edgePoints(y1, y0, x0, false, step, brkY));
  pts.push(pts[0]);
  return [pts];
}

// ---------- partition ----------
// specs: [{key, rects:[[x0,y0,x1,y1],...]}]  (later specs lose overlaps to earlier ones)
// opts.rest: key that receives anything not covered (default: last spec)
// opts.cutMin: parts with area >= cutMin (deg²) are cut; smaller parts are assigned whole by centroid.
//              default: only the largest part is cut.
export function partition(mp, specs, opts = {}) {
  const step = opts.step || 0.25;
  const brkX = new Set(), brkY = new Set();
  for (const s of specs) for (const r of s.rects) { brkX.add(r[0]); brkX.add(r[2]); brkY.add(r[1]); brkY.add(r[3]); }
  const bx = [...brkX], by = [...brkY];
  let prev = null;
  const areas = specs.map((s) => {
    let a = s.rects.length ? pc.union(...s.rects.map((r) => rectPoly(r, step, bx, by))) : [];
    if (prev && a.length) a = pc.difference(a, prev);
    prev = prev ? pc.union(prev, a) : a;
    return { key: s.key, area: a };
  });
  const all = prev;
  const restKey = opts.rest || specs[specs.length - 1].key;
  const out = new Map(specs.map((s) => [s.key, []]));
  if (!out.has(restKey)) out.set(restKey, []);
  const sorted = mp.map((p) => ({ p, a: polyArea(p) })).sort((u, v) => v.a - u.a);
  sorted.forEach(({ p, a }, idx) => {
    const cut = opts.cutMin != null ? a >= opts.cutMin : idx === 0;
    if (cut) {
      for (const { key, area } of areas) {
        if (!area.length) continue;
        const piece = pc.intersection([p], area);
        out.get(key).push(...piece);
      }
      const rest = pc.difference([p], all);
      if (rest.length) out.get(restKey).push(...rest);
    } else {
      const c = ringCentroid(p[0]);
      const hit = areas.find(({ area }) => area.length && pointInMP(c, area));
      out.get(hit ? hit.key : restKey).push(p);
    }
  });
  return out;
}

// Split the parts of a MP by a predicate on part centroid -> key (or null to drop)
export function splitParts(mp, fn) {
  const out = new Map();
  for (const p of mp) {
    const c = ringCentroid(p[0]);
    const k = fn(c, polyArea(p), p);
    if (k == null) continue;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(p);
  }
  return out;
}

export { pc };

// ---------- T-junction resolution + canonical densification ----------
// polygon-clipping drops collinear vertices, so two pieces cut by the same line may not share vertices.
// Insert every vertex that lies on another ring's edge, then split long edges deterministically,
// so shared borders become identical vertex sequences (needed for the shared-arc topology).
export function fixTJunctions(mps, { cell = 0.5, eps = 1e-7, maxSeg = 0.5 } = {}) {
  const grid = new Map();
  const gk = (i, j) => i * 100003 + j;
  for (const mp of mps) for (const p of mp) for (const r of p) for (const v of r) {
    const k = gk(Math.floor(v[0] / cell), Math.floor(v[1] / cell));
    let b = grid.get(k);
    if (!b) grid.set(k, (b = new Map()));
    b.set(v[0] + ',' + v[1], v);
  }
  const fixRing = (r) => {
    const out = [];
    for (let i = 0; i < r.length - 1; i++) {
      const p = r[i], q = r[i + 1];
      out.push(p);
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const L2 = dx * dx + dy * dy;
      if (L2 === 0) continue;
      const L = Math.sqrt(L2);
      const i0 = Math.floor((Math.min(p[0], q[0]) - eps) / cell), i1 = Math.floor((Math.max(p[0], q[0]) + eps) / cell);
      const j0 = Math.floor((Math.min(p[1], q[1]) - eps) / cell), j1 = Math.floor((Math.max(p[1], q[1]) + eps) / cell);
      let ins = null;
      if ((i1 - i0 + 1) * (j1 - j0 + 1) < 5000) {
        for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) {
          const b = grid.get(gk(ii, jj));
          if (!b) continue;
          for (const v of b.values()) {
            const t = ((v[0] - p[0]) * dx + (v[1] - p[1]) * dy) / L2;
            if (t <= 1e-12 || t >= 1 - 1e-12) continue;
            const d = Math.abs((v[0] - p[0]) * dy - (v[1] - p[1]) * dx) / L;
            if (d > eps) continue;
            (ins || (ins = [])).push([t, v]);
          }
        }
      }
      const pts = [p];
      if (ins) { ins.sort((a, b) => a[0] - b[0]); for (const [, v] of ins) if (v !== pts[pts.length - 1]) pts.push(v); }
      pts.push(q);
      // canonical densification of each resulting sub-edge
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        if (k > 0) out.push(a);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.ceil(len / maxSeg);
        if (n <= 1) continue;
        const fwd = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
        const [s, e] = fwd ? [a, b] : [b, a];
        const mids = [];
        for (let m = 1; m < n; m++) mids.push([s[0] + ((e[0] - s[0]) * m) / n, s[1] + ((e[1] - s[1]) * m) / n]);
        if (!fwd) mids.reverse();
        out.push(...mids);
      }
    }
    out.push(r[r.length - 1]);
    return out;
  };
  return mps.map((mp) => mp.map((p) => p.map(fixRing)));
}
