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

// foto de perfil: se guarda en este navegador (pequeña, recortada en cuadrado) y se envía al servidor al conectar
const Avatar = {
  get() { const v = store.get('hx_avatar', ''); return v && v.startsWith('data:image/') ? v : null; },
  set(v) { if (v) store.set('hx_avatar', v); else { try { localStorage.removeItem('hx_avatar'); } catch (e) { /* */ } } },
};
function makeAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Elige una imagen'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const S = 112, c = document.createElement('canvas'); c.width = S; c.height = S;
      const x = c.getContext('2d');
      const side = Math.min(img.naturalWidth, img.naturalHeight); // recorte cuadrado centrado
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
      URL.revokeObjectURL(url);
      let q = 0.85, out = c.toDataURL('image/jpeg', q);
      while (out.length > 15000 && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}
function applyAvatar(img) {
  Avatar.set(img);
  if (App.ws && App.ws.readyState === 1) App.ws.send(JSON.stringify({ t: 'avatar', img: img || null }));
  if (App.localRoom && App.mode === 'local') { const seat = App.localRoom.seats[App.localRoom.seatOf(App.token)]; if (seat) { seat.avatar = img || null; App.localRoom.sendRoom(); } }
  renderProfileChip();
}

// estadísticas de las partidas locales (contra bots, sin conexión): se guardan aparte en este navegador
const LocalStats = {
  empty() { return { games: 0, wins: 0, streak: 0, best: 0, prod: 0, stole: 0, vpTotal: 0, byLevel: {} }; },
  get() { try { return Object.assign(this.empty(), JSON.parse(store.get('hx_lstats', 'null')) || {}); } catch (e) { return this.empty(); } },
  set(o) { store.set('hx_lstats', JSON.stringify(o)); },
};
function recordLocalGame(r) {
  const s = r && r.state;
  if (!s || s.phase !== 'gameOver' || r._recAt === (r.startedAt || 1)) return;
  r._recAt = r.startedAt || 1;
  const me = r.seatOf(App.token); if (me < 0) return;
  const won = s.winTeam != null ? Engine.teamOf(s, me) === s.winTeam : s.winner === me;
  const st = (s.stats && s.stats.pl && s.stats.pl[me]) || {};
  const L = LocalStats.get();
  L.games++; if (won) { L.wins++; L.streak++; L.best = Math.max(L.best, L.streak); } else L.streak = 0;
  L.prod += st.prod || 0; L.stole += st.stole || 0; L.vpTotal += Engine.vp(s, me, true);
  // victorias según el nivel más alto de bot que había en la mesa
  const top = Math.max(0, ...r.seats.filter((x) => x.kind === 'bot').map((x) => x.level));
  if (top) { const b = L.byLevel[top] || { g: 0, w: 0 }; b.g++; if (won) b.w++; L.byLevel[top] = b; }
  LocalStats.set(L);
}
function statsGrid(p, extra) {
  const pct = p.games ? Math.round((p.wins / p.games) * 100) : 0;
  const stat = (n, l) => `<div class="pf-st"><b>${n}</b><small>${l}</small></div>`;
  return `<div class="pf-stats">${stat(p.games, 'Partidas')}${stat(p.wins, 'Victorias')}${stat(pct + '%', 'Ganadas')}${stat(p.best, 'Mejor racha')}${stat(p.prod, 'Producidas')}${stat(p.stole, 'Robadas')}${stat(p.games ? (p.vpTotal / p.games).toFixed(1) : '0', 'Puntos/partida')}${extra || ''}</div>`;
}
function localStatsHTML() {
  const L = LocalStats.get();
  const won = [1, 2, 3, 4].filter((l) => L.byLevel[l] && L.byLevel[l].w);
  const bestWon = won.length ? Math.max(...won) : 0;
  const lv = [1, 2, 3, 4].filter((l) => L.byLevel[l]).map((l) => `<span class="rchip">${'★'.repeat(l)} ${L.byLevel[l].w}/${L.byLevel[l].g}</span>`).join('');
  return L.games ? statsGrid(L, `<div class="pf-st"><b>${bestWon ? '★'.repeat(bestWon) : '—'}</b><small>Mejor bot ganado</small></div>`) + (lv ? `<div class="rr-mini"><small class="muted">Victorias según el nivel de bot más alto:</small>${lv}</div>` : '') : '<p class="muted st-empty">Todavía no has terminado ninguna partida local.</p>';
}
// estadísticas por modo de juego en un deslizable: Todas · Clásica · Por equipos · Personalizada · Local
const STAT_MODES = [
  { k: 'all', tab: '🌐 Todas', t: 'Todas las partidas online', sub: 'dan experiencia y logros' },
  { k: 'classic', tab: '🏛️ Clásica', t: 'Partidas clásicas online', sub: 'reglas de siempre' },
  { k: 'teams', tab: '👥 Equipos', t: 'Partidas por equipos online', sub: 'ganas si gana tu equipo' },
  { k: 'custom', tab: '🎲 Personalizada', t: 'Partidas personalizadas online', sub: 'con normas especiales' },
  { k: 'local', tab: '🤖 Local', t: 'Partidas locales', sub: 'contra bots, sin conexión · no dan experiencia' },
];
function statsSliderHTML(p, withLocal) {
  const stat = (n, l) => `<div class="pf-st"><b>${n}</b><small>${l}</small></div>`;
  const modes = STAT_MODES.filter((x) => x.k !== 'local' || withLocal);
  const M = p.modes || {};
  const split = Profile.MODE_KEYS.reduce((a, k) => a + ((M[k] && M[k].games) || 0), 0);
  const body = (x) => {
    if (x.k === 'all') return statsGrid(p, stat(p.ach.length + '/' + Profile.ACH.length, 'Logros')) + (p.games > split ? `<small class="muted st-note">${p.games - split} ${p.games - split === 1 ? 'partida jugada' : 'partidas jugadas'} antes de separar por modos solo ${p.games - split === 1 ? 'cuenta' : 'cuentan'} aquí.</small>` : '');
    if (x.k === 'local') return localStatsHTML();
    const m = M[x.k];
    return m && m.games ? statsGrid(m) : `<p class="muted st-empty">${withLocal ? 'Todavía no has terminado' : 'Todavía no ha terminado'} ninguna partida de este modo online.</p>`;
  };
  const cnt = (x) => x.k === 'all' ? p.games : x.k === 'local' ? LocalStats.get().games : (M[x.k] && M[x.k].games) || 0;
  return `<div class="st-wrap">
      <div class="st-tabs">${modes.map((x, i) => `<button class="st-tab ${i ? '' : 'on'}" data-sti="${i}">${x.tab} <small>${cnt(x)}</small></button>`).join('')}</div>
      <div class="st-slider">${modes.map((x) => `<div class="st-slide"><h4 class="pf-sec-t">${x.t} <small class="muted">${x.sub}</small></h4>${body(x)}</div>`).join('')}</div>
      <div class="st-dots">${modes.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
    </div>`;
}
// deslizar con el dedo, o pulsar las pestañas; recuerda la última pestaña vista
function bindStatsSlider(box) {
  const sl = box.querySelector('.st-slider'); if (!sl) return;
  const tabs = [...box.querySelectorAll('.st-tab')], dots = [...box.querySelectorAll('.st-dots i')];
  const mark = (i) => { tabs.forEach((t, j) => t.classList.toggle('on', j === i)); dots.forEach((d, j) => d.classList.toggle('on', j === i)); const t = tabs[i], bar = t && t.parentElement; if (t && bar.scrollWidth > bar.clientWidth) { const l = t.offsetLeft - bar.offsetLeft; if (l < bar.scrollLeft) bar.scrollLeft = l - 8; else if (l + t.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = l + t.offsetWidth - bar.clientWidth + 8; } };
  let lock = 0; // mientras se desliza por pulsar una pestaña, no marcar las intermedias
  let anim = 0;
  const go = (i, smooth) => {
    mark(i); App.ui.stTab = i;
    const to = i * sl.clientWidth, from = sl.scrollLeft;
    cancelAnimationFrame(anim);
    if (!smooth || Math.abs(to - from) < 2) { sl.scrollLeft = to; return; }
    // animación propia (el desplazamiento suave del navegador no va igual en todos)
    lock = Date.now() + 1000; sl.style.scrollSnapType = 'none';
    const t0 = performance.now(), dur = 260;
    let done = false;
    const end = () => { if (done) return; done = true; cancelAnimationFrame(anim); sl.style.scrollSnapType = ''; sl.scrollLeft = to; lock = Date.now() + 80; };
    const step = (now) => {
      if (done) return;
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      sl.scrollLeft = from + (to - from) * e;
      if (k < 1) anim = requestAnimationFrame(step); else end();
    };
    anim = requestAnimationFrame(step);
    setTimeout(end, dur + 120); // por si el navegador no pinta (pestaña en segundo plano)
  };
  tabs.forEach((t, i) => (t.onclick = () => { Sfx.click(); go(i, true); }));
  let raf = 0;
  sl.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (Date.now() < lock) return; const i = Math.round(sl.scrollLeft / Math.max(1, sl.clientWidth)); if (!tabs[i] || tabs[i].classList.contains('on')) return; mark(i); App.ui.stTab = i; }); });
  const start = Math.min(tabs.length - 1, App.ui.stTab || 0);
  if (start) requestAnimationFrame(() => go(start, false));
}

// jugadores con los que has coincidido (ficha guardada tal como estaba y resultados entre vosotros)
const Recents = {
  all() { try { return JSON.parse(store.get('hx_recent', '{}')) || {}; } catch (e) { return {}; } },
  save(o) { const arr = Object.values(o).sort((a, b) => b.last - a.last).slice(0, 30); store.set('hx_recent', JSON.stringify(Object.fromEntries(arr.map((x) => [x.id, x])))); },
};

// ---------- comunicación con el servidor ----------
let profReq = 0;
const profWait = new Map();
function profileCall(msg) { return serverCall(Object.assign({}, msg, { t: 'profile' })); }
function serverCall(msg) {
  return Promise.resolve(App.configReady).then(() => new Promise((resolve) => {
    if (!App.hasServer) return resolve(null);
    const req = ++profReq;
    msg = Object.assign({}, msg, { req });
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
  if (m.t === 'profile' || m.t === 'profileBad' || m.t === 'friends') { const r = profWait.get(m.req); if (r) { profWait.delete(m.req); r(m); } return; }
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

// ---------- ranking entre amigos ----------
async function refreshFriends() {
  const rec = Recents.all(), ids = Object.keys(rec);
  if (!ids.length) return;
  const r = await serverCall({ t: 'friends', ids });
  if (!r || r.t !== 'friends') return;
  App.friendsOnline = new Set();
  for (const x of r.list) {
    if (x.online) App.friendsOnline.add(x.id);
    const it = rec[x.id];
    if (it && x.p && (!it.prof || (x.p.updated || 0) >= (it.prof.updated || 0))) { it.prof = x.p; it.name = x.p.name; it.seen = x.at; it.avatar = x.avatar || null; }
  }
  Recents.save(rec);
  App.friendsAt = Date.now();
  if (App.ui.modal && App.ui.modal.kind === 'ranking') renderModal();
}
function ago(t) {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 2 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`;
}
function renderRanking(m, box) {
  const me = ProfStore.data(), rec = Object.values(Recents.all());
  const on = App.friendsOnline || new Set();
  const rows = rec.map((x) => ({ p: x.prof, name: x.name, x, mine: false, av: x.avatar }));
  if (me) rows.push({ p: Object.assign({}, me, { name: App.name }), name: App.name, x: null, mine: true, av: Avatar.get() });
  const sort = m.sort || 'lvl';
  const wr = (p) => (p.games ? p.wins / p.games : 0);
  if (sort === 'lvl') rows.sort((a, b) => b.p.xp - a.p.xp);
  if (sort === 'wins') rows.sort((a, b) => b.p.wins - a.p.wins || wr(b.p) - wr(a.p));
  if (sort === 'vs') rows.sort((a, b) => (a.mine ? 1 : b.mine ? -1 : (b.x.theirWins - b.x.myWins) - (a.x.theirWins - a.x.myWins)));
  const tab = (k, t) => `<button class="${sort === k ? 'on' : ''}" data-rsort="${k}">${t}</button>`;
  const body = rows.length > 1 || (rows.length && !me) ? rows.map((r, k) => {
    const p = r.p, l = Profile.levelOf(p.xp), rk = Profile.rankOf(l);
    const vs = r.mine ? '<span class="muted">—</span>' : `<b>${r.x.myWins}</b>–<b>${r.x.theirWins}</b>`;
    const st = r.mine ? 'Tú' : on.has(p.id) ? '<span class="on-dot"></span>Conectado' : r.x.seen ? `Visto ${ago(r.x.seen)}` : `Jugasteis ${ago(r.x.last)}`;
    return `<tr class="${r.mine ? 'me' : ''}" ${r.mine ? '' : `data-rk="${esc(p.id)}"`}><td>${k + 1}</td><td><span class="rk-name">${emblemHTML(p, '', r.av)}<span><b>${esc(r.name)}</b><small style="color:${rk.color}">${rk.name} · Nv ${l}</small></span></span></td>
      <td><b>${p.wins}</b><small> / ${p.games}</small><br><small class="muted">${Math.round(wr(p) * 100)}%</small></td><td>${vs}</td><td><small class="muted">${st}</small></td></tr>`;
  }).join('') : '';
  box.innerHTML = `<div class="row between"><h2>🏆 Ranking de amigos</h2><button class="btn small ghost" data-close>Cerrar</button></div>
    <p class="muted">Las personas con las que has terminado partidas online. ${App.hasServer ? 'Se actualiza con la última ficha de cada uno cada vez que entran al juego.' : ''}</p>
    <div class="side-tabs rk-tabs">${tab('lvl', 'Nivel')}${tab('wins', 'Victorias')}${tab('vs', 'Contra ti')}</div>
    ${body ? `<div class="st-wrap"><table class="rk-table"><thead><tr><th>#</th><th>Jugador</th><th>Victorias</th><th>Tú – él/ella</th><th>Estado</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="muted">Todavía no hay nadie. Termina una partida online con amigos y aparecerán aquí.</p>'}
    <div class="row gap between"><small class="muted">${App.friendsAt ? 'Actualizado ' + ago(App.friendsAt) : 'Actualizando…'}</small><button class="btn small cyan" id="rk-refresh">↻ Actualizar</button></div>`;
  box.querySelectorAll('[data-rsort]').forEach((b) => (b.onclick = () => { Sfx.click(); m.sort = b.dataset.rsort; renderModal(); }));
  box.querySelectorAll('[data-rk]').forEach((b) => (b.onclick = () => { Sfx.click(); const x = Recents.all()[b.dataset.rk]; if (x) openModal({ kind: 'pcard', prof: x.prof, avatar: x.avatar, back: 'ranking' }); }));
  $('#rk-refresh').onclick = () => { Sfx.click(); refreshFriends(); };
}

// ---------- tras cada partida ----------
function recordRecents(gain) {
  const v = App.view, r = App.room; if (!v || !r) return;
  const rec = Recents.all();
  const mine = ProfStore.data();
  r.seats.forEach((s, i) => {
    if (i === App.me || s.kind !== 'human' || !s.prof || (mine && s.prof.id === mine.id)) return;
    const x = rec[s.prof.id] || { id: s.prof.id, games: 0, myWins: 0, theirWins: 0 };
    x.prof = s.prof; x.name = s.prof.name; x.last = Date.now(); x.games++; x.avatar = s.avatar || null;
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
function emblemHTML(p, size = '', av = null) {
  const l = Profile.levelOf(p.xp), rk = Profile.rankOf(l);
  return `<span class="pemb ${size} ${av ? 'has-av' : ''}" style="--rk:${rk.color}">${av ? `<img src="${av}" alt="">` : p.emblem}<b>${l}</b></span>`;
}
function profCardHTML(p, av, withLocal) {
  const pr = Profile.progress(p.xp), rk = Profile.rankOf(pr.lvl);
  return `<div class="pf-card" style="--rk:${rk.color}">
      <div class="pf-head">${emblemHTML(p, 'big', av)}<div class="pf-id"><b>${esc(p.name)}</b><span class="pf-rank">${rk.name} · Nivel ${pr.lvl}</span>
        <div class="pf-xp"><i style="width:${pr.pct}%"></i></div><small class="muted">${pr.into} / ${pr.need} de experiencia para el nivel ${pr.lvl + 1}</small></div></div>
      ${statsSliderHTML(p, withLocal)}
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
  el.innerHTML = `${emblemHTML(p, '', Avatar.get())}<span class="pc-txt"><b>${esc(App.name)}</b><small>${rk.name} · Nivel ${pr.lvl}</small><span class="pf-xp"><i style="width:${pr.pct}%"></i></span></span><span class="pc-go">Perfil ›</span>`;
}

// ---------- ventanas ----------
function renderProfileModal(m, box) {
  const p = ProfStore.data();
  if (m.kind === 'profile') {
    if (!p) { box.innerHTML = `<h2>Tu perfil</h2><p class="muted">${App.hasServer ? 'Se está creando tu perfil, vuelve a abrirlo en un momento.' : 'El perfil necesita el servidor del juego.'}</p><button class="btn small ghost" data-close>Cerrar</button>`; return; }
    const lvl = Profile.levelOf(p.xp);
    const emb = Profile.EMBLEMS.map((x) => `<button class="emb ${x.e === p.emblem ? 'on' : ''}" data-emb="${x.e}" ${lvl >= x.lvl ? '' : 'disabled'} title="${lvl >= x.lvl ? 'Usar este emblema' : 'Se desbloquea en el nivel ' + x.lvl}">${x.e}${lvl >= x.lvl ? '' : `<small>Nv ${x.lvl}</small>`}</button>`).join('');
    const rec = Object.values(Recents.all()).sort((a, b) => b.last - a.last);
    const recHTML = rec.length ? rec.map((x) => `<button class="rec" data-rec="${esc(x.id)}">${emblemHTML(x.prof, '', x.avatar)}<span><b>${esc(x.name)}</b><small>${x.games} ${x.games === 1 ? 'partida' : 'partidas'} · tú ${x.myWins} – ${x.theirWins} ${esc(x.name)}</small></span></button>`).join('') : '<p class="muted">Aquí aparecerán las personas con las que juegues partidas online.</p>';
    box.innerHTML = `<div class="row between"><h2>Tu perfil</h2><button class="btn small ghost" data-close>Cerrar</button></div>
      ${App.profileBad ? '<p class="rr-warn">El servidor no ha podido comprobar este perfil. Si tienes un enlace de recuperación, ábrelo.</p>' : ''}
      ${profCardHTML(Object.assign({}, p, { name: App.name }), Avatar.get(), true)}
      <h4 class="tr-sub">Foto de perfil</h4>
      <div class="av-row">${Avatar.get() ? `<img class="av-prev" src="${Avatar.get()}" alt="Tu foto">` : '<span class="av-prev none">📷</span>'}
        <div class="av-txt"><small class="muted">Se verá en la sala, en la partida y en tu ficha. Se recorta en cuadrado y se guarda en este navegador.</small>
        <div class="row gap wrap"><label class="btn small cyan av-pick">📷 ${Avatar.get() ? 'Cambiar foto' : 'Elegir foto'}<input type="file" accept="image/*" id="av-file" hidden></label>${Avatar.get() ? '<button class="btn small ghost" id="av-del">Quitar foto</button>' : ''}</div></div></div>
      <h4 class="tr-sub">Emblema</h4><div class="emb-grid">${emb}</div>
      <h4 class="tr-sub">Logros (${p.ach.length}/${Profile.ACH.length})</h4>${achHTML(p)}
      <div class="row between"><h4 class="tr-sub">Jugadores recientes</h4><button class="btn small ghost" id="pf-rank">🏆 Ver ranking</button></div><div class="rec-list">${recHTML}</div>
      <h4 class="tr-sub">No pierdas tu perfil</h4>
      <p class="muted">Tu perfil se guarda en este navegador. Si borras los datos del navegador o cambias de móvil, abre tu <b>enlace de recuperación</b> y lo recuperas tal como estaba cuando lo copiaste. Cópialo de nuevo cuando subas de nivel. En iPhone, añade el juego a la pantalla de inicio para que Safari no lo borre.</p>
      <div class="row gap wrap"><button class="btn cyan" id="pf-copy">📋 Copiar enlace de recuperación</button><a class="btn green" id="pf-wa" target="_blank" rel="noopener">Enviármelo por WhatsApp</a></div>`;
    bindStatsSlider(box);
    $('#av-file').onchange = async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try { const img = await makeAvatar(f); applyAvatar(img); toast('📷 Foto de perfil guardada', true); if (App.ui.modal && App.ui.modal.kind === 'profile') renderModal(); }
      catch (err) { toast(err.message || 'No se pudo usar esa imagen'); }
    };
    if ($('#av-del')) $('#av-del').onclick = () => { Sfx.click(); applyAvatar(null); toast('Foto quitada', true); renderModal(); };
    $('#pf-copy').onclick = () => { const l = recoveryLink(); (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => toast('Enlace de recuperación copiado. Guárdalo en un sitio seguro', true), () => toast(l, true)); };
    $('#pf-wa').href = 'https://wa.me/?text=' + encodeURIComponent('Mi perfil de Hexópolis (enlace de recuperación): ' + recoveryLink());
    box.querySelectorAll('[data-emb]').forEach((b) => (b.onclick = async () => {
      Sfx.click();
      const r = await profileCall({ profile: ProfStore.signed(), emblem: b.dataset.emb, name: App.name });
      if (r && r.t === 'profile') { ProfStore.set(r.profile); if (App.ui.modal && App.ui.modal.kind === 'profile') renderModal(); }
      else toast('No se pudo cambiar el emblema (¿sin conexión con el servidor?)');
    }));
    $('#pf-rank').onclick = () => { Sfx.click(); openModal({ kind: 'ranking' }); refreshFriends(); };
    box.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => { Sfx.click(); const x = Recents.all()[b.dataset.rec]; if (x) openModal({ kind: 'pcard', prof: x.prof, avatar: x.avatar, back: 'profile' }); }));
    return;
  }
  if (m.kind === 'pcard') {
    const q = m.prof;
    if (!q) { closeModal(); return; }
    const mine = p && q.id === p.id;
    box.innerHTML = `<div class="row between"><h2>${mine ? 'Tu perfil' : 'Perfil de ' + esc(q.name)}</h2><button class="btn small ghost" ${m.back ? 'id="pc-back"' : 'data-close'}>${m.back ? '‹ Volver' : 'Cerrar'}</button></div>
      ${profCardHTML(q, m.avatar || (mine ? Avatar.get() : (Recents.all()[q.id] || {}).avatar))}
      ${mine ? '' : `<h4 class="tr-sub">Entre vosotros</h4>${vsHTML(q.id)}`}
      <h4 class="tr-sub">Logros (${q.ach.length}/${Profile.ACH.length})</h4>${achHTML(q)}`;
    bindStatsSlider(box);
    if ($('#pc-back')) $('#pc-back').onclick = () => openModal({ kind: m.back });
  }
}

$('#prof-chip').onclick = () => { Sfx.unlock(); Sfx.click(); openModal({ kind: 'profile' }); };
$('#btn-ranking').onclick = () => { Sfx.unlock(); Sfx.click(); openModal({ kind: 'ranking' }); refreshFriends(); };
$('#in-name').addEventListener('change', () => { if (ProfStore.get()) profileCall({ profile: ProfStore.signed(), name: App.name }).then((r) => r && r.t === 'profile' && ProfStore.set(r.profile)); renderProfileChip(); });
renderProfileChip();
syncProfile();
