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
