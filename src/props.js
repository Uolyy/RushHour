import * as THREE from 'three';
import { CITY } from './config.js';

// Пул придорожных объектов на InstancedMesh: деревья, камни, фонари, дома.
// Матрицы перезаполняются из списка пропсов трассы — дёшево и без аллокаций.
const dummy = new THREE.Object3D();
const CAP = { tree: 150, rock: 100, lamp: 48, building: CITY.BUILDINGS };

// Текстура «ночных окон»: тёмный холст, часть ячеек горит тёплым/холодным.
function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, 128, 128);
  const cols = 8, rows = 10;
  const wpx = 128 / cols, hpx = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      if (Math.random() < 0.55) {
        const warm = Math.random() < 0.5;
        x.fillStyle = warm
          ? 'rgba(255, 214, 150, ' + (0.55 + Math.random() * 0.45) + ')'
          : 'rgba(150, 200, 255, ' + (0.5 + Math.random() * 0.5) + ')';
        x.fillRect(q * wpx + wpx * 0.22, r * hpx + hpx * 0.18, wpx * 0.56, hpx * 0.5);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Неоновая вывеска на канвасе: тёмный фон + светящийся текст.
function boardTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#05060d';
  x.fillRect(0, 0, 256, 128);
  x.strokeStyle = color;
  x.lineWidth = 6;
  x.strokeRect(10, 10, 236, 108);
  x.font = 'bold 44px "Chakra Petch", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = color;
  x.shadowBlur = 24;
  x.fillStyle = color;
  x.fillText(text, 128, 64);
  return new THREE.CanvasTexture(c);
}

export class PropPool {
  constructor(scene) {
    const std = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    this.trunkMat = std();
    this.crownMat = std();
    this.rockMat = std();
    this.lampMat = std();
    this.lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.6 });

    const mk = (geo, mat, cap, shadows) => {
      const im = new THREE.InstancedMesh(geo, mat, cap);
      im.castShadow = shadows;
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      scene.add(im);
      return im;
    };
    this.trunks = mk(new THREE.CylinderGeometry(0.16, 0.28, 1, 6), this.trunkMat, CAP.tree, true);
    this.crowns = mk(new THREE.ConeGeometry(1, 2.2, 7), this.crownMat, CAP.tree, true);
    this.rocks = mk(new THREE.IcosahedronGeometry(1, 0), this.rockMat, CAP.rock, true);
    this.poles = mk(new THREE.CylinderGeometry(0.09, 0.13, 1, 6), this.lampMat, CAP.lamp, true);
    this.heads = mk(new THREE.BoxGeometry(0.34, 0.18, 1.1), this.lampHeadMat, CAP.lamp, false);

    // Дома: одна коробка на инстанс, окна — эмиссивная текстура.
    this.buildingMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.85, metalness: 0.05, flatShading: true,
      emissive: 0xffffff, emissiveMap: windowTexture(), emissiveIntensity: 0,
    });
    this.buildings = mk(new THREE.BoxGeometry(1, 1, 1), this.buildingMat, CAP.building, true);

    // Неон-щиты: их немного, поэтому не инстансы, а пул из четырёх групп.
    this.boards = [];
    const texts = [['RUSH', '#ff2d78'], ['HOUR', '#2fd8ff'], ['NITRO+', '#ffd23c'], ['24/7', '#7dff5e']];
    for (let i = 0; i < CITY.BOARDS; i++) {
      const [txt, col] = texts[i % texts.length];
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 6.4, 6), this.lampMat);
      pole.position.y = 3.2;
      pole.castShadow = true;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 3.5),
        new THREE.MeshStandardMaterial({
          color: 0x000000, emissive: 0xffffff, emissiveMap: boardTexture(txt, col),
          emissiveIntensity: 0, roughness: 0.6, side: THREE.DoubleSide,
        })
      );
      plane.position.y = 6.4;
      g.add(pole, plane);
      g.visible = false;
      scene.add(g);
      this.boards.push({ group: g, mat: plane.material });
    }
  }

  // Свечение: фонари — лампой биома, неон (дома + вывески) — параметром неона.
  setGlow(lampV, neonV) {
    this.lampHeadMat.emissiveIntensity = lampV;
    this.buildingMat.emissiveIntensity = neonV * 2.2;
    for (const b of this.boards) b.mat.emissiveIntensity = neonV * 1.7;
  }

  sync(props) {
    let nt = 0, nr = 0, nl = 0, nb = 0, nbd = 0;
    for (const p of props) {
      if (p.type === 'tree' && nt < CAP.tree) {
        const th = p.scale * 1.1;
        dummy.position.set(p.x, p.y + th / 2, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.scale.set(p.scale * 0.9, th, p.scale * 0.9);
        dummy.updateMatrix();
        this.trunks.setMatrixAt(nt, dummy.matrix);
        this.trunks.setColorAt(nt, p.trunk);
        const ch2 = p.scale * 2.2;
        dummy.position.set(p.x, p.y + th + ch2 * 0.36, p.z);
        dummy.scale.set(p.scale, ch2, p.scale);
        dummy.updateMatrix();
        this.crowns.setMatrixAt(nt, dummy.matrix);
        this.crowns.setColorAt(nt, p.crown);
        nt++;
      } else if (p.type === 'rock' && nr < CAP.rock) {
        dummy.position.set(p.x, p.y + p.scale * 0.42, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.scale.set(p.scale, p.scale * 0.72, p.scale * 0.9);
        dummy.updateMatrix();
        this.rocks.setMatrixAt(nr, dummy.matrix);
        this.rocks.setColorAt(nr, p.rock);
        nr++;
      } else if (p.type === 'lamp' && nl < CAP.lamp) {
        dummy.rotation.set(0, p.rot, 0);
        dummy.position.set(p.x, p.y + 2.6, p.z);
        dummy.scale.set(1, 5.2, 1);
        dummy.updateMatrix();
        this.poles.setMatrixAt(nl, dummy.matrix);
        dummy.position.set(p.x, p.y + 5.25, p.z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.heads.setMatrixAt(nl, dummy.matrix);
        nl++;
      } else if (p.type === 'building' && nb < CAP.building) {
        dummy.position.set(p.x, p.y + p.h / 2, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.scale.set(p.w, p.h, p.d);
        dummy.updateMatrix();
        this.buildings.setMatrixAt(nb, dummy.matrix);
        this.buildings.setColorAt(nb, p.color);
        nb++;
      } else if (p.type === 'billboard' && nbd < this.boards.length) {
        const b = this.boards[nbd++];
        b.group.visible = true;
        b.group.position.set(p.x, p.y, p.z);
        b.group.rotation.y = p.rot;
      }
    }
    const flush = (mesh, n) => {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    flush(this.trunks, nt); flush(this.crowns, nt);
    flush(this.rocks, nr); flush(this.poles, nl);
    flush(this.heads, nl); flush(this.buildings, nb);
    for (; nbd < this.boards.length; nbd++) this.boards[nbd].group.visible = false;
  }
}
