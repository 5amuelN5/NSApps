// Las Américas: Canadá (6), EE. UU. (8 + Alaska + Hawái, from us-atlas state groups), México (2), Brasil (4)
import fs from 'fs';
import { createRequire } from 'module';
import { merge } from 'topojson-client';
import { geoAzimuthalEqualArea } from 'd3-geo';
import { partition, geomToMP, ringCentroid, pc } from '../lib/geo.mjs';
import { C, usaParts, franceParts, decorAtoms, assemble, pairs } from './world.mjs';

const require = createRequire(import.meta.url);
const us = JSON.parse(fs.readFileSync(require.resolve('us-atlas/states-10m.json'), 'utf8'));

export const US_GROUPS = {
  noroeste: ['53', '41', '16', '30', '56'],
  california: ['06', '32'],
  suroeste: ['04', '35', '49', '08'],
  llanuras: ['38', '46', '31', '20', '27', '19', '29'],
  lagos: ['55', '17', '26', '18', '39'],
  sur: ['48', '40', '05', '22'],
  sureste: ['28', '01', '13', '12', '45', '37', '47', '21'],
  noreste: ['51', '54', '24', '10', '11', '42', '34', '36', '09', '44', '25', '50', '33', '23'],
};

// Split the world-atlas lower-48 polygon by unions of us-atlas states; slivers between the two
// datasets (coast, Great Lakes) go to the group sharing most vertices with them (or the nearest one).
function splitLower48(lower48) {
  const groups = Object.entries(US_GROUPS).map(([k, ids]) => {
    const g = merge(us, us.objects.states.geometries.filter((s) => ids.includes(s.id)));
    return { k, mp: geomToMP(g) };
  });
  const vkey = (v) => v[0].toFixed(6) + ',' + v[1].toFixed(6);
  const owner = new Map();
  const samples = [];
  for (const { k, mp } of groups) for (const p of mp) for (const r of p) r.forEach((v, i) => { owner.set(vkey(v), k); if (i % 5 === 0) samples.push([v, k]); });
  const out = new Map(groups.map(({ k, mp }) => [k, pc.intersection(lower48, mp)]));
  const all = pc.union(...groups.map((g) => g.mp));
  const rest = pc.difference(lower48, all);
  const extra = new Map(groups.map(({ k }) => [k, []]));
  for (const p of rest) {
    const tally = new Map();
    for (const v of p[0]) { const o = owner.get(vkey(v)); if (o) tally.set(o, (tally.get(o) || 0) + 1); }
    let best = null;
    for (const [k, n] of tally) if (!best || n > best[1]) best = [k, n];
    if (!best) {
      const c = ringCentroid(p[0]);
      let bd = Infinity;
      for (const [v, k] of samples) { const d = (v[0] - c[0]) ** 2 + (v[1] - c[1]) ** 2; if (d < bd) { bd = d; best = [k]; } }
    }
    extra.get(best[0]).push(p);
  }
  for (const [k, list] of extra) if (list.length) out.set(k, pc.union(out.get(k), ...list.map((p) => [p])));
  return out;
}

export function americasDef() {
  const usa = usaParts();
  const l48 = splitLower48(usa.get('lower48'));
  const ca = partition(C('Canada'), [
    { key: 'bc', rects: [[-142, 40, -120, 60]] },
    { key: 'praderas', rects: [[-120, 40, -95, 60]] },
    { key: 'ontario', rects: [[-95, 40, -79.5, 60]] },
    { key: 'quebec', rects: [[-79.5, 40, -50, 63.5]] },
    { key: 'yukon', rects: [[-142, 60, -102, 85]] },
    { key: 'nunavut', rects: [[-102, 60, -50, 85]] },
  ], { rest: 'nunavut' });
  const mx = partition(C('Mexico'), [{ key: 'norte', rects: [[-118, 22.5, -86, 33]] }, { key: 'sur', rects: [[-118, 10, -86, 22.5]] }], { rest: 'sur' });
  const br = partition(C('Brazil'), [
    { key: 'norte', rects: [[-75, -10.5, -46, 6]] },
    { key: 'nordeste', rects: [[-46, -15.5, -34, 6]] },
    { key: 'centro', rects: [[-75, -22, -46, -10.5]] },
    { key: 'sur', rects: [[-75, -35, -34, -15.5]] },
  ], { rest: 'sur' });
  const fr = franceParts();
  const A = assemble([
    ['norte', 'Norteamérica Norte', [
      { id: 'alaska', name: 'Alaska', mp: usa.get('alaska') },
      { id: 'yukon_noroeste', name: 'Yukón y Noroeste', mp: ca.get('yukon'), ne: 'Canada' },
      { id: 'nunavut', name: 'Nunavut', mp: ca.get('nunavut') },
      { id: 'columbia_britanica', name: 'Columbia Británica', mp: ca.get('bc') },
      { id: 'praderas', name: 'Praderas', mp: ca.get('praderas') },
      { id: 'ontario', name: 'Ontario', mp: ca.get('ontario') },
      { id: 'quebec_atlantico', name: 'Quebec y Atlántico', mps: [ca.get('quebec'), C('St. Pierre and Miquelon')], ne: 'St. Pierre and Miquelon' },
      'Greenland']],
    ['eeuu', 'Estados Unidos', [
      { id: 'noroeste', name: 'Noroeste', mp: l48.get('noroeste'), ne: 'United States of America' },
      { id: 'california', name: 'California y Nevada', mp: l48.get('california') },
      { id: 'suroeste', name: 'Suroeste', mp: l48.get('suroeste') },
      { id: 'grandes_llanuras', name: 'Grandes Llanuras', mp: l48.get('llanuras') },
      { id: 'grandes_lagos', name: 'Grandes Lagos', mp: l48.get('lagos') },
      { id: 'texas_sur', name: 'Texas y el Sur', mp: l48.get('sur') },
      { id: 'sureste', name: 'Sureste', mp: l48.get('sureste') },
      { id: 'noreste', name: 'Noreste', mp: l48.get('noreste') },
      { id: 'hawai', name: 'Hawái', mp: usa.get('hawaii').map((p) => p.map((r) => r.map(([x, y]) => [x + 31, y + 6]))) }]],
    ['mexico_ca', 'México y Centroamérica', [
      { id: 'mexico_norte', name: 'México Norte', mp: mx.get('norte'), ne: 'Mexico' },
      { id: 'mexico_sur', name: 'México Sur', mp: mx.get('sur') },
      'Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama']],
    ['caribe', 'Caribe', ['Cuba', 'Jamaica', 'Haiti', 'Dominican Rep.', 'Puerto Rico', 'Bahamas', 'Trinidad and Tobago']],
    ['andes', 'Andes y Guayanas', ['Venezuela', 'Colombia', 'Ecuador', 'Peru', 'Bolivia', 'Guyana', 'Suriname',
      { id: 'guayana_francesa', name: 'Guayana Francesa', mp: fr.get('guiana'), ne: 'France' }]],
    ['brasil', 'Brasil', [
      { id: 'brasil_norte', name: 'Brasil Norte', mp: br.get('norte'), ne: 'Brazil' },
      { id: 'brasil_nordeste', name: 'Brasil Nordeste', mp: br.get('nordeste') },
      { id: 'brasil_centro_oeste', name: 'Brasil Centro-Oeste', mp: br.get('centro') },
      { id: 'brasil_sudeste_sur', name: 'Brasil Sudeste y Sur', mp: br.get('sur') }]],
    ['cono_sur', 'Cono Sur', ['Argentina', 'Chile', 'Uruguay', 'Paraguay', 'Falkland Is.']],
  ]);
  return {
    id: 'americas', name: 'Las Américas',
    description: 'El continente americano de Alaska a Tierra del Fuego.',
    projections: { main: geoAzimuthalEqualArea().rotate([90, -15]) },
    ...A,
    decor: decorAtoms([-180, -60, -10, 85], [...A.used, 'Iceland']).filter((d) => d.mp.length),
    links: pairs(`groenlandia-nunavut groenlandia-quebec_atlantico quebec_atlantico-nunavut hawai-california cuba-sureste cuba-mexico_sur
      cuba-bahamas cuba-jamaica cuba-haiti bahamas-sureste republica_dominicana-puerto_rico puerto_rico-trinidad_y_tobago
      trinidad_y_tobago-venezuela islas_malvinas-argentina`),
    simplify: 40, islandMin: 150, decorMin: 250,
  };
}
