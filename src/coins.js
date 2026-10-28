import * as THREE from 'three';
import { COIN } from './config.js';

// Монетки на дороге: золотые диски, крутятся и подпрыгивают.
// Собрал — монеты капают в кошелёк, их можно тратить на кастомизацию.
// Спавн по одной монете (как канистры нитро) и только в стандартном режиме —
// включается/выключается через setEnabled().
export class CoinPickups {
  constructor(scene) {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffc93c, emissive: 0xffa000, emissiveIntensity: 0.55,
      roughness: 0.28, metalness: 0.75, flatShading: true,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xd08a12, roughness: 0.4, metalness: 0.6, flatShading: true,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffd257, transparent: true, opacity: 0.16, depthWrite: false,
    });
    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 14);
    const rimGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.05, 14);
    const glowGeo = new THREE.SphereGeometry(0.8, 10, 8);
    this.pool = [];
    for (let i = 0; i < COIN.COUNT; i++) {
      const g = new THREE.Group();
      const coin = new THREE.Mesh(coinGeo, goldMat);
      coin.position.y = 0.55;
      coin.rotation.x = Math.PI / 2; // диск стоит вертикально
      const rim = new THREE.Mesh(rimGeo, edgeMat);
      rim.position.y = 0.55;
      rim.rotation.x = Math.PI / 2;
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.y = 0.55;
      g.add(coin, rim, glow);
      g.visible = false;
      scene.add(g);
      this.pool.push({ group: g, s: -1, lat: 0, spin: Math.random() * 6, hop: Math.random() * 6 });
    }
    this.out = {};
    this.enabled = false; // по умолчанию выключены: включаем только в стандартном заезде
  }

  // Выдавать ли монеты в этом заезде: только стандартные настройки, только сольный режим.
  setEnabled(v) {
    this.enabled = !!v;
    for (const item of this.pool) item.group.visible = this.enabled;
  }

  place(item, s, road) {
    const lane = Math.floor(Math.random() * road.laneCount) + 0.5;
    item.s = s;
    item.lat = -road.roadwayHalf + road.laneWidth * lane + (Math.random() - 0.5) * 0.7;
  }

  reset(playerS, road) {
    let s = playerS + 200;
    for (const item of this.pool) {
      this.place(item, s, road);
      s += 260 + Math.random() * 300; // одна монета за раз, пауза между ними
    }
  }

  update(dt, player, road, onCollect) {
    if (!this.enabled) return;
    for (const item of this.pool) {
      if (item.s < player.s - 40) {
        this.place(item, player.s + 320 + Math.random() * 260, road);
      }
      item.spin += dt * 3.2;
      item.hop += dt * 4.4;
      const w = road.worldOf(item.s, item.lat, this.out);
      item.group.position.set(w.px, w.py + 0.45 + Math.abs(Math.sin(item.hop)) * 0.22, w.pz);
      item.group.rotation.y = item.spin;
      if (Math.abs(player.s - item.s) < 2.4 && Math.abs(player.lat - item.lat) < 1.7) {
        const cw = { px: w.px, py: w.py, pz: w.pz };
        this.place(item, player.s + 420 + Math.random() * 300, road);
        onCollect(cw);
      }
    }
  }
}
