/* HEXÓPOLIS — sala de juego: asientos, bots y bucle de turnos (servidor y modo local) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'), require('./bots'));
  else root.Room = factory(root.Engine, root.Bots);
})(typeof self !== 'undefined' ? self : this, function (E, B) {
  'use strict';

  const DELAY = { setup: 560, roll: 640, main: 520, robber: 780, discard: 520, respond: 950, confirm: 600, roadBuilding: 520 };
  const AUTO_GRACE = 20000; // ms antes de que un bot sustituya a un humano desconectado
  const TRADE_TIMEOUT = 12000;

  class Room {
    constructor({ code, name, isPublic = true, local = false, onChange, onState, onGameOver }) {
      this.code = code; this.name = name; this.isPublic = isPublic; this.local = local;
      this.seats = []; // {kind, token, name, level, client, connected, discAt}
      this.spectators = new Map(); // token → {client, name}
      this.startedAt = null; this.endedAt = null;
      this.chatTimes = new Map();
      this.host = null;
      this.state = null;
      this.chat = [];
      this.mem = {};
      this.timer = null;
      this.tradeTimer = null;
      this.lastTurn = -1;
      this.onChange = onChange || (() => {});
      this.onState = onState || (() => {}); // cada vez que cambia la partida (para guardarla)
      this.onGameOver = onGameOver || (() => {}); // al terminar (experiencia de los perfiles)
      this.awarded = false;
      this.speed = 1;
      this.rules = E.normRules({});
    }

    // ----- lobby -----
    info() {
      return {
        code: this.code, name: this.name, isPublic: this.isPublic, creatorSeat: this.seats.findIndex((x) => x.kind === 'human' && x.token === this.creator), hostSeat: this.seats.findIndex((x) => x.kind === 'human' && x.token === this.host), local: this.local, speed: this.speed,
        started: !!this.state, over: !!(this.state && this.state.phase === 'gameOver'), rules: this.rules, max: E.maxSeats(this.rules),
        seats: this.seats.map((s, i) => ({ i, kind: s.kind, name: s.name, level: s.level, connected: s.kind === 'bot' || s.connected, host: s.token === this.host, color: E.COLORS[i], prof: s.kind === 'human' && s.prof ? s.prof : null })),
        spectators: [...this.spectators.values()].map((x) => x.name),
        rematch: this.seats.map((x, i) => (x.kind === 'human' && this.rematch && this.rematch.has(x.token) ? i : -1)).filter((i) => i >= 0),
        startedAt: this.startedAt, endedAt: this.endedAt,
      };
    }
    seatOf(token) { return this.seats.findIndex((s) => s.kind === 'human' && s.token === token); }

    join(client, token, name, opts = {}) {
      const i = this.seatOf(token);
      if (i >= 0 && opts.watch) {
        // tiene sitio pero quiere mirar: su sitio sigue (lo juega un bot) y entra como espectador
        if (this.seats[i].connected) this.leave(token);
        return this.watch(client, token, name);
      }
      if (i >= 0) {
        this.spectators.delete(token);
        const seat = this.seats[i];
        if (!this.host || this.creator === token && !this.seats.some((x) => x.kind === 'human' && x.token === this.host && x.connected)) this.host = token;
        seat.client = client; seat.connected = true; seat.discAt = null; seat.left = false; seat.name = name || seat.name;
        if (client && client.profile) seat.prof = client.profile;
        this.sendRoom(); this.sendStateTo(i, []); this.schedule();
        return { ok: true };
      }
      // partida empezada, sala llena o quiere mirar: entra como espectador
      if (opts.watch || this.state || this.seats.length >= E.maxSeats(this.rules)) return this.watch(client, token, name);
      if (this.spectators.has(token)) this.spectators.delete(token); // un espectador ocupa un sitio libre
      this.seats.push({ kind: 'human', token, name: name || 'Jugador', client, connected: true, prof: (client && client.profile) || null });
      if (!this.host) this.host = token;
      if (!this.creator) this.creator = token; // quien creó la sala (puede eliminarla aunque haya salido)
      this.sysChat(`${name} entra en la sala`);
      this.sendRoom();
      return { ok: true };
    }

    watch(client, token, name) {
      const was = this.spectators.has(token);
      this.spectators.set(token, { client, name: name || 'Espectador' });
      if (!was) this.sysChat(`👁 ${name || 'Alguien'} está mirando la partida`);
      this.sendRoom();
      if (this.state) { this.sendSpectator(token, []); this.schedule(); }
      return { ok: true, spectator: true };
    }
    sendSpectator(token, events) {
      const x = this.spectators.get(token);
      if (!x || !x.client || !this.state) return;
      x.client.send({ t: 'state', view: E.viewFor(this.state, -1), events: E.filterEvents(events, -1) });
    }

    leave(token) {
      if (this.spectators.has(token)) { const x = this.spectators.get(token); this.spectators.delete(token); this.sysChat(`👁 ${x.name} deja de mirar`); this.sendRoom(); return; }
      const i = this.seatOf(token);
      if (i < 0) return;
      const seat = this.seats[i];
      if (!this.state || this.state.phase === 'gameOver') {
        this.seats.splice(i, 1);
        this.sysChat(`${seat.name} sale de la sala`);
        if (this.state) this.state = null;
      } else {
        seat.connected = false; seat.client = null; seat.discAt = Date.now();
        this.sysChat(`${seat.name} se ha ido (un bot jugará por él)`);
        seat.discAt = Date.now() - AUTO_GRACE; // sustitución inmediata si sale a propósito
        seat.left = true;
        this.schedule();
      }
      if (this.host === token) {
        const h = this.seats.find((s) => s.kind === 'human' && s.connected);
        this.host = h ? h.token : null;
      }
      this.sendRoom();
    }

    disconnect(token) {
      if (this.spectators.has(token)) { this.spectators.delete(token); this.sendRoom(); return; }
      const i = this.seatOf(token);
      if (i < 0) return;
      const seat = this.seats[i];
      if (!this.state) { this.leave(token); return; }
      seat.connected = false; seat.client = null; seat.discAt = Date.now();
      this.sendRoom();
      this.checkRematch();
      setTimeout(() => this.schedule(), AUTO_GRACE + 50);
    }

    // la sala sigue jugando mientras haya alguien conectado (jugador o espectador)
    humansConnected() { return this.seats.some((s) => s.kind === 'human' && s.connected) || this.spectators.size > 0; }

    addBot(token, level) {
      if (token !== this.host) return 'Solo el anfitrión puede añadir bots';
      if (this.state && this.state.phase !== 'gameOver') return 'La partida ya ha empezado';
      if (this.seats.length >= E.maxSeats(this.rules)) return this.rules.mode === 'teams' ? `En ${E.teamFormat(this.rules)} caben ${E.maxSeats(this.rules)} jugadores` : 'La sala está llena';
      level = Math.max(1, Math.min(4, level | 0 || 2));
      const used = new Set(this.seats.map((s) => s.name));
      const names = B.BOT_NAMES.filter((n) => !used.has(n));
      const nm = names[Math.floor(Math.random() * names.length)] || 'BOT';
      this.seats.push({ kind: 'bot', name: nm, level, connected: true });
      this.sendRoom();
    }
    setBotLevel(token, i, level) {
      if (token !== this.host) return 'Solo el anfitrión';
      const s = this.seats[i];
      if (!s || s.kind !== 'bot' || (this.state && this.state.phase !== 'gameOver')) return 'No aplica';
      s.level = Math.max(1, Math.min(4, level | 0));
      this.sendRoom();
    }
    removeSeat(token, i) {
      if (token !== this.host) return 'Solo el anfitrión';
      if (this.state && this.state.phase !== 'gameOver') return 'La partida ya ha empezado';
      const s = this.seats[i];
      if (!s || s.token === this.host) return 'No aplica';
      this.seats.splice(i, 1);
      if (s.kind === 'human' && s.client) s.client.send({ t: 'kicked' });
      this.sendRoom();
    }

    setRules(token, rules) {
      if (token !== this.host) return 'Solo el anfitrión puede cambiar las reglas';
      if (this.state && this.state.phase !== 'gameOver') return 'La partida ya ha empezado';
      this.rules = E.normRules(rules);
      this.sendRoom();
    }

    start(token, opts = {}) {
      if (token !== this.host) return 'Solo el anfitrión puede empezar';
      return this.startGame(opts);
    }
    startGame(opts = {}) {
      if (this.state && this.state.phase !== 'gameOver') return 'Ya hay una partida en curso';
      // quitar humanos desconectados o que se fueron
      const seats = this.seats.filter((s) => s.kind === 'bot' || (s.connected && !s.left));
      if (seats.length < 2) return 'Se necesitan al menos 2 jugadores';
      const tErr = E.teamsError(this.rules, seats.length);
      if (tErr) return tErr;
      this.seats = seats;
      this.rematch = new Set();
      this.state = E.createGame(this.seats.map((s, i) => ({ name: s.name, bot: s.kind === 'bot' ? s.level : 0, color: E.COLORS[i] })), Object.assign({}, opts, { rules: this.rules }));
      this.mem = {}; this.lastTurn = -1;
      this.startedAt = Date.now(); this.endedAt = null; this.awarded = false;
      this.seats.forEach((x) => { x.acts = 0; x.autoActs = 0; });
      this.sysChat(`¡Partida iniciada! Mapa ${this.state.map === 'big' ? 'grande' : 'normal'} a ${this.rules.vp} puntos.`);
      this.sendRoom();
      this.broadcast([{ type: 'start' }]);
      this.schedule();
      this.onState();
    }

    // ----- revancha por votación -----
    voteRematch(token) {
      if (!this.state || this.state.phase !== 'gameOver') return 'La partida no ha terminado';
      if (this.seatOf(token) < 0) return 'No estás en la partida';
      this.rematch = this.rematch || new Set();
      if (this.rematch.has(token)) this.rematch.delete(token); else this.rematch.add(token);
      this.sendRoom();
      this.checkRematch();
    }
    checkRematch() {
      if (!this.state || this.state.phase !== 'gameOver' || !this.rematch || !this.rematch.size) return;
      const need = this.seats.filter((x) => x.kind === 'human' && x.connected && !x.left);
      if (need.length && need.every((x) => this.rematch.has(x.token))) {
        const err = this.startGame();
        if (err) { this.sysChat('No se pudo empezar la revancha: ' + err); this.rematch.clear(); this.sendRoom(); }
      }
    }

    // ----- chat -----
    sysChat(text) { this.pushChat({ sys: true, text }); }
    say(token, text) {
      const spec = this.spectators.get(token) || null;
      const i = spec ? -1 : this.seatOf(token);
      if (i < 0 && !spec) return;
      text = String(text || '').slice(0, 200).trim();
      if (!text) return;
      // anti-spam: como mucho 6 mensajes cada 8 segundos
      const now = Date.now(), times = (this.chatTimes.get(token) || []).filter((t) => now - t < 8000);
      if (times.length >= 6) return;
      times.push(now); this.chatTimes.set(token, times);
      if (spec) this.pushChat({ name: '👁 ' + spec.name, color: '#95a8bd', text, seat: -1 });
      else this.pushChat({ name: this.seats[i].name, color: E.COLORS[i] || '#fff', text, seat: i });
    }
    pushChat(m) {
      this.chat.push(m); if (this.chat.length > 60) this.chat.shift();
      this.seats.forEach((s) => s.kind === 'human' && s.client && s.client.send({ t: 'chat', msg: m }));
      this.spectators.forEach((x) => x.client && x.client.send({ t: 'chat', msg: m }));
    }

    // ----- juego -----
    action(token, a) {
      if (!this.state) return 'No hay partida';
      if (this.spectators.has(token)) return 'Estás mirando la partida';
      const pid = this.seatOf(token);
      if (pid < 0) return 'No estás en la partida';
      const r = E.apply(this.state, pid, a);
      if (!r.ok) return r.error;
      this.seats[pid].acts = (this.seats[pid].acts || 0) + 1;
      this.after(r.events);
      return null;
    }

    after(events) {
      const s = this.state;
      if (s.turn !== this.lastTurn) { this.lastTurn = s.turn; this.mem = {}; }
      this.broadcast(events);
      if (s.phase === 'gameOver') {
        if (!this.endedAt) this.endedAt = Date.now();
        if (!this.awarded) { this.awarded = true; try { this.onGameOver(); } catch (e) { console.error('perfil', e); } }
        this.sendRoom(); this.onChange();
      }
      this.schedule();
      this.onState();
    }

    broadcast(events) {
      this.seats.forEach((seat, i) => { if (seat.kind === 'human' && seat.client) this.sendStateTo(i, events); });
      if (this.spectators.size && this.state) {
        const msg = { t: 'state', view: E.viewFor(this.state, -1), events: E.filterEvents(events, -1) };
        this.spectators.forEach((x) => x.client && x.client.send(msg));
      }
    }
    sendStateTo(i, events) {
      const seat = this.seats[i];
      if (!this.state || !seat.client) return;
      seat.client.send({ t: 'state', view: E.viewFor(this.state, i), events: E.filterEvents(events, i) });
    }
    sendRoom() {
      const info = this.info();
      this.seats.forEach((s, i) => s.kind === 'human' && s.client && s.client.send({ t: 'room', room: info, you: i, chat: this.chat }));
      this.spectators.forEach((x) => x.client && x.client.send({ t: 'room', room: info, you: -1, spectator: true, chat: this.chat }));
      this.onChange();
    }

    isAuto(i) {
      const seat = this.seats[i];
      if (!seat) return false;
      if (seat.kind === 'bot') return true;
      return !seat.connected && seat.discAt && Date.now() - seat.discAt >= AUTO_GRACE;
    }
    levelOf(i) { const s = this.seats[i]; return s.kind === 'bot' ? s.level : 2; }

    schedule() {
      clearTimeout(this.timer); this.timer = null;
      const s = this.state;
      if (!s || s.phase === 'gameOver') return;
      if (!this.local && !this.humansConnected()) return; // sala dormida
      const actors = B.whoActs(s).filter((p) => this.isAuto(p));
      // tiempo de espera de ofertas de bots
      clearTimeout(this.tradeTimer);
      if (s.trade && this.isAuto(s.trade.from)) {
        const id = s.trade.id;
        this.tradeTimer = setTimeout(() => {
          if (!this.state || !this.state.trade || this.state.trade.id !== id) return;
          const T = this.state.trade;
          const acc = Object.keys(T.responses).map(Number).filter((p) => T.responses[p] === 'accept');
          const r = E.apply(this.state, T.from, acc.length ? { type: 'confirmTrade', with: acc[0] } : { type: 'cancelTrade' });
          if (r.ok) this.after(r.events);
        }, TRADE_TIMEOUT);
      }
      if (!actors.length) return;
      let kind = s.phase;
      if (s.trade) kind = s.trade.from === actors[0] ? 'confirm' : 'respond';
      const delay = (DELAY[kind] || 600) * (0.75 + Math.random() * 0.5) / this.speed;
      this.timer = setTimeout(() => this.botStep(actors), delay);
    }

    botStep(actors) {
      const s = this.state;
      if (!s || s.phase === 'gameOver') return;
      for (const pid of actors) {
        if (!this.isAuto(pid)) continue;
        const mem = this.mem[pid] || (this.mem[pid] = { offerKeys: [] });
        let a = null;
        try { a = B.decide(s, pid, this.levelOf(pid), mem); } catch (e) { console.error('bot error', e); }
        if (!a) continue;
        let r = E.apply(s, pid, a);
        if (!r.ok) {
          const f = B.fallback(s, pid);
          r = f ? E.apply(s, pid, f) : r;
        }
        if (r.ok) {
          if (this.seats[pid] && this.seats[pid].kind === 'human') this.seats[pid].autoActs = (this.seats[pid].autoActs || 0) + 1;
          if (a.type === 'offerTrade' && s.trade) this.pushBotTradeChat(pid);
          this.after(r.events);
          return;
        }
      }
      // nadie pudo actuar: reintentar más tarde
      this.timer = setTimeout(() => this.schedule(), 1500);
    }
    pushBotTradeChat() { /* reservado para mensajes de bots */ }

    // ----- guardar y recuperar la partida (si el servidor se reinicia o se recarga la página) -----
    snapshot() {
      return {
        v: 1, code: this.code, name: this.name, isPublic: this.isPublic, local: this.local, speed: this.speed,
        host: this.host, creator: this.creator, rules: this.rules, startedAt: this.startedAt, lastTurn: this.lastTurn, chat: this.chat.slice(-30), state: this.state, savedAt: Date.now(),
        seats: this.seats.map((x) => ({ kind: x.kind, token: x.token, name: x.name, level: x.level, left: !!x.left, prof: x.prof || null, acts: x.acts || 0, autoActs: x.autoActs || 0 })),
      };
    }
    static fromSnapshot(snap, opts = {}) {
      const r = new Room({ code: snap.code, name: snap.name, isPublic: snap.isPublic, local: snap.local, ...opts });
      const now = Date.now();
      r.startedAt = snap.startedAt || null; r.creator = snap.creator || snap.host;
      r.speed = snap.speed || 1; r.rules = E.normRules(snap.rules || (snap.state && snap.state.rules)); r.host = snap.host; r.lastTurn = snap.lastTurn; r.chat = snap.chat || []; r.state = snap.state;
      // los humanos vuelven como desconectados: si alguien no regresa, un bot juega por él pasado el tiempo de gracia
      r.seats = snap.seats.map((x) => (x.kind === 'bot' ? { kind: 'bot', name: x.name, level: x.level, connected: true }
        : { kind: 'human', token: x.token, name: x.name, connected: false, client: null, left: x.left, discAt: x.left ? now - AUTO_GRACE : now, prof: x.prof || null, acts: x.acts || 0, autoActs: x.autoActs || 0 }));
      r.restoredSeq = snap.state && snap.state.seq;
      if (!r.local) setTimeout(() => r.schedule(), AUTO_GRACE + 50);
      return r;
    }

    destroy() { clearTimeout(this.timer); clearTimeout(this.tradeTimer); }
  }

  return Room;
});
