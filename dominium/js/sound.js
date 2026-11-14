// Efectos de sonido chiptune sintetizados con WebAudio (sin archivos)
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('dom.muted') === '1'; } catch { /* */ }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.1, type = 'triangle', vol = 0.08, when = 0, slide = 0) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

// un único búfer de ruido reutilizado (antes se creaba uno por sonido)
let noiseBuf = null;
function noise(dur = 0.06, vol = 0.12, when = 0, hp = 800) {
  const a = ac(); if (!a || muted) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + when;
  const src = a.createBufferSource(); src.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t, Math.random() * 0.5, dur + 0.02);
}

// si llegan muchos sonidos seguidos (bots rápidos), se limita la frecuencia
const lastPlay = {};
function rate(name, ms) { const n = performance.now(); if (n - (lastPlay[name] || 0) < ms) return false; lastPlay[name] = n; return true; }

export const sfx = {
  get muted() { return muted; },
  toggle() { muted = !muted; try { localStorage.setItem('dom.muted', muted ? '1' : '0'); } catch { /* */ } return muted; },
  unlock() { ac(); },
  click() { tone(660, 0.05, 'triangle', 0.05); },
  place() { if (!rate('place', 90)) return; tone(330, 0.06, 'triangle', 0.06); tone(495, 0.08, 'triangle', 0.05, 0.05); },
  dice() { if (!rate('dice', 160)) return; for (let i = 0; i < 5; i++) noise(0.035, 0.1, i * 0.05, 1500 + i * 300); },
  hit() { if (!rate('hit', 160)) return; noise(0.12, 0.16, 0, 300); tone(140, 0.15, 'triangle', 0.06, 0, -80); },
  conquer() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'triangle', 0.07, i * 0.08)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, i * 0.1)); },
  turn() { tone(784, 0.09, 'triangle', 0.06); tone(1046, 0.16, 'triangle', 0.06, 0.1); },
  card() { tone(880, 0.05, 'triangle', 0.08); tone(1320, 0.1, 'triangle', 0.07, 0.06); },
  trade() { [440, 554, 659, 880, 1108].forEach((f, i) => tone(f, 0.09, 'triangle', 0.06, i * 0.06)); },
  error() { tone(180, 0.15, 'triangle', 0.06, 0, -60); },
  eliminated() { noise(0.4, 0.2, 0, 120); [220, 165, 110].forEach((f, i) => tone(f, 0.25, 'triangle', 0.07, i * 0.15)); },
  win() { [523, 523, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.07, i * 0.13)); },
  tick() { tone(1200, 0.03, 'triangle', 0.03); },
};
