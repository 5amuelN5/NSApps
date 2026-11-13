/* HEXÓPOLIS — efectos de sonido chiptune sintetizados */
'use strict';
const Sfx = (() => {
  let ctx = null, master = null;
  let muted = false;
  try { muted = localStorage.getItem('hx_muted') === '1'; } catch (e) { /* sin almacenamiento */ }
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C(); master = ctx.createGain(); master.gain.value = 0.13; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, { type = 'triangle', at = 0, vol = 1, slide = 0 } = {}) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { at = 0, vol = 0.5 } = {}) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const t = c.currentTime + at;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = b; g.gain.value = vol; s.connect(g); g.connect(master); s.start(t);
  }
  const arp = (notes, step = 0.07, opts = {}) => notes.forEach((n, i) => tone(n, step * 1.6, Object.assign({ at: i * step }, opts)));
  return {
    unlock: ac,
    get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem('hx_muted', muted ? '1' : '0'); } catch (e) { /* */ } return muted; },
    click: () => tone(880, 0.05, { vol: 0.5 }),
    hover: () => tone(1320, 0.03, { vol: 0.2 }),
    dice: () => { for (let i = 0; i < 7; i++) noise(0.04, { at: i * 0.09, vol: 0.4 }); tone(220, 0.08, { at: 0.7, vol: 0.6 }); },
    coin: (d = 0) => { tone(988, 0.06, { at: d, vol: 0.5 }); tone(1319, 0.12, { at: d + 0.06, vol: 0.5 }); },
    build: () => arp([392, 523, 659, 784], 0.06, { vol: 0.6 }),
    road: () => tone(300, 0.15, { slide: 300, vol: 0.5 }),
    city: () => arp([523, 659, 784, 1047, 1319], 0.06, { vol: 0.6 }),
    robber: () => { tone(440, 0.25, { type: 'sawtooth', slide: -300, vol: 0.5 }); tone(330, 0.3, { type: 'sawtooth', at: 0.2, slide: -200, vol: 0.5 }); },
    turn: () => arp([659, 784, 988, 1319], 0.08, { type: 'triangle', vol: 0.9 }),
    trade: () => arp([784, 988], 0.08, { vol: 0.5 }),
    card: () => arp([600, 900], 0.05, { type: 'triangle', vol: 0.7 }),
    error: () => tone(160, 0.18, { type: 'sawtooth', vol: 0.4 }),
    bonus: () => arp([523, 659, 784, 1047, 784, 1047], 0.07, { vol: 0.6 }),
    win: () => { arp([523, 659, 784, 1047, 1319, 1568, 2093], 0.1, { vol: 0.7 }); arp([262, 330, 392, 523], 0.2, { type: 'triangle', vol: 0.8 }); },
    lose: () => arp([392, 349, 311, 262], 0.18, { type: 'triangle', vol: 0.7 }),
  };
})();
