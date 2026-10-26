import * as THREE from 'three';
import { PICKUP } from './config.js';

// Канистры нитро прямо на дороге: светящиеся баллоны, крутятся и порхают.
// Собрал — нитро поползло вверх, искры, звон.
export class NitroPickups {
  constructor(scene) {
    const canMat = new THREE.MeshStandardMaterial({
      color: 0x0a1e2e, emissive: 0x2fd8ff, emissiveIntensity: 1.5,
      roughness: 0.4, metalness: 0.3,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x111318, emissive: 0x18b8e0, emissiveIntensity: 1.1, roughness: 0.5,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x28d0ff, transparent: true, opacity: 0.13, depthWrite: false,
    });
    const canGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.95, 10);
    const capGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.16, 8);
    const glowGeo = new THREE.SphereGeometry(0.95, 10, 8);
    this.pool = [];
    for (let i = 0; i < PICKUP.COUNT; i++) {
      const g = new THREE.Group();
      const can = new THREE.Mesh(canGeo, canMat);
      can.position.y = 0.55;
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 1.1;
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.y = 0.65;
      g.add(can, cap, glow);
      scene.add(g);
      this.pool.push({ group: g, s: -1, lat: 0, spin: Math.random() * 6 });
    }
    this.out = {};
  }

  place(item, s, road) {
    const lane = Math.floor(Math.random() * road.laneCount) + 0.5;
    item.s = s;
    item.lat = -road.roadwayHalf + road.laneWidth * lane + (Math.random() - 0.5) * 0.7;
  }

  reset(playerS, road) {
    let s = playerS + 260;
    for (const item of this.pool) {
      this.place(item, s, road);
      s += 260 + Math.random() * 300;
    }
  }

  update(dt, player, road, onCollect) {
    for (const item of this.pool) {
      if (item.s < player.s - 40) {
        this.place(item, player.s + 320 + Math.random() * 260, road);
      }
      item.spin += dt * 2.6;
      const w = road.worldOf(item.s, item.lat, this.out);
      item.group.position.set(w.px, w.py + 0.25 + Math.sin(item.spin * 1.7) * 0.12, w.pz);
      item.group.rotation.y = item.spin;
      if (Math.abs(player.s - item.s) < 2.4 && Math.abs(player.lat - item.lat) < 1.7) {
        const cw = { px: w.px, py: w.py, pz: w.pz };
        this.place(item, player.s + 420 + Math.random() * 300, road);
        onCollect(cw);
      }
    }
  }
}
