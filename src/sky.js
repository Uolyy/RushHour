import * as THREE from 'three';
import { SKY } from './config.js';
import { mulberry32 } from './utils.js';

// Небо: градиентный купол + диск солнца/луны прямо в шейдере + звёзды точками.
// Купол следует за камерой, туман его не красит — он «бесконечно далеко».
// Диск лежит в том же шейдере: направление и цвет ведёт палитра биома,
// поэтому рассветное солнце — большое и тёплое, луна — маленькая и бледная.
export class SkyDome {
  constructor(scene) {
    this.uniforms = {
      top: { value: new THREE.Color('#6f86b8') },
      bottom: { value: new THREE.Color('#f6cfa4') },
      sunDir: { value: new THREE.Vector3(0.4, 0.5, 0.75).normalize() },
      sunColor: { value: new THREE.Color('#ffd9a8') },
      sunSize: { value: 0.05 },
      sunGlow: { value: 0.4 },
      moonDir: { value: new THREE.Vector3(0, 0.8, 0.6).normalize() },
      moonColor: { value: new THREE.Color('#cdd9ff') },
      moonSize: { value: 0.06 },
      moonGlow: { value: 0.22 },
    };
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1600, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: [
          'varying vec3 vP;',
          'void main() {',
          '  vP = position;',
          '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
          '}',
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 top;',
          'uniform vec3 bottom;',
          'uniform vec3 sunDir;',
          'uniform vec3 sunColor;',
          'uniform float sunSize;',
          'uniform float sunGlow;',
          'uniform vec3 moonDir;',
          'uniform vec3 moonColor;',
          'uniform float moonSize;',
          'uniform float moonGlow;',
          'varying vec3 vP;',
          'void main() {',
          '  vec3 dir = normalize(vP);',
          '  float t = smoothstep(-0.08, 0.45, dir.y);',
          '  vec3 col = mix(bottom, top, t);',
          '  float ang = acos(clamp(dot(dir, normalize(sunDir)), -1.0, 1.0));',
          '  float disk = smoothstep(sunSize, sunSize * 0.72, ang);',
          '  float glow = pow(max(0.0, 1.0 - ang / (sunSize * 6.0 + 0.001)), 3.0) * sunGlow;',
          '  col = mix(col, sunColor, clamp(disk + glow, 0.0, 1.0));',
          '  float mang = acos(clamp(dot(dir, normalize(moonDir)), -1.0, 1.0));',
          '  float mdisk = smoothstep(moonSize, moonSize * 0.7, mang);',
          '  float mglow = pow(max(0.0, 1.0 - mang / (moonSize * 5.0 + 0.001)), 3.0) * moonGlow;',
          '  col = mix(col, moonColor, clamp(mdisk + mglow, 0.0, 1.0));',
          '  gl_FragColor = vec4(col, 1.0);',
          '}',
        ].join('\n'),
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    // Звёзды — точки на верхней полусфере. Яркость ведёт биом: горят ночью.
    const rand = mulberry32(777);
    const pos = new Float32Array(SKY.STAR_COUNT * 3);
    for (let i = 0; i < SKY.STAR_COUNT; i++) {
      const az = rand() * Math.PI * 2;
      const el = Math.asin(rand() * 0.95 + 0.03);
      const r = SKY.STAR_RADIUS;
      pos[i * 3] = Math.cos(az) * Math.cos(el) * r;
      pos[i * 3 + 1] = Math.sin(el) * r;
      pos[i * 3 + 2] = Math.sin(az) * Math.cos(el) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.8, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false,
    }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);
  }

  apply(p) {
    const u = this.uniforms;
    u.top.value.copy(p.skyTop);
    u.bottom.value.copy(p.skyBot);
    u.sunColor.value.copy(p.diskColor);
    u.sunSize.value = p.diskSize;
    u.sunGlow.value = p.diskGlow;
    u.sunDir.value.set(
      Math.cos(p.sunAz) * Math.cos(p.sunEl),
      Math.sin(p.sunEl),
      Math.sin(p.sunAz) * Math.cos(p.sunEl)
    ).normalize();
    u.moonDir.value.set(
      Math.cos(p.moonAz) * Math.cos(p.moonEl),
      Math.sin(p.moonEl),
      Math.sin(p.moonAz) * Math.cos(p.moonEl)
    ).normalize();
    u.moonColor.value.copy(p.moonColor);
    u.moonSize.value = p.moonSize;
    u.moonGlow.value = p.moonGlow * Math.min(1, Math.max(0, p.moonI));
    this.stars.material.opacity = p.stars * 0.9;
    this.stars.visible = p.stars > 0.02;
  }

  update(cameraPos) {
    this.mesh.position.copy(cameraPos);
    this.stars.position.copy(cameraPos);
  }
}
