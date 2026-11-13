/* HEXÓPOLIS — sala de juego: asientos, bots y bucle de turnos (servidor y modo local) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'), require('./bots'));
  else root.Room = factory(root.Engine, root.Bots);
})(typeof self !== 'undefined' ? self : this, function (E, B) {
  'use strict';

  const DELAY = { setup: 650, roll: 750, main: 600, robber: 900, discard: 600, respond: 1100, confirm: 700, roadBuilding: 600 };
  const AUTO_GRACE = 20000; // ms antes de que un bot sustituya a un humano desconectado
  const TRADE_TIMEOUT = 12000;

  class Room {
    constructor({ code, name, isPublic = true, local = false, onChange }) {
      this.code = code; this.name = name; this.isPublic = isPublic; this.local = local;
      this.seats = []; // {kind, token, name, level, client, connected, discAt}
      this.spectators = new Map();
      this.host = null;
      this.state = null;
      this.chat = [];
      this.mem = {};
      this.timer = null;
      this.tradeTimer = null;
      this.lastTurn = -1;
      this.onChange = onChange || (() => {});
      this.speed = 1;
    }

    // ----- lobby -----
    info() {
      return {
        code: this.code, name: this.name, isPublic: this.isPublic, hostSeat: this.seats.findIndex((x) => x.kind === 'human' && x.token === this.host), local: this.local, speed: this.speed,
        started: !!this.state, over: !!(this.state && this.state.phase === 'gameOver'),
        seats: this.seats.map((s, i) => ({ i, kind: s.kind, name: s.name, level: s.level, connected: s.kind === 'bot' || s.connected, host: s.token === this.host, color: E.COLORS[i] })),
      };
    }
    seatOf(token) { return this.seats.findIndex((s) => s.kind === 'human' && s.token === token); }

    join(client, token, name) {
      const i = this.seatOf(token);
      if (i >= 0) {
        const seat = this.seats[i];
        seat.client = client; seat.connected = true; seat.discAt = null; seat.left = false; seat.name = name || seat.name;
        this.sendRoom(); this.sendStateTo(i, []); this.schedule();
        return { ok: true };
      }
      if (this.state) return { ok: false, error: 'La partida ya ha empezado' };
      if (this.seats.length >= 4) return { ok: false, error: 'La sala está llena' };
      this.seats.push({ kind: 'human', token, name: name || 'Jugador', client, connected: true });
      if (!this.host) this.host = token;
      this.sysChat(`${name} entra en la sala`);
      this.sendRoom();
      return { ok: true };
    }

    leave(token) {
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
      const i = this.seatOf(token);
      if (i < 0) return;
      const seat = this.seats[i];
      if (!this.state) { this.leave(token); return; }
      seat.connected = false; seat.client = null; seat.discAt = Date.now();
      this.sendRoom();
      setTimeout(() => this.schedule(), AUTO_GRACE + 50);
    }

    humansConnected() { return this.seats.some((s) => s.kind === 'human' && s.connected); }

    addBot(token, level) {
      if (token !== this.host) return 'Solo el anfitrión puede añadir bots';
      if (this.state && this.state.phase !== 'gameOver') return 'La partida ya ha empezado';
      if (this.seats.length >= 4) return 'La sala está llena';
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

    start(token, opts = {}) {
      if (token !== this.host) return 'Solo el anfitrión puede empezar';
      if (this.state && this.state.phase !== 'gameOver') return 'Ya hay una partida en curso';
      if (this.seats.length < 2) return 'Se necesitan al menos 2 jugadores';
      // quitar humanos desconectados
      this.seats = this.seats.filter((s) => s.kind === 'bot' || s.connected);
      this.state = E.createGame(this.seats.map((s, i) => ({ name: s.name, bot: s.kind === 'bot' ? s.level : 0, color: E.COLORS[i] })), opts);
      this.mem = {}; this.lastTurn = -1;
      this.sysChat('¡Partida iniciada! Mapa nuevo generado.');
      this.sendRoom();
      this.broadcast([{ type: 'start' }]);
      this.schedule();
    }

    // ----- chat -----
    sysChat(text) { this.pushChat({ sys: true, text }); }
    say(token, text) {
      const i = this.seatOf(token);
      const name = i >= 0 ? this.seats[i].name : '¿?';
      text = String(text || '').slice(0, 200).trim();
      if (!text) return;
      this.pushChat({ name, color: E.COLORS[i] || '#fff', text });
    }
    pushChat(m) {
      this.chat.push(m); if (this.chat.length > 60) this.chat.shift();
      this.seats.forEach((s) => s.kind === 'human' && s.client && s.client.send({ t: 'chat', msg: m }));
    }

    // ----- juego -----
    action(token, a) {
      if (!this.state) return 'No hay partida';
      const pid = this.seatOf(token);
      if (pid < 0) return 'No estás en la partida';
      const r = E.apply(this.state, pid, a);
      if (!r.ok) return r.error;
      this.after(r.events);
      return null;
    }

    after(events) {
      const s = this.state;
      if (s.turn !== this.lastTurn) { this.lastTurn = s.turn; this.mem = {}; }
      this.broadcast(events);
      if (s.phase === 'gameOver') { this.sendRoom(); this.onChange(); }
      this.schedule();
    }

    broadcast(events) {
      this.seats.forEach((seat, i) => { if (seat.kind === 'human' && seat.client) this.sendStateTo(i, events); });
    }
    sendStateTo(i, events) {
      const seat = this.seats[i];
      if (!this.state || !seat.client) return;
      seat.client.send({ t: 'state', view: E.viewFor(this.state, i), events: E.filterEvents(events, i) });
    }
    sendRoom() {
      const info = this.info();
      this.seats.forEach((s, i) => s.kind === 'human' && s.client && s.client.send({ t: 'room', room: info, you: i, chat: this.chat }));
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
          if (a.type === 'offerTrade' && s.trade) this.pushBotTradeChat(pid);
          this.after(r.events);
          return;
        }
      }
      // nadie pudo actuar: reintentar más tarde
      this.timer = setTimeout(() => this.schedule(), 1500);
    }
    pushBotTradeChat() { /* reservado para mensajes de bots */ }

    destroy() { clearTimeout(this.timer); clearTimeout(this.tradeTimer); }
  }

  return Room;
});
