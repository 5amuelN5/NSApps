// HEXÓPOLIS — arranca el servidor y un túnel de Cloudflare para jugar por internet.
// Uso: npm run online
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

require('./server'); // empieza a escuchar en PORT (3000 por defecto)

const PORT = +process.env.PORT || 3000;
const local = path.join(__dirname, 'tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const exe = fs.existsSync(local) ? local : 'cloudflared';

if (process.env.PUBLIC_URL) {
  console.log(`  Enlace público (fijo): ${process.env.PUBLIC_URL}\n`);
} else {
  const cf = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let found = false;
  const onData = (d) => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !found) {
      found = true;
      global.HX_PUBLIC_URL = m[0];
      const line = '═'.repeat(m[0].length + 4);
      console.log(`\n  ╔${line}╗\n  ║  ${m[0]}  ║\n  ╚${line}╝`);
      console.log('  ↑ Pasa este enlace a tus amigos (tarda unos segundos en estar disponible).');
      console.log('  Pulsa Ctrl+C para cerrar el juego y el enlace.\n');
    }
  };
  cf.stdout.on('data', onData);
  cf.stderr.on('data', onData);
  cf.on('error', () => {
    console.log('\n  No encuentro cloudflared. Descárgalo en tools/ o instálalo, y vuelve a lanzar «npm run online».\n');
  });
  cf.on('exit', (code) => { console.log('\n  El túnel se ha cerrado.'); process.exit(code || 0); });
  const stop = () => { cf.kill(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
