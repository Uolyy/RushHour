import * as THREE from 'three';
import { SPEED_LINES } from './config.js';

// Спидлайны: растяжки у камеры на высокой скорости. Живут в локальном
// пространстве камеры (поэтому камера добавлена в сцену), летят «на лобовое»
// и респавнятся впереди кольцом вокруг оси взгляда.
export class SpeedLines {
  constructor(camera) {
    const n = SPEED_LINES.COUNT;
    this.n = n;
    this.pos = new Float32Array(n * 6);
    this.z = new Float32Array(n);
    this.r = new Float32Array(n);
    this.a = new Float32Array(n);
    this.spd = new Float32Array(n);
    for (let i = 0; i < n; i++) this.respawn(i, true);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({
      color: 0xbcd8ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      fog: false,
    });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 4;
    camera.add(this.lines);
    this.lines.visible = false;
  }

  respawn(i, far) {
    this.r[i] = 2.4 + Math.random() * 6;
    this.a[i] = Math.random() * Math.PI * 2;
    this.spd[i] = 0.7 + Math.random() * 0.6;
    this.z[i] = far ? -(6 + Math.random() * 26) : -(28 + Math.random() * 8);
  }

  update(dt, speedNorm, boosting) {
    const k = (speedNorm - SPEED_LINES.MIN) / (1 - SPEED_LINES.MIN);
    const vis = Math.min(1, Math.max(0, k) + (boosting ? 0.35 : 0));
    this.lines.visible = vis > 0.03;
    this.mat.opacity = vis * 0.4;
    if (!this.lines.visible) return;
    const len = 2.2 + speedNorm * 5.5 + (boosting ? 2.5 : 0);
    const fly = (60 + speedNorm * 160) * dt;
    for (let i = 0; i < this.n; i++) {
      let z = this.z[i] + fly * this.spd[i];
      if (z > 2) { this.respawn(i, false); z = this.z[i]; }
      else this.z[i] = z;
      this.a[i] += dt * 0.35; // лёгкая спираль для живости
      const x = Math.cos(this.a[i]) * this.r[i];
      const y = Math.sin(this.a[i]) * this.r[i] * 0.72;
      const o = i * 6;
      this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
      this.pos[o + 3] = x; this.pos[o + 4] = y; this.pos[o + 5] = z - len;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
