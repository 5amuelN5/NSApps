// Latinoamérica: México (4), Centroamérica, Caribe, Sudamérica con Brasil (4), Argentina (3) y otros cortes
import { geoAzimuthalEqualArea } from 'd3-geo';
import { partition } from '../lib/geo.mjs';
import { C, franceParts, decorAtoms, assemble, pairs } from './world.mjs';

const split = (ne, specs, opts = {}) => partition(C(ne), specs, { rest: specs[specs.length - 1].key, ...opts });

export function latamDef() {
  const mx = split('Mexico', [
    { key: 'noroeste', rects: [[-118, 22.5, -104.5, 33]] },
    { key: 'noreste', rects: [[-104.5, 22.5, -96, 33]] },
    { key: 'central', rects: [[-106, 17.5, -96.5, 22.5]] },
    { key: 'sur', rects: [[-106, 10, -86, 17.5], [-96.5, 17.5, -86, 22.5]] },
  ]);
  const br = split('Brazil', [
    { key: 'norte', rects: [[-75, -10.5, -46, 6]] },
    { key: 'nordeste', rects: [[-46, -15.5, -34, 6]] },
    { key: 'centro', rects: [[-75, -22, -46, -10.5]] },
    { key: 'sur', rects: [[-75, -35, -34, -15.5]] },
  ]);
  const ar = split('Argentina', [
    { key: 'norte', rects: [[-74, -32, -53, -21]] },
    { key: 'pampa', rects: [[-74, -39, -53, -32]] },
    { key: 'patagonia', rects: [[-75, -56, -53, -39]] },
  ]);
  const cl = split('Chile', [{ key: 'norte', rects: [[-76, -30, -66, -17]] }, { key: 'sur', rects: [[-80, -57, -66, -30]] }]);
  const pe = split('Peru', [{ key: 'norte', rects: [[-82, -9.5, -68, 0.5]] }, { key: 'sur', rects: [[-82, -19, -68, -9.5]] }]);
  const co = split('Colombia', [{ key: 'oriental', rects: [[-73.2, -5, -66, 7.2]] }, { key: 'andina', rects: [[-80, -5, -73.2, 13.5], [-73.2, 7.2, -66, 13.5]] }]);
  const ve = split('Venezuela', [{ key: 'occidental', rects: [[-74, 0, -66.5, 13]] }, { key: 'oriental', rects: [[-66.5, 0, -59, 13]] }]);
  const cu = split('Cuba', [{ key: 'occidental', rects: [[-85.5, 19, -78.5, 24]] }, { key: 'oriental', rects: [[-78.5, 19, -73.5, 24]] }]);
  const fr = franceParts();
  const P = (id, name, mp, ne) => ({ id, name, mp, ne });
  const A = assemble([
    ['mexico', 'México', [
      P('mexico_noroeste', 'México Noroeste', mx.get('noroeste'), 'Mexico'), P('mexico_noreste', 'México Noreste', mx.get('noreste')),
      P('mexico_central', 'México Central', mx.get('central')), P('mexico_sur', 'México Sur y Yucatán', mx.get('sur'))]],
    ['centroamerica', 'Centroamérica', ['Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama']],
    ['caribe', 'Caribe', [
      P('cuba_occidental', 'Cuba Occidental', cu.get('occidental'), 'Cuba'), P('cuba_oriental', 'Cuba Oriental', cu.get('oriental')),
      'Bahamas', 'Jamaica', 'Haiti', 'Dominican Rep.', 'Puerto Rico', 'Trinidad and Tobago']],
    ['andes', 'Andes y Guayanas', [
      P('venezuela_occidental', 'Venezuela Occidental', ve.get('occidental'), 'Venezuela'), P('venezuela_oriental', 'Venezuela Oriental', ve.get('oriental')),
      P('colombia_andina', 'Colombia Andina', co.get('andina'), 'Colombia'), P('colombia_oriental', 'Colombia Oriental', co.get('oriental')),
      'Ecuador', P('peru_norte', 'Perú Norte', pe.get('norte'), 'Peru'), P('peru_sur', 'Perú Sur', pe.get('sur')), 'Bolivia',
      'Guyana', 'Suriname', P('guayana_francesa', 'Guayana Francesa', fr.get('guiana'), 'France')]],
    ['brasil', 'Brasil', [
      P('brasil_norte', 'Brasil Norte', br.get('norte'), 'Brazil'), P('brasil_nordeste', 'Brasil Nordeste', br.get('nordeste')),
      P('brasil_centro_oeste', 'Brasil Centro-Oeste', br.get('centro')), P('brasil_sudeste_sur', 'Brasil Sudeste y Sur', br.get('sur'))]],
    ['cono_sur', 'Cono Sur', [
      P('argentina_norte', 'Argentina Norte', ar.get('norte'), 'Argentina'), P('pampa', 'La Pampa', ar.get('pampa')), P('patagonia', 'Patagonia', ar.get('patagonia')),
      P('chile_norte', 'Chile Norte', cl.get('norte'), 'Chile'), P('chile_sur', 'Chile Sur', cl.get('sur')),
      'Uruguay', 'Paraguay', 'Falkland Is.']],
  ]);
  return {
    id: 'latam', name: 'Latinoamérica',
    description: 'De México a la Patagonia: el mundo latinoamericano y el Caribe.',
    projections: { main: geoAzimuthalEqualArea().rotate([78, 12]) },
    ...A,
    decor: decorAtoms([-125, -60, -25, 36], A.used),
    links: pairs(`cuba_occidental-mexico_sur cuba_oriental-bahamas cuba_occidental-bahamas cuba_oriental-haiti cuba_oriental-jamaica jamaica-haiti
      republica_dominicana-puerto_rico puerto_rico-trinidad_y_tobago trinidad_y_tobago-venezuela_oriental islas_malvinas-patagonia`),
    simplify: 35, islandMin: 150, decorMin: 250, growTo: 600,
  };
}
