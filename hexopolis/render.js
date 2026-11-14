/* HEXÓPOLIS — render del tablero (canvas), sprites pixel-art y efectos */
'use strict';

// ================= ICONOS VECTORIALES =================
const Sprites = (() => {
  const OUT = '#1d2430';
  function shade(hex, f) {
    if (!hex || hex[0] !== '#') return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  const rr = (x, a, b, w, h, r) => { x.beginPath(); x.roundRect(a, b, w, h, r); };
  const poly = (x, pts) => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); };
  const fillStroke = (x, fill, stroke = OUT, lw = 0.45) => { x.fillStyle = fill; x.fill(); if (stroke) { x.lineWidth = lw; x.strokeStyle = stroke; x.stroke(); } };

  function tree(x, cx, by, s) {
    rr(x, cx - 0.5 * s, by - 1.8 * s, 1 * s, 1.8 * s, 0.3 * s); fillStroke(x, '#7a4f2a', null);
    for (let i = 0; i < 3; i++) {
      const y = by - 1.3 * s - i * 1.55 * s, half = (2.5 - i * 0.55) * s, top = y - 2.3 * s;
      poly(x, [[cx, top], [cx + half, y], [cx - half, y]]); fillStroke(x, '#2f8a4c', '#1c5a31', 0.35);
      poly(x, [[cx, top], [cx - half, y], [cx - half * 0.15, y]]); x.fillStyle = 'rgba(255,255,255,0.18)'; x.fill();
    }
  }

  const ICONS = {
    wood: { w: 12, h: 12, draw(x) { tree(x, 9.1, 11.6, 0.9); tree(x, 4.6, 11.6, 1.22); } },
    brick: { w: 12, h: 9.5, draw(x) {
      const rows = [[0.5, [[0.4, 5.4], [6.2, 5.4]]], [3.4, [[0.4, 2.5], [3.3, 5.4], [9.1, 2.5]]], [6.3, [[0.4, 5.4], [6.2, 5.4]]]];
      for (const [y, bs] of rows) for (const [a, w] of bs) {
        rr(x, a, y, w, 2.6, 0.5); fillStroke(x, '#cf6a40', '#7d3a1d', 0.4);
        rr(x, a + 0.4, y + 0.35, w - 0.8, 0.6, 0.3); x.fillStyle = 'rgba(255,255,255,0.28)'; x.fill();
      }
    } },
    sheep: { w: 12, h: 9.5, draw(x) {
      x.fillStyle = '#3b3a40';
      for (const a of [3.2, 4.8, 7, 8.5]) { rr(x, a, 6.2, 0.8, 2.8, 0.35); x.fill(); }
      const blobs = [[3.6, 4.4, 2.2], [5.7, 3.3, 2.4], [7.8, 4.2, 2.2], [5.6, 5.6, 2.3], [3.2, 5.6, 1.9], [8.2, 5.7, 1.9]];
      x.fillStyle = '#c9c7bd'; for (const [a, b, r] of blobs) { x.beginPath(); x.arc(a, b, r + 0.45, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = '#fbfaf4'; for (const [a, b, r] of blobs) { x.beginPath(); x.arc(a, b, r, 0, Math.PI * 2); x.fill(); }
      x.beginPath(); x.ellipse(10.2, 4.3, 1.5, 1.9, 0.35, 0, Math.PI * 2); fillStroke(x, '#3b3a40', null);
      x.beginPath(); x.ellipse(9.1, 3.1, 0.9, 0.45, -0.5, 0, Math.PI * 2); x.fillStyle = '#3b3a40'; x.fill();
      x.beginPath(); x.arc(10.6, 3.9, 0.32, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();
    } },
    wheat: { w: 10, h: 12, draw(x) {
      const stalks = [[5, 1.2, 0], [2.4, 2.4, -0.38], [7.6, 2.4, 0.38]];
      x.lineWidth = 0.55; x.strokeStyle = '#a77a22';
      for (const [tx, ty] of stalks) { x.beginPath(); x.moveTo(5, 11.6); x.quadraticCurveTo(5, 7, tx, ty + 3.5); x.stroke(); }
      for (const [tx, ty, rot] of stalks) {
        for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
          const gx = tx + Math.sin(rot) * i * 1.1, gy = ty + Math.cos(rot) * i * 1.1 + 0.4;
          x.beginPath(); x.ellipse(gx + side * 0.55, gy, 0.5, 0.9, side * 0.5 + rot, 0, Math.PI * 2); fillStroke(x, '#f0c64a', '#a77a22', 0.3);
        }
      }
      rr(x, 3.6, 8.4, 2.8, 0.9, 0.4); fillStroke(x, '#8a5a2b', null);
    } },
    ore: { w: 12, h: 9.5, draw(x) {
      poly(x, [[0.4, 9], [4.3, 2.4], [6.1, 4.8], [8, 0.8], [11.6, 9]]); fillStroke(x, '#8f97ab', '#3f4556', 0.45);
      poly(x, [[8, 0.8], [11.6, 9], [8.6, 9], [7.4, 4.6]]); x.fillStyle = '#6b7286'; x.fill();
      poly(x, [[4.3, 2.4], [6.1, 4.8], [4.4, 4.2], [3, 4.6]]); x.fillStyle = '#f3f5f8'; x.fill();
      poly(x, [[8, 0.8], [9.2, 3.5], [8.1, 3], [7, 3.4]]); x.fillStyle = '#f3f5f8'; x.fill();
      x.beginPath(); x.ellipse(3, 8.1, 1.3, 0.8, 0, 0, Math.PI * 2); fillStroke(x, '#5b6276', '#3f4556', 0.35);
    } },
    desert: { w: 8, h: 10, draw(x) {
      rr(x, 3, 0.8, 2.1, 9, 1.05); fillStroke(x, '#4f9a5b', '#2c5f35', 0.4);
      rr(x, 0.8, 3, 1.3, 3.4, 0.65); fillStroke(x, '#4f9a5b', '#2c5f35', 0.4);
      rr(x, 0.8, 5.3, 3, 1.2, 0.6); fillStroke(x, '#4f9a5b', null);
      rr(x, 6, 2.2, 1.3, 3, 0.65); fillStroke(x, '#4f9a5b', '#2c5f35', 0.4);
      rr(x, 4.4, 4.2, 2.9, 1.2, 0.6); fillStroke(x, '#4f9a5b', null);
      x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 0.3; x.beginPath(); x.moveTo(3.9, 1.8); x.lineTo(3.9, 9); x.stroke();
    } },
    settlement: { w: 8, h: 8, draw(x, p) {
      rr(x, 1, 3.6, 6, 4, 0.4); fillStroke(x, p.P, OUT, 0.5);
      poly(x, [[0.3, 4.1], [4, 0.4], [7.7, 4.1]]); fillStroke(x, p.p, OUT, 0.5);
      rr(x, 3.3, 5.1, 1.4, 2.5, 0.3); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fill();
      poly(x, [[1.2, 3.9], [4, 1.1], [4, 1.8], [1.9, 3.9]]); x.fillStyle = 'rgba(255,255,255,0.3)'; x.fill();
    } },
    city: { w: 12, h: 10, draw(x, p) {
      rr(x, 0.8, 2, 4.8, 7.6, 0.4); fillStroke(x, p.P, OUT, 0.5);
      poly(x, [[0.5, 2.3], [3.2, 0.3], [5.9, 2.3]]); fillStroke(x, p.p, OUT, 0.5);
      rr(x, 5.4, 5, 6, 4.6, 0.4); fillStroke(x, p.P, OUT, 0.5);
      poly(x, [[5, 5.3], [8.4, 2.3], [11.8, 5.3]]); fillStroke(x, p.p, OUT, 0.5);
      x.fillStyle = 'rgba(255,248,220,0.85)';
      for (const [a, b] of [[1.8, 3.4], [3.6, 3.4], [1.8, 5.6], [3.6, 5.6]]) { rr(x, a, b, 1, 1.2, 0.2); x.fill(); }
      rr(x, 7.7, 6.6, 1.4, 3, 0.3); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fill();
    } },
    robber: { w: 8, h: 11, draw(x) {
      const g = x.createLinearGradient(0, 0, 8, 0); g.addColorStop(0, '#5a6072'); g.addColorStop(1, '#2c303b');
      x.beginPath(); x.moveTo(4, 0.5); x.bezierCurveTo(6.6, 0.5, 6.8, 3.8, 6, 5); x.lineTo(7.4, 10.4); x.quadraticCurveTo(4, 11.2, 0.6, 10.4); x.lineTo(2, 5); x.bezierCurveTo(1.2, 3.8, 1.4, 0.5, 4, 0.5); x.closePath();
      fillStroke(x, g, '#161a22', 0.45);
      x.beginPath(); x.ellipse(4, 3.3, 1.5, 1.3, 0, 0, Math.PI * 2); x.fillStyle = '#161a22'; x.fill();
      x.fillStyle = '#f2c14e'; for (const a of [3.4, 4.6]) { x.beginPath(); x.arc(a, 3.3, 0.28, 0, Math.PI * 2); x.fill(); }
    } },
    knight: { w: 9, h: 9.5, draw(x) {
      x.beginPath(); x.moveTo(1, 1); x.lineTo(8, 1); x.lineTo(8, 4.6); x.quadraticCurveTo(7.8, 7.6, 4.5, 9); x.quadraticCurveTo(1.2, 7.6, 1, 4.6); x.closePath();
      fillStroke(x, '#d7dbe4', '#4b5163', 0.55);
      x.fillStyle = '#c8372d'; rr(x, 3.9, 2, 1.2, 5.6, 0.3); x.fill(); rr(x, 2.2, 3.6, 4.6, 1.2, 0.3); x.fill();
    } },
    devcard: { w: 7, h: 9, draw(x) {
      rr(x, 0.6, 0.6, 5.8, 7.8, 0.9); fillStroke(x, '#6a55b8', '#f6efdc', 0.6);
      const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.9 : 2; pts.push([3.5 + Math.cos(a) * r, 4.6 + Math.sin(a) * r]); }
      poly(x, pts); x.fillStyle = '#f2c14e'; x.fill();
    } },
    card: { w: 7, h: 9, draw(x) {
      rr(x, 0.6, 0.6, 5.8, 7.8, 0.9); fillStroke(x, '#2f5d8a', '#f6efdc', 0.6);
      poly(x, [[3.5, 2.3], [5, 4.5], [3.5, 6.7], [2, 4.5]]); x.fillStyle = '#f2c14e'; x.fill();
    } },
    road: { w: 9, h: 9, draw(x, p) {
      x.lineCap = 'round';
      x.strokeStyle = OUT; x.lineWidth = 2.8; x.beginPath(); x.moveTo(1.6, 7.4); x.lineTo(7.4, 1.6); x.stroke();
      x.strokeStyle = p.P; x.lineWidth = 1.9; x.beginPath(); x.moveTo(1.6, 7.4); x.lineTo(7.4, 1.6); x.stroke();
    } },
    trophy: { w: 9, h: 9, draw(x) {
      x.beginPath(); x.moveTo(2, 1); x.lineTo(7, 1); x.quadraticCurveTo(7, 5, 4.5, 5.6); x.quadraticCurveTo(2, 5, 2, 1); x.closePath(); fillStroke(x, '#f2c14e', '#8a6410', 0.4);
      x.lineWidth = 0.6; x.strokeStyle = '#d29b16'; x.beginPath(); x.arc(2, 2.4, 1, Math.PI * 0.5, Math.PI * 1.5); x.stroke(); x.beginPath(); x.arc(7, 2.4, 1, -Math.PI * 0.5, Math.PI * 0.5); x.stroke();
      rr(x, 4, 5.4, 1, 1.6, 0.2); x.fillStyle = '#d29b16'; x.fill();
      rr(x, 2.6, 7, 3.8, 1.3, 0.4); fillStroke(x, '#c88f1a', '#8a6410', 0.35);
    } },
    vp: { w: 9, h: 9, draw(x) {
      const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 1.8 : 4; pts.push([4.5 + Math.cos(a) * r, 4.8 + Math.sin(a) * r]); }
      poly(x, pts); fillStroke(x, '#f2c14e', '#8a6410', 0.45);
    } },
    yop: { w: 9, h: 9, draw(x) {
      rr(x, 0.8, 1.6, 4.4, 6, 0.7); fillStroke(x, '#e8c25a', '#8a6410', 0.4);
      rr(x, 3.6, 1, 4.4, 6, 0.7); fillStroke(x, '#9ccc5c', '#4c7a26', 0.4);
      x.beginPath(); x.arc(6.6, 6.8, 1.9, 0, Math.PI * 2); fillStroke(x, '#fff', '#1d2430', 0.4);
      x.fillStyle = '#1d2430'; rr(x, 6.25, 5.6, 0.7, 2.4, 0.2); x.fill(); rr(x, 5.4, 6.45, 2.4, 0.7, 0.2); x.fill();
    } },
    monopoly: { w: 9, h: 9.5, draw(x) {
      x.beginPath(); x.moveTo(3, 2.6); x.quadraticCurveTo(0.4, 5, 1.2, 7.6); x.quadraticCurveTo(4.5, 9.6, 7.8, 7.6); x.quadraticCurveTo(8.6, 5, 6, 2.6); x.closePath();
      fillStroke(x, '#c9a46a', '#6e5126', 0.45);
      rr(x, 2.8, 1.2, 3.4, 1.6, 0.6); fillStroke(x, '#b38a4c', '#6e5126', 0.4);
      x.fillStyle = '#6e5126'; x.font = '700 4px Fredoka, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', 4.5, 6.2);
    } },
    any: { w: 6, h: 7, draw(x, p) {
      x.fillStyle = p.N || '#3d4a5c'; x.font = '700 7px Fredoka, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 3, 3.8);
    } },
  };

  const cache = new Map();
  const R = 2; // resolución interna (pantallas retina)
  function get(name, scale, color, extra) {
    const key = name + '|' + scale + '|' + (color || '') + (extra ? JSON.stringify(extra) : '');
    if (cache.has(key)) return cache.get(key);
    const I = ICONS[name] || ICONS.card;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(I.w * scale * R)); c.height = Math.max(1, Math.ceil(I.h * scale * R));
    c.cw = I.w * scale; c.ch = I.h * scale;
    const x = c.getContext('2d');
    x.scale(scale * R, scale * R);
    x.lineJoin = 'round'; x.lineCap = 'round';
    const P = color || '#c9a46a';
    I.draw(x, Object.assign({ P, p: shade(P, -0.3) }, extra || {}));
    cache.set(key, c);
    return c;
  }
  const urls = new Map();
  function url(name, scale = 3, color) {
    const k = name + scale + (color || '');
    if (!urls.has(k)) urls.set(k, get(name, scale, color).toDataURL());
    return urls.get(k);
  }
  return { get, url, shade };
})();

const TILE = {
  wood: { c1: '#3f8f52', c2: '#2a6b3b', name: 'Bosque' },
  brick: { c1: '#c9693f', c2: '#9c4a29', name: 'Cantera' },
  sheep: { c1: '#9ccc5c', c2: '#74a63d', name: 'Pradera' },
  wheat: { c1: '#e8c25a', c2: '#c69c32', name: 'Campo' },
  ore: { c1: '#8d93a6', c2: '#666d82', name: 'Montaña' },
  desert: { c1: '#e6d2a2', c2: '#c9b07a', name: 'Desierto' },
};
const RES_STROKE = { wood: '#2f8a4c', brick: '#c0532c', sheep: '#6fae3f', wheat: '#d29b16', ore: '#6d7690' };
const RES_COLOR = { wood: '#3ee07a', brick: '#ff7a45', sheep: '#b6f36b', wheat: '#ffd84a', ore: '#b9c2e0' };

const ease = {
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// ---------- geometría del mar ----------
function convexHull(pts) {
  const p = pts.map((q) => [Math.round(q[0] * 1e4) / 1e4, Math.round(q[1] * 1e4) / 1e4]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 1e-9) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up); // sentido antihorario (con y hacia abajo se ve horario)
}
// desplaza hacia fuera cada lado de un polígono convexo una distancia d
function offsetPoly(poly, d) {
  const n = poly.length, lines = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const nx = dy / L, ny = -dx / L; // normal exterior para el sentido del casco
    lines.push({ p: [a[0] + nx * d, a[1] + ny * d], d: [dx, dy] });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n], l2 = lines[i];
    const den = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
    if (Math.abs(den) < 1e-9) { out.push(l2.p); continue; }
    const t = ((l2.p[0] - l1.p[0]) * l2.d[1] - (l2.p[1] - l1.p[1]) * l2.d[0]) / den;
    out.push([l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t]);
  }
  return out;
}
function inPoly(px, py, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ================= TABLERO =================
class BoardRenderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.view = null; this.boardId = null;
    this.S = 40; this.cx = 0; this.cy = 0;
    this.region = { x: 0, y: 0, w: 100, h: 100 };
    this.tiles = []; this.base = null;
    this.pop = new Map();
    this.targets = null; // {type, ids:Set, color}
    this.hover = null;
    this.glow = null;
    this.robberAnim = null;
    this.introT = 0;
    this.shakeT = 0;
    this.dirty = true; // se redibuja solo cuando algo cambia o hay una animación en marcha
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 2 + 0.5, p: Math.random() * 6 }));
    this.onPick = null;
    this.onZoom = null;
    this.zoom = 1; this.panX = 0; this.panY = 0; this.baseS = 40;
    this.interactive = true;
    // ratón: clic, arrastrar para mover, rueda para zoom
    let drag = null;
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) drag = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY, moved: false }; });
    window.addEventListener('mousemove', (e) => {
      if (drag && (e.buttons & 1)) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; this.cv.style.cursor = 'grabbing'; }
        if (drag.moved) { this.setPan(drag.px + dx, drag.py + dy); return; }
      }
      if (e.target === canvas) this.move(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.moved) { this.cv.style.cursor = 'default'; return; }
      if (e.target === canvas) this.click(e.clientX, e.clientY);
    });
    canvas.addEventListener('mouseleave', () => { if (this.hover != null) { this.hover = null; this.dirty = true; } });
    canvas.addEventListener('wheel', (e) => {
      if (!this.interactive) return;
      e.preventDefault();
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      this.setZoom(this.zoom * f, e.clientX, e.clientY);
    }, { passive: false });
    // táctil: un dedo mueve, dos dedos amplían/alejan (y mueven a la vez), un toque = clic
    const pts = new Map();
    let g = null;
    const center = () => ({ x: this.region.x + this.region.w / 2, y: this.region.y + this.region.h / 2 });
    const begin = (fromGesture) => {
      const arr = [...pts.values()];
      if (arr.length === 1) {
        g = { mode: 'pan', x: arr[0].x, y: arr[0].y, px: this.panX, py: this.panY, moved: !!fromGesture };
      } else if (arr.length >= 2) {
        const [p1, p2] = arr;
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        g = { mode: 'pinch', d: Math.max(20, Math.hypot(p1.x - p2.x, p1.y - p2.y)), z: this.zoom, bx: (mx - this.cx) / this.S, by: (my - this.cy) / this.S, moved: true };
      } else g = null;
    };
    const track = (list) => { for (const t of list) if (pts.has(t.identifier)) pts.set(t.identifier, { x: t.clientX, y: t.clientY }); };
    canvas.addEventListener('touchstart', (e) => {
      if (!this.interactive) return;
      for (const t of e.changedTouches) pts.set(t.identifier, { x: t.clientX, y: t.clientY });
      begin(g && g.moved);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!g) return;
      track(e.changedTouches);
      const arr = [...pts.values()];
      if (g.mode === 'pan' && arr.length === 1) {
        const dx = arr[0].x - g.x, dy = arr[0].y - g.y;
        if (!g.moved && Math.hypot(dx, dy) > 8) g.moved = true;
        if (g.moved) this.setPan(g.px + dx, g.py + dy);
      } else if (g.mode === 'pinch' && arr.length >= 2) {
        const [p1, p2] = arr;
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        const z = Math.max(0.7, Math.min(3, g.z * d / g.d));
        const c = center();
        this.zoom = z;
        const S2 = this.baseS * z;
        // el punto del tablero que estaba bajo los dedos sigue bajo los dedos
        this.panX = mx - g.bx * S2 - c.x;
        this.panY = my - g.by * S2 - c.y;
        this.applyCamera(true);
        if (this.onZoom) this.onZoom(z);
      }
    }, { passive: false });
    const end = (e) => {
      e.preventDefault();
      const wasTap = e.type === 'touchend' && g && g.mode === 'pan' && !g.moved && pts.size === 1;
      for (const t of e.changedTouches) pts.delete(t.identifier);
      if (wasTap) { const t = e.changedTouches[0]; this.move(t.clientX, t.clientY); this.click(t.clientX, t.clientY); }
      if (pts.size > 0) begin(true); else g = null;
    };
    canvas.addEventListener('touchend', end, { passive: false });
    canvas.addEventListener('touchcancel', end, { passive: false });
  }

  // ---------- zoom y desplazamiento ----------
  setZoom(z, px, py) {
    z = Math.max(0.7, Math.min(3, z));
    const r = this.region;
    if (px == null) { px = r.x + r.w / 2; py = r.y + r.h / 2; }
    const bx = (px - this.cx) / this.S, by = (py - this.cy) / this.S;
    this.zoom = z;
    const S2 = this.baseS * z;
    this.panX = px - bx * S2 - (r.x + r.w / 2);
    this.panY = py - by * S2 - (r.y + r.h / 2);
    this.applyCamera(true);
    if (this.onZoom) this.onZoom(z);
  }
  setPan(x, y) { this.panX = x; this.panY = y; this.applyCamera(false); }
  resetCamera() { this.zoom = 1; this.panX = 0; this.panY = 0; this.applyCamera(true); if (this.onZoom) this.onZoom(1); }
  applyCamera(rebuild) {
    const r = this.region;
    const lim = this.baseS * (this.ext ? Math.max(this.ext.x, this.ext.y) * 0.9 : 5.2) * Math.max(this.zoom, 0.6);
    this.panX = Math.max(-lim, Math.min(lim, this.panX));
    this.panY = Math.max(-lim, Math.min(lim, this.panY));
    this.S = this.baseS * this.zoom;
    this.cx = r.x + r.w / 2 + this.panX; this.cy = r.y + r.h / 2 + this.panY;
    this.dirty = true;
    if (rebuild) {
      clearTimeout(this.cacheT);
      // reconstruir las texturas al terminar el gesto; mientras, se escalan las actuales
      this.cacheT = setTimeout(() => this.buildCaches(), 120);
    }
  }

  resize(region) {
    this.W = window.innerWidth; this.H = window.innerHeight;
    // en pantallas muy grandes se baja un poco la resolución interna para que vaya fluido
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.W * this.H * dpr * dpr > 4.2e6) dpr = Math.max(1, Math.sqrt(4.2e6 / (this.W * this.H)));
    this.dpr = dpr;
    this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    if (region) this.region = region;
    this.fitBoard();
    this.buildCaches();
  }
  // tamaño de las casillas para que la isla entera (con su mar) quepa en la zona libre
  fitBoard() {
    const r = this.region;
    const e = this.ext || { x: 5.75, y: 4.98 };
    this.baseS = Math.max(14, Math.min(r.w / (2 * e.x * 0.92), r.h / (2 * e.y * 1.0)));
    this.applyCamera(false);
  }
  // forma del mar: envolvente de la isla ensanchada (sirve para el mapa normal y el grande)
  computeSea() {
    const B = this.view.board, pts = [];
    for (const h of B.hexes) for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); pts.push([h.x + Math.cos(a), h.y + Math.sin(a)]); }
    const hull = convexHull(pts);
    const outer = offsetPoly(hull, 1.15);
    let ex = 0, ey = 0; for (const [px, py] of outer) { ex = Math.max(ex, Math.abs(px)); ey = Math.max(ey, Math.abs(py)); }
    this.sea = { hull, outer };
    this.ext = { x: ex, y: ey };
  }

  setView(view, events = [], me = -1) {
    const first = !this.view || this.boardId !== view.boardKey;
    const prevRobber = this.view ? this.view.board.robber : null;
    this.view = view; this.me = me; this.dirty = true;
    if (first) {
      this.boardId = view.boardKey;
      this.introT = performance.now();
      this.pop.clear();
      this.robberAnim = null;
      this.computeSea();
      this.panX = 0; this.panY = 0; this.fitBoard();
      this.buildCaches();
    }
    const now = performance.now();
    for (const e of events) {
      if (e.type === 'build') this.pop.set(e.kind === 'road' ? 'e' + e.e : 'v' + e.v, now);
      if (e.type === 'produce' && !e.setup) this.glow = { ids: new Set(e.gains.map((g) => g.hex)), num: e.roll, t0: now };
      if (e.type === 'roll') this.glowNum = { num: e.sum, t0: now };
      if (e.type === 'robber' && prevRobber != null) this.robberAnim = { from: e.from, to: e.hex, t0: now };
    }
  }

  toScreen(x, y) { return { x: this.cx + x * this.S, y: this.cy + y * this.S }; }
  hexScreen(id) { const h = this.view.board.hexes[id]; return this.toScreen(h.x, h.y); }
  vertexScreen(id) { const v = this.view.board.vertices[id]; return this.toScreen(v.x, v.y); }

  // ---------- caché de casillas ----------
  buildCaches() {
    this.dirty = true;
    if (!this.view) return;
    const S = this.S, dpr = this.dpr || 1;
    this.cacheS = S;
    const B = this.view.board;
    this.tiles = B.hexes.map((h) => this.drawTile(h, S, dpr));
    // base: mar + puertos (el mar sigue la forma de la isla)
    if (!this.sea) this.computeSea();
    const sea = this.sea;
    const R = Math.max(this.ext.x, this.ext.y) * S;
    const c = document.createElement('canvas');
    const size = Math.ceil(R * 2 + S);
    c.width = size * dpr; c.height = size * dpr;
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const o = size / 2;
    const polyPath = (poly, round) => {
      x.beginPath();
      const n = poly.length, P = (i) => poly[(i + n) % n];
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const m0 = mid(P(-1), P(0));
      x.moveTo(o + m0[0] * S, o + m0[1] * S);
      for (let i = 0; i < n; i++) { const p0 = P(i), p1 = mid(P(i), P(i + 1)); x.arcTo(o + p0[0] * S, o + p0[1] * S, o + p1[0] * S, o + p1[1] * S, round * S); }
      x.closePath();
    };
    // sombra
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = S * 0.5; x.shadowOffsetY = S * 0.12;
    polyPath(sea.outer, 0.6); x.fillStyle = '#1b5f8f'; x.fill();
    x.restore();
    polyPath(sea.outer, 0.6);
    const g = x.createRadialGradient(o, o, S, o, o, R);
    g.addColorStop(0, '#3b8fc4'); g.addColorStop(1, '#1f5f8e');
    x.fillStyle = g; x.fill();
    x.lineWidth = Math.max(4, S * 0.16); x.strokeStyle = '#d9c08a'; x.stroke();
    polyPath(offsetPoly(sea.hull, 1.07), 0.55); x.lineWidth = 1.5; x.strokeStyle = 'rgba(255,255,255,0.35)'; x.stroke();
    // olas: solo en la franja de mar entre la costa y el marco
    x.strokeStyle = 'rgba(255,255,255,0.13)'; x.lineWidth = Math.max(1, S * 0.03); x.lineCap = 'round';
    const inner = offsetPoly(sea.hull, 0.2), outerIn = offsetPoly(sea.hull, 0.95);
    let placed = 0;
    for (let i = 0; i < 900 && placed < 70 + B.hexes.length; i++) {
      const px = (Math.random() * 2 - 1) * this.ext.x, py = (Math.random() * 2 - 1) * this.ext.y;
      if (!inPoly(px, py, outerIn) || inPoly(px, py, inner)) continue;
      placed++;
      const wx = o + px * S, wy = o + py * S, w = S * 0.18;
      x.beginPath(); x.moveTo(wx - w, wy); x.quadraticCurveTo(wx - w / 2, wy - w * 0.5, wx, wy); x.quadraticCurveTo(wx + w / 2, wy + w * 0.5, wx + w, wy); x.stroke();
    }
    // puertos
    for (const p of B.ports) {
      const P = (xx, yy) => ({ x: o + xx * S, y: o + yy * S });
      const pp = P(p.x, p.y), a = P(p.ax, p.ay), b = P(p.bx, p.by);
      x.strokeStyle = '#c08a4f'; x.lineWidth = Math.max(3, S * 0.11); x.lineCap = 'round';
      for (const q of [a, b]) { x.beginPath(); x.moveTo(q.x + (pp.x - q.x) * 0.15, q.y + (pp.y - q.y) * 0.15); x.lineTo(pp.x + (q.x - pp.x) * 0.3, pp.y + (q.y - pp.y) * 0.3); x.stroke(); }
      const rr = S * 0.36;
      x.beginPath(); x.arc(pp.x, pp.y, rr, 0, Math.PI * 2);
      x.fillStyle = '#f6efdc'; x.fill();
      x.lineWidth = Math.max(2, S * 0.07); x.strokeStyle = p.type === 'any' ? '#5b6b80' : RES_STROKE[p.type]; x.stroke();
      const sc = S / 24;
      const spr = Sprites.get(p.type === 'any' ? 'any' : p.type, sc, null, p.type === 'any' ? { N: '#3d4a5c' } : null);
      x.imageSmoothingEnabled = true;
      x.drawImage(spr, pp.x - spr.cw / 2, pp.y - rr * 0.82, spr.cw, spr.ch);
      x.fillStyle = '#2b3442'; x.font = `600 ${Math.max(9, S * 0.24)}px "Fredoka", system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(p.ratio + ':1', pp.x, pp.y + rr * 0.48);
    }
    this.base = { c, size };
  }

  drawTile(h, S, dpr) {
    const pad = S * 0.25;
    const w = Math.ceil(S * 2 + pad * 2), hgt = Math.ceil(S * 2 + pad * 2 + S * 0.15);
    const c = document.createElement('canvas');
    c.width = w * dpr; c.height = hgt * dpr;
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const o = { x: w / 2, y: w / 2 };
    const T = TILE[h.res];
    const path = (r, dy = 0) => { x.beginPath(); for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); x.lineTo(o.x + Math.cos(a) * r, o.y + dy + Math.sin(a) * r); } x.closePath(); };
    const r = S * 0.965;
    // grosor 3D
    path(r, S * 0.12); x.fillStyle = Sprites.shade(T.c2, -0.35); x.fill();
    path(r); x.fillStyle = T.c1; x.fill();
    // textura tramada
    x.save(); path(r); x.clip();
    const rg = x.createRadialGradient(o.x, o.y - r * 0.3, r * 0.1, o.x, o.y, r * 1.1);
    rg.addColorStop(0, Sprites.shade(T.c1, 0.12)); rg.addColorStop(1, T.c2);
    x.fillStyle = rg; x.fillRect(0, 0, w, w);
    // brillo superior
    const g = x.createLinearGradient(0, o.y - r, 0, o.y + r);
    g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
    // sprites
    x.imageSmoothingEnabled = true;
    const sc = S / 16;
    const spr = Sprites.get(h.res, sc);
    const spots = h.res === 'desert' ? [[-0.42, -0.35], [0.42, 0.25], [0, 0]] : [[-0.5, -0.42], [0.5, -0.42], [-0.05, 0.5]];
    spots.forEach(([dx, dy], i) => {
      if (h.res === 'desert' && i === 2) return;
      x.drawImage(spr, o.x + dx * S - spr.cw / 2, o.y + dy * S - spr.ch / 2, spr.cw, spr.ch);
    });
    x.restore();
    path(r); x.lineWidth = Math.max(2, S * 0.06); x.strokeStyle = '#e9d9b0'; x.stroke();
    path(r * 0.94); x.lineWidth = 1; x.strokeStyle = 'rgba(255,255,255,0.15)'; x.stroke();
    // ficha de número
    if (h.num) {
      const tr = S * 0.33;
      x.beginPath(); x.arc(o.x, o.y + S * 0.04, tr, 0, Math.PI * 2); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fill();
      x.beginPath(); x.arc(o.x, o.y, tr, 0, Math.PI * 2); x.fillStyle = '#fff3d6'; x.fill();
      x.lineWidth = Math.max(1, S * 0.03); x.strokeStyle = 'rgba(60,45,20,0.45)'; x.stroke();
      const red = h.num === 6 || h.num === 8;
      x.fillStyle = red ? '#c8372d' : '#2b2416';
      x.font = `700 ${Math.round(S * (red ? 0.36 : 0.32))}px "Fredoka", system-ui, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(String(h.num), o.x, o.y - S * 0.035);
      const pips = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }[h.num];
      const ps = Math.max(2, S * 0.055);
      for (let i = 0; i < pips; i++) { x.beginPath(); x.arc(o.x - (pips * ps * 1.6) / 2 + i * ps * 1.6 + ps * 0.8, o.y + tr * 0.6, ps * 0.5, 0, Math.PI * 2); x.fill(); }
    }
    return { c, w, hgt, o };
  }

  // ---------- interacción ----------
  setTargets(t) { this.targets = t; if (!t) this.hover = null; this.dirty = true; }
  findTarget(px, py) {
    const t = this.targets; if (!t || !this.view) return null;
    const B = this.view.board, S = this.S;
    let best = null, bd = 1e9;
    if (t.type === 'vertex') for (const id of t.ids) { const p = this.vertexScreen(id); const d = Math.hypot(p.x - px, p.y - py); if (d < bd) { bd = d; best = id; } }
    if (t.type === 'edge') for (const id of t.ids) {
      const e = B.edges[id], a = this.vertexScreen(e.a), b = this.vertexScreen(e.b);
      const d = distSeg(px, py, a.x, a.y, b.x, b.y); if (d < bd) { bd = d; best = id; }
    }
    if (t.type === 'hex') for (const id of t.ids) { const p = this.hexScreen(id); const d = Math.hypot(p.x - px, p.y - py); if (d < bd) { bd = d; best = id; } }
    const lim = t.type === 'hex' ? S * 0.85 : S * 0.42;
    return bd <= lim ? best : null;
  }
  move(x, y) { const h = this.findTarget(x, y); if (h !== this.hover) { this.hover = h; this.dirty = true; } this.cv.style.cursor = this.hover != null ? 'pointer' : 'default'; }
  click(x, y) { const id = this.findTarget(x, y); if (id != null && this.onPick) this.onPick(this.targets.type, id); }
  shake() { this.shakeT = performance.now(); this.dirty = true; }
  // ¿hay algo moviéndose? (entrada del tablero, piezas nuevas, brillo de la tirada, ladrón, temblor u objetivos que laten)
  animating(now) {
    if (!this.view) return false;
    if (now - this.introT < 900 + this.view.board.hexes.length * 45) return true;
    if (this.targets) return true;
    if (now - this.shakeT < 450) return true;
    if (this.glowNum && now - this.glowNum.t0 < 2200) return true;
    if (this.robberAnim && now - this.robberAnim.t0 < 600) return true;
    for (const [k, t0] of this.pop) { if (now - t0 < 450) return true; this.pop.delete(k); }
    return false;
  }

  // ---------- fondo ----------
  drawBackground(now) {
    const x = this.ctx, W = this.W, H = this.H;
    if (!this.bgCache || this.bgCache.w !== W || this.bgCache.h !== H) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g2 = c.getContext('2d');
      const g = g2.createRadialGradient(W / 2, H * 0.45, 50, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, '#1d3a57'); g.addColorStop(0.55, '#132a42'); g.addColorStop(1, '#0b1726');
      g2.fillStyle = g; g2.fillRect(0, 0, W, H);
      this.bgCache = { c, w: W, h: H };
    }
    x.drawImage(this.bgCache.c, 0, 0, W, H);
  }

  // ---------- frame ----------
  frame(now) {
    const anim = this.animating(now);
    if (!this.dirty && !anim) return; // nada ha cambiado: no se vuelve a pintar
    this.dirty = anim; // tras una animación se pinta una vez más para dejarla en su sitio
    const x = this.ctx;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.imageSmoothingEnabled = true;
    this.drawBackground(now);
    if (!this.view) return;
    const S = this.S, B = this.view.board;
    x.save();
    const st = (now - this.shakeT) / 450;
    if (st < 1) { const m = (1 - st) * S * 0.12; x.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m); }

    const intro = now - this.introT;
    // base
    if (this.base) {
      const p = ease.outCubic(clamp01(intro / 500));
      x.globalAlpha = p;
      const sz = this.base.size * (this.S / this.cacheS) * (0.9 + 0.1 * p);
      x.imageSmoothingEnabled = true;
      x.drawImage(this.base.c, this.cx - sz / 2, this.cy - sz / 2, sz, sz);
      x.globalAlpha = 1;
    }
    // casillas
    x.imageSmoothingEnabled = true;
    B.hexes.forEach((h, i) => {
      const T = this.tiles[i]; if (!T) return;
      const p = clamp01((intro - 250 - i * 45) / 420);
      if (p <= 0) return;
      const sc = ease.outBack(p) * (this.S / this.cacheS);
      const c = this.toScreen(h.x, h.y);
      const drop = (1 - ease.outCubic(p)) * -S * 1.5;
      x.globalAlpha = Math.min(1, p * 2);
      x.drawImage(T.c, c.x - T.o.x * sc, c.y - T.o.y * sc + drop, T.w * sc, T.hgt * sc);
    });
    x.globalAlpha = 1;

    // brillo producción
    const hexPath = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); };
    if (this.glowNum && now - this.glowNum.t0 < 2200) {
      const k = 1 - (now - this.glowNum.t0) / 2200;
      for (const h of B.hexes) {
        if (h.num !== this.glowNum.num) continue;
        const c = this.hexScreen(h.id);
        x.save(); x.shadowColor = '#fff'; x.shadowBlur = 25 * k;
        hexPath(c.x, c.y, S * 0.95); x.lineWidth = 4; x.strokeStyle = `rgba(255,255,255,${0.9 * k * (0.6 + 0.4 * Math.sin(now / 80))})`; x.stroke();
        x.restore();
      }
    }

    // objetivos hex (ladrón)
    const T = this.targets;
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    if (T && T.type === 'hex') {
      for (const id of T.ids) {
        const c = this.hexScreen(id);
        hexPath(c.x, c.y, S * 0.9);
        x.lineWidth = id === this.hover ? 5 : 3;
        x.strokeStyle = id === this.hover ? '#e5484d' : `rgba(229,72,77,${0.35 + 0.4 * pulse})`;
        x.stroke();
        if (id === this.hover) { x.fillStyle = 'rgba(229,72,77,0.18)'; x.fill(); }
      }
    }

    // caminos
    x.lineCap = 'round';
    for (const e of B.edges) {
      if (e.road === null) continue;
      const a = this.vertexScreen(e.a), b = this.vertexScreen(e.b);
      const t0 = this.pop.get('e' + e.id);
      const p = t0 ? ease.outCubic(clamp01((now - t0) / 320)) : 1;
      const ax = a.x + (b.x - a.x) * 0.12, ay = a.y + (b.y - a.y) * 0.12;
      const bx = a.x + (b.x - a.x) * (0.12 + 0.76 * p), by = a.y + (b.y - a.y) * (0.12 + 0.76 * p);
      const col = this.view.players[e.road].color;
      x.strokeStyle = '#120d22'; x.lineWidth = S * 0.22;
      x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      x.strokeStyle = col; x.lineWidth = S * 0.13;
      x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = S * 0.035;
      x.beginPath(); x.moveTo(ax, ay - S * 0.025); x.lineTo(bx, by - S * 0.025); x.stroke();
    }
    // objetivos arista
    if (T && T.type === 'edge') {
      for (const id of T.ids) {
        const e = B.edges[id], a = this.vertexScreen(e.a), b = this.vertexScreen(e.b);
        const hv = id === this.hover;
        x.setLineDash(hv ? [] : [S * 0.12, S * 0.1]);
        x.lineDashOffset = -now / 30;
        x.strokeStyle = hv ? T.color : Sprites.shade(T.color, 0.2);
        x.globalAlpha = hv ? 1 : 0.45 + 0.45 * pulse;
        x.lineWidth = hv ? S * 0.15 : S * 0.08;
        x.beginPath(); x.moveTo(a.x + (b.x - a.x) * 0.15, a.y + (b.y - a.y) * 0.15); x.lineTo(a.x + (b.x - a.x) * 0.85, a.y + (b.y - a.y) * 0.85); x.stroke();
        x.setLineDash([]); x.globalAlpha = 1;
      }
    }
    // edificios
    x.imageSmoothingEnabled = true;
    const sc = S / 10;
    for (const v of B.vertices) {
      if (!v.b) continue;
      const p = this.vertexScreen(v.id);
      const t0 = this.pop.get('v' + v.id);
      const k = t0 ? ease.outBack(clamp01((now - t0) / 380)) : 1;
      const spr = Sprites.get(v.b.type, sc, this.view.players[v.b.owner].color);
      const w = spr.cw * k, h = spr.ch * k;
      x.fillStyle = 'rgba(0,0,0,0.3)';
      x.beginPath(); x.ellipse(p.x + w * 0.06, p.y + h * 0.36, w * 0.52, h * 0.16, 0, 0, Math.PI * 2); x.fill();
      x.drawImage(spr, p.x - w / 2, p.y - h * 0.62, w, h);
    }
    // objetivos vértice
    if (T && T.type === 'vertex') {
      for (const id of T.ids) {
        const p = this.vertexScreen(id);
        const hv = id === this.hover;
        x.beginPath(); x.arc(p.x, p.y, S * (hv ? 0.24 : 0.14 + 0.05 * pulse), 0, Math.PI * 2);
        x.fillStyle = hv ? T.color : 'rgba(255,255,255,0.18)'; x.fill();
        x.lineWidth = 2.5; x.strokeStyle = T.color; x.stroke();
      }
    }
    // ladrón
    let rp;
    const ra = this.robberAnim;
    if (ra && now - ra.t0 < 600) {
      const p = ease.inOut(clamp01((now - ra.t0) / 600));
      const a = this.hexScreen(ra.from), b = this.hexScreen(ra.to);
      rp = { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p - Math.sin(Math.PI * p) * S * 1.2 };
    } else rp = this.hexScreen(B.robber);
    const rs = Sprites.get('robber', S / 9);
    const bob = 0;
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.beginPath(); x.ellipse(rp.x + S * 0.42, rp.y + S * 0.33, rs.cw * 0.5, rs.cw * 0.16, 0, 0, Math.PI * 2); x.fill();
    x.drawImage(rs, rp.x + S * 0.42 - rs.cw / 2, rp.y + S * 0.33 - rs.ch + bob, rs.cw, rs.ch);
    x.restore();
  }
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// ================= EFECTOS (capa superior) =================
class FX {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.parts = []; this.flyers = []; this.texts = []; this.dice = null; this.flash = null;
  }
  resize() {
    this.W = window.innerWidth; this.H = window.innerHeight;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.W * this.H * dpr * dpr > 4.2e6) dpr = Math.max(1, Math.sqrt(4.2e6 / (this.W * this.H)));
    this.dpr = dpr; this.drawn = false;
    this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
  }
  burst(x, y, color, n = 22, speed = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * speed;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0, max: 40 + Math.random() * 25, color, size: 2 + Math.random() * 4, g: 0.15 });
    }
  }
  confetti() {
    const cols = ['#ff3b6b', '#2ec5ff', '#ffc21e', '#3dff8b', '#ff2bd6', '#ffffff'];
    for (let i = 0; i < 220; i++) this.parts.push({ x: Math.random() * this.W, y: -20 - Math.random() * this.H * 0.5, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, life: 0, max: 260, color: cols[i % cols.length], size: 4 + Math.random() * 5, g: 0.02, rot: Math.random() * 6 });
  }
  fly(img, from, to, delay = 0, onArrive, size = 30) {
    this.flyers.push({ img, from, to, t0: performance.now() + delay, dur: 650, onArrive, size, done: false });
  }
  text(str, x, y, color = '#fff', size = 16) { this.texts.push({ str, x, y, color, size, t0: performance.now() }); }
  doFlash(color) { this.flash = { color, t0: performance.now() }; }
  // pos opcional {cx, cy, size}: dados pequeños en una esquina (tiradas de otros jugadores)
  rollDice(values, cb, pos) { this.dice = { values, t0: performance.now(), cb, fired: false, pos: pos || null }; }

  drawDie(x, cx, cy, size, val, rot) {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    const rr = size * 0.18;
    const rect = (ox, oy) => { x.beginPath(); x.roundRect(-size / 2 + ox, -size / 2 + oy, size, size, rr); };
    rect(0, 5); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fill();
    rect(0, 0); x.fillStyle = '#fbf6ea'; x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.15)'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#2b2416';
    const d = size * 0.26, p = size * 0.16;
    const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[val];
    for (const [i, j] of P) { x.beginPath(); x.arc(i * d, j * d, p * 0.55, 0, Math.PI * 2); x.fill(); }
    x.restore();
  }

  frame(now) {
    const busy = this.parts.length || this.flyers.length || this.texts.length || this.dice || this.flash;
    if (!busy) { if (this.drawn) { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.cv.width, this.cv.height); this.drawn = false; } return; }
    this.drawn = true;
    const x = this.ctx;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.clearRect(0, 0, this.W, this.H);
    x.imageSmoothingEnabled = true;
    if (this.flash) {
      const t = (now - this.flash.t0) / 500;
      if (t < 1) { x.fillStyle = this.flash.color; x.globalAlpha = 0.35 * (1 - t); x.fillRect(0, 0, this.W, this.H); x.globalAlpha = 1; }
      else this.flash = null;
    }
    // partículas
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life++; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.99;
      if (p.life > p.max || p.y > this.H + 30) { this.parts.splice(i, 1); continue; }
      x.globalAlpha = 1 - p.life / p.max;
      x.fillStyle = p.color;
      x.beginPath(); x.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    // voladores
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      const t = (now - f.t0) / f.dur;
      if (t < 0) continue;
      if (t >= 1) { this.flyers.splice(i, 1); if (f.onArrive) f.onArrive(); continue; }
      const e = ease.inOut(t);
      const px = f.from.x + (f.to.x - f.from.x) * e;
      const py = f.from.y + (f.to.y - f.from.y) * e - Math.sin(Math.PI * e) * 80;
      const sz = f.size * (1 + 0.35 * Math.sin(Math.PI * e));
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.roundRect(px - sz / 2 - 3, py - sz / 2, sz + 6, sz + 6, 6); x.fill();
      x.fillStyle = '#f6efdc'; x.beginPath(); x.roundRect(px - sz / 2 - 4, py - sz / 2 - 4, sz + 8, sz + 8, 6); x.fill();
      x.drawImage(f.img, px - sz / 2, py - sz / 2, sz, sz);
    }
    // textos flotantes
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i], k = (now - t.t0) / 1100;
      if (k >= 1) { this.texts.splice(i, 1); continue; }
      x.globalAlpha = 1 - k * k;
      x.font = `700 ${t.size + 4}px "Fredoka", system-ui, sans-serif`; x.textAlign = 'center';
      x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillText(t.str, t.x, t.y - k * 40 + 2);
      x.fillStyle = t.color; x.fillText(t.str, t.x, t.y - k * 40);
    }
    x.globalAlpha = 1;
    // dados
    if (this.dice) {
      const d = this.dice, t = now - d.t0;
      const P0 = d.pos;
      const P = P0 && P0.small ? P0 : null; // P: dados pequeños (otros jugadores)
      const ROLL = P ? 430 : 560, HOLD = P ? 850 : 600, OUT = 280;
      const size = P0 ? P0.size : Math.min(84, this.W * 0.14);
      const cy = P0 ? P0.cy : this.H * 0.45;
      const cx = P ? P.cx - size * 0.55 : P0 ? P0.cx : this.W / 2;
      const bounce = P ? 18 : 60;
      if (t < ROLL + HOLD + OUT) {
        let k = 1, rot = 0, v1 = d.values[0], v2 = d.values[1], yOff = 0;
        if (t < ROLL) {
          const p = t / ROLL;
          v1 = 1 + Math.floor(Math.random() * 6); v2 = 1 + Math.floor(Math.random() * 6);
          rot = (1 - p) * 6; yOff = -Math.abs(Math.sin(p * Math.PI * 3)) * bounce * (1 - p);
        } else if (!d.fired) { d.fired = true; if (d.cb) d.cb(); }
        if (t > ROLL + HOLD) k = 1 - (t - ROLL - HOLD) / OUT;
        x.globalAlpha = Math.max(0, k);
        this.drawDie(x, cx - size * 0.7, cy + yOff, size, v1, rot);
        this.drawDie(x, cx + size * 0.7, cy + yOff * 0.8, size, v2, -rot * 1.2);
        if (t >= ROLL) {
          const sum = v1 + v2;
          x.font = `700 ${Math.round(size * (P ? 0.75 : 0.6))}px "Fredoka", system-ui, sans-serif`;
          x.textAlign = 'center'; x.textBaseline = P ? 'middle' : 'alphabetic';
          // con los dados pequeños, el total va a la derecha; con los grandes, debajo
          const sx = P ? cx + size * 1.75 : cx, sy = P ? cy : cy + size * 1.15;
          if (P) { x.fillStyle = 'rgba(11,21,34,0.85)'; x.beginPath(); x.arc(sx, sy, size * 0.55, 0, Math.PI * 2); x.fill(); }
          x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillText(String(sum), sx, sy + 3);
          x.fillStyle = sum === 7 ? '#e5484d' : '#f2c14e'; x.fillText(String(sum), sx, sy);
          x.textBaseline = 'alphabetic';
        }
        x.globalAlpha = 1;
      } else this.dice = null;
    }
  }
}
