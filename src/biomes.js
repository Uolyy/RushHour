import * as THREE from 'three';
import { BIOME } from './config.js';

const c = (hex) => new THREE.Color(hex);

// Шесть миров по кольцу: РАССВЕТ → ДЕНЬ → ЗАКАТ → НОЧЬ → НЕОН-ГОРОД → ЗИМА.
// На границах всё плавно перетекает (BLEND метров): цвета, свет, снег, неон.
const BIOMES = [
  {
    name: 'DAWN',
    skyTop: c('#6f86b8'), skyBot: c('#f6cfa4'), fog: c('#e8c8a8'), fogFar: 640,
    sun: c('#ffd9a8'), sunInt: 2.6, sunEl: 0.35, sunAz: 0.5,
    moonEl: 0.8, moonAz: 2.4, moonSize: 0.06, moonGlow: 0.22, moonColor: c('#cdd9ff'), moonI: 0,
    amb: c('#8a9bb8'), ambInt: 0.5,
    hemiSky: c('#cfd8e8'), hemiGround: c('#7d9a6f'), hemiInt: 0.6,
    road: c('#3c3f4a'), line: c('#e8e6df'), curb: c('#d05248'), shoulder: c('#58545e'),
    ground: c('#7d9a6f'), skirt: c('#6b5a48'), building: c('#4c4a56'),
    tree: c('#5f8f5e'), trunk: c('#6b4f3f'), rock: c('#8a8578'),
    treeW: 0.55, rockW: 0.12, density: 0.5,
    lampGlow: 0.25, headlight: 0,
    diskColor: c('#ffd28f'), diskSize: 0.085, diskGlow: 0.55,
    stars: 0, snow: 0, city: 0, neon: 0.12,
  },
  {
    name: 'DAY',
    skyTop: c('#3f8fd4'), skyBot: c('#c8e6f4'), fog: c('#cfe4f0'), fogFar: 720,
    sun: c('#fff2dc'), sunInt: 3.1, sunEl: 1.05, sunAz: 1.1,
    moonEl: 0.8, moonAz: 2.4, moonSize: 0.06, moonGlow: 0.22, moonColor: c('#cdd9ff'), moonI: 0,
    amb: c('#b8cbe0'), ambInt: 0.5,
    hemiSky: c('#bcd8f0'), hemiGround: c('#8fae72'), hemiInt: 0.6,
    road: c('#43464f'), line: c('#f0eee6'), curb: c('#d05248'), shoulder: c('#57545c'),
    ground: c('#8fae72'), skirt: c('#7a674f'), building: c('#5a5a62'),
    tree: c('#4f8a4f'), trunk: c('#6b4f3f'), rock: c('#938e80'),
    treeW: 0.6, rockW: 0.1, density: 0.5,
    lampGlow: 0, headlight: 0,
    diskColor: c('#fff6e8'), diskSize: 0.04, diskGlow: 0.28,
    stars: 0, snow: 0, city: 0, neon: 0,
  },
  {
    name: 'DUSK',
    skyTop: c('#55447a'), skyBot: c('#f08a4b'), fog: c('#d98a55'), fogFar: 560,
    sun: c('#ff9a4d'), sunInt: 2.4, sunEl: 0.06, sunAz: 1.7,
    moonEl: 0.8, moonAz: 2.4, moonSize: 0.06, moonGlow: 0.22, moonColor: c('#cdd9ff'), moonI: 0,
    amb: c('#7a6a8a'), ambInt: 0.5,
    hemiSky: c('#c58a8a'), hemiGround: c('#a08050'), hemiInt: 0.5,
    road: c('#3a3d46'), line: c('#e0ddd2'), curb: c('#c2543f'), shoulder: c('#4d4852'),
    ground: c('#a08050'), skirt: c('#6f563f'), building: c('#46424e'),
    tree: c('#6f7a4a'), trunk: c('#5f463a'), rock: c('#93796b'),
    treeW: 0.25, rockW: 0.45, density: 0.45,
    lampGlow: 0.9, headlight: 0.25,
    diskColor: c('#ff9a4d'), diskSize: 0.1, diskGlow: 0.6,
    stars: 0.08, snow: 0, city: 0, neon: 0.45,
  },
  {
    name: 'NIGHT',
    skyTop: c('#0c1330'), skyBot: c('#28355e'), fog: c('#1a2340'), fogFar: 460,
    sun: c('#9fb4d8'), sunInt: 0.65, sunEl: -0.5, sunAz: 2.3,
    moonEl: 0.8, moonAz: 2.4, moonSize: 0.06, moonGlow: 0.22, moonColor: c('#cdd9ff'), moonI: 1,
    amb: c('#3a4668'), ambInt: 0.5,
    hemiSky: c('#33406a'), hemiGround: c('#22303a'), hemiInt: 0.4,
    road: c('#2b2e38'), line: c('#8f9089'), curb: c('#7a3b3b'), shoulder: c('#20232e'),
    ground: c('#233038'), skirt: c('#1b242c'), building: c('#2c2e3a'),
    tree: c('#1e3a2e'), trunk: c('#2c2420'), rock: c('#3f4450'),
    treeW: 0.3, rockW: 0.3, density: 0.55,
    lampGlow: 2.4, headlight: 1,
    diskColor: c('#cdd9ff'), diskSize: 0.05, diskGlow: 0,
    stars: 1, snow: 0, city: 0, neon: 0.5,
  },
  {
    name: 'CITY',
    skyTop: c('#070a18'), skyBot: c('#252a4a'), fog: c('#141a30'), fogFar: 520,
    sun: c('#8090c8'), sunInt: 0.5, sunEl: -0.55, sunAz: 2.6,
    moonEl: 0.75, moonAz: 2.6, moonSize: 0.06, moonGlow: 0.22, moonColor: c('#cdd9ff'), moonI: 0.85,
    amb: c('#2c3450'), ambInt: 0.5,
    hemiSky: c('#39406a'), hemiGround: c('#141824'), hemiInt: 0.35,
    road: c('#24262f'), line: c('#8f939f'), curb: c('#7a3b48'), shoulder: c('#1b1e28'),
    ground: c('#191d2c'), skirt: c('#141826'), building: c('#232838'),
    tree: c('#22303a'), trunk: c('#1c2028'), rock: c('#2c3140'),
    treeW: 0.08, rockW: 0.04, density: 0.14,
    lampGlow: 3.0, headlight: 1,
    diskColor: c('#aebfff'), diskSize: 0.045, diskGlow: 0,
    stars: 0.55, snow: 0, city: 1, neon: 1,
  },
  {
    name: 'WINTER',
    skyTop: c('#8fa2b8'), skyBot: c('#d8e2e8'), fog: c('#c4d0da'), fogFar: 520,
    sun: c('#f4f6ff'), sunInt: 1.9, sunEl: 0.75, sunAz: 3.2,
    moonEl: 0.8, moonAz: 2.4, moonSize: 0.06, moonGlow: 0.22, moonColor: c('#cdd9ff'), moonI: 0,
    amb: c('#a8b4c4'), ambInt: 0.5,
    hemiSky: c('#c8d4e0'), hemiGround: c('#8894a0'), hemiInt: 0.6,
    road: c('#3a3d46'), line: c('#e8eae6'), curb: c('#b04545'), shoulder: c('#aab6c2'),
    ground: c('#d4dde6'), skirt: c('#a8b4c0'), building: c('#8890a0'),
    tree: c('#5f8870'), trunk: c('#5a4638'), rock: c('#9aa2ac'),
    treeW: 0.5, rockW: 0.3, density: 0.6,
    lampGlow: 0.8, headlight: 0.35,
    diskColor: c('#eef4ff'), diskSize: 0.04, diskGlow: 0.3,
    stars: 0.15, snow: 1, city: 0, neon: 0.1,
  },
];

function makeScratch() {
  const out = {};
  for (const k in BIOMES[0]) {
    const v = BIOMES[0][k];
    out[k] = v instanceof THREE.Color ? v.clone() : v;
  }
  return out;
}

// Смешивает две палитры: цвета — lerp, числа — lerp, строки (имена) — копия.
// Азимуты солнца/луны идут по кругу: если следующий биом «позади» по кругу,
// разворачиваем его через +2π, чтобы диск не пятялся назад при переходе.
const UNWRAP = { sunAz: true, moonAz: true };
function blend(out, a, b, t) {
  for (const k in a) {
    const va = a[k];
    if (typeof va === 'string') { out[k] = va; continue; }
    if (va instanceof THREE.Color) out[k].copy(va).lerp(b[k], t);
    else {
      let vb = b[k];
      if (UNWRAP[k] && vb < va) vb += Math.PI * 2;
      out[k] = va + (vb - va) * t;
    }
  }
  return out;
}

export class Biomes {
  constructor() { this.scratch = makeScratch(); }

  // Возвращает текущую (уже смешанную) палитру для дистанции s.
  get(s) {
    const n = BIOMES.length;
    const raw = Math.max(0, s) / BIOME.LENGTH;
    const idx = Math.floor(raw) % n;
    const local = (raw - Math.floor(raw)) * BIOME.LENGTH;
    const a = BIOMES[idx];
    const b = BIOMES[(idx + 1) % n];
    let t = 0;
    if (local > BIOME.LENGTH - BIOME.BLEND) {
      t = (local - (BIOME.LENGTH - BIOME.BLEND)) / BIOME.BLEND;
    }
    return blend(this.scratch, a, b, t);
  }
}
