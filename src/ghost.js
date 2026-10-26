import * as THREE from 'three';
import { buildCar } from './carModel.js';
import { GHOST } from './config.js';

// Призрак лучшего заезда: полупрозрачная машинка едет по записанной траектории.
// Коллизий с ним нет, на очки не влияет — чисто «догони себя прошлого».
// Запись: [время, s, lat] каждые SAMPLE_S метров пути.
export class Ghost {
  constructor(scene) {
    const model = buildCar('player', 0x8fd0ff);
    model.group.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.24;
        o.material.depthWrite = false;
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    this.model = model;
    this.group = model.group;
    this.group.visible = false;
    scene.add(this.group);
    this.data = null;
    this.enabled = false;
    this.active = false;
    this.t = 0;
    this.idx = 0;
    this.lastS = 0;
    this.spin = 0;
    this.out = {};
    // для мини-карты
    this.s = 0;
    this.lat = 0;
  }

  loadData(raw) {
    try {
      const data = raw ? JSON.parse(raw) : null;
      this.data = data && Array.isArray(data.samples) && data.samples.length > 4 ? data : null;
    } catch (e) {
      this.data = null;
    }
  }

  start() {
    this.active = false;
    this.t = 0;
    this.idx = 0;
    this.spin = 0;
    if (!this.enabled || !this.data) {
      this.group.visible = false;
      return;
    }
    this.active = true;
    this.lastS = this.data.samples[0][1];
    this.s = this.lastS;
    this.lat = this.data.samples[0][2];
    this.group.visible = true;
  }

  stop() {
    this.active = false;
    this.group.visible = false;
  }

  update(dt, road) {
    if (!this.active) return;
    this.t += dt;
    const smp = this.data.samples;
    if (this.t >= smp[smp.length - 1][0]) {
      // призрак доехал до своей аварии — растворяется
      this.stop();
      return;
    }
    while (this.idx < smp.length - 2 && this.t > smp[this.idx + 1][0]) this.idx++;
    const a = smp[this.idx];
    const b = smp[this.idx + 1];
    const f = (this.t - a[0]) / Math.max(0.001, b[0] - a[0]);
    const s = a[1] + (b[1] - a[1]) * f;
    const lat = a[2] + (b[2] - a[2]) * f;
    this.spin += (s - this.lastS) / 0.38;
    this.lastS = s;
    this.s = s;
    this.lat = lat;
    const w = road.worldOf(s, lat, this.out);
    this.group.position.set(w.px, w.py, w.pz);
    this.group.rotation.y = w.h;
    for (const wh of this.model.wheels) wh.rotation.x = this.spin;
  }
}

// Записывает траекторию текущего заезда. На очки не влияет, копеечная цена.
export class GhostRecorder {
  constructor() {
    this.samples = [];
    this.t = 0;
    this.lastS = 0;
  }

  start(playerS, playerLat) {
    this.samples = [[0, Math.round(playerS * 10) / 10, Math.round(playerLat * 100) / 100]];
    this.t = 0;
    this.lastS = playerS;
  }

  update(dt, player) {
    this.t += dt;
    if (player.s - this.lastS >= GHOST.SAMPLE_S && this.samples.length < GHOST.MAX_SAMPLES) {
      this.lastS = player.s;
      this.samples.push([
        Math.round(this.t * 100) / 100,
        Math.round(player.s * 10) / 10,
        Math.round(player.lat * 100) / 100,
      ]);
    }
  }

  finish(metric) {
    return { v: 1, metric, samples: this.samples };
  }
}
