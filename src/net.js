// Клиент гонки: WebSocket к серверу через прокси vite (/race-ws).
// Все входящие сообщения приходят в onMessage(msg) — их раздаёт main.js.

export class RaceNet {
  constructor() {
    this.ws = null;
    this.queue = []; // сообщения, отправленные до открытия сокета
    this.onMessage = () => {};
    this.onClose = () => {};
  }

  get connected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    if (this.connected || (this.ws && this.ws.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/race-ws`);
    this.ws = ws;
    ws.onopen = () => {
      for (const m of this.queue) ws.send(m);
      this.queue = [];
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.onClose();
    };
    ws.onerror = () => { /* закрытие придёт через onclose */ };
  }

  send(obj) {
    const data = JSON.stringify(obj);
    if (this.connected) this.ws.send(data);
    else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) this.queue.push(data);
  }

  create(nick, look) { this.connect(); this.send({ t: 'create', nick, ...(look || {}) }); }
  join(code, nick, look) { this.connect(); this.send({ t: 'join', code, nick, ...(look || {}) }); }
  look(skin, color) { this.send({ t: 'look', skin, color }); }
  launch() { this.send({ t: 'launch' }); }
  ready2(val) { this.send({ t: 'ready2', val }); }
  cfg(mode, lanes, traffic) { this.send({ t: 'cfg', mode, lanes, traffic }); }
  finish(score) { this.send({ t: 'finish', score }); }
  state(s, lat, v) {
    // Округляем — короче JSON, меньше трафика, точности достаточно.
    this.send({ t: 'state', s: Math.round(s * 100) / 100, lat: Math.round(lat * 100) / 100, v: Math.round(v * 10) / 10 });
  }
  traffic(arr) { this.send({ t: 'traffic', arr }); }
  crash(score) { this.send({ t: 'crash', score }); }
  leave() { this.send({ t: 'leave' }); }

  disconnect() {
    if (!this.ws) return;
    try { this.ws.close(); } catch { /* */ }
    this.ws = null;
  }
}