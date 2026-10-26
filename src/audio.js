import { PLAYER } from './config.js';
import { clamp } from './utils.js';

// Весь звук синтезируется WebAudio на лету — ни одного аудиофайла.
// Движок: пила + суб-октава + свист передачи через фильтр, 6 передач,
// blow-off при сбросе газа, сирена у полиции, звоны на пикапах/воротах.
export class GameAudio {
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Общий буфер белого шума (для ветра, вжуха и аварии)
    const len = Math.floor(ctx.sampleRate * 1.2);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Движок
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 50;
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.frequency.value = 25;
    // третий осциллятор — «свист» передачи поверх мотора
    this.osc3 = ctx.createOscillator();
    this.osc3.type = 'square';
    this.osc3.frequency.value = 130;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0.012;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engFilter.Q.value = 2;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const sub = ctx.createGain();
    sub.gain.value = 0.4;
    this.osc.connect(this.engFilter);
    this.osc2.connect(sub);
    sub.connect(this.engFilter);
    this.osc3.connect(this.whineGain);
    this.whineGain.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);
    this.osc.start();
    this.osc2.start();
    this.osc3.start();

    // Ветер на скорости
    this.wind = ctx.createBufferSource();
    this.wind.buffer = this.noiseBuf;
    this.wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 800;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.wind.start();

    this.gear = 0;
    this.gas = false;
    this.sirenT = 0;
  }

  setVolume(v) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(clamp(v, 0, 1) * 0.9, this.ctx.currentTime, 0.05);
  }

  engine(speed, boosting, active, gas) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const norm = clamp(speed / (PLAYER.MAX_SPEED * PLAYER.NITRO_MULT), 0, 1);
    // шесть передач: обороты растут внутри передачи, на переключении — клик
    const g6 = Math.min(5.999, norm * 6);
    const gear = Math.floor(g6);
    const inGear = g6 - gear;
    if (gear !== this.gear) {
      if (norm > 0.25 && this.gas) this.shiftClick();
      this.gear = gear;
    }
    // сброс газа на высоких оборотах — пшых blow-off
    if (this.gas && gas === false && norm > 0.4) this.blowOff();
    this.gas = gas;
    const f = 42 + inGear * 88 + gear * 5 + (boosting ? 16 : 0);
    this.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f / 2, t, 0.05);
    this.osc3.frequency.setTargetAtTime(f * 3.02 + gear * 7, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(320 + inGear * 1200 + (boosting ? 800 : 0), t, 0.08);
    this.engGain.gain.setTargetAtTime(active ? 0.05 + norm * 0.05 : 0, t, 0.1);
    this.windGain.gain.setTargetAtTime(active ? norm * 0.06 : 0, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(500 + norm * 1500, t, 0.1);
  }

  // Клик коробки при переключении
  shiftClick() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.09);
  }

  // Турбо-пшых при сбросе газа
  blowOff() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.35);
  }

  // Пронёсся впритирку — короткий «вжух».
  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.3);
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.55);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.35);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.45);
  }

  // Кислая канистра нитро
  chime() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [940, 1410].forEach((f0, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f0;
      const g = ctx.createGain();
      const t0 = t + i * 0.05;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + 0.35);
    });
  }

  // Прошёл ворота «на время» — восходящее арпеджио
  gate() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [660, 880, 1320].forEach((f0, i) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f0;
      const g = ctx.createGain();
      const t0 = t + i * 0.06;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + 0.3);
    });
  }

  // Сирена полиции: вой, громкость ведёт дистанция до ближайшей машины.
  sirenUpdate(dt, vol) {
    if (!this.ctx) return;
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sawtooth';
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2200;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(f);
      f.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    }
    this.sirenT += dt;
    const fq = 640 + Math.sin(this.sirenT * 5.2) * 170;
    this.sirenOsc.frequency.setTargetAtTime(fq, this.ctx.currentTime, 0.03);
    this.sirenGain.gain.setTargetAtTime(clamp(vol, 0, 1) * 0.09, this.ctx.currentTime, 0.1);
  }
}
