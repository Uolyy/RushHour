import { MUSIC } from './config.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Прогрессия Am–F–C–G — она и есть синтвейв.
// Арп в первой октаве, бас пилой, кик/снейр/хэты, всё в делэй —
// ни одного аудиофайла, весь трек синтезируется на лету.
const CHORDS = [
  { root: 45, arp: [57, 60, 64, 67] },
  { root: 41, arp: [53, 57, 60, 65] },
  { root: 48, arp: [55, 60, 64, 67] },
  { root: 43, arp: [55, 59, 62, 67] },
];

export class Music {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.muted = false;
    this.volume = 0.55;
    this.duckLevel = 1;
    this.step = 0;
    this.timer = null;
  }

  init(ctx) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(ctx.destination);
    // делэй на арп и снейр — пространство
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / MUSIC.BPM) * 0.75;
    this.fdb = ctx.createGain();
    this.fdb.gain.value = 0.32;
    this.delay.connect(this.fdb);
    this.fdb.connect(this.delay);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.5;
    this.delay.connect(this.wet);
    this.wet.connect(this.out);
    this.send = ctx.createGain();
    this.send.gain.value = 1;
    this.send.connect(this.delay);
    // шумовой буфер под перкуссию
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyGain();
  }

  applyGain() {
    if (!this.ctx) return;
    const v = this.muted ? 0 : this.volume * this.duckLevel;
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.12);
  }

  setVolume(v) { this.volume = v; this.applyGain(); }
  setMuted(m) { this.muted = m; this.applyGain(); }
  duck(d) { this.duckLevel = d; this.applyGain(); }

  start() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.tick(), 27);
  }

  stop() {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  tick() {
    const s16 = 60 / MUSIC.BPM / 4;
    while (this.next < this.ctx.currentTime + 0.14) {
      this.schedule(this.step, this.next);
      this.next += s16;
      this.step = (this.step + 1) % 64;
    }
  }

  schedule(step, t) {
    const bar = Math.floor(step / 16) % 4;
    const chord = CHORDS[bar];
    const s = step % 16;
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.3 : 0.14);
    if (s % 2 === 0) this.bass(t, mtof(chord.root));
    const pat = [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 0, 2, 1, 3, 2];
    this.pluck(t, mtof(chord.arp[pat[s]]));
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.26);
  }

  snare(t) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1750;
    f.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.36, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    g.connect(this.send);
    src.start(t);
    src.stop(t + 0.2);
  }

  hat(t, v) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t);
    src.stop(t + 0.06);
  }

  bass(t, f0) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f0;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(420, t);
    f.frequency.exponentialRampToValueAtTime(160, t + 0.2);
    f.Q.value = 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(f);
    f.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.24);
  }

  pluck(t, f0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    f.connect(g);
    g.connect(this.out);
    g.connect(this.send);
    for (const det of [-6, 6]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f0;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + 0.18);
    }
  }
}
