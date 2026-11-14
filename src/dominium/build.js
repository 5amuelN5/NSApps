// Genera la web estática (GitHub Pages) en dist/.
// Uso: SERVER_URL=https://dominium.onrender.com npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const server = (process.env.SERVER_URL || '').replace(/\/$/, '');

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true, filter: (src) => !src.endsWith('.DS_Store') });
fs.mkdirSync(path.join(DIST, 'shared'), { recursive: true });
for (const f of ['engine.js', 'profile.js']) fs.copyFileSync(path.join(ROOT, 'shared', f), path.join(DIST, 'shared', f));
fs.writeFileSync(path.join(DIST, 'config.json'), JSON.stringify({ server }));
console.log(`Web generada en dist/ ${server ? `→ servidor ${server}` : '(mismo origen)'}`);
