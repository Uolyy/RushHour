import { buildCar } from './carModel.js';
import { PLAYER } from './config.js';
import { damp } from './utils.js';

// Соперники по сети: полноценные машинки (не призраки), у каждого — свой цвет.
// Позиции приходят ~15 раз/с, между пакетами интерполируем (damp).
// Коллизии с игроком проверяем по габаритам, как с трафиком.
const COLORS = [0x3a8fc9, 0x3ac96f, 0xc9a13a, 0x9a3ac9, 0xc93a8f, 0x6fc93a, 0x3ac9c9, 0xc96f3a];

const out = {};
export class Rivals {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map(); // id -> { model, group, wheels, nick, s, lat, spd, tS, tLat, tSpd, spin }
    this.colorI = 0;
  }

  sync(list, road) {
    const ids = new Set(list.map((p) => p.id));
    // убрать выбывших из комнаты
    for (const [id, r] of this.map) {
      if (!ids.has(id)) {
        this.scene.remove(r.group);
        this.map.delete(id);
      }
    }
    for (const p of list) {
      if (this.map.has(p.id)) {
        this.map.get(p.id).nick = p.nick;
        continue;
      }
      const model = buildCar('player', COLORS[this.colorI++ % COLORS.length]);
      this.scene.add(model.group);
      model.group.visible = false; // появится после первого пакета позиции
      const r = {
        model, group: model.group, wheels: model.wheels, nick: p.nick,
        s: 0, lat: 0, spd: 0, tS: 0, tLat: 0, tSpd: 0, spin: 0, first: true, crashed: false,
      };
      this.map.set(p.id, r);
    }
  }

  setState(id, s, lat, v) {
    const r = this.map.get(id);
    if (!r) return;
    if (r.first) { r.s = s; r.lat = lat; r.spd = v; r.first = false; r.group.visible = true; }
    r.tS = s; r.tLat = lat; r.tSpd = v;
  }

  markCrashed(id) {
    const r = this.map.get(id);
    if (r) r.crashed = true;
  }

  clear() {
    for (const r of this.map.values()) this.scene.remove(r.group);
    this.map.clear();
  }

  update(dt, road) {
    for (const r of this.map.values()) {
      r.s = damp(r.s, r.tS, 12, dt);
      r.lat = damp(r.lat, r.tLat, 12, dt);
      r.spd = damp(r.spd, r.tSpd, 8, dt);
      const w = road.worldOf(r.s, r.lat, out);
      r.group.position.set(w.px, w.py, w.pz);
      r.group.rotation.y = w.h;
      r.spin += (r.spd * dt) / 0.38;
      for (const wh of r.wheels) wh.rotation.x = r.spin;
    }
  }

  // Столкновение с игроком: id столкнувшегося соперника или null.
  checkCollision(player) {
    for (const [id, r] of this.map) {
      if (r.crashed) continue;
      if (Math.abs(r.s - player.s) < (PLAYER.LENGTH + PLAYER.LENGTH) / 2 &&
          Math.abs(r.lat - player.lat) < (PLAYER.WIDTH + PLAYER.WIDTH) / 2) {
        return id;
      }
    }
    return null;
  }

  get count() { return this.map.size; }
}