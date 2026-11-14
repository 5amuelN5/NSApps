// Italia, Alemania, Islas Británicas (Natural Earth admin-1)
import { geoConicConformal } from 'd3-geo';
import { partition } from '../lib/geo.mjs';
import { C, decorAtoms, pairs } from './world.mjs';
import { admin1, groupAdmin1 } from './admin1.mjs';

// ------------------------------------------------------------------ ITALIA
export function italiaDef() {
  const G = [
    ['valle_de_aosta', 'Valle de Aosta', 'noroeste', ['Aoste']],
    ['piamonte_norte', 'Piamonte Norte', 'noroeste', ['Turin', 'Biella', 'Vercelli', 'Novara', 'Verbano-Cusio-Ossola']],
    ['piamonte_sur', 'Piamonte Sur', 'noroeste', ['Cuneo', 'Asti', 'Alessandria']],
    ['liguria', 'Liguria', 'noroeste', ['Imperia', 'Savona', 'Genova', 'La Spezia']],
    ['lombardia_occidental', 'Lombardía Occidental', 'noroeste', ['Varese', 'Como', 'Lecco', 'Milano', 'Monza e Brianza', 'Lodi', 'Pavia']],
    ['lombardia_oriental', 'Lombardía Oriental', 'noroeste', ['Sondrio', 'Bergamo', 'Brescia', 'Cremona', 'Mantova']],
    ['alto_adigio', 'Alto Adigio', 'noreste', ['Bozen']],
    ['trentino', 'Trentino', 'noreste', ['Trento']],
    ['veneto_norte', 'Véneto Norte', 'noreste', ['Belluno', 'Treviso', 'Vicenza']],
    ['veneto_sur', 'Véneto Sur', 'noreste', ['Verona', 'Padova', 'Venezia', 'Rovigo']],
    ['friuli', 'Friuli-Venecia Julia', 'noreste', ['Udine', 'Gorizia', 'Trieste', 'Pordenone']],
    ['emilia', 'Emilia', 'noreste', ['Piacenza', 'Parma', 'Reggio Emilia', 'Modena']],
    ['romana', 'Romaña', 'noreste', ['Bologna', 'Ferrara', 'Ravenna', 'Forlì-Cesena', 'Rimini']],
    ['toscana_norte', 'Toscana Norte', 'centro', ['Massa-Carrara', 'Lucca', 'Pistoia', 'Prato', 'Firenze', 'Pisa', 'Livorno']],
    ['toscana_sur', 'Toscana Sur', 'centro', ['Siena', 'Arezzo', 'Grosseto']],
    ['umbria', 'Umbría', 'centro', ['Perugia', 'Terni']],
    ['marcas', 'Marcas', 'centro', ['Pesaro e Urbino', 'Ancona', 'Macerata', 'Fermo', 'Ascoli Piceno']],
    ['lacio_norte', 'Lacio Norte', 'centro', ['Viterbo', 'Rieti']],
    ['roma', 'Roma', 'centro', ['Roma']],
    ['lacio_sur', 'Lacio Sur', 'centro', ['Latina', 'Frosinone']],
    ['abruzos', 'Abruzos', 'sur', ["L'Aquila", 'Teramo', 'Pescara', 'Chieti']],
    ['molise', 'Molise', 'sur', ['Campobasso', 'Isernia']],
    ['campania', 'Campania', 'sur', ['Caserta', 'Benevento', 'Napoli']],
    ['salerno_irpinia', 'Salerno e Irpinia', 'sur', ['Salerno', 'Avellino']],
    ['apulia_norte', 'Apulia Norte', 'sur', ['Foggia', 'Barletta-Andria Trani']],
    ['bari', 'Bari', 'sur', ['Bari']],
    ['salento', 'Salento', 'sur', ['Brindisi', 'Lecce', 'Taranto']],
    ['basilicata', 'Basilicata', 'sur', ['Potenza', 'Matera']],
    ['calabria_norte', 'Calabria Norte', 'sur', ['Cosenza', 'Crotene']],
    ['calabria_sur', 'Calabria Sur', 'sur', ['Catanzaro', 'Vibo Valentia', 'Reggio Calabria']],
    ['sicilia_occidental', 'Sicilia Occidental', 'islas', ['Trapani', 'Palermo', 'Agrigento', 'Caltanissetta']],
    ['sicilia_oriental', 'Sicilia Oriental', 'islas', ['Messina', 'Enna', 'Catania', 'Siracusa', 'Ragusa']],
    ['cerdena_norte', 'Cerdeña Norte', 'islas', ['Sassari', 'Olbia-Tempio', 'Nuoro', 'Ogliastra']],
    ['cerdena_sur', 'Cerdeña Sur', 'islas', ['Oristrano', 'Medio Campidano', 'Cagliari', 'Carbonia-Iglesias']],
  ];
  const A = groupAdmin1(admin1('ITA'), G);
  return {
    id: 'italia', name: 'Italia',
    description: 'La península italiana y sus islas, de los Alpes a Sicilia.',
    projections: { main: geoConicConformal().rotate([-12.5, 0]).parallels([38, 46]) },
    ...A,
    regions: [
      { id: 'noroeste', name: 'Noroeste' }, { id: 'noreste', name: 'Noreste' }, { id: 'centro', name: 'Centro' },
      { id: 'sur', name: 'Sur' }, { id: 'islas', name: 'Islas' },
    ],
    decor: decorAtoms([4, 35, 21, 48.5], ['Italy'], [], { res: '10m' }),
    links: pairs('sicilia_oriental-calabria_sur cerdena_norte-toscana_norte cerdena_norte-roma cerdena_sur-sicilia_occidental'),
    simplify: 30, islandMin: 150, decorMin: 300, growTo: 600,
  };
}

// ------------------------------------------------------------------ ALEMANIA
export function alemaniaDef() {
  const st = new Map(admin1('DEU').map((u) => [u.name, u.mp]));
  const cut = (name, specs) => partition(st.get(name), specs, { rest: specs[specs.length - 1].key, step: 0.05 });
  const T = [], atoms = [];
  const add = (id, name, region, mp) => { T.push({ id, name, region }); atoms.push({ tid: id, mp }); };
  const addCut = (state, region, specs, names) => {
    const parts = cut(state, specs);
    for (const s of specs) add(s.key, names[s.key], region, parts.get(s.key));
  };
  // Norte
  add('schleswig_holstein', 'Schleswig-Holstein', 'norte', st.get('Schleswig-Holstein'));
  add('hamburgo', 'Hamburgo', 'norte', st.get('Hamburg'));
  add('bremen', 'Bremen', 'norte', st.get('Bremen'));
  addCut('Niedersachsen', 'norte', [
    { key: 'weser_ems', rects: [[6.4, 51.8, 8.6, 54.2]] },
    { key: 'luneburgo', rects: [[8.6, 52.75, 11.8, 54.2]] },
    { key: 'brunswick', rects: [[10.1, 51.2, 11.8, 52.75]] },
    { key: 'hannover', rects: [[8.6, 51.2, 10.1, 52.75]] },
  ], { weser_ems: 'Weser-Ems', luneburgo: 'Luneburgo', brunswick: 'Brunswick', hannover: 'Hannover' });
  addCut('Mecklenburg-Vorpommern', 'norte', [
    { key: 'pomerania', rects: [[12.6, 53.0, 14.6, 54.9]] },
    { key: 'mecklemburgo', rects: [[10.5, 53.0, 12.6, 54.9]] },
  ], { pomerania: 'Pomerania Occidental', mecklemburgo: 'Mecklemburgo' });
  // Oeste
  addCut('Nordrhein-Westfalen', 'oeste', [
    { key: 'munster', rects: [[5.8, 51.6, 8.25, 52.6]] },
    { key: 'detmold', rects: [[8.25, 51.35, 9.6, 52.6]] },
    { key: 'dusseldorf', rects: [[5.8, 51.05, 7.25, 51.6]] },
    { key: 'colonia', rects: [[5.8, 50.3, 7.6, 51.05]] },
    { key: 'arnsberg', rects: [[7.25, 50.3, 9.6, 51.6]] },
  ], { munster: 'Münster', detmold: 'Detmold', dusseldorf: 'Düsseldorf', colonia: 'Colonia', arnsberg: 'Arnsberg' });
  addCut('Rheinland-Pfalz', 'oeste', [
    { key: 'coblenza', rects: [[6.0, 49.75, 8.6, 50.95]] },
    { key: 'palatinado', rects: [[6.0, 48.9, 8.6, 49.75]] },
  ], { coblenza: 'Coblenza y Tréveris', palatinado: 'Palatinado' });
  add('sarre', 'Sarre', 'oeste', st.get('Saarland'));
  // Centro
  addCut('Hessen', 'centro', [
    { key: 'hesse_norte', rects: [[7.7, 50.55, 10.3, 51.7]] },
    { key: 'hesse_sur', rects: [[7.7, 49.3, 10.3, 50.55]] },
  ], { hesse_norte: 'Hesse del Norte', hesse_sur: 'Hesse del Sur' });
  add('turingia', 'Turingia', 'centro', st.get('Thüringen'));
  addCut('Sachsen-Anhalt', 'centro', [
    { key: 'magdeburgo', rects: [[10.5, 51.75, 13.3, 53.1]] },
    { key: 'halle', rects: [[10.5, 50.9, 13.3, 51.75]] },
  ], { magdeburgo: 'Magdeburgo', halle: 'Halle' });
  // Este
  add('berlin', 'Berlín', 'este', st.get('Berlin'));
  addCut('Brandenburg', 'este', [
    { key: 'brandeburgo_norte', rects: [[11.2, 52.45, 14.8, 53.6]] },
    { key: 'brandeburgo_sur', rects: [[11.2, 51.3, 14.8, 52.45]] },
  ], { brandeburgo_norte: 'Brandeburgo Norte', brandeburgo_sur: 'Brandeburgo Sur' });
  addCut('Sachsen', 'este', [
    { key: 'leipzig', rects: [[11.8, 50.1, 12.9, 51.7]] },
    { key: 'dresde', rects: [[12.9, 50.1, 15.1, 51.7]] },
  ], { leipzig: 'Leipzig y Chemnitz', dresde: 'Dresde' });
  // Baden-Württemberg
  addCut('Baden-Württemberg', 'suroeste', [
    { key: 'karlsruhe', rects: [[7.4, 48.35, 8.85, 49.8]] },
    { key: 'stuttgart', rects: [[8.85, 48.55, 10.6, 49.8]] },
    { key: 'friburgo', rects: [[7.4, 47.5, 8.85, 48.35]] },
    { key: 'tubinga', rects: [[8.85, 47.5, 10.6, 48.55]] },
  ], { karlsruhe: 'Karlsruhe', stuttgart: 'Stuttgart', friburgo: 'Friburgo', tubinga: 'Tubinga' });
  // Bayern
  addCut('Bayern', 'baviera', [
    { key: 'baja_franconia', rects: [[8.9, 49.45, 10.6, 50.6]] },
    { key: 'alta_franconia', rects: [[10.6, 49.6, 12.3, 50.6]] },
    { key: 'franconia_media', rects: [[9.0, 48.85, 11.55, 49.6]] },
    { key: 'alto_palatinado', rects: [[11.55, 49.0, 14.0, 50.6]] },
    { key: 'baja_baviera', rects: [[11.55, 48.2, 14.0, 49.0]] },
    { key: 'suabia', rects: [[9.8, 47.2, 10.95, 48.85]] },
    { key: 'alta_baviera', rects: [[10.95, 47.2, 13.2, 48.85]] },
  ], { baja_franconia: 'Baja Franconia', alta_franconia: 'Alta Franconia', franconia_media: 'Franconia Media', alto_palatinado: 'Alto Palatinado', baja_baviera: 'Baja Baviera', suabia: 'Suabia', alta_baviera: 'Alta Baviera' });
  return {
    id: 'alemania', name: 'Alemania',
    description: 'Los estados federados alemanes, con los más grandes divididos en distritos.',
    projections: { main: geoConicConformal().rotate([-10.5, 0]).parallels([48, 54]) },
    territories: T, atoms,
    regions: [
      { id: 'norte', name: 'Norte' }, { id: 'oeste', name: 'Renania y Ruhr' }, { id: 'centro', name: 'Centro' },
      { id: 'este', name: 'Este' }, { id: 'suroeste', name: 'Baden-Wurtemberg' }, { id: 'baviera', name: 'Baviera' },
    ],
    decor: decorAtoms([3, 45.5, 18, 56.5], ['Germany'], [], { res: '10m' }),
    links: [],
    simplify: 30, islandMin: 150, decorMin: 300, growTo: 600,
  };
}

// ------------------------------------------------------------------ ISLAS BRITANICAS
export function britanicasDef() {
  const london = admin1('GBR').filter((u) => u.region === 'Greater London').map((u) => u.name);
  const G = [
    ['tierras_altas', 'Tierras Altas', 'escocia', ['Highland', 'Eilean Siar', 'Orkney']],
    ['grampian', 'Grampian', 'escocia', ['Aberdeenshire', 'Aberdeen', 'Moray']],
    ['tayside', 'Tayside', 'escocia', ['Angus', 'Dundee', 'Perthshire and Kinross']],
    ['fife_lothian', 'Fife y Lothian', 'escocia', ['Fife', 'Edinburgh', 'West Lothian', 'Midlothian', 'East Lothian', 'Falkirk', 'Clackmannanshire', 'Stirling']],
    ['strathclyde', 'Strathclyde', 'escocia', ['Argyll and Bute', 'Glasgow', 'North Lanarkshire', 'South Lanarkshire', 'East Dunbartonshire', 'West Dunbartonshire', 'Renfrewshire', 'East Renfrewshire', 'Inverclyde', 'North Ayshire', 'South Ayrshire', 'East Ayrshire']],
    ['sur_de_escocia', 'Fronteras y Galloway', 'escocia', ['Scottish Borders', 'Dumfries and Galloway']],
    ['antrim_down', 'Antrim y Down', 'irlanda_del_norte', ['Belfast', 'Antrim', 'Larne', 'Carrickfergus', 'Newtownabbey', 'North Down', 'Ards', 'Down', 'Castlereagh', 'Lisburn', 'Ballymena', 'Ballymoney', 'Moyle']],
    ['ulster_occidental', 'Ulster Occidental', 'irlanda_del_norte', ['Derry', 'Strabane', 'Fermanagh', 'Dungannon', 'Omagh', 'Magherafelt', 'Mid Ulster', 'Limavady', 'Coleraine', 'Armagh', 'Craigavon', 'Banbridge', 'Newry and Mourne']],
    ['gales_norte', 'Gales del Norte', 'gales', ['Anglesey', 'Gwynedd', 'Conwy', 'Denbighshire', 'Flintshire', 'Wrexham']],
    ['gales_centro', 'Gales Central', 'gales', ['Powys', 'Ceredigion', 'Pembrokeshire', 'Carmarthenshire']],
    ['gales_sur', 'Gales del Sur', 'gales', ['Swansea', 'Neath Port Talbot', 'Bridgend', 'Vale of Glamorgan', 'Cardiff', 'Rhondda, Cynon, Taff', 'Merthyr Tydfil', 'Caerphilly', 'Blaenau Gwent', 'Torfaen', 'Monmouthshire', 'Newport']],
    ['northumbria', 'Northumbria', 'norte', ['Northumberland', 'Newcastle upon Tyne', 'North Tyneside', 'South Tyneside', 'Gateshead', 'Sunderland', 'Durham', 'Hartlepool', 'Stockton-on-Tees', 'Darlington', 'Middlesbrough', 'Redcar and Cleveland']],
    ['cumbria', 'Cumbria', 'norte', ['Cumbria']],
    ['lancashire', 'Lancashire', 'norte', ['Lancashire', 'Blackpool', 'Blackburn with Darwen']],
    ['manchester_mersey', 'Mánchester y Merseyside', 'norte', ['Wigan', 'Stockport', 'Salford', 'Bolton', 'Trafford', 'Manchester', 'Oldham', 'Rochdale', 'Tameside', 'Bury', 'Knowsley', 'Liverpool', 'Sefton', 'Merseyside', 'Halton', 'Cheshire West and Chester', 'Cheshire East', 'Warrington']],
    ['yorkshire_norte', 'Yorkshire del Norte', 'norte', ['North Yorkshire', 'York', 'East Riding of Yorkshire', 'Kingston upon Hull']],
    ['yorkshire_sur', 'Yorkshire del Sur y Oeste', 'norte', ['Leeds', 'Bradford', 'Wakefield', 'Calderdale', 'Kirklees', 'Sheffield', 'Rotherham', 'Barnsley', 'Doncaster', 'North Lincolnshire', 'North East Lincolnshire']],
    ['birmingham', 'Birmingham y Warwick', 'midlands', ['Birmingham', 'Solihull', 'Coventry', 'Sandwell', 'Dudley', 'Walsall', 'Wolverhampton', 'Warwickshire']],
    ['staffordshire', 'Staffordshire y Shropshire', 'midlands', ['Staffordshire', 'Stoke-on-Trent', 'Shropshire', 'Telford and Wrekin']],
    ['hereford', 'Hereford y Worcester', 'midlands', ['Herefordshire', 'Worcestershire']],
    ['nottingham', 'Derby y Nottingham', 'midlands', ['Derbyshire', 'Derby', 'Nottinghamshire', 'Nottingham']],
    ['leicester', 'Leicester y Northampton', 'midlands', ['Leicestershire', 'Leicester', 'Rutland', 'Northamptonshire']],
    ['lincolnshire', 'Lincolnshire', 'midlands', ['Lincolnshire']],
    ['anglia', 'Anglia Oriental', 'sur', ['Norfolk', 'Suffolk', 'Essex', 'Southend-on-Sea', 'Thurrock']],
    ['cambridge', 'Cambridge y Hertford', 'sur', ['Cambridgeshire', 'Peterborough', 'Hertfordshire', 'Bedford', 'Central Bedfordshire', 'Luton']],
    ['londres', 'Londres', 'sur', london],
    ['kent', 'Kent', 'sur', ['Kent', 'Medway']],
    ['sussex', 'Sussex y Surrey', 'sur', ['East Sussex', 'West Sussex', 'Brighton and Hove', 'Surrey']],
    ['hampshire', 'Hampshire y Wight', 'sur', ['Hampshire', 'Portsmouth', 'Southampton', 'Isle of Wight']],
    ['tamesis', 'Valle del Támesis', 'sur', ['Oxfordshire', 'Buckinghamshire', 'Milton Keynes', 'West Berkshire', 'Wokingham', 'Bracknell Forest', 'Royal Borough of Windsor and Maidenhead', 'Slough', 'Reading']],
    ['wessex', 'Wessex', 'suroeste', ['Wiltshire', 'Swindon', 'Dorset', 'Bournemouth', 'Poole', 'Gloucestershire']],
    ['somerset', 'Somerset y Bristol', 'suroeste', ['Somerset', 'North Somerset', 'Bristol', 'South Gloucestershire', 'Bath and North East Somerset']],
    ['devon', 'Devon y Cornualles', 'suroeste', ['Devon', 'Torbay', 'Plymouth', 'Cornwall', 'Isles of Scilly']],
  ];
  const GI = [
    ['donegal', 'Donegal', 'irlanda', ['Donegal']],
    ['connacht', 'Connacht', 'irlanda', ['Galway', 'Mayo', 'Sligo', 'Leitrim', 'Roscommon']],
    ['cavan_monaghan', 'Cavan y Monaghan', 'irlanda', ['Cavan', 'Monaghan']],
    ['dublin', 'Dublín', 'irlanda', ['Dublin', 'Dún Laoghaire–Rathdown', 'Fingal', 'South Dublin']],
    ['leinster_central', 'Leinster Central', 'irlanda', ['Meath', 'Louth', 'Westmeath', 'Longford', 'Offaly', 'Laoighis', 'Kildare']],
    ['leinster_sur', 'Leinster Sur', 'irlanda', ['Wicklow', 'Wexford', 'Carlow', 'Kilkenny']],
    ['munster_norte', 'Munster Norte', 'irlanda', ['Clare', 'Limerick', 'North Tipperary']],
    ['cork_kerry', 'Cork y Kerry', 'irlanda', ['Cork', 'Kerry']],
    ['waterford_tipperary', 'Waterford y Tipperary', 'irlanda', ['Waterford', 'South Tipperary']],
  ];
  const uk = groupAdmin1(admin1('GBR'), G, ['Shetland Islands']);
  const ie = groupAdmin1(admin1('IRL'), GI);
  const territories = [...uk.territories, ...ie.territories, { id: 'isla_de_man', name: 'Isla de Man', region: 'norte' }];
  const atoms = [...uk.atoms, ...ie.atoms, { tid: 'isla_de_man', mp: C('Isle of Man') }];
  return {
    id: 'britanicas', name: 'Islas Británicas',
    description: 'Gran Bretaña e Irlanda, de las Tierras Altas a Cornualles.',
    projections: { main: geoConicConformal().rotate([4, 0]).parallels([50, 58]) },
    territories, atoms,
    regions: [
      { id: 'escocia', name: 'Escocia' }, { id: 'norte', name: 'Norte de Inglaterra' }, { id: 'midlands', name: 'Midlands' },
      { id: 'sur', name: 'Sur de Inglaterra' }, { id: 'suroeste', name: 'Suroeste de Inglaterra' }, { id: 'gales', name: 'Gales' },
      { id: 'irlanda_del_norte', name: 'Irlanda del Norte' }, { id: 'irlanda', name: 'Irlanda' },
    ],
    decor: decorAtoms([-12, 47.5, 6, 61], ['United Kingdom', 'Ireland', 'Isle of Man'], [], { res: '10m' }),
    links: pairs(`gales_norte-dublin gales_centro-leinster_sur antrim_down-sur_de_escocia antrim_down-strathclyde
      isla_de_man-cumbria isla_de_man-antrim_down isla_de_man-sur_de_escocia isla_de_man-lancashire`),
    simplify: 30, islandMin: 150, decorMin: 300, growTo: 600,
  };
}
