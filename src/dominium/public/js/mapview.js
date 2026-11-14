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
    const PAT = [
      'M0 8 L8 0', 'M0 4 H8', 'M4 0 V8', 'M0 0 L8 8 M8 0 L0 8', 'M0 0 L8 8', 'M2 2 h1 M6 6 h1', 'M0 6 L4 2 L8 6', 'M0 4 H8 M4 0 V8',
    ];
    PAT.forEach((d, i) => {
      const pt = el('pattern', { id: `pat-${i}`, width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, defs);
      el('path', { d, stroke: 'rgba(255,255,255,.55)', 'stroke-width': i === 5 ? 2.4 : 1.4, fill: 'none', 'stroke-linecap': 'round' }, pt);
    });
    const SEA = '#1e3246';
    this.vp = el('g', {}, svg);
    const W = map.width, H = map.height;
    el('rect', { x: -W * 2, y: -H * 2, width: W * 5, height: H * 5, fill: SEA }, this.vp);
    const allPaths = map.territories.map((t) => t.path).join(' ');
    const coast = allPaths + ' ' + (map.decor || '');
    // meridianos y paralelos decorativos
    const grid = [];
    for (let i = 1; i < 12; i++) grid.push(`M${(W * i) / 12} ${-H} V${H * 2}`);
    for (let i = 1; i < 8; i++) grid.push(`M${-W} ${(H * i) / 8} H${W * 2}`);
    el('path', { d: grid.join(' '), stroke: 'rgba(150,190,225,.055)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', fill: 'none' }, this.vp);
    this.drawCompass(map);
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
    // capa de tramas (modo daltónico): una forma por territorio, rellena con el patrón de su dueño
    this.patG = el('g', { class: 'pat-layer' }, this.vp);
    this.patPaths = map.territories.map((t) => el('path', { d: t.path, fill: 'none', 'fill-rule': 'evenodd' }, this.patG));
    this.fxG = el('g', { class: 'fx' }, this.vp);
    this.aim = null;
    this.wrapPairs = new Set((map.links || []).filter((l) => l.wrap).flatMap((l) => [`${l.a}|${l.b}`, `${l.b}|${l.a}`]));

    this.badgeG = el('g', {}, this.vp);
    // las flechas van por encima de las fichas (son indicadores momentáneos)
    this.arrowG = el('g', { class: 'arrows' }, this.vp);
    this.aimG = el('g', { class: 'arrows aim' }, this.vp);
    this.badges = map.territories.map((t) => {
      const g = el('g', { class: 'badge' }, this.badgeG);
      el('circle', { class: 'ring', r: 18 }, g);
      const sh = el('circle', { class: 'sh', r: 13, cx: 0, cy: 2 }, g);
      const c = el('circle', { class: 'b', r: 13, fill: '#777' }, g);
      const n = el('text', { class: 'n', y: 0.5 }, g);
      const lbl = el('text', { class: 'lbl', y: 26 }, g);
      lbl.textContent = t.name;
      const cap = el('text', { class: 'cap', x: 11, y: -9 }, g);
      cap.textContent = '⭐';
      cap.style.display = 'none';
      return { g, c, sh, n, lbl, cap, x: t.cx, y: t.cy, last: null, vis: true, lvis: true };
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
    const R = 14.5 * (this.userBadge || 1), GAP = 3;
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
    const caps = state && state.capitals ? new Set(state.capitals.filter((t) => t >= 0)) : null;
    this.badges.forEach((b, i) => {
      const on = !!(caps && caps.has(i));
      if (b.capOn !== on) { b.capOn = on; b.cap.style.display = on ? '' : 'none'; }
    });
    if (this.patterns) {
      this.patPaths.forEach((pp, i) => {
        const o = state ? state.owners[i] : -1;
        const f = o >= 0 ? `url(#pat-${o % 8})` : 'none';
        if (pp.getAttribute('fill') !== f) pp.setAttribute('fill', f);
      });
    }
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
      if (b.shown !== showBadge) { b.shown = showBadge; b.g.style.display = showBadge ? '' : 'none'; }
      if (showBadge) {
        if (b.color !== color) { b.color = color; b.c.setAttribute('fill', shade(color, -0.32)); }
        const txt = String(n);
        if (b.n.textContent !== txt) {
          if (b.last !== null) { b.g.classList.remove('pop'); requestAnimationFrame(() => b.g.classList.add('pop')); clearTimeout(b.to); b.to = setTimeout(() => b.g.classList.remove('pop'), 500); }
          b.n.textContent = txt;
          b.last = n;
          const rr = n >= 100 ? 14.5 : 13; b.c.setAttribute('r', rr); b.sh.setAttribute('r', rr); b.n.style.fontSize = n >= 1000 ? '10px' : n >= 100 ? '12.5px' : '';
        }
      }
    });
    if (this.freshLoad) {
      this.freshLoad = false;
      setTimeout(() => this.svg.classList.remove('noanim'), 100);
    }
  }

  setRegionMode(on) { this.regionMode = on; if (this.state) this.update(this.state, this._players || []); }
  setPlayers(players) { this._players = players; }

  highlight({ sel = -1, targets = [], own = [], dim = false, keep = null } = {}) {
    if (!this.map) return;
    const tset = new Set(targets), oset = new Set(own);
    const kset = keep ? new Set(keep) : null;
    this.paths.forEach((p, i) => {
      p.classList.toggle('soft', !!kset && !kset.has(i));
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

  setBadgeScale(f) {
    this.userBadge = f;
    this.lodFitS = 0;
    if (this.badges) this.applyBadgeScale();
  }

  setPatterns(on) {
    this.patterns = !!on;
    if (!this.patPaths) return;
    if (!on) this.patPaths.forEach((pp) => pp.setAttribute('fill', 'none'));
    else if (this.state) this.update(this.state, this._players || []);
  }

  // destello de varios territorios (región conquistada)
  flashSet(list, color) {
    if (!this.fxG) return;
    const d = list.map((t) => this.map.territories[t].path).join(' ');
    const pth = el('path', { d, fill: color, 'fill-rule': 'evenodd', class: 'region-flash', stroke: '#fff', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, this.fxG);
    setTimeout(() => pth.remove(), 1700);
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
    const c = this.clampVals(this.s, r.width / 2 - tt.cx * this.s, r.height / 2 - tt.cy * this.s);
    this.animateTo(this.s, c.tx, c.ty, 380);
  }

  // ------------------------------------------------ cámara
  fit(keepZoom, animate) {
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
    const ns = fitS, ntx = (r.width - this.map.width * fitS) / 2, nty = (r.height - this.map.height * fitS) / 2;
    if (animate) return this.animateTo(ns, ntx, nty);
    this.s = ns; this.tx = ntx; this.ty = nty;
    this.apply();
  }

  // destino de un zoom alrededor de un punto (sin aplicarlo)
  zoomTarget(factor, px, py) {
    const k = Math.max(1, Math.min(this.maxK || 10, (this.s * factor) / this.fitS));
    const ns = this.fitS * k;
    const c = this.clampVals(ns, px - ((px - this.tx) * ns) / this.s, py - ((py - this.ty) * ns) / this.s);
    return { s: ns, tx: c.tx, ty: c.ty };
  }

  zoomAt(factor, px, py, live) {
    const z = this.zoomTarget(factor, px, py);
    this.s = z.s; this.tx = z.tx; this.ty = z.ty;
    if (live) this.preview(); else this.apply();
  }

  zoomButton(dir) {
    const r = this.box.getBoundingClientRect();
    if (dir === 'fit') return this.fit(false, true);
    const z = this.zoomTarget(dir === 'in' ? 1.5 : 1 / 1.5, r.width / 2, r.height / 2);
    this.animateTo(z.s, z.tx, z.ty);
  }

  clampVals(s, tx, ty) {
    const r = this.boxRect || this.box.getBoundingClientRect();
    const w = this.map.width * s, h = this.map.height * s;
    const m = 80;
    if (w <= r.width) tx = (r.width - w) / 2; else tx = Math.min(m, Math.max(r.width - w - m, tx));
    if (h <= r.height) ty = (r.height - h) / 2; else ty = Math.min(m, Math.max(r.height - h - m, ty));
    return { tx, ty };
  }

  clamp() {
    const c = this.clampVals(this.s, this.tx, this.ty);
    this.tx = c.tx; this.ty = c.ty;
  }

  // Durante un gesto (arrastrar, rueda, pellizco, animación) se transforma el <svg> entero con CSS:
  // lo mueve la tarjeta gráfica sin redibujar el mapa. Al terminar se confirma la posición real.
  preview(now) {
    if (!this.base) {
      this.base = { s: this.s, tx: this.tx, ty: this.ty };
      this.svg.classList.add('moving');
    }
    const paint = () => {
      this.pvRaf = 0;
      if (!this.base) return;
      const k = this.s / this.base.s;
      this.svg.style.transform = `translate3d(${(this.tx - k * this.base.tx).toFixed(2)}px, ${(this.ty - k * this.base.ty).toFixed(2)}px, 0) scale(${k.toFixed(5)})`;
    };
    if (now) paint();
    else if (!this.pvRaf) this.pvRaf = requestAnimationFrame(paint);
  }

  commit() {
    if (this.pvRaf) { cancelAnimationFrame(this.pvRaf); this.pvRaf = 0; }
    if (!this.base) return;
    this.base = null;
    this.apply();
    this.svg.style.transform = '';
    this.svg.classList.remove('moving');
  }

  animateTo(ns, ntx, nty, ms = 260) {
    if (this.anim) cancelAnimationFrame(this.anim);
    const s0 = this.s, x0 = this.tx, y0 = this.ty, t0 = performance.now();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) ms = 1;
    const ease = (u) => 1 - Math.pow(1 - u, 3);
    const step = (t) => {
      const u = Math.min(1, (t - t0) / ms), e = ease(u);
      this.s = s0 * Math.pow(ns / s0, e);
      this.tx = x0 + (ntx - x0) * e; this.ty = y0 + (nty - y0) * e;
      this.preview(true);
      if (u < 1) this.anim = requestAnimationFrame(step);
      else { this.anim = 0; this.s = ns; this.tx = ntx; this.ty = nty; this.commit(); }
    };
    this.anim = requestAnimationFrame(step);
  }

  apply() {
    this.vp.setAttribute('transform', `translate(${this.tx.toFixed(2)},${this.ty.toFixed(2)}) scale(${this.s.toFixed(5)})`);
    this.applyBadgeScale();
    this.renderAim();
  }

  // ------------------------------------------------ efectos: rosa de los vientos, flechas y ondas
  drawCompass(map) {
    const W = map.width, H = map.height, m = 70;
    const corners = [[m, m], [W - m, m], [m, H - m], [W - m, H - m]];
    let best = corners[0], bestD = -1;
    for (const [x, y] of corners) {
      const d = Math.min(...map.territories.map((t) => Math.hypot(t.cx - x, t.cy - y)));
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    const g = el('g', { transform: `translate(${best[0]},${best[1]})`, opacity: 0.38, class: 'compass' }, this.vp);
    el('circle', { r: 40, fill: 'none', stroke: 'rgba(170,200,230,.5)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, g);
    el('circle', { r: 30, fill: 'none', stroke: 'rgba(170,200,230,.3)', 'stroke-width': 1, 'stroke-dasharray': '2 4', 'vector-effect': 'non-scaling-stroke' }, g);
    el('path', { d: 'M0 -48 L7 -7 L48 0 L7 7 L0 48 L-7 7 L-48 0 L-7 -7 Z', fill: 'rgba(170,200,230,.25)' }, g);
    el('path', { d: 'M0 -48 L7 -7 L0 0 Z M48 0 L7 7 L0 0 Z M0 48 L-7 7 L0 0 Z M-48 0 L-7 -7 L0 0 Z', fill: 'rgba(225,235,245,.55)' }, g);
    const n = el('text', { y: -54, 'text-anchor': 'middle', class: 'compass-n' }, g);
    n.textContent = 'N';
  }

  drawArrow(g, a, b, color) {
    const T = this.map.territories, s = this.s;
    const A = { x: T[a].cx, y: T[a].cy }, B = { x: T[b].cx, y: T[b].cy };
    const r = 15 / s;
    const segs = [];
    if (this.wrapPairs.has(`${T[a].id}|${T[b].id}`)) {
      const W = this.map.width, left = A.x < B.x, my = (A.y + B.y) / 2;
      segs.push([A, { x: left ? -40 : W + 40, y: my }, false]);
      segs.push([{ x: left ? W + 40 : -40, y: my }, B, true]);
    } else segs.push([A, B, true]);
    for (const [P, Q, head] of segs) {
      const dx = Q.x - P.x, dy = Q.y - P.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const short = len * s < 70;
      const so = short ? len * 0.12 : Math.min(r, len * 0.28), eo = short ? len * 0.12 : Math.min(r * 1.1, len * 0.28);
      const st = head || segs.length === 1 ? { x: P.x + ux * so, y: P.y + uy * so } : P;
      const st2 = segs.length === 2 && head ? P : st;
      const en = head ? { x: Q.x - ux * eo, y: Q.y - uy * eo } : Q;
      const bend = Math.max(len * 0.3, (short ? 46 : 22) / s);
      const cx = (st2.x + en.x) / 2 - uy * bend, cy = (st2.y + en.y) / 2 + ux * bend;
      const d = `M${st2.x} ${st2.y} Q${cx} ${cy} ${en.x} ${en.y}`;
      el('path', { d, class: 'arrow-bg' }, g);
      el('path', { d, class: 'arrow-fg', stroke: color }, g);
      if (head) {
        const hx = en.x - cx, hy = en.y - cy, hl = Math.hypot(hx, hy) || 1, vx = hx / hl, vy = hy / hl;
        const L = 15 / s, Wd = 9 / s;
        const tip = { x: en.x + vx * L * 0.35, y: en.y + vy * L * 0.35 };
        const base = { x: tip.x - vx * L, y: tip.y - vy * L };
        el('path', { d: `M${tip.x} ${tip.y} L${base.x - vy * Wd} ${base.y + vx * Wd} L${base.x + vy * Wd} ${base.y - vx * Wd} Z`, class: 'arrow-head', fill: color }, g);
      }
    }
  }

  setAim(from, to, color) {
    this.aim = from >= 0 && to >= 0 ? { from, to, color } : null;
    this.renderAim();
  }

  renderAim() {
    if (!this.aimG) return;
    this.aimG.innerHTML = '';
    if (this.aim) this.drawArrow(this.aimG, this.aim.from, this.aim.to, this.aim.color);
  }

  flashArrow(from, to, color) {
    if (!this.arrowG) return;
    const g = el('g', { class: 'arrow-flash' }, this.arrowG);
    this.drawArrow(g, from, to, color);
    setTimeout(() => g.remove(), 1400);
  }

  ripple(t, color) {
    if (!this.fxG || !this.map.territories[t]) return;
    const { cx, cy } = this.map.territories[t], s = this.s;
    [0, 0.25].forEach((delay) => {
      const c = el('circle', { cx, cy, r: 12 / s, fill: 'none', stroke: color, 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke', opacity: 0 }, this.fxG);
      const a1 = el('animate', { attributeName: 'r', from: 12 / s, to: 80 / s, dur: '1s', begin: 'indefinite', fill: 'freeze' }, c);
      const a2 = el('animate', { attributeName: 'opacity', values: '0;0.95;0', keyTimes: '0;0.15;1', dur: '1s', begin: 'indefinite', fill: 'freeze' }, c);
      setTimeout(() => { try { a1.beginElement(); a2.beginElement(); } catch { /* */ } }, delay * 1000);
      setTimeout(() => c.remove(), 1400);
    });
  }

  applyBadgeScale() {
    if (!this.badges) return;
    if (Math.abs(this.lodFitS - this.fitS) > 1e-9) this.computeLOD();
    const k = this.s / this.fitS;
    const base = this.sizeAt(k) * (this.userBadge || 1);
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
      if (this.anim) { cancelAnimationFrame(this.anim); this.anim = 0; this.commit(); }
      this.boxRect = this.box.getBoundingClientRect();
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
        this.zoomAt(target / this.s, (a.x + b.x) / 2, (a.y + b.y) / 2, true);
        return;
      }
      if (this.drag && this.pointers.size === 1) {
        const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) > 7) { this.drag.moved = true; svg.classList.add('panning'); }
        if (this.drag.moved) { this.tx = this.drag.tx + dx; this.ty = this.drag.ty + dy; this.clamp(); this.preview(); }
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
        this.boxRect = null;
        this.commit();
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.onHover(-1); if (this.hoverT >= 0) this.paths[this.hoverT]?.classList.remove('hover'); this.hoverT = -1; } });
    svg.addEventListener('wheel', (e) => {
      if (!this.map) return;
      e.preventDefault();
      if (this.anim) { cancelAnimationFrame(this.anim); this.anim = 0; }
      const p = local(e);
      this.zoomAt(Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0022), p.x, p.y, true);
      clearTimeout(this.wheelT);
      this.wheelT = setTimeout(() => this.commit(), 140);
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
