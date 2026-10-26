import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Финальный грейд: хроматика на скорости, виньетка, зерно, вспышка при аварии.
// Аддоныthree уже в пакете three — новых зависимостей нет.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}',
  ].join('\n'),
  fragmentShader: [
    'uniform sampler2D tDiffuse;',
    'uniform float uSpeed;',
    'uniform float uTime;',
    'uniform float uFlash;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec2 c = vUv - 0.5;',
    '  float r2 = dot(c, c);',
    '  vec2 off = c * uSpeed * (0.35 + r2 * 2.2);',
    '  vec3 col;',
    '  col.r = texture2D(tDiffuse, vUv + off).r;',
    '  col.g = texture2D(tDiffuse, vUv).g;',
    '  col.b = texture2D(tDiffuse, vUv - off).b;',
    '  float vig = smoothstep(1.05, 0.35, length(c) * (1.0 + uSpeed * 25.0));',
    '  col *= mix(0.42, 1.0, vig);',
    '  float n = fract(sin(dot(vUv + fract(uTime) * 0.01, vec2(12.9898, 78.233))) * 43758.5453);',
    '  col += (n - 0.5) * 0.035;',
    '  col += uFlash;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}',
  ].join('\n'),
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.flash = 0;
    this.time = 0;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    // Bloom по HDR: лампы, стопы, фары, неон, солнце — всё начинает СВЕТИТЬСЯ.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.65, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setEnabled(v) { this.enabled = v; }

  bump(f) { this.flash = Math.max(this.flash, f); }

  render(dt, speedNorm, boosting) {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const u = this.grade.uniforms;
    u.uSpeed.value = speedNorm * 0.011 + (boosting ? 0.006 : 0);
    u.uTime.value = this.time;
    u.uFlash.value = this.flash * 0.55;
    this.composer.render(dt);
  }

  setSize(w, h) { this.composer.setSize(w, h); }
}
