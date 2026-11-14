// DOMINIUM — tutorial interactivo: burbujas que guían la primera partida paso a paso
// según lo que el jugador tiene que hacer en cada momento. Cada paso se muestra una vez.

const STEPS = [
  { id: 'welcome', at: 'map', title: '¡Bienvenido a Dominium!',
    text: 'El objetivo es conquistar territorios hasta cumplir el objetivo de la partida. Los territorios de tu color son tuyos; el número de cada ficha son sus ejércitos.',
    when: (c) => c.g && c.me >= 0 && (c.g.phase === 'setup' || c.g.phase === 'claim' || c.g.phase === 'reinforce') },
  { id: 'claim', at: 'bar', title: 'Elige territorios',
    text: 'Por turnos, cada jugador elige un territorio libre. Toca uno que brille. Intenta agruparlos en la misma región para conseguir su bonus.',
    when: (c) => c.mine && c.g.phase === 'claim' },
  { id: 'deploy', at: 'bar', title: 'Despliega tus ejércitos',
    text: 'Toca tus territorios (los que brillan) para colocar ejércitos. Abajo eliges cuántos por toque: 1, 3, 5 o todos. Refuerza sobre todo las fronteras con enemigos.',
    when: (c) => c.mine && c.g.phase === 'setup' },
  { id: 'reinforce', at: 'bar', title: 'Refuerzos del turno',
    text: 'Cada turno recibes ejércitos: tus territorios entre 3 (mínimo 3) más el bonus de las regiones que controles enteras. Colócalos tocando tus territorios.',
    when: (c) => c.mine && c.g.phase === 'reinforce' && c.g.reinforcements > 0 },
  { id: 'attack_select', at: 'bar', title: 'Al ataque',
    text: 'Toca uno de tus territorios con 2 o más ejércitos que tenga un enemigo al lado. Si no quieres atacar, pulsa «Terminar turno».',
    when: (c) => c.mine && c.g.phase === 'attack' && c.ui.sel < 0 },
  { id: 'attack_target', at: 'bar', title: 'Elige a quién atacar',
    text: 'Los vecinos que puedes atacar se marcan en amarillo. Toca uno. Al pasar el ratón verás la probabilidad de conquistarlo.',
    when: (c) => c.mine && c.g.phase === 'attack' && c.ui.sel >= 0 && c.ui.target < 0 },
  { id: 'attack_go', at: 'bar', title: 'Tira los dados',
    text: '«Atacar» lanza una tirada (tú hasta 3 dados, el defensor hasta 2; los empates los gana el defensor). «Asalto total» sigue atacando hasta conquistar o quedarte con 1 ejército.',
    when: (c) => c.mine && c.g.phase === 'attack' && c.ui.target >= 0 },
  { id: 'conquer', at: 'map', title: '¡Territorio conquistado!',
    text: 'Elige cuántos ejércitos mover al territorio nuevo. Deja suficientes atrás si el de origen sigue teniendo enemigos cerca.',
    when: (c) => c.mine && c.g.phase === 'conquer' },
  { id: 'card', at: 'cards', title: 'Has ganado una carta',
    text: 'Cada turno en que conquistas algo ganas una carta. Tres cartas iguales, o una de cada tipo, se canjean por ejércitos extra al empezar tu turno.',
    when: (c) => c.me >= 0 && (c.hand || 0) > 0 },
  { id: 'fortify', at: 'bar', title: 'Fortificar',
    text: 'Antes de terminar puedes mover ejércitos una vez entre dos territorios tuyos conectados. Toca el origen y después el destino, o pulsa «Terminar turno».',
    when: (c) => c.mine && c.g.phase === 'fortify' },
  { id: 'done', at: 'map', title: '¡Ya sabes lo básico!',
    text: 'Domina regiones enteras para recibir más refuerzos, canjea cartas y no dejes fronteras débiles. Abajo a la izquierda tienes reacciones y frases rápidas. ¡Suerte, comandante!',
    when: (c) => c.myTurnsDone >= 1 && !c.mine },
];

export function createTutorial({ store, sfx }) {
  let done = new Set();
  try { done = new Set(JSON.parse(store.get('dom.tut', '[]'))); } catch { /* */ }
  let active = store.get('dom.tutOff', '') !== '1' && !done.has('done');
  let shown = null;
  let lastCtx = null;
  let api = null;
  const el = document.createElement('div');
  el.className = 'tut';
  el.hidden = true;
  document.body.appendChild(el);
  const save = () => store.set('dom.tut', JSON.stringify([...done]));

  function hide() { el.hidden = true; shown = null; }
  function finish(stepId, manual) {
    if (stepId) done.add(stepId);
    save();
    hide();
    // tras pulsar «Entendido», pasa al siguiente paso sin esperar a que cambie la partida
    if (manual && lastCtx) setTimeout(() => api && api.check(lastCtx), 250);
  }
  function skipAll() {
    STEPS.forEach((s) => done.add(s.id));
    active = false;
    store.set('dom.tutOff', '1');
    save(); hide();
  }
  function show(step) {
    shown = step.id;
    const idx = STEPS.findIndex((s) => s.id === step.id) + 1;
    el.className = `tut at-${step.at}`;
    el.innerHTML = `<div class="tut-top"><span class="tut-n">Tutorial ${idx}/${STEPS.length}</span><button class="tut-skip" type="button">Saltar tutorial</button></div>
      <b>${step.title}</b><p>${step.text}</p><button class="btn small btn-gold tut-ok" type="button">Entendido</button>`;
    el.hidden = false;
    el.querySelector('.tut-ok').onclick = () => { sfx.click(); finish(step.id, true); };
    el.querySelector('.tut-skip').onclick = () => { sfx.click(); skipAll(); };
  }

  api = {
    get active() { return active; },
    start() { done = new Set(); active = true; store.set('dom.tutOff', ''); save(); },
    stop: skipAll,
    // se llama tras cada render de la partida
    check(c) {
      lastCtx = c;
      if (!active || !c.g || c.g.phase === 'over') { if (!el.hidden) hide(); return; }
      // un paso visible cuya condición deja de cumplirse se da por hecho (el jugador ya lo hizo)
      if (shown) {
        const cur = STEPS.find((s) => s.id === shown);
        if (cur && !cur.when(c)) finish(cur.id);
        else return;
      }
      const next = STEPS.find((s) => !done.has(s.id) && s.when(c));
      if (next) show(next);
      if (done.has('done')) active = false;
    },
  };
  return api;
}
