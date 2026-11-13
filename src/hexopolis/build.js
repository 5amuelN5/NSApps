// HEXÓPOLIS — genera la versión web estática en dist/ (para Netlify, GitHub Pages, Cloudflare Pages…)
// Uso: npm run build   → sube la carpeta dist/ tal cual.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'shared'), { recursive: true });

for (const f of fs.readdirSync(path.join(ROOT, 'public'))) fs.copyFileSync(path.join(ROOT, 'public', f), path.join(DIST, f));
for (const f of ['engine.js', 'bots.js', 'room.js']) fs.copyFileSync(path.join(ROOT, 'shared', f), path.join(DIST, 'shared', f));

// Salas online con servidor propio (p. ej. Render): SERVER_URL=https://tu-servidor.onrender.com npm run build
const SERVER = (process.env.SERVER_URL || '').trim().replace(/\/+$/, '');
if (SERVER) {
  const wsUrl = SERVER.replace(/^http/, 'ws') + '/ws';
  fs.writeFileSync(path.join(DIST, 'config.json'), JSON.stringify({ server: true, wsUrl }));
  console.log('Salas online → ' + wsUrl);
} else console.log('Sin SERVER_URL: las salas online usarán el modo directo (navegador a navegador).');

// Netlify: no cachear los scripts para que las actualizaciones lleguen al recargar
fs.writeFileSync(path.join(DIST, '_headers'), '/*\n  Cache-Control: no-cache\n');

console.log('Web estática lista en dist/ (' + fs.readdirSync(DIST).length + ' elementos). Súbela a Netlify arrastrando la carpeta.');
