#!/usr/bin/env node
// Builds public/maps/<id>.json + public/maps/index.json for DOMINIUM.
// Usage: node build-maps.mjs [mapId ...]   (no args = all maps)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMap } from './lib/pipeline.mjs';
import { clasicoDef } from './maps/world.mjs';
import { europaDef, africaDef, asiaDef } from './maps/continents.mjs';
import { americasDef } from './maps/americas.mjs';
import { espanaDef } from './maps/espana.mjs';
import { eeuuDef } from './maps/eeuu.mjs';
import { latamDef } from './maps/latam.mjs';
import { italiaDef, alemaniaDef, britanicasDef } from './maps/europe2.mjs';
import { fantasiaDef } from './maps/fantasia.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'public', 'maps');
fs.mkdirSync(outDir, { recursive: true });

const DEFS = [
  ['clasico', clasicoDef],
  ['europa', europaDef],
  ['africa', africaDef],
  ['americas', americasDef],
  ['asia', asiaDef],
  ['espana', espanaDef],
  ['eeuu', eeuuDef],
  ['latam', latamDef],
  ['italia', italiaDef],
  ['alemania', alemaniaDef],
  ['britanicas', britanicasDef],
  ['fantasia', fantasiaDef],
];

const only = process.argv.slice(2);
for (const [id, fn] of DEFS) {
  if (only.length && !only.includes(id)) continue;
  const t0 = Date.now();
  const map = buildMap(fn());
  const json = JSON.stringify(map);
  fs.writeFileSync(path.join(outDir, `${id}.json`), json);
  console.log(`${id}: ${map.territories.length} territories, ${map.regions.length} regions, ${map.links.length} links, ${(json.length / 1024).toFixed(1)} KB, ${map.width}x${map.height}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// index.json is rebuilt from whatever map files exist, in the canonical order
const index = [];
for (const [id] of DEFS) {
  const f = path.join(outDir, `${id}.json`);
  if (!fs.existsSync(f)) continue;
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  index.push({ id: m.id, name: m.name, description: m.description, territories: m.territories.length, regions: m.regions.length, recommendedPlayers: '2-6' });
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`index.json: ${index.length} maps`);
