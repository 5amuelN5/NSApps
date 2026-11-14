// Estados Unidos: 50 estados (DC dentro de Maryland), Albers USA, 9 divisiones del censo
import fs from 'fs';
import { createRequire } from 'module';
import { feature } from 'topojson-client';
import { geoAlbersUsa } from 'd3-geo';
import { geomToMP } from '../lib/geo.mjs';
import { slug } from '../lib/names.mjs';

const require = createRequire(import.meta.url);
const us = JSON.parse(fs.readFileSync(require.resolve('us-atlas/states-10m.json'), 'utf8'));

const NAME = {
  '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas', '06': 'California', '08': 'Colorado', '09': 'Connecticut',
  '10': 'Delaware', '12': 'Florida', '13': 'Georgia', '15': 'Hawái', '16': 'Idaho', '17': 'Illinois', '18': 'Indiana', '19': 'Iowa',
  '20': 'Kansas', '21': 'Kentucky', '22': 'Luisiana', '23': 'Maine', '24': 'Maryland', '25': 'Massachusetts', '26': 'Míchigan',
  '27': 'Minnesota', '28': 'Misisipi', '29': 'Misuri', '30': 'Montana', '31': 'Nebraska', '32': 'Nevada', '33': 'Nuevo Hampshire',
  '34': 'Nueva Jersey', '35': 'Nuevo México', '36': 'Nueva York', '37': 'Carolina del Norte', '38': 'Dakota del Norte', '39': 'Ohio',
  '40': 'Oklahoma', '41': 'Oregón', '42': 'Pensilvania', '44': 'Rhode Island', '45': 'Carolina del Sur', '46': 'Dakota del Sur',
  '47': 'Tennessee', '48': 'Texas', '49': 'Utah', '50': 'Vermont', '51': 'Virginia', '53': 'Washington', '54': 'Virginia Occidental',
  '55': 'Wisconsin', '56': 'Wyoming',
};
const DIV = [
  ['nueva_inglaterra', 'Nueva Inglaterra', ['23', '33', '50', '25', '44', '09']],
  ['atlantico_medio', 'Atlántico Medio', ['36', '34', '42']],
  ['centro_noreste', 'Centro Noreste', ['39', '18', '17', '26', '55']],
  ['centro_noroeste', 'Centro Noroeste', ['27', '19', '29', '38', '46', '31', '20']],
  ['atlantico_sur', 'Atlántico Sur', ['10', '24', '51', '54', '37', '45', '13', '12']],
  ['centro_sureste', 'Centro Sureste', ['21', '47', '28', '01']],
  ['centro_suroeste', 'Centro Suroeste', ['05', '22', '40', '48']],
  ['montana', 'Montaña', ['30', '16', '56', '08', '35', '04', '49', '32']],
  ['pacifico', 'Pacífico', ['53', '41', '06', '02', '15']],
];

export function eeuuDef() {
  const feats = new Map(feature(us, us.objects.states).features.map((f) => [f.id, f]));
  const territories = [], atoms = [];
  for (const [rid, , ids] of DIV) for (const s of ids) {
    const id = slug(NAME[s]);
    territories.push({ id, name: NAME[s], region: rid });
    atoms.push({ tid: id, mp: geomToMP(feats.get(s).geometry) });
    if (s === '24') atoms.push({ tid: id, mp: geomToMP(feats.get('11').geometry) }); // DC -> Maryland
  }
  return {
    id: 'eeuu', name: 'Estados Unidos',
    description: 'Los 50 estados agrupados en las 9 divisiones del censo.',
    projections: { main: geoAlbersUsa() },
    territories,
    regions: DIV.map(([id, name]) => ({ id, name })),
    atoms,
    links: [['alaska', 'washington'], ['hawai', 'california']],
    simplify: 22, islandMin: 80, growTo: 700,
  };
}
