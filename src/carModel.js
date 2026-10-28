import * as THREE from 'three';

// Низкополигональные машинки из примитивов. Общие материалы — стекло и шины,
// кузов и стопы у каждой машины свои (у игрока стопы реагируют на тормоз).
// Полиция — со своей мигалкой (уникальные материалы, мигают по фазе).

const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.25, metalness: 0.1, flatShading: true });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.9, flatShading: true });
const headMat = new THREE.MeshStandardMaterial({ color: 0x8a8570, emissive: 0xffe9b0, emissiveIntensity: 0.7 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.5, flatShading: true });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function makeWheel(r, w) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 10), tireMat);
  c.rotation.z = Math.PI / 2;
  g.add(c);
  return g;
}

// kind: 'player' | 'sedan' | 'van' | 'truck' | 'police'. Машинка смотрит в +Z.
export function buildCar(kind, colorHex) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5, metalness: 0.2, flatShading: true });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x4a0f0f, emissive: 0xff2626, emissiveIntensity: 1.4 });
  const group = new THREE.Group();
  const wheels = [];
  let siren = null;
  let dims;

  const addWheel = (x, z, r, w) => {
    const wheel = makeWheel(r, w);
    wheel.position.set(x, r, z);
    group.add(wheel);
    wheels.push(wheel);
  };
  const addLights = (zTail, zHead, halfW, y) => {
    group.add(box(0.44, 0.14, 0.08, tailMat, -halfW, y, zTail));
    group.add(box(0.44, 0.14, 0.08, tailMat, halfW, y, zTail));
    group.add(box(0.4, 0.12, 0.08, headMat, -halfW, y, zHead));
    group.add(box(0.4, 0.12, 0.08, headMat, halfW, y, zHead));
  };

  if (kind === 'player') {
    dims = { len: 4.4, w: 2.0 };
    group.add(box(2.0, 0.5, 4.4, bodyMat, 0, 0.52, 0));
    group.add(box(1.7, 0.42, 2.1, glassMat, 0, 0.97, -0.2));
    group.add(box(1.86, 0.14, 1.2, bodyMat, 0, 0.83, 1.5));
    addWheel(-0.92, 1.45, 0.38, 0.32); addWheel(0.92, 1.45, 0.38, 0.32);
    addWheel(-0.92, -1.45, 0.38, 0.32); addWheel(0.92, -1.45, 0.38, 0.32);
    addLights(-2.22, 2.22, 0.62, 0.62);
  } else if (kind === 'police') {
    dims = { len: 4.5, w: 2.0 };
    group.add(box(2.0, 0.55, 4.5, bodyMat, 0, 0.58, 0));
    group.add(box(1.7, 0.5, 2.2, glassMat, 0, 1.08, -0.15));
    // чёрная «ливрея» на капоте и крышке багажника
    group.add(box(1.72, 0.06, 1.3, darkMat, 0, 0.86, 1.55));
    group.add(box(1.72, 0.06, 0.9, darkMat, 0, 0.86, -1.85));
    // мигалка: тёмная платформа + красный и синий
    group.add(box(1.1, 0.08, 0.4, darkMat, 0, 1.27, 0));
    const barR = new THREE.MeshStandardMaterial({ color: 0x33060a, emissive: 0xff2222, emissiveIntensity: 0 });
    const barB = new THREE.MeshStandardMaterial({ color: 0x061030, emissive: 0x2266ff, emissiveIntensity: 0 });
    group.add(box(0.42, 0.14, 0.34, barR, -0.24, 1.38, 0));
    group.add(box(0.42, 0.14, 0.34, barB, 0.24, 1.38, 0));
    siren = { r: barR, b: barB };
    addWheel(-0.92, 1.45, 0.37, 0.31); addWheel(0.92, 1.45, 0.37, 0.31);
    addWheel(-0.92, -1.45, 0.37, 0.31); addWheel(0.92, -1.45, 0.37, 0.31);
    addLights(-2.26, 2.26, 0.62, 0.66);
  } else if (kind === 'sedan') {
    dims = { len: 4.3, w: 1.9 };
    group.add(box(1.9, 0.6, 4.3, bodyMat, 0, 0.56, 0));
    group.add(box(1.7, 0.5, 2.2, glassMat, 0, 1.1, -0.1));
    addWheel(-0.85, 1.4, 0.36, 0.3); addWheel(0.85, 1.4, 0.36, 0.3);
    addWheel(-0.85, -1.4, 0.36, 0.3); addWheel(0.85, -1.4, 0.36, 0.3);
    addLights(-2.16, 2.16, 0.58, 0.66);
  } else if (kind === 'van') {
    dims = { len: 5.0, w: 2.1 };
    group.add(box(2.1, 1.1, 5.0, bodyMat, 0, 0.8, 0));
    group.add(box(1.9, 0.5, 0.9, glassMat, 0, 1.15, 1.9));
    addWheel(-0.95, 1.7, 0.4, 0.32); addWheel(0.95, 1.7, 0.4, 0.32);
    addWheel(-0.95, -1.7, 0.4, 0.32); addWheel(0.95, -1.7, 0.4, 0.32);
    addLights(-2.52, 2.52, 0.66, 0.7);
  } else { // truck
    dims = { len: 8.0, w: 2.4 };
    group.add(box(2.3, 1.2, 2.0, bodyMat, 0, 1.0, 2.9));
    group.add(box(2.0, 0.55, 0.4, glassMat, 0, 1.45, 3.5));
    group.add(box(2.4, 1.8, 5.2, bodyMat, 0, 1.15, -1.2));
    addWheel(-1.0, 2.9, 0.5, 0.36); addWheel(1.0, 2.9, 0.5, 0.36);
    addWheel(-1.0, -2.4, 0.5, 0.36); addWheel(1.0, -2.4, 0.5, 0.36);
    addLights(-3.82, 3.95, 0.8, 0.8);
  }

  // Псевдо-тень: машина стоит на дамбе, настоящая тень падала бы на землю
  // далеко внизу и выглядела багом. Кладём «кляксу» на полотно дороги.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(1, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.scale.set(dims.w * 0.62, dims.len * 0.55, 1);
  blob.position.y = 0.045;
  blob.renderOrder = 2;
  group.add(blob);

  return { group, wheels, dims, tailMat, siren };
}

// ---------- Кастомизация: машина игрока с разными скинами ----------
// Текстуры рисуем на канвасе — без внешних файлов.
function textTexture(text, fg = '#101318', bg = '#ffd257') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = fg;
  g.font = 'bold 52px "Chakra Petch", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function checkerTexture(a = '#14161c', b = '#f2f3f5') {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Мягкое радиальное свечение — для неоновых машин под днищем.
// Прямоугольная подложка читалась бы как «платформа», поэтому края гасим.
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,.95)');
  grad.addColorStop(0.45, 'rgba(255,255,255,.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Общие материалы — их нельзя освобождать при смене машины (они у всех).
const SHARED_MATS = new Set([glassMat, tireMat, headMat, darkMat]);

// Освободить ресурсы снятой машины: геометрия, уникальные материалы и текстуры.
export function disposeCar(model) {
  if (!model || !model.group) return;
  model.group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || SHARED_MATS.has(m)) continue;
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}

// Машина игрока с кастомным видом.
// kind: 'stock' | 'taxi' | 'icecream' | 'neon' | 'police' | 'rainbow'
export function buildPlayerCar(kind = 'stock', colorHex = 0xc9403a) {
  if (kind === 'stock') return buildCar('player', colorHex);

  const group = new THREE.Group();
  const wheels = [];
  const dims = { len: 4.4, w: 2.0 };
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x4a0f0f, emissive: 0xff2626, emissiveIntensity: 1.4 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5, metalness: 0.2, flatShading: true });
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xfdf3e2, roughness: 0.7, flatShading: true });
  let siren = null;

  const addWheel = (x, z, r = 0.38, w = 0.32) => {
    const wheel = makeWheel(r, w);
    wheel.position.set(x, r, z);
    group.add(wheel);
    wheels.push(wheel);
  };
  const addLights = (zTail, zHead, halfW, y) => {
    group.add(box(0.44, 0.14, 0.08, tailMat, -halfW, y, zTail));
    group.add(box(0.44, 0.14, 0.08, tailMat, halfW, y, zTail));
    group.add(box(0.4, 0.12, 0.08, headMat, -halfW, y, zHead));
    group.add(box(0.4, 0.12, 0.08, headMat, halfW, y, zHead));
  };
  const fourWheels = () => {
    addWheel(-0.92, 1.45); addWheel(0.92, 1.45);
    addWheel(-0.92, -1.45); addWheel(0.92, -1.45);
  };
  const baseBody = () => {
    // Меши слегка «вложены» друг в друга — совпадающих граней быть не должно,
    // иначе появляется z-fighting (рябь на стыках).
    group.add(box(2.0, 0.5, 4.4, bodyMat, 0, 0.52, 0));
    group.add(box(1.7, 0.34, 2.1, glassMat, 0, 0.92, -0.2));
    group.add(box(1.86, 0.14, 1.2, bodyMat, 0, 0.83, 1.5));
    // Крыша в цвет кузова — иначе салон читается чёрным ящиком.
    group.add(box(1.74, 0.08, 2.14, bodyMat, 0, 1.11, -0.2));
  };

  if (kind === 'taxi') {
    baseBody();
    // Шашечки по бокам — полоса чуть шире кузова.
    const checkerMat = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.6, flatShading: true });
    group.add(box(2.06, 0.3, 2.6, checkerMat, 0, 0.5, 0.15));
    // «Такси» на крыше.
    const signMat = new THREE.MeshStandardMaterial({
      map: textTexture('TAXI'), roughness: 0.5, emissive: 0xffd257, emissiveIntensity: 0.35,
    });
    group.add(box(0.9, 0.06, 0.38, darkMat, 0, 1.19, 0.1));
    group.add(box(0.86, 0.3, 0.34, signMat, 0, 1.37, 0.1));
    fourWheels();
    addLights(-2.22, 2.22, 0.62, 0.62);
  } else if (kind === 'icecream') {
    // Фургон: низкий кузов + высокий задний отсек.
    // Отсек чуть уже кузова — иначе боковые грани совпадают и будет z-fighting.
    group.add(box(2.0, 0.5, 4.4, bodyMat, 0, 0.52, 0));
    group.add(box(1.66, 0.3, 1.1, glassMat, 0, 0.88, 1.25));
    group.add(box(1.9, 1.15, 2.7, creamMat, 0, 1.3, -0.95));
    group.add(box(1.98, 0.16, 2.76, bodyMat, 0, 1.93, -0.95));
    // Мороженое: вафельный рожок и розовая шапка.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.52, 0.95, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9a35c, roughness: 0.9, flatShading: true })
    );
    cone.position.set(0, 2.48, -0.95);
    group.add(cone);
    const scoop = new THREE.Mesh(
      new THREE.SphereGeometry(0.44, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffb3d1, roughness: 0.85, flatShading: true })
    );
    scoop.position.set(0, 3.04, -0.95);
    group.add(scoop);
    // Розовая полоса — накладка на борт отсека, чуть шире самого отсека.
    group.add(box(1.96, 0.26, 2.72, new THREE.MeshStandardMaterial({ color: 0xff9ec4, roughness: 0.6, flatShading: true }), 0, 1.05, -0.95));
    fourWheels();
    addLights(-2.22, 2.22, 0.62, 0.62);
  } else if (kind === 'neon') {
    baseBody();
    // Светящиеся трубки вдоль бортов и подсветка снизу.
    const neonA = new THREE.MeshStandardMaterial({ color: 0x2ff0ff, emissive: 0x2ff0ff, emissiveIntensity: 2.4, roughness: 0.3 });
    const neonB = new THREE.MeshStandardMaterial({ color: 0xff3fd0, emissive: 0xff3fd0, emissiveIntensity: 2.4, roughness: 0.3 });
    group.add(box(0.07, 0.09, 4.1, neonA, -1.0, 0.72, 0));
    group.add(box(0.07, 0.09, 4.1, neonB, 1.0, 0.72, 0));
    group.add(box(1.5, 0.07, 0.09, neonA, 0, 1.19, -0.2));
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 6.4),
      new THREE.MeshBasicMaterial({
        map: glowTexture(), color: 0x2ff0ff, transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    glow.renderOrder = 1;
    group.add(glow);
    fourWheels();
    addLights(-2.22, 2.22, 0.62, 0.62);
  } else if (kind === 'police') {
    baseBody();
    // Чёрно-белая «ливрея» по бортам.
    const liveryMat = new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.55, flatShading: true });
    group.add(box(2.04, 0.34, 1.5, liveryMat, 0, 0.52, -0.4));
    group.add(box(1.0, 0.3, 0.4, liveryMat, -1.0, 0.52, 1.3));
    group.add(box(1.0, 0.3, 0.4, liveryMat, 1.0, 0.52, 1.3));
    // Мигалка: платформа + красный и синий.
    group.add(box(1.06, 0.08, 0.36, darkMat, 0, 1.22, -0.2));
    const barR = new THREE.MeshStandardMaterial({ color: 0x33060a, emissive: 0xff2222, emissiveIntensity: 0 });
    const barB = new THREE.MeshStandardMaterial({ color: 0x061030, emissive: 0x2266ff, emissiveIntensity: 0 });
    group.add(box(0.4, 0.15, 0.32, barR, -0.24, 1.34, -0.2));
    group.add(box(0.4, 0.15, 0.32, barB, 0.24, 1.34, -0.2));
    siren = { r: barR, b: barB };
    fourWheels();
    addLights(-2.22, 2.22, 0.62, 0.62);
  } else { // rainbow
    baseBody();
    // Радужные полосы поперёк кузова.
    const rainbow = [0xff4d4d, 0xff9d3d, 0xffd93d, 0x5ddc5d, 0x3da9ff, 0xa85dff];
    rainbow.forEach((c, i) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.15, flatShading: true });
      group.add(box(2.02, 0.12, 0.3, m, 0, 0.79, 1.32 - i * 0.34));
    });
    fourWheels();
    addLights(-2.22, 2.22, 0.62, 0.62);
  }

  // Псевдо-тень — как у обычных машин.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(1, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.scale.set(dims.w * 0.62, dims.len * 0.55, 1);
  blob.position.y = 0.045;
  blob.renderOrder = 2;
  group.add(blob);

  return { group, wheels, dims, tailMat, siren };
}
