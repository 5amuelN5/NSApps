// DOMINIUM — perfil del jugador en el navegador: nivel, estadísticas, logros, foto, emblema,
// jugadores recientes, ranking de amigos y enlace de recuperación (mismo funcionamiento que Hexópolis).
import * as Profile from '../shared/profile.js';

let D = null; // dependencias que pasa app.js: { $, esc, api, toast, openModal, closeModal, sfx, store, getName, setName, inRoom, sendAvatar }
const $ = (s) => D.$(s);
const esc = (s) => D.esc(s);

// ------------------------------------------------------------ almacenamiento local
export const ProfStore = {
  get() {
    try { const x = JSON.parse(D.store.get('dom.profile', 'null')); if (x && x.d && x.s) { x.data = JSON.parse(x.d); return x; } } catch { /* */ }
    return null;
  },
  set(signed) { D.store.set('dom.profile', JSON.stringify({ d: signed.d, s: signed.s })); renderProfileChip(); },
  signed() { const x = this.get(); return x ? { d: x.d, s: x.s } : null; },
  data() { const x = this.get(); return x ? x.data : null; },
};

export const Avatar = {
  get() { const v = D.store.get('dom.avatar', ''); return v && v.startsWith('data:image/') ? v : null; },
  set(v) { if (v) D.store.set('dom.avatar', v); else { try { localStorage.removeItem('dom.avatar'); } catch { /* */ } } },
};

function makeAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Elige una imagen'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const S = 112, c = document.createElement('canvas'); c.width = S; c.height = S;
      const x = c.getContext('2d');
      const side = Math.min(img.naturalWidth, img.naturalHeight);
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
  D.sendAvatar(img || null);
  renderProfileChip();
}

// jugadores con los que has coincidido online y resultados entre vosotros
export const Recents = {
  all() { try { return JSON.parse(D.store.get('dom.recent', '{}')) || {}; } catch { return {}; } },
  save(o) {
    const arr = Object.values(o).sort((a, b) => b.last - a.last).slice(0, 30);
    D.store.set('dom.recent', JSON.stringify(Object.fromEntries(arr.map((x) => [x.id, x]))));
  },
};

// ------------------------------------------------------------ servidor
async function profileCall(body) {
  try { return await D.api('/api/profile', { ...body, cid: D.cid }); } catch { return null; }
}
const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
function recoveryLink() {
  const sg = ProfStore.signed(); if (!sg) return '';
  return `${location.origin}${location.pathname}?perfil=${b64e(JSON.stringify(sg))}`;
}

let profileBad = false;
export async function syncProfile() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* */ }
  const q = new URLSearchParams(location.search);
  const raw = q.get('perfil');
  if (raw) {
    q.delete('perfil');
    history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : ''));
    let imp = null; try { imp = JSON.parse(b64d(raw)); } catch { /* */ }
    const r = imp ? await profileCall({ profile: imp, check: true }) : null;
    if (r && r.profile) {
      const cur = ProfStore.data(), nd = JSON.parse(r.profile.d);
      if (!cur || nd.xp >= cur.xp) { ProfStore.set(r.profile); D.setName(nd.name); D.toast(`Perfil recuperado: ${nd.name}, nivel ${Profile.levelOf(nd.xp)}`, true); }
      else D.toast('Tu perfil de este navegador tiene más experiencia que el del enlace: se mantiene el actual');
    } else D.toast('Ese enlace de perfil no es válido');
  }
  let r = await profileCall({ profile: ProfStore.signed(), name: D.getName(), avatar: Avatar.get() });
  if (r && r.bad) {
    r = await profileCall({ profile: null, name: D.getName() });
    if (r && r.profile) D.toast('Tu perfil anterior ya no es válido: empiezas uno nuevo desde el nivel 1', true);
  }
  if (r && r.profile) { ProfStore.set(r.profile); profileBad = false; }
  else if (r && r.bad) profileBad = true;
  if (r && r.update) handleProfileUpdate(r.update, null);
  renderProfileChip();
}

// ------------------------------------------------------------ tras cada partida
let lastGain = null;
export function getLastGain() { return lastGain; }
export function handleProfileUpdate(upd, snap) {
  if (!upd || !upd.signed) return false;
  if (D.store.get('dom.lastGain', '') === upd.key) { lastGain = lastGain || upd.gain; return false; }
  D.store.set('dom.lastGain', upd.key);
  ProfStore.set(upd.signed);
  lastGain = upd.gain;
  if (snap) recordRecents(snap);
  showGain(upd.gain);
  return true;
}
function recordRecents(snap) {
  const g = snap.game, rec = Recents.all(), mine = ProfStore.data();
  snap.room.slots.forEach((s, i) => {
    if (i === snap.you.slot || s.kind !== 'human' || !s.prof || (mine && s.prof.id === mine.id)) return;
    const x = rec[s.prof.id] || { id: s.prof.id, games: 0, myWins: 0, theirWins: 0 };
    x.prof = s.prof; x.name = s.prof.name; x.last = Date.now(); x.games++;
    x.avatar = (snap.avatars && snap.avatars[i]) || x.avatar || null;
    if (g.winner === snap.you.slot) x.myWins++;
    else if (g.winner === i) x.theirWins++;
    rec[x.id] = x;
  });
  Recents.save(rec);
}
function showGain(g) {
  if (!g) return;
  if (g.lvlTo > g.lvlFrom) { D.bigMsg(`¡Nivel ${g.lvlTo}!`, Profile.rankOf(g.lvlTo).name); D.sfx.win(); }
  D.toast(`+${g.xp} de experiencia${g.newAch.length ? `  ·  ${g.newAch.length} ${g.newAch.length === 1 ? 'logro nuevo' : 'logros nuevos'}` : ''}`, true);
}
export function gainHTML() {
  const g = lastGain; if (!g) return '';
  const lvl = g.lvlTo > g.lvlFrom ? `<b class="gain-up">¡Subes a nivel ${g.lvlTo}!</b>` : '';
  const ach = g.newAch.map((k) => Profile.ACH.find((a) => a.key === k)).filter(Boolean).map((a) => `<span class="rchip">${a.icon} ${esc(a.name)}</span>`).join('');
  return `<div class="gain-box"><div class="gain-top"><span class="gain-xp">+${g.xp} XP</span>${lvl}</div>
    <small class="muted">${g.from.length ? g.from.map(([t, n]) => `${esc(t)} (+${n})`).join(', ') : 'Saliste o un bot jugó por ti: esta partida no da experiencia'}</small>
    ${ach ? `<div class="chips">${ach}</div>` : ''}</div>`;
}

// ------------------------------------------------------------ piezas visuales
export function emblemHTML(p, size = '', av = null) {
  if (!p) return '';
  const l = Profile.levelOf(p.xp), rk = Profile.rankOf(l);
  return `<span class="pemb ${size} ${av ? 'has-av' : ''}" style="--rk:${rk.color}">${av ? `<img src="${av}" alt="">` : p.emblem}<b>${l}</b></span>`;
}
export function levelBadge(p) {
  if (!p) return '';
  const l = Profile.levelOf(p.xp), rk = Profile.rankOf(l);
  return `<span class="lvl-badge" style="--rk:${rk.color}" title="${esc(rk.name)}, nivel ${l}">${p.emblem} ${l}</span>`;
}
function statsGrid(p, extra) {
  const pct = p.games ? Math.round((p.wins / p.games) * 100) : 0;
  const stat = (n, l) => `<div class="pf-st"><b>${n}</b><small>${l}</small></div>`;
  return `<div class="pf-stats">${stat(p.games, 'Partidas')}${stat(p.wins, 'Victorias')}${stat(`${pct}%`, 'Ganadas')}${stat(p.best, 'Mejor racha')}${stat(p.conq, 'Conquistas')}${stat(p.kills, 'Eliminaciones')}${stat(p.destroyed, 'Bajas causadas')}${stat(p.trades, 'Canjes')}${extra || ''}</div>`;
}
const STAT_MODES = [
  { k: 'all', name: 'Todas', sub: 'Todas tus partidas online terminadas' },
  { k: 'dominacion', name: 'Dominación mundial', sub: 'Partidas con objetivo de dominación' },
  { k: 'misiones', name: 'Misiones secretas', sub: 'Partidas con misiones secretas' },
  { k: 'bots', name: 'Solo contra bots', sub: 'Partidas sin otras personas: dan menos experiencia' },
];
let stMode = 'all';
function statsCount(p, k) { const M = p.modes || {}; return k === 'all' ? p.games : (M[k] && M[k].games) || 0; }
function statsBodyHTML(p, k) {
  const x = STAT_MODES.find((y) => y.k === k) || STAT_MODES[0];
  const M = p.modes || {};
  let body;
  if (x.k === 'all') body = statsGrid(p, `<div class="pf-st"><b>${(p.ach || []).length}/${Profile.ACH.length}</b><small>Logros</small></div><div class="pf-st"><b>${(p.maps || []).length}</b><small>Mapas jugados</small></div>`);
  else body = M[x.k] && M[x.k].games ? statsGrid(M[x.k]) : '<p class="muted st-empty">Todavía no hay partidas terminadas de este tipo.</p>';
  return `<small class="muted st-sub">${x.sub}</small>${body}`;
}
function statsBlockHTML(p) {
  return `<div class="pst-wrap">
      <label class="st-pick"><span>Estadísticas</span><select class="st-sel">${STAT_MODES.map((x) => `<option value="${x.k}" ${x.k === stMode ? 'selected' : ''}>${x.name} (${statsCount(p, x.k)})</option>`).join('')}</select></label>
      <div class="st-body">${statsBodyHTML(p, stMode)}</div>
    </div>`;
}
function bindStats(box, p) {
  const sel = box.querySelector('.st-sel'); if (!sel) return;
  sel.onchange = () => { D.sfx.click(); stMode = sel.value; box.querySelector('.st-body').innerHTML = statsBodyHTML(p, sel.value); };
}
function profCardHTML(p, av) {
  const pr = Profile.progress(p.xp), rk = Profile.rankOf(pr.lvl);
  return `<div class="pf-card" style="--rk:${rk.color}">
      <div class="pf-head">${emblemHTML(p, 'big', av)}<div class="pf-id"><b>${esc(p.name)}</b><span class="pf-rank">${rk.name}, nivel ${pr.lvl}</span>
        <div class="pf-xp"><i style="width:${pr.pct}%"></i></div><small class="muted">${pr.max ? `Nivel máximo: ${p.xp} de experiencia en total` : `${pr.into} / ${pr.need} de experiencia para el nivel ${pr.lvl + 1}`}</small></div></div>
      ${statsBlockHTML(p)}
    </div>`;
}
function achHTML(p) {
  const has = new Set(p.ach || []);
  return `<div class="ach-grid">${Profile.ACH.map((a) => `<div class="ach ${has.has(a.key) ? 'on' : ''}" title="${esc(a.desc)}"><span>${has.has(a.key) ? a.icon : '🔒'}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`).join('')}</div>`;
}
function vsHTML(id) {
  const x = Recents.all()[id];
  if (!x || !x.games) return '<p class="muted">Todavía no habéis terminado ninguna partida juntos.</p>';
  const other = x.games - x.myWins - x.theirWins;
  return `<p class="pf-vs">Habéis jugado <b>${x.games}</b> ${x.games === 1 ? 'partida' : 'partidas'} juntos. Tú ganaste <b>${x.myWins}</b> y ${esc(x.name)} <b>${x.theirWins}</b>${other ? `; otros ${other}` : ''}.</p>`;
}
function ago(t) {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 2 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`;
}

// ------------------------------------------------------------ chip del menú
export function renderProfileChip() {
  const el = $('#prof-chip'); if (!el) return;
  const p = ProfStore.data();
  if (!p) {
    el.style.removeProperty('--rk');
    el.innerHTML = `<span class="pc-txt"><b>${esc(D.getName())}</b><small>Creando tu perfil…</small></span><span class="pc-go">Perfil ›</span>`;
    return;
  }
  const pr = Profile.progress(p.xp), rk = Profile.rankOf(pr.lvl);
  el.style.setProperty('--rk', rk.color);
  el.innerHTML = `${emblemHTML(p, '', Avatar.get())}<span class="pc-txt"><b>${esc(D.getName())}</b><small>${rk.name}, nivel ${pr.lvl}</small><span class="pf-xp"><i style="width:${pr.pct}%"></i></span></span><span class="pc-go">Perfil ›</span>`;
}

// ------------------------------------------------------------ ventanas
const nameFieldHTML = () => `<div class="pf-name"><label for="pf-name-in">Tu nombre</label><input id="pf-name-in" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(D.getName())}"><button class="btn small btn-gold" id="pf-name-ok">Guardar</button></div>`;
function bindNameField(rerender) {
  const nameIn = $('#pf-name-in'); if (!nameIn) return;
  const save = async () => {
    const nv = nameIn.value.trim().slice(0, 16);
    if (!nv) { D.toast('Escribe un nombre'); nameIn.focus(); return; }
    if (nv === D.getName()) return;
    D.sfx.click(); D.setName(nv);
    renderProfileChip();
    D.toast(`Nombre cambiado a ${nv}`, true);
    if (ProfStore.get()) { const r = await profileCall({ profile: ProfStore.signed(), name: nv }); if (r && r.profile) ProfStore.set(r.profile); }
    rerender && rerender();
  };
  $('#pf-name-ok').onclick = save;
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
}

export function openProfile() {
  const p = ProfStore.data();
  const box = D.openModal('', { wide: true });
  if (!p) {
    box.innerHTML = `<div class="m-head"><h3>Tu perfil</h3><button class="btn small" data-close>Cerrar</button></div>${nameFieldHTML()}
      <p class="muted">Se está creando tu perfil. Vuelve a abrirlo en un momento.</p>`;
    bindNameField(openProfile); bindClose(box); return;
  }
  const me = { ...p, name: D.getName() };
  const lvl = Profile.levelOf(p.xp);
  const emb = Profile.EMBLEMS.map((x) => `<button class="emb ${x.e === p.emblem ? 'on' : ''}" data-emb="${x.e}" ${lvl >= x.lvl ? '' : 'disabled'} title="${lvl >= x.lvl ? 'Usar este emblema' : `Se desbloquea en el nivel ${x.lvl}`}">${x.e}${lvl >= x.lvl ? '' : `<small>Nv ${x.lvl}</small>`}</button>`).join('');
  const rec = Object.values(Recents.all()).sort((a, b) => b.last - a.last);
  const recHTML = rec.length ? rec.map((x) => `<button class="rec" data-rec="${esc(x.id)}">${emblemHTML(x.prof, '', x.avatar)}<span><b>${esc(x.name)}</b><small>${x.games} ${x.games === 1 ? 'partida' : 'partidas'}, tú ${x.myWins} – ${x.theirWins} ${esc(x.name)}</small></span></button>`).join('') : '<p class="muted">Aquí aparecerán las personas con las que termines partidas online.</p>';
  const av = Avatar.get();
  box.innerHTML = `<div class="m-head"><h3>Tu perfil</h3><button class="btn small" data-close>Cerrar</button></div>
    ${profileBad ? '<p class="warn">El servidor no ha podido comprobar este perfil. Si tienes un enlace de recuperación, ábrelo.</p>' : ''}
    ${nameFieldHTML()}
    ${profCardHTML(me, av)}
    <h4 class="tr-sub">Foto de perfil</h4>
    <div class="av-row">${av ? `<img class="av-prev" src="${av}" alt="Tu foto">` : '<span class="av-prev none">📷</span>'}
      <div class="av-txt"><small class="muted">Se verá en la sala, en la partida y en tu ficha. Se recorta en cuadrado y se guarda en este navegador.</small>
      <div class="row-gap"><label class="btn small av-pick">${av ? 'Cambiar foto' : 'Elegir foto'}<input type="file" accept="image/*" id="av-file" hidden></label>${av ? '<button class="btn small" id="av-del">Quitar foto</button>' : ''}</div></div></div>
    <h4 class="tr-sub">Emblema</h4><div class="emb-grid">${emb}</div>
    <h4 class="tr-sub">Logros (${(p.ach || []).length}/${Profile.ACH.length})</h4>${achHTML(p)}
    <div class="m-head"><h4 class="tr-sub">Jugadores recientes</h4><button class="btn small" id="pf-rank">🏆 Ver ranking</button></div><div class="rec-list">${recHTML}</div>
    <h4 class="tr-sub">No pierdas tu perfil</h4>
    <p class="muted">Tu perfil se guarda en este navegador. Si borras los datos del navegador o cambias de móvil, abre tu <b>enlace de recuperación</b> y lo recuperas tal como estaba cuando lo copiaste. Cópialo de nuevo cuando subas de nivel.</p>
    <div class="row-gap"><button class="btn" id="pf-copy">Copiar enlace de recuperación</button><a class="btn btn-green" id="pf-wa" target="_blank" rel="noopener">Enviármelo por WhatsApp</a></div>`;
  bindClose(box);
  bindStats(box, me);
  bindNameField(openProfile);
  $('#av-file').onchange = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { const img = await makeAvatar(f); applyAvatar(img); D.toast('Foto de perfil guardada', true); openProfile(); }
    catch (err) { D.toast(err.message || 'No se pudo usar esa imagen'); }
  };
  if ($('#av-del')) $('#av-del').onclick = () => { D.sfx.click(); applyAvatar(null); D.toast('Foto quitada', true); openProfile(); };
  $('#pf-copy').onclick = () => {
    const l = recoveryLink();
    (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => D.toast('Enlace de recuperación copiado. Guárdalo en un sitio seguro', true), () => D.toast(l, true));
  };
  $('#pf-wa').href = `https://wa.me/?text=${encodeURIComponent(`Mi perfil de Dominium (enlace de recuperación): ${recoveryLink()}`)}`;
  box.querySelectorAll('[data-emb]').forEach((b) => (b.onclick = async () => {
    D.sfx.click();
    const r = await profileCall({ profile: ProfStore.signed(), emblem: b.dataset.emb, name: D.getName() });
    if (r && r.profile) { ProfStore.set(r.profile); openProfile(); }
    else D.toast('No se pudo cambiar el emblema. Comprueba la conexión.');
  }));
  $('#pf-rank').onclick = () => { D.sfx.click(); openRanking(); };
  box.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => { D.sfx.click(); const x = Recents.all()[b.dataset.rec]; if (x) openPcard(x.prof, x.avatar, 'profile'); }));
}

export function openPcard(q, avatar, back) {
  if (!q) return;
  const p = ProfStore.data(), mine = p && q.id === p.id;
  const box = D.openModal('', { wide: true });
  box.innerHTML = `<div class="m-head"><h3>${mine ? 'Tu perfil' : `Perfil de ${esc(q.name)}`}</h3><button class="btn small" ${back ? 'id="pc-back"' : 'data-close'}>${back ? '‹ Volver' : 'Cerrar'}</button></div>
    ${profCardHTML(q, avatar || (mine ? Avatar.get() : (Recents.all()[q.id] || {}).avatar))}
    ${mine ? '' : `<h4 class="tr-sub">Entre vosotros</h4>${vsHTML(q.id)}`}
    <h4 class="tr-sub">Logros (${(q.ach || []).length}/${Profile.ACH.length})</h4>${achHTML(q)}`;
  bindClose(box);
  bindStats(box, q);
  if ($('#pc-back')) $('#pc-back').onclick = () => (back === 'ranking' ? openRanking() : openProfile());
}

let friendsOnline = new Set(), friendsAt = 0, rankSort = 'lvl';
async function refreshFriends() {
  const rec = Recents.all(), ids = Object.keys(rec);
  if (!ids.length) { friendsAt = Date.now(); return; }
  let r = null;
  try { r = await D.api('/api/friends', { ids }); } catch { /* */ }
  if (!r || !r.list) return;
  friendsOnline = new Set();
  for (const x of r.list) {
    if (x.online) friendsOnline.add(x.id);
    const it = rec[x.id];
    if (it && x.p && (!it.prof || (x.p.updated || 0) >= (it.prof.updated || 0))) { it.prof = x.p; it.name = x.p.name; it.seen = x.at; if (x.avatar) it.avatar = x.avatar; }
  }
  Recents.save(rec);
  friendsAt = Date.now();
}
export function openRanking(skipRefresh) {
  const box = D.openModal('', { wide: true });
  const me = ProfStore.data(), rec = Object.values(Recents.all());
  const rows = rec.filter((x) => x.prof).map((x) => ({ p: x.prof, name: x.name, x, mine: false, av: x.avatar }));
  if (me) rows.push({ p: { ...me, name: D.getName() }, name: D.getName(), x: null, mine: true, av: Avatar.get() });
  const wr = (p) => (p.games ? p.wins / p.games : 0);
  if (rankSort === 'lvl') rows.sort((a, b) => b.p.xp - a.p.xp);
  if (rankSort === 'wins') rows.sort((a, b) => b.p.wins - a.p.wins || wr(b.p) - wr(a.p));
  if (rankSort === 'vs') rows.sort((a, b) => (a.mine ? 1 : b.mine ? -1 : (b.x.theirWins - b.x.myWins) - (a.x.theirWins - a.x.myWins)));
  const tab = (k, t) => `<button class="${rankSort === k ? 'on' : ''}" data-rsort="${k}">${t}</button>`;
  const body = rows.length > 1 ? rows.map((r, k) => {
    const p = r.p, l = Profile.levelOf(p.xp), rk = Profile.rankOf(l);
    const vs = r.mine ? '<span class="muted">—</span>' : `<b>${r.x.myWins}</b>–<b>${r.x.theirWins}</b>`;
    const st = r.mine ? 'Tú' : friendsOnline.has(p.id) ? '<span class="on-dot"></span>Conectado' : r.x.seen ? `Visto ${ago(r.x.seen)}` : `Jugasteis ${ago(r.x.last)}`;
    return `<tr class="${r.mine ? 'me' : ''}" ${r.mine ? '' : `data-rk="${esc(p.id)}"`}><td>${k + 1}</td><td><span class="rk-name">${emblemHTML(p, '', r.av)}<span><b>${esc(r.name)}</b><small style="color:${rk.color}">${rk.name}, nv ${l}</small></span></span></td>
      <td><b>${p.wins}</b><small> / ${p.games}</small><br><small class="muted">${Math.round(wr(p) * 100)}%</small></td><td>${vs}</td><td><small class="muted">${st}</small></td></tr>`;
  }).join('') : '';
  box.innerHTML = `<div class="m-head"><h3>🏆 Ranking de amigos</h3><button class="btn small" data-close>Cerrar</button></div>
    <p class="muted">Las personas con las que has terminado partidas online. Se actualiza con la última ficha de cada uno cada vez que entran al juego.</p>
    <div class="seg rk-tabs">${tab('lvl', 'Nivel')}${tab('wins', 'Victorias')}${tab('vs', 'Contra ti')}</div>
    ${body ? `<div class="st-wrap"><table class="rk-table"><thead><tr><th>#</th><th>Jugador</th><th>Victorias</th><th>Tú – rival</th><th>Estado</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="muted st-empty">Todavía no hay nadie. Termina una partida online con amigos y aparecerán aquí.</p>'}
    <div class="m-head"><small class="muted">${friendsAt ? `Actualizado ${ago(friendsAt)}` : 'Actualizando…'}</small><button class="btn small" id="rk-refresh">↻ Actualizar</button></div>`;
  bindClose(box);
  box.querySelectorAll('[data-rsort]').forEach((b) => (b.onclick = () => { D.sfx.click(); rankSort = b.dataset.rsort; openRanking(true); }));
  box.querySelectorAll('[data-rk]').forEach((b) => (b.onclick = () => { D.sfx.click(); const x = Recents.all()[b.dataset.rk]; if (x) openPcard(x.prof, x.avatar, 'ranking'); }));
  $('#rk-refresh').onclick = () => { D.sfx.click(); refreshFriends().then(() => openRanking(true)); };
  if (!skipRefresh) refreshFriends().then(() => { if (box.isConnected && box.querySelector('.rk-tabs')) openRanking(true); });
}

function bindClose(box) { box.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => D.closeModal())); }

export function initProfile(deps) {
  D = deps;
  $('#prof-chip').onclick = () => { D.sfx.unlock(); D.sfx.click(); openProfile(); };
  $('#btn-ranking').onclick = () => { D.sfx.unlock(); D.sfx.click(); openRanking(); };
  renderProfileChip();
  syncProfile();
}
