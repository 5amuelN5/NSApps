/* HEXÓPOLIS — perfil del jugador en el navegador: nivel, logros, enlace de recuperación y jugadores recientes */
'use strict';

// el perfil se guarda firmado por el servidor ({d: datos en JSON, s: firma}); el navegador solo lo lee
const ProfStore = {
  get() {
    try { const x = JSON.parse(store.get('hx_profile', 'null')); if (x && x.d && x.s) { x.data = JSON.parse(x.d); return x; } } catch (e) { /* */ }
    return null;
  },
  set(signed) { store.set('hx_profile', JSON.stringify({ d: signed.d, s: signed.s })); renderProfileChip(); },
  signed() { const x = this.get(); return x ? { d: x.d, s: x.s } : null; },
  data() { const x = this.get(); return x ? x.data : null; },
};

// jugadores con los que has coincidido (ficha guardada tal como estaba y resultados entre vosotros)
const Recents = {
  all() { try { return JSON.parse(store.get('hx_recent', '{}')) || {}; } catch (e) { return {}; } },
  save(o) { const arr = Object.values(o).sort((a, b) => b.last - a.last).slice(0, 30); store.set('hx_recent', JSON.stringify(Object.fromEntries(arr.map((x) => [x.id, x])))); },
};

// ---------- comunicación con el servidor ----------
let profReq = 0;
const profWait = new Map();
function profileCall(msg) {
  return Promise.resolve(App.configReady).then(() => new Promise((resolve) => {
    if (!App.hasServer) return resolve(null);
    const req = ++profReq;
    msg = Object.assign({}, msg, { t: 'profile', req });
    profWait.set(req, resolve);
    setTimeout(() => { if (profWait.has(req)) { profWait.delete(req); resolve(null); } }, 75000);
    if (App.ws && App.ws.readyState === 1) { App.ws.send(JSON.stringify(msg)); return; }
    let ws;
    try { ws = new WebSocket(App.wsUrl || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws')); } catch (e) { profWait.delete(req); return resolve(null); }
    ws.onopen = () => ws.send(JSON.stringify(msg));
    ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.req === req) { handleProfileMsg(m); ws.close(); } } catch (err) { /* */ } };
    ws.onerror = () => { if (profWait.has(req)) { profWait.delete(req); resolve(null); } };
  }));
}
function handleProfileMsg(m) {
  if (m.t === 'profile' || m.t === 'profileBad') { const r = profWait.get(m.req); if (r) { profWait.delete(m.req); r(m); } return; }
  if (m.t === 'profileUpdate') {
    ProfStore.set(m.profile);
    App.lastGain = m.gain;
    recordRecents(m.gain);
    showGain(m.gain);
    if (App.ui.modal && (App.ui.modal.kind === 'gameover' || App.ui.modal.kind === 'profile')) renderModal();
  }
}
const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
function recoveryLink() {
  const sg = ProfStore.signed(); if (!sg) return '';
  const base = (App.publicUrl || location.origin).replace(/\/$/, '') + location.pathname.replace(/index\.html$/, '');
  return base + '?perfil=' + b64e(JSON.stringify(sg));
}

// al abrir el juego: recuperar desde un enlace, crear el perfil si no hay o actualizar el nombre
async function syncProfile() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* */ }
  await App.configReady;
  if (!App.hasServer) { renderProfileChip(); return; }
  const q = new URLSearchParams(location.search);
  const raw = q.get('perfil');
  if (raw) {
    q.delete('perfil');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    let imp = null; try { imp = JSON.parse(b64d(raw)); } catch (e) { /* */ }
    const r = imp ? await profileCall({ profile: imp, check: true }) : null;
    if (r && r.t === 'profile') {
      const cur = ProfStore.data(), nd = JSON.parse(r.profile.d);
      if (!cur || nd.xp >= cur.xp) { ProfStore.set(r.profile); toast(`Perfil recuperado: ${nd.name}, nivel ${Profile.levelOf(nd.xp)}`, true); }
      else toast('Tu perfil de este navegador tiene más experiencia que el del enlace: se mantiene el actual');
    } else toast('Ese enlace de perfil no es válido');
  }
  const r = await profileCall({ profile: ProfStore.signed(), name: App.name });
  if (r && r.t === 'profile') { ProfStore.set(r.profile); App.profileBad = false; }
  else if (r && r.t === 'profileBad') App.profileBad = true;
  renderProfileChip();
}

// ---------- tras cada partida ----------
function recordRecents(gain) {
  const v = App.view, r = App.room; if (!v || !r) return;
  const rec = Recents.all();
  const mine = ProfStore.data();
  r.seats.forEach((s, i) => {
    if (i === App.me || s.kind !== 'human' || !s.prof || (mine && s.prof.id === mine.id)) return;
    const x = rec[s.prof.id] || { id: s.prof.id, games: 0, myWins: 0, theirWins: 0 };
    x.prof = s.prof; x.name = s.prof.name; x.last = Date.now(); x.games++;
    if (v.winner === App.me) x.myWins++;
    else if (v.winner === i) x.theirWins++;
    rec[x.id] = x;
  });
  Recents.save(rec);
}
function showGain(g) {
  if (!g) return;
  if (g.lvlTo > g.lvlFrom) { bigMsg(`¡NIVEL ${g.lvlTo}!`, '#f2c14e'); Sfx.win && Sfx.win(); }
  toast(`+${g.xp} de experiencia${g.newAch.length ? ` · 🏅 ${g.newAch.length} ${g.newAch.length === 1 ? 'logro nuevo' : 'logros nuevos'}` : ''}`, true);
}

// ---------- piezas visuales ----------
function profBadge(p) {
  if (!p) return '';
  const l = Profile.levelOf(p.xp), rk = Profile.rankOf(l);
  return `<span class="pbadge" style="--rk:${rk.color}" title="${esc(rk.name)} · nivel ${l}"><i>${p.emblem}</i>Nv ${l}</span>`;
}
function emblemHTML(p, size = '') {
  const l = Profile.levelOf(p.xp), rk = Profile.rankOf(l);
  return `<span class="pemb ${size}" style="--rk:${rk.color}">${p.emblem}<b>${l}</b></span>`;
}
function profCardHTML(p) {
  const pr = Profile.progress(p.xp), rk = Profile.rankOf(pr.lvl);
  const pct = p.games ? Math.round((p.wins / p.games) * 100) : 0;
  const stat = (n, l) => `<div class="pf-st"><b>${n}</b><small>${l}</small></div>`;
  return `<div class="pf-card" style="--rk:${rk.color}">
      <div class="pf-head">${emblemHTML(p, 'big')}<div class="pf-id"><b>${esc(p.name)}</b><span class="pf-rank">${rk.name} · Nivel ${pr.lvl}</span>
        <div class="pf-xp"><i style="width:${pr.pct}%"></i></div><small class="muted">${pr.into} / ${pr.need} de experiencia para el nivel ${pr.lvl + 1}</small></div></div>
      <div class="pf-stats">${stat(p.games, 'Partidas')}${stat(p.wins, 'Victorias')}${stat(pct + '%', 'Ganadas')}${stat(p.best, 'Mejor racha')}${stat(p.prod, 'Producidas')}${stat(p.stole, 'Robadas')}${stat(p.games ? (p.vpTotal / p.games).toFixed(1) : '0', 'Puntos/partida')}${stat(p.ach.length + '/' + Profile.ACH.length, 'Logros')}</div>
    </div>`;
}
function achHTML(p) {
  const has = new Set(p.ach);
  return `<div class="ach-grid">${Profile.ACH.map((a) => `<div class="ach ${has.has(a.key) ? 'on' : ''}" title="${esc(a.desc)}"><span>${has.has(a.key) ? a.icon : '🔒'}</span><b>${a.name}</b><small>${a.desc}</small></div>`).join('')}</div>`;
}
function vsHTML(id) {
  const x = Recents.all()[id];
  if (!x || !x.games) return '<p class="muted">Todavía no habéis terminado ninguna partida juntos.</p>';
  return `<p class="pf-vs">Habéis jugado <b>${x.games}</b> ${x.games === 1 ? 'partida' : 'partidas'} juntos · tú ganaste <b>${x.myWins}</b>, ganó <b>${x.theirWins}</b>${x.games - x.myWins - x.theirWins ? `, otros ${x.games - x.myWins - x.theirWins}` : ''}</p>`;
}
function gainHTML() {
  const g = App.lastGain; if (!g) return '';
  const lvl = g.lvlTo > g.lvlFrom ? `<b class="gain-up">¡Subes a nivel ${g.lvlTo}!</b>` : '';
  const ach = g.newAch.map((k) => Profile.ACH.find((a) => a.key === k)).filter(Boolean).map((a) => `<span class="rchip sp">${a.icon} ${a.name}</span>`).join('');
  return `<div class="gain-box"><div class="gain-top"><span class="gain-xp">+${g.xp} XP</span>${lvl}</div>
    <small class="muted">${g.from.map(([t, n]) => `${t} (+${n})`).join(' · ')}${g.from.length ? '' : 'Saliste de la partida antes de acabar'}</small>
    ${ach ? `<div class="rr-mini">${ach}</div>` : ''}</div>`;
}

// chip del menú principal
function renderProfileChip() {
  const el = $('#prof-chip'); if (!el) return;
  const p = ProfStore.data();
  if (!p) { el.innerHTML = App.hasServer === false ? '' : '<span class="muted">Creando tu perfil…</span>'; el.classList.toggle('hidden', App.hasServer === false); return; }
  const pr = Profile.progress(p.xp), rk = Profile.rankOf(pr.lvl);
  el.classList.remove('hidden');
  el.style.setProperty('--rk', rk.color);
  el.innerHTML = `${emblemHTML(p)}<span class="pc-txt"><b>${esc(App.name)}</b><small>${rk.name} · Nivel ${pr.lvl}</small><span class="pf-xp"><i style="width:${pr.pct}%"></i></span></span><span class="pc-go">Perfil ›</span>`;
}

// ---------- ventanas ----------
function renderProfileModal(m, box) {
  const p = ProfStore.data();
  if (m.kind === 'profile') {
    if (!p) { box.innerHTML = `<h2>Tu perfil</h2><p class="muted">${App.hasServer ? 'Se está creando tu perfil, vuelve a abrirlo en un momento.' : 'El perfil necesita el servidor del juego.'}</p><button class="btn small ghost" data-close>Cerrar</button>`; return; }
    const lvl = Profile.levelOf(p.xp);
    const emb = Profile.EMBLEMS.map((x) => `<button class="emb ${x.e === p.emblem ? 'on' : ''}" data-emb="${x.e}" ${lvl >= x.lvl ? '' : 'disabled'} title="${lvl >= x.lvl ? 'Usar este emblema' : 'Se desbloquea en el nivel ' + x.lvl}">${x.e}${lvl >= x.lvl ? '' : `<small>Nv ${x.lvl}</small>`}</button>`).join('');
    const rec = Object.values(Recents.all()).sort((a, b) => b.last - a.last);
    const recHTML = rec.length ? rec.map((x) => `<button class="rec" data-rec="${esc(x.id)}">${emblemHTML(x.prof)}<span><b>${esc(x.name)}</b><small>${x.games} ${x.games === 1 ? 'partida' : 'partidas'} · tú ${x.myWins} – ${x.theirWins} ${esc(x.name)}</small></span></button>`).join('') : '<p class="muted">Aquí aparecerán las personas con las que juegues partidas online.</p>';
    box.innerHTML = `<div class="row between"><h2>Tu perfil</h2><button class="btn small ghost" data-close>Cerrar</button></div>
      ${App.profileBad ? '<p class="rr-warn">El servidor no ha podido comprobar este perfil. Si tienes un enlace de recuperación, ábrelo.</p>' : ''}
      ${profCardHTML(Object.assign({}, p, { name: App.name }))}
      <h4 class="tr-sub">Emblema</h4><div class="emb-grid">${emb}</div>
      <h4 class="tr-sub">Logros (${p.ach.length}/${Profile.ACH.length})</h4>${achHTML(p)}
      <h4 class="tr-sub">Jugadores recientes</h4><div class="rec-list">${recHTML}</div>
      <h4 class="tr-sub">No pierdas tu perfil</h4>
      <p class="muted">Tu perfil se guarda en este navegador. Si borras los datos del navegador o cambias de móvil, abre tu <b>enlace de recuperación</b> y lo recuperas tal como estaba cuando lo copiaste. Cópialo de nuevo cuando subas de nivel. En iPhone, añade el juego a la pantalla de inicio para que Safari no lo borre.</p>
      <div class="row gap wrap"><button class="btn cyan" id="pf-copy">📋 Copiar enlace de recuperación</button><a class="btn green" id="pf-wa" target="_blank" rel="noopener">Enviármelo por WhatsApp</a></div>`;
    $('#pf-copy').onclick = () => { const l = recoveryLink(); (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => toast('Enlace de recuperación copiado. Guárdalo en un sitio seguro', true), () => toast(l, true)); };
    $('#pf-wa').href = 'https://wa.me/?text=' + encodeURIComponent('Mi perfil de Hexópolis (enlace de recuperación): ' + recoveryLink());
    box.querySelectorAll('[data-emb]').forEach((b) => (b.onclick = async () => {
      Sfx.click();
      const r = await profileCall({ profile: ProfStore.signed(), emblem: b.dataset.emb, name: App.name });
      if (r && r.t === 'profile') { ProfStore.set(r.profile); if (App.ui.modal && App.ui.modal.kind === 'profile') renderModal(); }
      else toast('No se pudo cambiar el emblema (¿sin conexión con el servidor?)');
    }));
    box.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => { Sfx.click(); const x = Recents.all()[b.dataset.rec]; if (x) openModal({ kind: 'pcard', prof: x.prof, back: 'profile' }); }));
    return;
  }
  if (m.kind === 'pcard') {
    const q = m.prof;
    if (!q) { closeModal(); return; }
    const mine = p && q.id === p.id;
    box.innerHTML = `<div class="row between"><h2>${mine ? 'Tu perfil' : 'Perfil de ' + esc(q.name)}</h2><button class="btn small ghost" ${m.back ? 'id="pc-back"' : 'data-close'}>${m.back ? '‹ Volver' : 'Cerrar'}</button></div>
      ${profCardHTML(q)}
      ${mine ? '' : `<h4 class="tr-sub">Entre vosotros</h4>${vsHTML(q.id)}`}
      <h4 class="tr-sub">Logros (${q.ach.length}/${Profile.ACH.length})</h4>${achHTML(q)}`;
    if ($('#pc-back')) $('#pc-back').onclick = () => openModal({ kind: m.back });
  }
}

$('#prof-chip').onclick = () => { Sfx.unlock(); Sfx.click(); openModal({ kind: 'profile' }); };
$('#in-name').addEventListener('change', () => { if (ProfStore.get()) profileCall({ profile: ProfStore.signed(), name: App.name }).then((r) => r && r.t === 'profile' && ProfStore.set(r.profile)); renderProfileChip(); });
renderProfileChip();
syncProfile();
