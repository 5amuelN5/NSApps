/* HEXÓPOLIS — mini tutorial: aparece en tu primera partida y se puede repetir desde el botón «?» */
'use strict';

const TUT_STEPS = [
  { t: null, h: '¡Bienvenido a Hexópolis!', p: (v) => `Gana quien llegue antes a <b>${v.teams ? v.teams.target + ' puntos sumando a tu equipo' : Engine.winVP(v) + ' puntos de victoria'}</b>. Te enseño lo básico en un minuto.` },
  { t: 'board', h: 'La isla', p: () => 'Cada casilla da un recurso: <b>madera, ladrillo, lana, trigo o mineral</b>. Cuando los dados sacan su número, producen para los poblados y ciudades que la tocan. Cuantos más puntitos tiene el número, más sale (el <b style="color:#ff6b6b">6</b> y el <b style="color:#ff6b6b">8</b> son los mejores).' },
  { t: 'board', h: 'Colocación inicial', p: () => 'Al empezar, cada jugador pone <b>2 poblados y 2 caminos</b>, por turnos. Toca los círculos que brillan en los cruces. Consejo: busca cruces con números buenos y recursos distintos.' },
  { t: '#players', h: 'Los jugadores', p: (v) => `Aquí ves a todos: puntos, cartas en la mano, caballeros y camino.${v.teams ? ' La letra de color es su equipo.' : ''} Toca a cualquiera para ver su ficha y su perfil.` },
  { t: '#hand', h: 'Tus cartas', p: () => 'Los recursos que vas consiguiendo. Debajo verás también tus cartas de desarrollo; tócalas para saber qué hacen.' },
  { t: '#build', h: 'Construir', p: () => '<b>Camino</b> para expandirte, <b>poblado</b> (1 punto), <b>ciudad</b> (2 puntos, produce el doble) y <b>carta de desarrollo</b> (caballeros, puntos ocultos y más). Se ilumina lo que puedes pagar.' },
  { t: '#info', h: 'Tiradas', p: () => 'La gráfica muestra cuántas veces ha salido cada número. La línea de puntos marca lo que debería salir por probabilidad. Lo que cuesta cada construcción lo ves en su botón (y en el botón ?).' },
  { t: '#actions', h: 'Tu turno', p: (v) => `1) Tira los dados. 2) Construye y <b>comercia</b> con el banco, los puertos o los demás${v.teams ? ' (o regala cartas a tu compañero)' : ''}. 3) Pulsa <b>Fin de turno</b>. Con la barra espaciadora también tiras y terminas.` },
  { t: null, h: 'Y cuidado con el 7', p: (v) => `Si sale un 7, quien tenga más de ${Engine.rulesOf(v).hand === 99 ? 'muchas' : Engine.rulesOf(v).hand} cartas descarta la mitad, y quien tiró mueve el <b>ladrón</b>: bloquea una casilla y roba una carta. El camino más largo y el ejército más grande dan 2 puntos extra. ¡A jugar!` },
];

const Tut = { i: 0, on: false };
function tutEl() {
  let el = $('#tut');
  if (!el) {
    el = document.createElement('div'); el.id = 'tut'; el.className = 'tut hidden';
    el.innerHTML = '<div class="tut-hole"></div><div class="tut-card"><small class="tut-step"></small><h3></h3><p></p><div class="tut-btns"><button class="btn small ghost" data-tut="skip">Saltar</button><span class="grow"></span><button class="btn small" data-tut="prev">‹ Atrás</button><button class="btn small yellow" data-tut="next">Siguiente ›</button></div></div>';
    document.body.appendChild(el);
    el.querySelectorAll('[data-tut]').forEach((b) => (b.onclick = () => {
      Sfx.click();
      const k = b.dataset.tut;
      if (k === 'skip') return endTutorial();
      if (k === 'prev') Tut.i = Math.max(0, Tut.i - 1);
      if (k === 'next') { if (Tut.i >= TUT_STEPS.length - 1) return endTutorial(); Tut.i++; }
      renderTutorial();
    }));
  }
  return el;
}
function startTutorial() {
  if (!App.view || App.screen !== 'game' || App.me < 0) return;
  closeModal();
  Tut.i = 0; Tut.on = true;
  tutEl().classList.remove('hidden');
  renderTutorial();
}
function endTutorial() {
  Tut.on = false;
  store.set('hx_tut', '1');
  const el = $('#tut'); if (el) el.classList.add('hidden');
}
function tutRect(t) {
  if (!t) return null;
  if (t === 'board') { const r = board.region; return { left: r.x, top: r.y, width: r.w, height: r.h }; }
  const el = $(t); if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 4 && r.height > 4 ? r : null;
}
function renderTutorial() {
  if (!Tut.on) return;
  const el = tutEl(), s = TUT_STEPS[Tut.i], v = App.view;
  if (!v) return endTutorial();
  const hole = el.querySelector('.tut-hole'), card = el.querySelector('.tut-card');
  card.querySelector('.tut-step').textContent = `${Tut.i + 1} de ${TUT_STEPS.length}`;
  card.querySelector('h3').textContent = s.h;
  card.querySelector('p').innerHTML = s.p(v);
  card.querySelector('[data-tut="prev"]').disabled = Tut.i === 0;
  card.querySelector('[data-tut="next"]').textContent = Tut.i === TUT_STEPS.length - 1 ? '¡A jugar!' : 'Siguiente ›';
  const r = tutRect(s.t), pad = 8, W = innerWidth, H = innerHeight;
  el.classList.toggle('nohole', !r);
  if (r) {
    Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  }
  // la tarjeta va donde quepa: debajo, encima, o centrada
  const cw = Math.min(360, W - 24);
  card.style.width = cw + 'px';
  const ch = card.offsetHeight || 200;
  let left = (W - cw) / 2, top = (H - ch) / 2;
  if (r) {
    left = Math.max(12, Math.min(W - cw - 12, r.left + r.width / 2 - cw / 2));
    if (r.top + r.height + pad + 14 + ch < H) top = r.top + r.height + pad + 14;
    else if (r.top - pad - 14 - ch > 0) top = r.top - pad - 14 - ch;
    else { top = Math.max(12, Math.min(H - ch - 12, r.top + r.height / 2 - ch / 2)); left = r.left > W / 2 ? Math.max(12, r.left - cw - 20) : Math.min(W - cw - 12, r.left + r.width + 20); }
  }
  card.style.left = Math.round(left) + 'px';
  card.style.top = Math.round(top) + 'px';
}
// primera partida: el tutorial sale solo
function maybeTutorial() {
  if (Tut.on || Tut.queued || App.me < 0 || !App.view || App.view.phase !== 'setup' || store.get('hx_tut', '')) return;
  Tut.queued = true;
  setTimeout(() => { Tut.queued = false; if (!Tut.on && App.screen === 'game' && !store.get('hx_tut', '')) startTutorial(); }, 1400);
}
window.addEventListener('resize', () => { if (Tut.on) renderTutorial(); });
