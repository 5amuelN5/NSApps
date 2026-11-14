// España: 50 provincias + Ceuta y Melilla, Canarias en recuadro (como geoConicConformalSpain)
import fs from 'fs';
import { createRequire } from 'module';
import { feature } from 'topojson-client';
import { geoConicConformal } from 'd3-geo';
import { geomToMP } from '../lib/geo.mjs';
import { slug } from '../lib/names.mjs';
import { C, franceParts } from './world.mjs';

const require = createRequire(import.meta.url);
const es = JSON.parse(fs.readFileSync(require.resolve('es-atlas/es/provinces.json'), 'utf8'));

const PROV = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz', '07': 'Islas Baleares',
  '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba',
  '15': 'A Coruña', '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa', '21': 'Huelva',
  '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga',
  '30': 'Murcia', '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia', '41': 'Sevilla', '42': 'Soria',
  '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid', '48': 'Bizkaia', '49': 'Zamora',
  '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
};
const CCAA = [
  ['andalucia', 'Andalucía', ['04', '11', '14', '18', '21', '23', '29', '41']],
  ['aragon', 'Aragón', ['22', '44', '50']],
  ['asturias', 'Principado de Asturias', ['33']],
  ['baleares', 'Islas Baleares', ['07']],
  ['canarias', 'Canarias', ['35', '38']],
  ['cantabria', 'Cantabria', ['39']],
  ['castilla_y_leon', 'Castilla y León', ['05', '09', '24', '34', '37', '40', '42', '47', '49']],
  ['castilla_la_mancha', 'Castilla-La Mancha', ['02', '13', '16', '19', '45']],
  ['cataluna', 'Cataluña', ['08', '17', '25', '43']],
  ['comunidad_valenciana', 'Comunidad Valenciana', ['03', '12', '46']],
  ['extremadura', 'Extremadura', ['06', '10']],
  ['galicia', 'Galicia', ['15', '27', '32', '36']],
  ['comunidad_de_madrid', 'Comunidad de Madrid', ['28']],
  ['region_de_murcia', 'Región de Murcia', ['30']],
  ['navarra', 'Comunidad Foral de Navarra', ['31']],
  ['pais_vasco', 'País Vasco', ['01', '20', '48']],
  ['la_rioja', 'La Rioja', ['26']],
  ['ceuta_y_melilla', 'Ceuta y Melilla', ['51', '52']],
];

export function espanaDef() {
  const K = 2700, X = 480, Y = 250;
  const main = geoConicConformal().rotate([5, -38.6]).parallels([0, 60]).scale(K).translate([X, Y]);
  const canary = geoConicConformal().rotate([5, -38.6]).parallels([0, 60]).scale(K).translate([X + 0.1 * K, Y - 0.094 * K]);
  const feats = new Map(feature(es, es.objects.provinces).features.map((f) => [f.id, f]));
  const territories = [], atoms = [];
  for (const [rid, , provs] of CCAA) for (const p of provs) {
    const id = slug(PROV[p]);
    territories.push({ id, name: PROV[p], region: rid });
    atoms.push({ tid: id, mp: geomToMP(feats.get(p).geometry), proj: p === '35' || p === '38' ? 'canary' : 'main' });
  }
  const inBox = (mp, [x0, y0, x1, y1]) => mp.filter((p) => p[0].some(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1));
  const box = [-12, 33, 6, 46];
  const decor = [
    C('Portugal'), franceParts().get('europe'), C('Andorra'), C('Morocco'), C('Algeria'), geomToMP(feats.get('54').geometry),
  ].map((mp) => ({ mp: inBox(mp, box) }));
  return {
    id: 'espana', name: 'España',
    description: 'Las 50 provincias españolas más Ceuta y Melilla, agrupadas por comunidades autónomas.',
    projections: { main, canary },
    territories,
    regions: CCAA.map(([id, name]) => ({ id, name })),
    atoms,
    decor,
    // keep the Canary inset clear of the Moroccan coast
    decorHoles: (terr) => {
      const can = terr.filter((t) => t.id === 'las_palmas' || t.id === 'santa_cruz_de_tenerife');
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const t of can) for (const p of t.polys) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const m = 25;
      return [[[[x0 - m, y0 - m], [x1 + m, y0 - m], [x1 + m, y1 + m], [x0 - m, y1 + m], [x0 - m, y0 - m]]]];
    },
    links: [['islas_baleares', 'barcelona'], ['islas_baleares', 'tarragona'], ['islas_baleares', 'valencia'],
      ['las_palmas', 'santa_cruz_de_tenerife'], ['las_palmas', 'cadiz'], ['santa_cruz_de_tenerife', 'huelva'],
      ['ceuta', 'cadiz'], ['melilla', 'malaga'], ['melilla', 'almeria']],
    simplify: 26, islandMin: 60, decorMin: 300, growTo: 700, growMax: 12,
  };
}
