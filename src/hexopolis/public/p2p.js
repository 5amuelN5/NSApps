/* HEXÓPOLIS — modo online directo (navegador a navegador, WebRTC vía PeerJS).
   Quien crea la sala ejecuta la partida y los bots en su navegador; el resto se conecta con el código. */
'use strict';
const P2P = (() => {
  const PREFIX = 'hexopolis-v1-';
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let peer = null, conn = null, room = null, role = null, closing = false;
  const guests = new Set();
  const code4 = () => Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
  const available = () => typeof Peer !== 'undefined';

  function close() {
    closing = true;
    guests.forEach((g) => { try { g.conn.close(); } catch (e) { /* */ } });
    guests.clear();
    if (conn) { try { conn.close(); } catch (e) { /* */ } }
    conn = null;
    if (peer) { try { peer.destroy(); } catch (e) { /* */ } }
    peer = null;
    if (room) room.destroy();
    room = null; role = null;
  }

  function errText(e) {
    switch (e && e.type) {
      case 'browser-incompatible': return 'Tu navegador no permite conexiones directas (WebRTC).';
      case 'network': case 'socket-error': case 'socket-closed': case 'server-error': return 'No se pudo contactar con el servicio de emparejamiento. Revisa tu conexión a internet.';
      default: return 'Error de conexión (' + ((e && e.type) || 'desconocido') + ').';
    }
  }

  // ---------- anfitrión ----------
  function host({ name, hostToken, onRoom, onError }, tries = 0) {
    close(); closing = false; role = 'host';
    const code = code4();
    peer = new Peer(PREFIX + code, { debug: 0 });
    peer.on('open', () => {
      room = new Room({ code, name, isPublic: false });
      onRoom(room, code);
    });
    peer.on('connection', (c) => attachGuest(c, hostToken));
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && tries < 6) return host({ name, hostToken, onRoom, onError }, tries + 1);
      if (e.type === 'peer-unavailable') return;
      if (!room) onError(errText(e));
    });
    // si se cae el emparejador, las partidas siguen; nos reconectamos para que puedan entrar más
    peer.on('disconnected', () => { if (!closing && peer && !peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* */ } }, 1500); });
  }

  function attachGuest(c, hostToken) {
    const g = { conn: c, token: null, send: (m) => { if (c.open) { try { c.send(m); } catch (e) { /* */ } } } };
    guests.add(g);
    c.on('data', (m) => onGuest(g, m, hostToken));
    c.on('close', () => { guests.delete(g); if (room && g.token) room.disconnect(g.token); });
    c.on('error', () => {});
  }

  function onGuest(g, m, hostToken) {
    if (!room || !m || typeof m.t !== 'string') return;
    if (m.t === 'hello') {
      const tok = String(m.token || '').slice(0, 64);
      if (!tok || tok === hostToken) { g.send({ t: 'error', msg: 'Sesión no válida' }); return; }
      g.token = tok;
      const nm = String(m.name || 'Jugador').slice(0, 16).trim() || 'Jugador';
      const r = room.join(g, tok, nm);
      if (!r.ok) { g.send({ t: 'error', msg: r.error }); g.send({ t: 'joinFail', msg: r.error }); setTimeout(() => { try { g.conn.close(); } catch (e) { /* */ } }, 400); return; }
      g.send({ t: 'joined', code: room.code });
      return;
    }
    if (!g.token || room.seatOf(g.token) < 0) return;
    switch (m.t) {
      case 'action': { const e = room.action(g.token, m.action); if (e) g.send({ t: 'error', msg: e }); break; }
      case 'chat': room.say(g.token, m.text); break;
      case 'leaveRoom': room.leave(g.token); g.token = null; setTimeout(() => { try { g.conn.close(); } catch (e) { /* */ } }, 200); break;
      default: break; // los invitados no pueden empezar, añadir bots, etc.
    }
  }

  // ---------- invitado ----------
  function join(code, { token, name, onMsg, onFail, onLost }) {
    close(); closing = false; role = 'guest';
    let tries = 0, opened = false;
    peer = new Peer({ debug: 0 });
    const connectTo = () => {
      if (closing || !peer) return;
      const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn = c;
      const timer = setTimeout(() => {
        if (c.open || closing || conn !== c) return;
        try { c.close(); } catch (e) { /* */ }
        if (!opened) onFail('No se pudo conectar con la sala ' + code + '. Puede que vuestra red bloquee las conexiones directas; prueba con otra red (por ejemplo, datos del móvil).');
        else retry();
      }, 15000);
      c.on('open', () => { clearTimeout(timer); opened = true; tries = 0; c.send({ t: 'hello', token, name }); });
      c.on('data', (m) => onMsg(m));
      c.on('close', () => { clearTimeout(timer); if (!closing && conn === c && opened) retry(); });
      c.on('error', () => {});
    };
    const retry = () => {
      if (closing) return;
      if (tries >= 6) { onLost(true); return; }
      tries++; onLost(false);
      setTimeout(connectTo, 2000);
    };
    peer.on('open', connectTo);
    peer.on('error', (e) => {
      if (closing) return;
      if (e.type === 'peer-unavailable') {
        if (opened) retry();
        else onFail('No existe la sala ' + code + ', o quien la creó ha cerrado el juego.');
      } else if (!opened) onFail(errText(e));
    });
    peer.on('disconnected', () => { if (!closing && peer && !peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* */ } }, 1500); });
  }

  function send(m) { if (role === 'guest' && conn && conn.open) { try { conn.send(m); } catch (e) { /* */ } } }
  function guestCount() { return guests.size; }

  return { available, host, join, send, close, guestCount, get role() { return role; } };
})();
