#!/usr/bin/env node
// Renders a quick PNG preview of every map: region fills, borders, decor, links, label dots.
// Usage: node render-previews.mjs <outDir> [mapId ...]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const mapsDir = path.resolve(here, '..', 'public', 'maps');
const outDir = process.argv[2] || path.join(here, 'previews');
const only = process.argv.slice(3);
fs.mkdirSync(outDir, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const index = JSON.parse(fs.readFileSync(path.join(mapsDir, 'index.json'), 'utf8'));
for (const { id } of index) {
  if (only.length && !only.includes(id)) continue;
  const m = JSON.parse(fs.readFileSync(path.join(mapsDir, `${id}.json`), 'utf8'));
  const color = Object.fromEntries(m.regions.map((r) => [r.id, r.color]));
  const T = Object.fromEntries(m.territories.map((t) => [t.id, t]));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}" viewBox="0 0 ${m.width} ${m.height}">`;
  s += `<rect width="100%" height="100%" fill="#2b4a5c"/>`;
  if (m.decor) s += `<path d="${m.decor}" fill="#5c6166" stroke="#44484c" stroke-width="0.8"/>`;
  for (const t of m.territories) s += `<path d="${t.path}" fill="${color[t.region]}" stroke="#1d1d1d" stroke-width="1.2" stroke-linejoin="round"/>`;
  for (const l of m.links) {
    const a = T[l.a], b = T[l.b];
    if (l.wrap) {
      const [L, R] = a.cx < b.cx ? [a, b] : [b, a];
      const ym = (L.cy + R.cy) / 2;
      s += `<path d="M${L.cx},${L.cy}L0,${ym}M${R.cx},${R.cy}L${m.width},${ym}" stroke="#f4e9c8" stroke-width="1.6" stroke-dasharray="5 4" fill="none"/>`;
    } else s += `<path d="M${a.cx},${a.cy}L${b.cx},${b.cy}" stroke="#f4e9c8" stroke-width="1.6" stroke-dasharray="5 4" fill="none"/>`;
  }
  for (const t of m.territories) {
    s += `<circle cx="${t.cx}" cy="${t.cy}" r="11" fill="#f4e9c8" stroke="#1d1d1d" stroke-width="1.5"/>`;
    s += `<text x="${t.cx}" y="${t.cy + 21}" font-size="9" font-family="Helvetica, Arial, sans-serif" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">${esc(t.name)}</text>`;
  }
  s += `</svg>`;
  fs.writeFileSync(path.join(outDir, `${id}.svg`), s);
  const png = new Resvg(s, { font: { loadSystemFonts: true }, fitTo: { mode: 'width', value: m.width } }).render().asPng();
  fs.writeFileSync(path.join(outDir, `${id}.png`), png);
  console.log(`${id}: ${path.join(outDir, id + '.png')}`);
}
