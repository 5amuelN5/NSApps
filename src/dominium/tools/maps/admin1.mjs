// Natural Earth 10m admin-1 (public domain), downloaded into tools/data/ (gitignored):
// https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geomToMP } from '../lib/geo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '..', 'data', 'ne_10m_admin_1_states_provinces.geojson');
let cache = null;

export function admin1(a3) {
  if (!cache) {
    if (!fs.existsSync(FILE)) {
      throw new Error(`Missing ${FILE}\nDownload it with:\n  curl -L -o ${FILE} https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson`);
    }
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8')).features;
  }
  return cache.filter((f) => f.properties.adm0_a3 === a3).map((f) => ({ name: f.properties.name, region: f.properties.region, mp: geomToMP(f.geometry) }));
}

// groups: [[tid, name, regionId, [admin-1 names]]]; every admin-1 unit must be used or listed in `drop`
export function groupAdmin1(units, groups, drop = []) {
  const byName = new Map();
  for (const u of units) { if (!byName.has(u.name)) byName.set(u.name, []); byName.get(u.name).push(u); }
  const used = new Set(drop);
  const territories = [], atoms = [];
  for (const [tid, name, region, names] of groups) {
    territories.push({ id: tid, name, region });
    for (const n of names) {
      const list = byName.get(n);
      if (!list) throw new Error(`admin-1 unit not found: ${n}`);
      used.add(n);
      for (const u of list) atoms.push({ tid, mp: u.mp });
    }
  }
  const unused = [...byName.keys()].filter((n) => !used.has(n));
  if (unused.length) throw new Error(`admin-1 units not assigned: ${unused.join(', ')}`);
  return { territories, atoms };
}
