// Render del mapa en SVG con zoom/arrastre, fichas de ejércitos y resaltados
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

const UNOWNED = '#3a4b63';

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  r = f(r); g = f(g); b = f(b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
// mezcla el color del jugador con pergamino para un tono "pintado a mano"
function landTone(hex) {
  const a = parseInt(hex.slice(1), 16), p = 0x1e3246;
  const mix = (sh) => Math.round(((a >> sh) & 255) * 0.86 + ((p >> sh) & 255) * 0.14);
  return `#${((1 << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).slice(1)}`;
}

export class MapView {
  constructor(svg, container, { onClick, onHover } = {}) {
    this.svg = svg; this.box = container;
    this.onClick = onClick || (() => {}); this.onHover = onHover || (() => {});
    this.map = null; this.s = 1; this.tx = 0; this.ty = 0; this.fitS = 1;
    this.pointers = new Map(); this.drag = null; this.hoverT = -1;
    this.regionMode = false;
    this.bindEvents();
    new ResizeObserver(() => this.map && this.fit(true)).observe(container);
  }

  load(map) {
    this.map = map;
    const svg = this.svg;
    svg.innerHTML = '';
    svg.classList.add('noanim');
    this.freshLoad = true;
    const defs = el('defs', {}, svg);
    const SEA = '#1e3246';
    this.vp = el('g', {}, svg);
    const W = map.width, H = map.height;
    el('rect', { x: -W * 2, y: -H * 2, width: W * 5, height: H * 5, fill: SEA }, this.vp);
    const allPaths = map.territories.map((t) => t.path).join(' ');
    const coast = allPaths + ' ' + (map.decor || '');
    // líneas de profundidad alrededor de las costas, como en una carta náutica
    [34, 22, 12].forEach((w, i) => el('path', { d: coast, fill: 'none', stroke: `rgba(150,190,225,${0.045 + i * 0.03})`, 'stroke-width': w, 'stroke-linejoin': 'round' }, this.vp));
    el('path', { d: coast, fill: 'rgba(4,9,18,.35)', transform: 'translate(0,2.5)' }, this.vp);
    if (map.decor) el('path', { d: map.decor, fill: '#2a3a50', stroke: '#17253a', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, this.vp);

    const linksG = el('g', {}, this.vp);
    for (const l of map.links || []) {
      const a = map.territories.find((t) => t.id === l.a), b = map.territories.find((t) => t.id === l.b);
      if (!a || !b) continue;
      if (l.wrap) {
        const left = a.cx < b.cx ? a : b, right = a.cx < b.cx ? b : a;
        const my = (a.cy + b.cy) / 2;
        el('line', { x1: left.cx, y1: left.cy, x2: -20, y2: my, class: 'link' }, linksG);
        el('line', { x1: right.cx, y1: right.cy, x2: W + 20, y2: my, class: 'link' }, linksG);
      } else {
        const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
        const dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy) || 1;
        const bend = Math.min(30, len * 0.12);
        el('path', { d: `M${a.cx} ${a.cy} Q${mx - (dy / len) * bend} ${my + (dx / len) * bend} ${b.cx} ${b.cy}`, class: 'link' }, linksG);
      }
    }

    const terrG = el('g', {}, this.vp);
    this.paths = map.territories.map((t, i) => el('path', { d: t.path, class: 'terr', 'data-t': i, fill: UNOWNED, 'fill-rule': 'evenodd' }, terrG));

    this.badgeG = el('g', {}, this.vp);
    this.badges = map.territories.map((t) => {
      const g = el('g', { class: 'badge' }, this.badgeG);
      el('circle', { class: 'ring', r: 18 }, g);
      const sh = el('circle', { class: 'sh', r: 13, cx: 0, cy: 2 }, g);
      const c = el('circle', { class: 'b', r: 13, fill: '#777' }, g);
      const n = el('text', { class: 'n', y: 0.5 }, g);
      const lbl = el('text', { class: 'lbl', y: 26 }, g);
      lbl.textContent = t.name;
      return { g, c, sh, n, lbl, x: t.cx, y: t.cy, last: null, vis: true, lvis: true };
    });
    // prioridad: territorios más grandes primero (su ficha se ve antes al alejar)
    this.area = this.paths.map((p) => { try { const b = p.getBBox(); return b.width * b.height; } catch { return 0; } });
    this.lodFitS = 0;
    this.fit();
  }

  // ------------------------------------------------ nivel de detalle sin solapes
  // Para cada territorio calcula el zoom mínimo (k = s / fitS) a partir del cual su ficha
  // y su nombre caben sin tocar ninguna otra ficha o nombre visible. Por debajo de ese
  // zoom se ocultan; cerca del umbral se encogen. Así nada se superpone nunca.
  computeLOD() {
    const T = this.map.territories, n = T.length, fitS = this.fitS;
    const K = [];
    for (let k = 1; k <= 80; k *= 1.06) K.push(k);
    const f = (k) => Math.min(1, 0.85 + (0.15 * (k - 1)) / 1.2);   // tamaño relativo de la ficha según zoom
    const R = 14.5, GAP = 3;
    const order = [...Array(n).keys()].sort((a, b) => (this.area[b] - this.area[a]) || a - b);
    const dx = (a, b) => T[a].cx - T[b].cx, dy = (a, b) => T[a].cy - T[b].cy;
    const kB = new Array(n).fill(Infinity);
    const placed = [];
    for (const t of order) {
      let thr = 0;
      for (let gi = K.length - 1; gi >= 0; gi--) {
        const k = K[gi], s = fitS * k, need = 2 * R * f(k) + GAP;
        let hit = false;
        for (const u of placed) {
          if (kB[u] > k) continue;
          if (Math.hypot(dx(t, u), dy(t, u)) * s < need) { hit = true; break; }
        }
        if (hit) { thr = gi + 1; break; }
      }
      kB[t] = K[Math.min(thr, K.length - 1)];
      placed.push(t);
    }
    // nombres: no pueden tocar ninguna ficha visible ni nombres de mayor prioridad
    const lw = T.map((t) => t.name.length * 7.2 + 8), LH = 13, LOFF = 22;
    const kL = new Array(n).fill(Infinity);
    const placedL = [];
    for (const t of order) {
      let thr = 0;
      for (let gi = K.length - 1; gi >= 0; gi--) {
        const k = K[gi], s = fitS * k, fk = f(k), r = R * fk;
        if (kB[t] > 1 && k < kB[t] * 1.15) { thr = gi + 1; break; }   // nombres solo con la ficha a tamaño legible
        const w = lw[t] * fk, h = LH * fk, off = LOFF * fk;
        let hit = false;
        for (let u = 0; u < n && !hit; u++) {
          if (u === t || kB[u] > k) continue;
          const X = dx(t, u) * s, Y = dy(t, u) * s + off;
          if (Math.abs(X) < w / 2 + r && Math.abs(Y) < h / 2 + r) hit = true;
        }
        for (const v of placedL) {
          if (hit) break;
          if (kL[v] > k) continue;
          if (Math.abs(dx(t, v) * s) < (w + lw[v] * fk) / 2 + 2 && Math.abs(dy(t, v) * s) < h + 1) hit = true;
        }
        if (hit) { thr = gi + 1; break; }
      }
      kL[t] = thr >= K.length ? Infinity : K[thr];
      placedL.push(t);
    }
    this.kB = kB; this.kL = kL; this.sizeAt = f;
    const maxB = Math.max(...kB);
    const finiteL = kL.filter((x) => x < Infinity);
    const maxL = finiteL.length ? Math.max(...finiteL) : 1;
    // cuanto más denso el mapa, más zoom permite
    this.maxK = Math.min(80, Math.max(4, maxB * 1.5, maxL * 1.1));
    this.lodFitS = fitS;
  }

  // ------------------------------------------------ estado
  update(state, players, { showLabels } = {}) {
    if (!this.map) return;
    this.state = state;
    const regions = this.map.regions;
    const regionColor = Object.fromEntries(regions.map((r) => [r.id, r.color]));
    this.map.territories.forEach((t, i) => {
      const o = state ? state.owners[i] : -1;
      const color = o >= 0 ? players[o].color : null;
      let fill = color ? landTone(color) : UNOWNED;
      if (this.regionMode) fill = regionColor[t.region] || UNOWNED;
      if (this.paths[i].getAttribute('fill') !== fill) this.paths[i].setAttribute('fill', fill);
      const b = this.badges[i];
      const n = state ? state.armies[i] : 0;
      const showBadge = o >= 0;
      b.g.style.display = showBadge ? '' : 'none';
      if (showBadge) {
        const bc = shade(color, -0.32);
        b.c.setAttribute('fill', bc);
        const txt = String(n);
        if (b.n.textContent !== txt) {
          if (b.last !== null) { b.g.classList.remove('pop'); requestAnimationFrame(() => b.g.classList.add('pop')); clearTimeout(b.to); b.to = setTimeout(() => b.g.classList.remove('pop'), 500); }
          b.n.textContent = txt;
          b.last = n;
          const rr = n >= 100 ? 14.5 : 13; b.c.setAttribute('r', rr); b.sh.setAttribute('r', rr); b.n.style.fontSize = n >= 1000 ? '10px' : n >= 100 ? '12.5px' : '';
        }
      }
    });
    this.applyBadgeScale();
    if (this.freshLoad) {
      this.freshLoad = false;
      setTimeout(() => this.svg.classList.remove('noanim'), 100);
    }
  }

  setRegionMode(on) { this.regionMode = on; if (this.state) this.update(this.state, this._players || []); }
  setPlayers(players) { this._players = players; }

  highlight({ sel = -1, targets = [], own = [], dim = false } = {}) {
    if (!this.map) return;
    const tset = new Set(targets), oset = new Set(own);
    this.paths.forEach((p, i) => {
      p.classList.toggle('sel', i === sel);
      p.classList.toggle('target', tset.has(i));
      p.classList.toggle('target-own', oset.has(i));
      p.classList.toggle('dim', dim && i !== sel && !tset.has(i) && !oset.has(i));
      this.badges[i].g.classList.toggle('sel', i === sel);
    });
  }

  highlightSet(set) {
    this.paths.forEach((p, i) => p.classList.toggle('dim', set ? !set.has(i) : false));
  }

  flash(t) {
    const p = this.paths[t]; if (!p) return;
    p.classList.remove('flash'); void p.getBBox(); p.classList.add('flash');
    setTimeout(() => p.classList.remove('flash'), 1100);
  }

  // posición en píxeles (relativa al contenedor) del centro de un territorio
  screenPos(t) {
    const tt = this.map.territories[t];
    return { x: tt.cx * this.s + this.tx, y: tt.cy * this.s + this.ty };
  }

  centerOn(t) {
    const tt = this.map.territories[t];
    const r = this.box.getBoundingClientRect();
    const sx = tt.cx * this.s + this.tx, sy = tt.cy * this.s + this.ty;
    if (sx > 40 && sx < r.width - 40 && sy > 40 && sy < r.height - 40) return;
    this.tx = r.width / 2 - tt.cx * this.s; this.ty = r.height / 2 - tt.cy * this.s;
    this.apply();
  }

  // ------------------------------------------------ cámara
  fit(keepZoom) {
    const r = this.box.getBoundingClientRect();
    if (!r.width || !this.map) return;
    const pad = 16;
    const fitS = Math.min((r.width - pad * 2) / this.map.width, (r.height - pad * 2) / this.map.height);
    if (keepZoom && this.fitS) {
      const k = this.s / this.fitS;
      this.fitS = fitS;
      if (k > 1.01) { this.s = fitS * k; this.clamp(); this.apply(); return; }
    }
    this.fitS = fitS;
    this.s = fitS;
    this.tx = (r.width - this.map.width * fitS) / 2;
    this.ty = (r.height - this.map.height * fitS) / 2;
    this.apply();
  }

  zoomAt(factor, px, py) {
    const k = Math.max(1, Math.min(this.maxK || 10, (this.s * factor) / this.fitS));
    const ns = this.fitS * k;
    this.tx = px - ((px - this.tx) * ns) / this.s;
    this.ty = py - ((py - this.ty) * ns) / this.s;
    this.s = ns;
    this.clamp(); this.apply();
  }

  zoomButton(dir) {
    const r = this.box.getBoundingClientRect();
    if (dir === 'fit') return this.fit();
    this.zoomAt(dir === 'in' ? 1.4 : 1 / 1.4, r.width / 2, r.height / 2);
  }

  clamp() {
    const r = this.box.getBoundingClientRect();
    const w = this.map.width * this.s, h = this.map.height * this.s;
    const m = 80;
    if (w <= r.width) this.tx = (r.width - w) / 2; else this.tx = Math.min(m, Math.max(r.width - w - m, this.tx));
    if (h <= r.height) this.ty = (r.height - h) / 2; else this.ty = Math.min(m, Math.max(r.height - h - m, this.ty));
  }

  apply() {
    this.vp.setAttribute('transform', `translate(${this.tx.toFixed(2)},${this.ty.toFixed(2)}) scale(${this.s.toFixed(5)})`);
    this.applyBadgeScale();
  }

  applyBadgeScale() {
    if (!this.badges) return;
    if (Math.abs(this.lodFitS - this.fitS) > 1e-9) this.computeLOD();
    const k = this.s / this.fitS;
    const base = this.sizeAt(k);
    this.badges.forEach((b, i) => {
      const kb = this.kB[i];
      const vis = k >= kb * 0.999;
      if (vis !== b.vis) { b.vis = vis; b.g.style.visibility = vis ? '' : 'hidden'; }
      if (!vis) return;
      // cerca del umbral la ficha se encoge (nunca crece por encima del tamaño calculado)
      const fade = kb <= 1 ? 1 : Math.min(1, 0.82 + (0.18 * (k / kb - 1)) / 0.15);
      const bs = (base * fade) / this.s;
      b.g.setAttribute('transform', `translate(${b.x},${b.y}) scale(${bs.toFixed(5)})`);
      const lv = k >= this.kL[i] * 0.999;
      if (lv !== b.lvis) { b.lvis = lv; b.lbl.style.display = lv ? '' : 'none'; }
    });
  }

  // ------------------------------------------------ eventos
  bindEvents() {
    const svg = this.svg;
    const local = (e) => { const r = this.box.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    svg.addEventListener('pointerdown', (e) => {
      if (!this.map) return;
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 1) {
        const t = e.target.dataset?.t;
        this.drag = { x: p.x, y: p.y, tx: this.tx, ty: this.ty, moved: false, t: t != null ? Number(t) : -1 };
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.s };
        if (this.drag) this.drag.moved = true;
      }
      svg.setPointerCapture?.(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!this.map) return;
      const p = local(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const target = (this.pinch.s * d) / this.pinch.d;
        this.zoomAt(target / this.s, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      if (this.drag && this.pointers.size === 1) {
        const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) > 7) { this.drag.moved = true; svg.classList.add('panning'); }
        if (this.drag.moved) { this.tx = this.drag.tx + dx; this.ty = this.drag.ty + dy; this.clamp(); this.apply(); }
        return;
      }
      if (e.pointerType === 'mouse') {
        const t = e.target.dataset?.t != null ? Number(e.target.dataset.t) : -1;
        if (t !== this.hoverT) {
          if (this.hoverT >= 0) this.paths[this.hoverT]?.classList.remove('hover');
          this.hoverT = t;
          if (t >= 0) this.paths[t].classList.add('hover');
        }
        this.onHover(t, p.x, p.y);
      }
    });
    const end = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0) {
        if (this.drag && !this.drag.moved && this.drag.t >= 0 && e.type === 'pointerup') this.onClick(this.drag.t);
        this.drag = null;
        svg.classList.remove('panning');
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.onHover(-1); if (this.hoverT >= 0) this.paths[this.hoverT]?.classList.remove('hover'); this.hoverT = -1; } });
    svg.addEventListener('wheel', (e) => {
      if (!this.map) return;
      e.preventDefault();
      const p = local(e);
      this.zoomAt(Math.exp(-e.deltaY * 0.0018), p.x, p.y);
    }, { passive: false });
  }
}

// Mini vista previa (lobby)
export function renderPreview(container, map) {
  container.innerHTML = '';
  const svg = el('svg', { viewBox: `-10 -10 ${map.width + 20} ${map.height + 20}`, preserveAspectRatio: 'xMidYMid meet' });
  el('rect', { x: -10, y: -10, width: map.width + 20, height: map.height + 20, fill: '#1e3246' }, svg);
  if (map.decor) el('path', { d: map.decor, fill: '#2a3a50' }, svg);
  const colors = Object.fromEntries(map.regions.map((r) => [r.id, r.color]));
  for (const t of map.territories) el('path', { d: t.path, fill: colors[t.region] || '#ccc', stroke: '#13202f', 'stroke-width': map.width / 900 }, svg);
  container.appendChild(svg);
  const d = document.createElement('div');
  d.className = 'desc';
  d.textContent = map.description || '';
  container.appendChild(d);
}
