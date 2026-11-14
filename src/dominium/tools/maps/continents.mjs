// Europa, África, Asia y Oceanía
import { geoConicConformal, geoAzimuthalEqualArea } from 'd3-geo';
import { geoMiller } from 'd3-geo-projection';
import { partition, splitParts } from '../lib/geo.mjs';
import { C, franceParts, decorAtoms, assemble, pairs, arcticTrim } from './world.mjs';

// ------------------------------------------------------------------ EUROPA
export function europaDef() {
  const ru = partition(C('Russia'), [
    { key: 'rusia_noroeste', rects: [[18, 58.5, 60, 70.6]] },
    { key: 'rusia_central', rects: [[18, 52, 44, 58.5]] },
    { key: 'rusia_volga', rects: [[44, 50, 60, 58.5]] },
    { key: 'rusia_meridional', rects: [[30, 40, 44, 52], [44, 40, 60, 50]] },
    { key: 'decor', rects: [[60, 30, 200, 90], [18, 70.6, 60, 90]] },
  ], { rest: 'decor' });
  const fr = franceParts();
  const keep = (pred) => (mp) => mp.filter((p) => pred(p[0][0]));
  const spain = splitParts(C('Spain'), ([x, y]) => (y > 35.5 ? 'main' : null)).get('main');
  const portugal = splitParts(C('Portugal'), ([x]) => (x > -10 ? 'main' : null)).get('main');
  const norway = C('Norway').filter((p) => p[0].every(([, y]) => y < 72));
  const A = assemble([
    ['atlantico', 'Atlántico Norte', ['Iceland', 'Ireland', 'United Kingdom']],
    ['occidental', 'Europa Occidental', [
      { id: 'portugal', name: 'Portugal', mp: portugal, ne: 'Portugal' },
      { id: 'espana', name: 'España', mps: [spain, C('Andorra')], ne: ['Spain', 'Andorra'] },
      { id: 'francia', name: 'Francia', mps: [fr.get('europe'), C('Monaco')], ne: ['France', 'Monaco'] },
      'Belgium', 'Netherlands', 'Italy']],
    ['nordicos', 'Nórdicos y Bálticos', [{ id: 'noruega', name: 'Noruega', mp: norway, ne: 'Norway' }, 'Sweden', 'Finland', 'Denmark', 'Estonia', 'Latvia', 'Lithuania']],
    ['central', 'Europa Central', ['Germany', 'Poland', 'Czechia', 'Slovakia', 'Austria', 'Switzerland', 'Hungary', 'Slovenia']],
    ['balcanes', 'Balcanes', ['Croatia', 'Bosnia and Herz.', 'Serbia', 'Montenegro', 'Kosovo', 'Macedonia', 'Albania', 'Greece', 'Bulgaria', 'Romania', 'Moldova']],
    ['este', 'Europa del Este', ['Ukraine', 'Belarus',
      { id: 'rusia_noroeste', name: 'Rusia Noroeste', mp: ru.get('rusia_noroeste'), ne: 'Russia' },
      { id: 'rusia_central', name: 'Rusia Central', mp: ru.get('rusia_central') },
      { id: 'rusia_volga', name: 'Rusia del Volga', mp: ru.get('rusia_volga') },
      { id: 'rusia_meridional', name: 'Rusia Meridional', mp: ru.get('rusia_meridional') }]],
    ['anatolia', 'Anatolia y Cáucaso', ['Turkey', 'Cyprus', 'Georgia', 'Armenia', 'Azerbaijan']],
  ], { Belgium: 'Bélgica y Luxemburgo' });
  return {
    id: 'europa', name: 'Europa',
    description: 'El Viejo Continente, del Atlántico a los Urales y el Cáucaso.',
    projections: { main: geoConicConformal().rotate([-15, 0]).parallels([38, 62]) },
    ...A,
    decor: decorAtoms([-40, 25, 80, 85], [...A.used, 'Russia', 'Spain', 'Portugal', 'France', 'Norway'], [ru.get('decor')]),
    links: pairs(`islandia-reino_unido islandia-noruega reino_unido-francia reino_unido-belgica reino_unido-paises_bajos reino_unido-noruega
      dinamarca-suecia dinamarca-noruega estonia-finlandia suecia-letonia italia-grecia italia-albania chipre-turquia`),
    simplify: 35, islandMin: 120, decorMin: 250,
  };
}

// ------------------------------------------------------------------ AFRICA
export function africaDef() {
  const A = assemble([
    ['norte', 'Norte de África', ['Morocco', 'W. Sahara', 'Algeria', 'Tunisia', 'Libya', 'Egypt']],
    ['occidental', 'África Occidental', ['Mauritania', 'Senegal', 'Gambia', 'Guinea-Bissau', 'Guinea', 'Sierra Leone', 'Liberia', "Côte d'Ivoire", 'Mali', 'Cabo Verde']],
    ['golfo', 'Golfo de Guinea', ['Burkina Faso', 'Ghana', 'Togo', 'Benin', 'Nigeria', 'Niger']],
    ['central', 'África Central', ['Chad', 'Cameroon', 'Central African Rep.', 'Eq. Guinea', 'Gabon', 'Congo', 'Dem. Rep. Congo', 'São Tomé and Principe']],
    ['cuerno', 'Cuerno de África', ['Sudan', 'S. Sudan', 'Eritrea', 'Ethiopia', 'Djibouti', 'Somalia']],
    ['oriental', 'África Oriental', ['Kenya', 'Uganda', 'Rwanda', 'Burundi', 'Tanzania', 'Comoros']],
    ['austral', 'África Austral', ['Angola', 'Zambia', 'Malawi', 'Mozambique', 'Zimbabwe', 'Botswana', 'Namibia', 'South Africa', 'Lesotho', 'eSwatini', 'Madagascar', 'Mauritius']],
  ], { Congo: 'República del Congo' });
  return {
    id: 'africa', name: 'África',
    description: 'Todo el continente africano, del Magreb al cabo de Buena Esperanza.',
    projections: { main: geoAzimuthalEqualArea().rotate([-17, -3]) },
    ...A,
    decor: decorAtoms([-35, -45, 75, 50], A.used),
    links: pairs(`madagascar-mozambique madagascar-comoras comoras-mozambique comoras-tanzania mauricio-madagascar
      cabo_verde-senegal cabo_verde-mauritania santo_tome_y_principe-gabon santo_tome_y_principe-guinea_ecuatorial`),
    simplify: 40, islandMin: 120, decorMin: 250,
  };
}

// ------------------------------------------------------------------ ASIA Y OCEANIA
export function asiaDef() {
  const ru = partition(arcticTrim(C('Russia'), 76), [
    { key: 'decor', rects: [[0, 30, 60, 90]] },
    { key: 'urales', rects: [[60, 40, 76, 82]] },
    { key: 'siberia', rects: [[76, 40, 108, 82]] },
    { key: 'amur', rects: [[108, 40, 150, 56]] },
    { key: 'yakutia', rects: [[108, 56, 143, 82]] },
    { key: 'lejano_oriente', rects: [[143, 56, 192, 82], [150, 40, 192, 56]] },
  ], { rest: 'decor' });
  const cn = partition([...C('China'), ...C('Hong Kong'), ...C('Macao')], [
    { key: 'xinjiang', rects: [[73, 36.2, 95.5, 50]] },
    { key: 'tibet', rects: [[73, 26, 95.5, 36.2], [95.5, 28, 102, 39.5]] },
    { key: 'manchuria', rects: [[118, 40.8, 136, 54], [115, 45, 118, 54]] },
    { key: 'norte', rects: [[95.5, 33, 136, 54]] },
    { key: 'sur', rects: [[70, 10, 136, 33]] },
  ], { rest: 'sur', cutMin: 50 });
  const idn = splitParts(C('Indonesia'), ([x, y]) => {
    if (x > 130.8 && y < 0) return 'papua';
    if (x < 106.2 && y > -6.2) return 'sumatra';
    if (y < -5.5 && x < 127.5) return 'java';
    if (x > 107.5 && x < 119.5 && y > -4.5 && y < 5) return 'borneo';
    return 'celebes';
  });
  const au = partition(C('Australia'), [
    { key: 'oeste', rects: [[110, -40, 129, -9]] },
    { key: 'este', rects: [[138, -29, 156, -9], [141, -45, 156, -29]] },
    { key: 'centro', rects: [[129, -45, 141, -9]] },
  ]);
  const nz = splitParts(C('New Zealand'), ([, y]) => (y > -41.6 ? 'norte' : 'sur'));
  const A = assemble([
    ['oriente_medio', 'Oriente Medio', ['Turkey', 'Cyprus', 'Syria', 'Lebanon', 'Israel', 'Jordan', 'Iraq', 'Saudi Arabia', 'Kuwait', 'Qatar', 'United Arab Emirates', 'Oman', 'Yemen', 'Iran']],
    ['asia_central', 'Asia Central y Cáucaso', ['Georgia', 'Armenia', 'Azerbaijan', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan', 'Afghanistan']],
    ['asia_sur', 'Asia del Sur', ['Pakistan', 'India', 'Nepal', 'Bhutan', 'Bangladesh', 'Sri Lanka']],
    ['asia_oriental', 'Asia Oriental', [
      { id: 'xinjiang', name: 'Xinjiang', mp: cn.get('xinjiang'), ne: ['China', 'Hong Kong', 'Macao'] },
      { id: 'tibet', name: 'Tíbet', mp: cn.get('tibet') },
      { id: 'manchuria', name: 'Manchuria', mp: cn.get('manchuria') },
      { id: 'china_norte', name: 'China del Norte', mp: cn.get('norte') },
      { id: 'china_sur', name: 'China del Sur', mp: cn.get('sur') },
      'Mongolia', 'North Korea', 'South Korea', 'Japan', 'Taiwan']],
    ['sudeste', 'Sudeste Asiático', ['Myanmar', 'Thailand', 'Laos', 'Cambodia', 'Vietnam', 'Malaysia', 'Philippines', 'Timor-Leste',
      { id: 'sumatra', name: 'Sumatra', mp: idn.get('sumatra'), ne: 'Indonesia' },
      { id: 'java', name: 'Java', mp: idn.get('java') },
      { id: 'borneo', name: 'Borneo', mp: idn.get('borneo') },
      { id: 'celebes', name: 'Célebes y Molucas', mp: idn.get('celebes') }]],
    ['rusia', 'Rusia Asiática', [
      { id: 'urales', name: 'Urales', mp: ru.get('urales'), ne: 'Russia' },
      { id: 'siberia', name: 'Siberia', mp: ru.get('siberia') },
      { id: 'yakutia', name: 'Yakutia', mp: ru.get('yakutia') },
      { id: 'amur', name: 'Amur', mp: ru.get('amur') },
      { id: 'lejano_oriente', name: 'Lejano Oriente', mp: ru.get('lejano_oriente') }]],
    ['oceania', 'Oceanía', [
      { id: 'australia_occidental', name: 'Australia Occidental', mp: au.get('oeste'), ne: 'Australia' },
      { id: 'australia_central', name: 'Australia Central', mp: au.get('centro') },
      { id: 'australia_oriental', name: 'Australia Oriental', mp: au.get('este') },
      { id: 'isla_norte', name: 'Isla Norte (N. Zelanda)', mp: nz.get('norte'), ne: 'New Zealand' },
      { id: 'isla_sur', name: 'Isla Sur (N. Zelanda)', mp: nz.get('sur') },
      { id: 'papua_occidental', name: 'Papúa Occidental', mp: idn.get('papua') },
      'Papua New Guinea', 'Solomon Is.', 'Vanuatu', 'New Caledonia', 'Fiji']],
  ]);
  return {
    id: 'asia', name: 'Asia y Oceanía',
    description: 'De Anatolia al Pacífico: Asia, el archipiélago malayo y Oceanía.',
    projections: { main: geoMiller().rotate([-105, 0]) },
    ...A,
    decor: decorAtoms([20, -50, 200, 85], A.used, [ru.get('decor')]),
    links: pairs(`chipre-turquia chipre-siria iran-oman sri_lanka-india japon-corea_del_sur japon-amur japon-taiwan taiwan-china_sur
      taiwan-filipinas filipinas-malasia filipinas-celebes sumatra-malasia sumatra-java java-borneo borneo-celebes celebes-papua_occidental
      timor_oriental-australia_central java-australia_occidental papua_nueva_guinea-australia_oriental papua_nueva_guinea-islas_salomon
      islas_salomon-vanuatu vanuatu-nueva_caledonia vanuatu-fiyi nueva_caledonia-australia_oriental isla_norte-isla_sur
      isla_sur-australia_oriental isla_norte-fiyi lejano_oriente-japon`),
    simplify: 35, islandMin: 90, decorMin: 200,
  };
}
