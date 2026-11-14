// Shared world-atlas loading + the two world maps (clasico, mundo)
import fs from 'fs';
import { createRequire } from 'module';
import { feature } from 'topojson-client';
import { geoMiller } from 'd3-geo-projection';
import { geomToMP, unwrapLon, partition, splitParts, ringCentroid } from '../lib/geo.mjs';
import { ES, MERGE, slug } from '../lib/names.mjs';

const require = createRequire(import.meta.url);
const readJSON = (p) => JSON.parse(fs.readFileSync(require.resolve(p), 'utf8'));

const world = readJSON('world-atlas/countries-50m.json');
export const WF = new Map();
for (const f of feature(world, world.objects.countries).features) {
  let mp = geomToMP(f.geometry);
  if (f.properties.name === 'Russia' || f.properties.name === 'Fiji') mp = unwrapLon(mp);
  WF.set(f.properties.name, mp);
}
export function C(name) {
  const mp = WF.get(name);
  if (!mp) throw new Error(`unknown country ${name}`);
  return mp;
}
export const ALL_COUNTRIES = [...WF.keys()];

// Arcade clean-up for cylindrical world maps: drop high-arctic islands (keeps the main landmass)
export function arcticTrim(mp, lat = 74) {
  let big = 0;
  mp.forEach((p, i) => { if (p[0].length > mp[big][0].length) big = i; });
  return mp.filter((p, i) => i === big || ringCentroid(p[0])[1] < lat);
}

// USA without the far Aleutians (west of -170 / east of 180)
export function usaParts() {
  return splitParts(C('United States of America'), ([x, y]) => {
    if (x > 0 || x < -169.5) return null;
    if (x < -129 && y > 50) return 'alaska';
    if (y < 30 && x < -150) return 'hawaii';
    return 'lower48';
  });
}
export function franceParts() {
  return splitParts(C('France'), ([x, y]) => {
    if (x > -6 && x < 10 && y > 41 && y < 52) return 'europe';
    if (x < -50 && x > -56 && y > 1 && y < 7) return 'guiana';
    return null;
  });
}

// ------------------------------------------------------------------ CLASICO
const CL_T = [
  ['alaska', 'Alaska', 'na'], ['nwt', 'Territorio del Noroeste', 'na'], ['greenland', 'Groenlandia', 'na'],
  ['alberta', 'Alberta', 'na'], ['ontario', 'Ontario', 'na'], ['quebec', 'Quebec', 'na'],
  ['west_us', 'Estados Unidos Occidentales', 'na'], ['east_us', 'Estados Unidos Orientales', 'na'], ['central_america', 'Centroamérica', 'na'],
  ['venezuela', 'Venezuela', 'sa'], ['peru', 'Perú', 'sa'], ['brazil', 'Brasil', 'sa'], ['argentina', 'Argentina', 'sa'],
  ['iceland', 'Islandia', 'eu'], ['great_britain', 'Gran Bretaña', 'eu'], ['scandinavia', 'Escandinavia', 'eu'],
  ['north_europe', 'Europa del Norte', 'eu'], ['west_europe', 'Europa Occidental', 'eu'], ['south_europe', 'Europa del Sur', 'eu'], ['ukraine', 'Ucrania', 'eu'],
  ['north_africa', 'África del Norte', 'af'], ['egypt', 'Egipto', 'af'], ['east_africa', 'África Oriental', 'af'], ['congo', 'Congo', 'af'],
  ['south_africa', 'Sudáfrica', 'af'], ['madagascar', 'Madagascar', 'af'],
  ['ural', 'Urales', 'as'], ['siberia', 'Siberia', 'as'], ['yakutsk', 'Yakutsk', 'as'], ['kamchatka', 'Kamchatka', 'as'], ['irkutsk', 'Irkutsk', 'as'],
  ['mongolia', 'Mongolia', 'as'], ['japan', 'Japón', 'as'], ['afghanistan', 'Afganistán', 'as'], ['china', 'China', 'as'],
  ['middle_east', 'Oriente Medio', 'as'], ['india', 'India', 'as'], ['siam', 'Siam', 'as'],
  ['indonesia', 'Indonesia', 'oc'], ['new_guinea', 'Nueva Guinea', 'oc'], ['west_australia', 'Australia Occidental', 'oc'], ['east_australia', 'Australia Oriental', 'oc'],
];
const CL_COUNTRIES = {
  greenland: ['Greenland'],
  central_america: ['Mexico', 'Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama', 'Cuba', 'Jamaica', 'Haiti', 'Dominican Rep.', 'Puerto Rico', 'Bahamas'],
  east_us: ['Bermuda'],
  quebec: ['St. Pierre and Miquelon'],
  venezuela: ['Venezuela', 'Colombia', 'Guyana', 'Suriname', 'Trinidad and Tobago'],
  peru: ['Peru', 'Ecuador', 'Bolivia'],
  brazil: ['Brazil'],
  argentina: ['Argentina', 'Chile', 'Uruguay', 'Paraguay', 'Falkland Is.'],
  iceland: ['Iceland'],
  great_britain: ['United Kingdom', 'Ireland', 'Isle of Man', 'Faeroe Is.'],
  scandinavia: ['Norway', 'Sweden', 'Finland', 'Åland'],
  north_europe: ['Germany', 'Poland', 'Denmark', 'Netherlands', 'Belgium', 'Luxembourg', 'Czechia', 'Austria', 'Switzerland', 'Liechtenstein'],
  west_europe: ['Spain', 'Portugal', 'Andorra', 'Monaco'],
  south_europe: ['Italy', 'San Marino', 'Vatican', 'Malta', 'Slovenia', 'Croatia', 'Bosnia and Herz.', 'Serbia', 'Montenegro', 'Kosovo', 'Macedonia', 'Albania', 'Greece', 'Bulgaria', 'Romania', 'Hungary', 'Slovakia'],
  ukraine: ['Ukraine', 'Belarus', 'Moldova', 'Estonia', 'Latvia', 'Lithuania'],
  north_africa: ['Morocco', 'W. Sahara', 'Algeria', 'Tunisia', 'Mauritania', 'Mali', 'Niger', 'Senegal', 'Gambia', 'Guinea-Bissau', 'Guinea', 'Sierra Leone', 'Liberia', "Côte d'Ivoire", 'Burkina Faso', 'Ghana', 'Togo', 'Benin', 'Nigeria', 'Chad', 'Cabo Verde'],
  egypt: ['Egypt', 'Libya'],
  east_africa: ['Sudan', 'S. Sudan', 'Ethiopia', 'Eritrea', 'Djibouti', 'Somalia', 'Somaliland', 'Kenya', 'Uganda', 'Rwanda', 'Burundi', 'Tanzania'],
  congo: ['Dem. Rep. Congo', 'Congo', 'Gabon', 'Eq. Guinea', 'Cameroon', 'Central African Rep.', 'São Tomé and Principe'],
  south_africa: ['South Africa', 'Namibia', 'Botswana', 'Zimbabwe', 'Mozambique', 'Zambia', 'Angola', 'Malawi', 'Lesotho', 'eSwatini'],
  madagascar: ['Madagascar', 'Comoros', 'Mauritius'],
  mongolia: ['Mongolia', 'North Korea', 'South Korea'],
  japan: ['Japan'],
  afghanistan: ['Afghanistan', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Tajikistan', 'Kyrgyzstan'],
  china: ['Taiwan', 'Hong Kong', 'Macao'],
  middle_east: ['Turkey', 'Syria', 'Lebanon', 'Israel', 'Palestine', 'Jordan', 'Iraq', 'Iran', 'Saudi Arabia', 'Yemen', 'Oman', 'United Arab Emirates', 'Qatar', 'Bahrain', 'Kuwait', 'Cyprus', 'N. Cyprus', 'Georgia', 'Armenia', 'Azerbaijan'],
  india: ['India', 'Pakistan', 'Nepal', 'Bhutan', 'Bangladesh', 'Sri Lanka', 'Siachen Glacier'],
  siam: ['Myanmar', 'Thailand', 'Laos', 'Cambodia', 'Vietnam', 'Singapore'],
  indonesia: ['Philippines', 'Timor-Leste', 'Brunei'],
  new_guinea: ['Papua New Guinea', 'Solomon Is.'],
  east_australia: ['New Zealand', 'New Caledonia', 'Vanuatu', 'Fiji'],
};
// official classic Risk adjacency (83 borders)
const CL_ADJ = `alaska:nwt,alberta,kamchatka
nwt:alberta,ontario,greenland
greenland:ontario,quebec,iceland
alberta:ontario,west_us
ontario:west_us,east_us,quebec
quebec:east_us
west_us:east_us,central_america
east_us:central_america
central_america:venezuela
venezuela:peru,brazil
peru:brazil,argentina
brazil:argentina,north_africa
iceland:great_britain,scandinavia
great_britain:scandinavia,north_europe,west_europe
scandinavia:north_europe,ukraine
north_europe:ukraine,south_europe,west_europe
west_europe:south_europe,north_africa
south_europe:ukraine,middle_east,egypt,north_africa
ukraine:middle_east,afghanistan,ural
north_africa:egypt,east_africa,congo
egypt:middle_east,east_africa
east_africa:congo,south_africa,madagascar,middle_east
congo:south_africa
south_africa:madagascar
ural:siberia,china,afghanistan
siberia:yakutsk,irkutsk,mongolia,china
yakutsk:irkutsk,kamchatka
kamchatka:irkutsk,mongolia,japan
irkutsk:mongolia
mongolia:japan,china
afghanistan:china,india,middle_east
china:india,siam
middle_east:india
india:siam
siam:indonesia
indonesia:new_guinea,west_australia
new_guinea:west_australia,east_australia
west_australia:east_australia`
  .split('\n')
  .flatMap((l) => { const [a, bs] = l.split(':'); return bs.split(',').map((b) => [a, b]); });

export function clasicoDef() {
  const atoms = [];
  const add = (tid, mp) => mp && mp.length && atoms.push({ tid, mp });
  for (const [tid, list] of Object.entries(CL_COUNTRIES)) for (const n of list) if (WF.has(n)) add(tid, n === 'Norway' ? C(n).filter((p) => p[0].every(([, y]) => y < 74)) : C(n));
  // USA
  const us = usaParts();
  add('alaska', us.get('alaska'));
  add('west_us', us.get('hawaii'));
  const l48 = partition(us.get('lower48'), [{ key: 'west_us', rects: [[-130, 20, -100, 55]] }, { key: 'east_us', rects: [[-100, 20, -60, 55]] }]);
  add('west_us', l48.get('west_us')); add('east_us', l48.get('east_us'));
  // Canada
  const ca = partition(arcticTrim(C('Canada')), [
    { key: 'alberta', rects: [[-142, 40, -110, 60]] },
    { key: 'ontario', rects: [[-110, 40, -79.5, 60]] },
    { key: 'quebec', rects: [[-79.5, 40, -50, 63.5]] },
    { key: 'nwt', rects: [[-142, 60, -50, 85]] },
  ], { rest: 'nwt' });
  for (const [k, mp] of ca) add(k, mp);
  // France
  const fr = franceParts();
  add('west_europe', fr.get('europe')); add('venezuela', fr.get('guiana'));
  // Russia (unwrapped lon 19..191)
  const ru = partition(arcticTrim(C('Russia')), [
    { key: 'ukraine', rects: [[18, 40, 55, 82]] },
    { key: 'ural', rects: [[55, 40, 75, 82], [75, 40, 87.55, 56.5]] },
    { key: 'siberia', rects: [[75, 56.5, 100, 82], [87.55, 40, 100, 56.5], [100, 62, 112, 82]] },
    { key: 'irkutsk', rects: [[100, 40, 130, 62]] },
    { key: 'yakutsk', rects: [[112, 62, 145, 82]] },
    { key: 'kamchatka', rects: [[145, 40, 192, 82], [130, 40, 145, 62]] },
  ]);
  for (const [k, mp] of ru) add(k, mp);
  // China: Manchuria -> mongolia
  const cn = partition(C('China'), [{ key: 'mongolia', rects: [[115, 40.5, 136, 54]] }, { key: 'china', rects: [[70, 15, 136, 54]] }], { rest: 'china' });
  add('mongolia', cn.get('mongolia')); add('china', cn.get('china'));
  // Malaysia: peninsula -> siam, Borneo -> indonesia
  const my = splitParts(C('Malaysia'), ([x]) => (x < 105 ? 'siam' : 'indonesia'));
  for (const [k, mp] of my) add(k, mp);
  // Indonesia: Papua -> new_guinea
  const id = splitParts(C('Indonesia'), ([x, y]) => (x > 130.8 && y < 0 ? 'new_guinea' : 'indonesia'));
  for (const [k, mp] of id) add(k, mp);
  // Australia
  const au = partition(C('Australia'), [{ key: 'west_australia', rects: [[110, -45, 135, -9]] }, { key: 'east_australia', rects: [[135, -45, 160, -9]] }]);
  for (const [k, mp] of au) add(k, mp);

  return {
    id: 'clasico', name: 'Mundo Clásico',
    description: 'El tablero tradicional de 42 territorios y 6 continentes.',
    projections: { main: geoMiller().rotate([-10, 0]) },
    territories: CL_T.map(([id, name, region]) => ({ id, name, region })),
    regions: [
      { id: 'na', name: 'Norteamérica', bonus: 5, color: '#c9a227' },
      { id: 'sa', name: 'Sudamérica', bonus: 2, color: '#a14a3b' },
      { id: 'eu', name: 'Europa', bonus: 5, color: '#5f7f9a' },
      { id: 'af', name: 'África', bonus: 3, color: '#b5651d' },
      { id: 'as', name: 'Asia', bonus: 7, color: '#6d7f4f' },
      { id: 'oc', name: 'Oceanía', bonus: 2, color: '#8b5a83' },
    ],
    atoms,
    adjacency: CL_ADJ,
    wrap: [['alaska', 'kamchatka']],
    simplify: 45, islandMin: 80, decorMin: 120, growTo: 500,
  };
}

// ------------------------------------------------------------------ MUNDO
const MUNDO_REGIONS = [
  ['norteamerica', 'Norteamérica', ['Canada', 'United States of America', 'Greenland', 'Mexico']],
  ['centroamerica', 'Centroamérica', ['Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama']],
  ['caribe', 'Caribe', ['Cuba', 'Jamaica', 'Haiti', 'Dominican Rep.', 'Puerto Rico', 'Bahamas', 'Trinidad and Tobago']],
  ['andes', 'Andes', ['Venezuela', 'Colombia', 'Ecuador', 'Peru', 'Bolivia']],
  ['amazonia', 'Amazonía y Guayanas', ['Brazil', 'Guyana', 'Suriname', '#guiana']],
  ['cono_sur', 'Cono Sur', ['Argentina', 'Chile', 'Uruguay', 'Paraguay', 'Falkland Is.']],
  ['europa_occidental', 'Europa Occidental', ['United Kingdom', 'Ireland', 'Portugal', 'Spain', '#france', 'Belgium', 'Netherlands', 'Italy']],
  ['europa_norte', 'Europa del Norte', ['Iceland', 'Norway', 'Sweden', 'Finland', 'Denmark', 'Estonia', 'Latvia', 'Lithuania']],
  ['europa_central', 'Europa Central', ['Germany', 'Poland', 'Czechia', 'Slovakia', 'Austria', 'Switzerland', 'Hungary']],
  ['europa_oriental', 'Europa Oriental', ['Russia', 'Belarus', 'Ukraine', 'Moldova']],
  ['balcanes', 'Balcanes', ['Slovenia', 'Croatia', 'Bosnia and Herz.', 'Serbia', 'Montenegro', 'Kosovo', 'Macedonia', 'Albania', 'Greece', 'Bulgaria', 'Romania']],
  ['norte_africa', 'Norte de África', ['Morocco', 'W. Sahara', 'Algeria', 'Tunisia', 'Libya', 'Egypt']],
  ['africa_occidental', 'África Occidental', ['Mauritania', 'Senegal', 'Gambia', 'Guinea-Bissau', 'Guinea', 'Sierra Leone', 'Liberia', "Côte d'Ivoire", 'Mali', 'Burkina Faso', 'Ghana', 'Togo', 'Benin', 'Niger', 'Nigeria']],
  ['africa_central', 'África Central', ['Chad', 'Cameroon', 'Central African Rep.', 'Eq. Guinea', 'Gabon', 'Congo', 'Dem. Rep. Congo']],
  ['africa_oriental', 'África Oriental', ['Sudan', 'S. Sudan', 'Ethiopia', 'Eritrea', 'Djibouti', 'Somalia', 'Kenya', 'Uganda', 'Rwanda', 'Burundi', 'Tanzania']],
  ['africa_austral', 'África Austral', ['Angola', 'Zambia', 'Malawi', 'Mozambique', 'Zimbabwe', 'Botswana', 'Namibia', 'South Africa', 'Lesotho', 'eSwatini', 'Madagascar']],
  ['oriente_medio', 'Oriente Medio', ['Turkey', 'Cyprus', 'Syria', 'Lebanon', 'Israel', 'Jordan', 'Iraq', 'Iran', 'Saudi Arabia', 'Kuwait', 'Qatar', 'United Arab Emirates', 'Oman', 'Yemen']],
  ['asia_central', 'Asia Central y Cáucaso', ['Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan', 'Afghanistan', 'Georgia', 'Armenia', 'Azerbaijan']],
  ['asia_sur', 'Asia del Sur', ['India', 'Pakistan', 'Nepal', 'Bhutan', 'Bangladesh', 'Sri Lanka']],
  ['asia_oriental', 'Asia Oriental', ['China', 'Mongolia', 'North Korea', 'South Korea', 'Japan', 'Taiwan']],
  ['sudeste_asiatico', 'Sudeste Asiático', ['Myanmar', 'Thailand', 'Laos', 'Cambodia', 'Vietnam', 'Malaysia', 'Indonesia', 'Philippines', 'Timor-Leste']],
  ['oceania', 'Oceanía', ['Australia', 'New Zealand', 'Papua New Guinea', 'Solomon Is.', 'Vanuatu', 'New Caledonia', 'Fiji']],
];

// Adds atoms for a NE country (plus anything merged into it) with territory id tid
export function countryAtoms(atoms, ne, tid, transform) {
  const all = [ne, ...Object.entries(MERGE).filter(([, to]) => to === ne).map(([from]) => from)];
  for (const n of all) {
    if (!WF.has(n)) continue;
    let mp = C(n);
    if (transform) mp = transform(mp, n);
    if (mp && mp.length) atoms.push({ tid, mp });
  }
}

export function countryTerritory(ne) {
  const name = ES[ne];
  if (!name) throw new Error(`no Spanish name for ${ne}`);
  return { id: slug(name), name };
}

export function mundoDef() {
  const territories = [];
  const atoms = [];
  const fr = franceParts();
  for (const [rid, , list] of MUNDO_REGIONS) {
    for (const ne of list) {
      if (ne === '#guiana') { territories.push({ id: 'guayana_francesa', name: 'Guayana Francesa', region: rid }); atoms.push({ tid: 'guayana_francesa', mp: fr.get('guiana') }); continue; }
      if (ne === '#france') { territories.push({ id: 'francia', name: 'Francia', region: rid }); atoms.push({ tid: 'francia', mp: fr.get('europe') }, { tid: 'francia', mp: C('Monaco') }); continue; }
      const t = countryTerritory(ne);
      if (ne === 'Belgium') t.name = 'Bélgica y Luxemburgo';
      territories.push({ ...t, region: rid });
      let tr;
      if (ne === 'United States of America') { const u = usaParts(); tr = () => [...u.get('lower48'), ...u.get('alaska'), ...u.get('hawaii')]; }
      if (ne === 'Norway') tr = (mp) => mp.filter((p) => p[0].every(([, y]) => y < 74));
      if (ne === 'Canada' || ne === 'Russia') tr = (mp) => arcticTrim(mp);
      countryAtoms(atoms, ne, t.id, tr);
    }
  }
  return {
    id: 'mundo', name: 'Mundo Completo',
    description: 'Todos los países del mundo agrupados en 22 regiones geográficas.',
    projections: { main: geoMiller().rotate([-10, 0]) },
    territories,
    regions: MUNDO_REGIONS.map(([id, name]) => ({ id, name })),
    atoms,
    links: `reino_unido-francia reino_unido-islandia islandia-groenlandia islandia-noruega groenlandia-canada
      dinamarca-suecia dinamarca-noruega estonia-finlandia espana-marruecos italia-tunez italia-albania
      chipre-turquia chipre-siria egipto-arabia_saudi sudan-arabia_saudi yemen-yibuti yemen-eritrea yemen-somalia iran-oman
      sri_lanka-india japon-corea_del_sur japon-rusia taiwan-china taiwan-filipinas filipinas-malasia indonesia-australia
      papua_nueva_guinea-australia papua_nueva_guinea-islas_salomon islas_salomon-vanuatu vanuatu-nueva_caledonia vanuatu-fiyi
      nueva_caledonia-australia nueva_zelanda-australia nueva_zelanda-fiyi timor_oriental-australia madagascar-mozambique madagascar-tanzania
      cuba-estados_unidos cuba-mexico cuba-bahamas cuba-jamaica cuba-haiti bahamas-estados_unidos republica_dominicana-puerto_rico
      puerto_rico-trinidad_y_tobago trinidad_y_tobago-venezuela islas_malvinas-argentina estados_unidos-rusia`
      .split(/\s+/).filter(Boolean).map((s) => s.split('-')),
    wrap: [['estados_unidos', 'rusia']],
    simplify: 25, islandMin: 40, decorMin: 80, smallK: 0.02, growTo: 160, growMax: 3,
  };
}

// Decor atoms: every country (not Antarctica, not in `used`, not merged into a used one) whose bbox meets `bb`
export function decorAtoms(bb, used, extra = []) {
  const usedAll = new Set(used);
  for (const [from, to] of Object.entries(MERGE)) if (usedAll.has(to)) usedAll.add(from);
  const out = [];
  for (const [n, mp] of WF) {
    if (n === 'Antarctica' || usedAll.has(n)) continue;
    const parts = mp.filter((p) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return !(x1 < bb[0] || x0 > bb[2] || y1 < bb[1] || y0 > bb[3]);
    });
    if (parts.length) out.push({ mp: parts });
  }
  for (const mp of extra) if (mp && mp.length) out.push({ mp });
  return out;
}

// Build territories+atoms from [[regionId, regionName, [NE names | {id,name,mp}]]]
export function assemble(regionsSpec, renames = {}) {
  const territories = [], atoms = [], used = [];
  for (const [rid, , list] of regionsSpec) {
    for (const e of list) {
      if (typeof e === 'string') {
        const t = countryTerritory(e);
        if (renames[e]) t.name = renames[e];
        territories.push({ ...t, region: rid });
        countryAtoms(atoms, e, t.id);
        used.push(e);
      } else {
        territories.push({ id: e.id, name: e.name, region: rid });
        for (const mp of [].concat(e.mps || [e.mp])) if (mp && mp.length) atoms.push({ tid: e.id, mp });
        if (e.ne) used.push(...[].concat(e.ne));
      }
    }
  }
  return { territories, atoms, used, regions: regionsSpec.map(([id, name]) => ({ id, name })) };
}
export const pairs = (s) => s.split(/\s+/).filter(Boolean).map((x) => x.split('-'));
