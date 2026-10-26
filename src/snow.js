import * as THREE from 'three';
import { SNOW } from './config.js';

function flakeTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 1, 16, 16, 15);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

// Снегопад: облако хлопьев вокруг камеры (в её локальном пространстве).
// Интенсивность — параметр биома: подъезжаешь к зиме — снег постепенно
// начинается, уезжаешь — тает. На скорости хлопья летят «на лобовое».
export class Snowfall {
  constructor(scene) {
    this.count = SNOW.MAX;
    this.pos = new Float32Array(this.count * 3);
    this.vy = new Float32Array(this.count);
    this.vz = new Float32Array(this.count);
    this.sway = new Float32Array(this.count);
    this.phase = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] = (Math.random() * 2 - 1) * SNOW.BOX;
      this.pos[i * 3 + 1] = Math.random() * (SNOW.TOP + 6) - 4;
      this.pos[i * 3 + 2] = (Math.random() * 2 - 1) * SNOW.BOX;
      this.vy[i] = 1.8 + Math.random() * 1.6;
      this.vz[i] = (Math.random() * 2 - 1) * 0.6;
      this.sway[i] = 0.6 + Math.random() * 1.2;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.13, map: flakeTexture(),
      transparent: true, opacity: 0, depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.intensity = 0;
    this.time = 0;
  }

  setIntensity(v) {
    this.intensity = v;
    this.points.visible = v > 0.02;
    this.mat.opacity = Math.min(0.9, v * 1.6);
    this.geo.setDrawRange(0, Math.floor(this.count * Math.min(1, v * 1.2)));
  }

  update(dt, cameraPos, forwardSpeed) {
    if (!this.points.visible) return;
    this.time += dt;
    this.points.position.copy(cameraPos);
    const box = SNOW.BOX;
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      // падение
      let y = this.pos[o + 1] - this.vy[i] * dt;
      // едем вперёд — мир летит на камеру: в локальном Z хлопья плывут назад
      let z = this.pos[o + 2] + (forwardSpeed + this.vz[i] * 6) * dt;
      // снос вбок
      let x = this.pos[o] + Math.sin(this.time * this.sway[i] + this.phase[i]) * dt * 1.4;
      if (y < -5) {
        y += SNOW.TOP + 11;
        x = (Math.random() * 2 - 1) * box;
        z = (Math.random() * 2 - 1) * box;
      }
      if (z > box) z -= box * 2;
      if (x > box) x -= box * 2;
      else if (x < -box) x += box * 2;
      this.pos[o] = x;
      this.pos[o + 1] = y;
      this.pos[o + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
