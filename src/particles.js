import * as THREE from 'three';
import { PARTICLES } from './config.js';

// Одна система частиц = один THREE.Points = один draw call.
// aSize в мировых метрах, цвет/прозрачность — в aColor. Мёртвые — размер 0.
const VERT = [
  'attribute float aSize;',
  'attribute vec4 aColor;',
  'varying vec4 vColor;',
  'void main() {',
  '  vColor = aColor;',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));',
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');
const FRAG = [
  'varying vec4 vColor;',
  'void main() {',
  '  float d = length(gl_PointCoord - vec2(0.5));',
  '  float a = smoothstep(0.5, 0.08, d);',
  '  if (a < 0.01) discard;',
  '  gl_FragColor = vec4(vColor.rgb, a * vColor.a);',
  '}',
].join('\n');

export class ParticlePool {
  constructor(scene, max, additive) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.col = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4);
    this.c1 = new Float32Array(max * 4);
    this.drag.fill(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 2;
    scene.add(this.points);
    this.geo = geo;
  }

  // o: { x,y,z, vx?,vy?,vz?, life, size0,size1, c0:[r,g,b,a], c1?:[r,g,b,a], grav?, drag? }
  emit(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = o.x;
    this.pos[i * 3 + 1] = o.y;
    this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0;
    this.vel[i * 3 + 1] = o.vy || 0;
    this.vel[i * 3 + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 1;
    this.grav[i] = o.grav || 0;
    this.drag[i] = o.drag === undefined ? 1 : o.drag;
    this.s0[i] = o.size0 === undefined ? 0.3 : o.size0;
    this.s1[i] = o.size1 === undefined ? 0.6 : o.size1;
    const c = o.c0 || [1, 1, 1, 1];
    this.c0[i * 4] = c[0]; this.c0[i * 4 + 1] = c[1]; this.c0[i * 4 + 2] = c[2];
    this.c0[i * 4 + 3] = c[3] === undefined ? 1 : c[3];
    const d = o.c1 || c;
    this.c1[i * 4] = d[0]; this.c1[i * 4 + 1] = d[1]; this.c1[i * 4 + 2] = d[2];
    this.c1[i * 4 + 3] = d[3] === undefined ? 0 : d[3];
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const q = i * 4;
      if (this.life[i] <= 0) { this.size[i] = 0; this.col[q + 3] = 0; continue; }
      this.life[i] -= dt;
      const o = i * 3;
      const dr = Math.pow(this.drag[i], dt * 60);
      this.vel[o] *= dr;
      this.vel[o + 2] *= dr;
      this.vel[o + 1] = this.vel[o + 1] * dr - this.grav[i] * dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.life[i] <= 0) { this.size[i] = 0; this.col[q + 3] = 0; continue; }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[q] = this.c0[q] + (this.c1[q] - this.c0[q]) * t;
      this.col[q + 1] = this.c0[q + 1] + (this.c1[q + 1] - this.c0[q + 1]) * t;
      this.col[q + 2] = this.c0[q + 2] + (this.c1[q + 2] - this.c0[q + 2]) * t;
      this.col[q + 3] = this.c0[q + 3] + (this.c1[q + 3] - this.c0[q + 3]) * t;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.size.fill(0);
    for (let i = 0; i < this.max; i++) this.col[i * 4 + 3] = 0;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

// Обломки после аварии: ящички с баллистикой, гравитацией и отскоком.
export class Debris {
  constructor(scene) {
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mats = [
      new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.8, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xc9403a, roughness: 0.5, metalness: 0.2, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x8a8d94, roughness: 0.6, metalness: 0.3, flatShading: true }),
    ];
    this.pieces = [];
    for (let i = 0; i < PARTICLES.DEBRIS; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mats[i % 3]);
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      this.pieces.push({ mesh, vel: new THREE.Vector3(), ang: new THREE.Vector3(), life: 0, ground: 0 });
    }
  }

  burst(x, y, z, fwdX, fwdZ, groundY) {
    for (const p of this.pieces) {
      p.mesh.visible = true;
      p.mesh.position.set(x, y + 0.6, z);
      const s = 0.14 + Math.random() * 0.38;
      p.mesh.scale.set(s, s * (0.5 + Math.random() * 0.7), s * (0.6 + Math.random() * 0.9));
      const side = Math.random() * 2 - 1;
      p.vel.set(
        fwdX * (3 + Math.random() * 9) + side * 3,
        3.5 + Math.random() * 5,
        fwdZ * (3 + Math.random() * 9) - side * 3
      );
      p.ang.set((Math.random() * 2 - 1) * 9, (Math.random() * 2 - 1) * 9, (Math.random() * 2 - 1) * 9);
      p.life = 2.6 + Math.random() * 1.2;
      p.ground = groundY;
    }
  }

  update(dt) {
    for (const p of this.pieces) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 24 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < p.ground + 0.1 && p.vel.y < 0) {
        p.mesh.position.y = p.ground + 0.1;
        p.vel.y *= -0.38;
        p.vel.x *= 0.55;
        p.vel.z *= 0.55;
        p.ang.multiplyScalar(0.6);
      }
      p.mesh.rotation.x += p.ang.x * dt;
      p.mesh.rotation.y += p.ang.y * dt;
      p.mesh.rotation.z += p.ang.z * dt;
    }
  }

  clear() {
    for (const p of this.pieces) { p.mesh.visible = false; p.life = 0; }
  }
}

// Смещение локальной точки машины по курсу yaw (yaw-вращение вокруг Y).
export function yawRot(ox, oy, oz, yaw) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return [ox * cy + oz * sy, oy, -ox * sy + oz * cy];
}

// Пламя нитро из обоих выхлопов: синее ядро -> оранжевый хвост.
export function flame(pool, px, py, pz, yaw) {
  for (const ox of [-0.55, 0.55]) {
    const [ex, ey, ez] = yawRot(ox, 0.45, -2.3, yaw);
    const [vx, , vz] = yawRot((Math.random() - 0.5) * 2, 0.8, -7 - Math.random() * 3, yaw);
    pool.emit({
      x: px + ex, y: py + ey, z: pz + ez,
      vx, vy: 0.8, vz,
      life: 0.16 + Math.random() * 0.08,
      size0: 0.22, size1: 0.95,
      c0: [0.35, 0.75, 1.0, 0.95],
      c1: [1.0, 0.42, 0.08, 0.0],
      drag: 0.9,
    });
  }
}

// Дым из-под задних колёс: торможение или обочина (зимой — снежное облако).
export function tireSmoke(pool, px, py, pz, yaw, white) {
  for (const ox of [-0.95, 0.95]) {
    const [wx, wy, wz] = yawRot(ox, 0.18, -1.5, yaw);
    const [vx, , vz] = yawRot((Math.random() - 0.5) * 3, 0, -2, yaw);
    const g = white ? 0.92 : 0.7;
    pool.emit({
      x: px + wx, y: py + wy, z: pz + wz,
      vx, vy: 1.2 + Math.random(), vz,
      life: 0.5 + Math.random() * 0.4,
      size0: 0.35, size1: 2.4,
      c0: [g, g, g, 0.34],
      c1: [g, g, g, 0],
      drag: 0.94,
    });
  }
}

// Искры: при аварии — горячие, при сборе канистры — холодные (cyan).
export function sparks(pool, x, y, z, n, hot) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 3 + Math.random() * 9;
    pool.emit({
      x, y: y + 0.3, z,
      vx: Math.cos(a) * v * 0.7,
      vy: 2 + Math.random() * 5,
      vz: Math.sin(a) * v * 0.7,
      life: 0.3 + Math.random() * 0.5,
      size0: 0.14, size1: 0.05,
      c0: hot ? [1.0, 0.85, 0.4, 1] : [0.3, 0.9, 1.0, 1],
      c1: [1.0, 0.25, 0.05, 0],
      grav: 14, drag: 0.985,
    });
  }
}
