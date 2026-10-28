import * as THREE from 'three';
import { buildPlayerCar, disposeCar } from './carModel.js';
import { PLAYER } from './config.js';
import { colorById, hexToInt } from './skins.js';
import { damp, clamp } from './utils.js';

// Соперники по сети: полноценные машинки (не призраки), у каждого — свой вид.
// Позиции приходят пакетами (~30 раз/с). Чтобы машины не дёргались и не отставали,
// копим пакеты в буфер и рисуем с небольшой задержкой (INTERP_DELAY), интерполируя
// между соседними пакетами. Если пакетов не хватает — экстраполируем по скорости.
// Коллизии с игроком проверяем по габаритам, как с трафиком.
const INTERP_DELAY = 0.1;  // задержка отрисовки — на её фоне интерполируем
const MAX_EXTRAP = 0.15;   // сколько додумываем по скорости, если пакетов нет
const BUF_MAX = 16;        // размер буфера пакетов
const NICK_FONT = '700 34px "Chakra Petch", Arial, sans-serif';

// Ник над машиной: спрайт с текстом, нарисованным на канвасе.
function makeNickSprite(nick) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ctx.font = NICK_FONT;
  const text = String(nick || 'PLAYER');
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  const h = 48;
  canvas.width = Math.max(2, Math.round(w * dpr));
  canvas.height = Math.max(2, Math.round(h * dpr));
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  c.font = NICK_FONT;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = 6;
  c.strokeStyle = 'rgba(6, 8, 14, .85)';
  c.strokeText(text, w / 2, h / 2);
  c.fillStyle = '#ffd257';
  c.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0);   // низ спрайта — точка привязки (над крышей)
  sprite.renderOrder = 20;    // ник рисуется поверх машин
  sprite.userData.aspect = w / h;
  return sprite;
}

const out = {};
export class Rivals {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map(); // id -> { model, group, wheels, nick, nickSprite, buf, s, lat, spd, spin }
    this.colorI = 0;
  }

  sync(list, road) {
    const ids = new Set(list.map((p) => p.id));
    // убрать выбывших из комнаты
    for (const [id, r] of this.map) {
      if (!ids.has(id)) {
        this.disposeRival(r);
        this.map.delete(id);
      }
    }
    for (const p of list) {
      // Цвет приходит из сети как id ('red'), в модель нужен hex.
      const color = hexToInt(colorById(p.color).hex);
      if (this.map.has(p.id)) {
        const r = this.map.get(p.id);
        if (r.nick !== p.nick) { r.nick = p.nick; this.replaceNick(r, p.nick); }
        // Соперник сменил вид машины в лобби — пересобираем модель.
        if (r.skin !== p.skin || r.color !== color) this.rebuildCar(r, p.skin, color);
        continue;
      }
      const model = buildPlayerCar(p.skin || 'stock', color);
      this.scene.add(model.group);
      model.group.visible = false; // появится после первого пакета позиции
      const r = {
        model, group: model.group, wheels: model.wheels, nick: p.nick,
        skin: p.skin || 'stock', color,
        nickSprite: makeNickSprite(p.nick),
        buf: [], s: 0, lat: 0, sCol: 0, latCol: 0, spd: 0, spin: 0, first: true, crashed: false,
      };
      r.group.add(r.nickSprite);
      this.map.set(p.id, r);
    }
  }

  // Пересобрать машину соперника (скин/цвет приехали из сети).
  rebuildCar(r, skin, color) {
    const old = r.model;
    const model = buildPlayerCar(skin || 'stock', color || 0x3a8fc9);
    // Ник переезжает в новую модель (колёса у новой модели свои).
    model.group.add(r.nickSprite);
    model.group.visible = old.group.visible;
    this.scene.remove(old.group);
    this.scene.add(model.group);
    disposeCar(old);
    r.model = model;
    r.group = model.group;
    r.wheels = model.wheels;
    r.skin = skin;
    r.color = color;
  }

  replaceNick(r, nick) {
    const old = r.nickSprite;
    const sprite = makeNickSprite(nick);
    r.group.add(sprite);
    r.group.remove(old);
    if (old.material.map) old.material.map.dispose();
    old.material.dispose();
    r.nickSprite = sprite;
  }

  setState(id, s, lat, v) {
    const r = this.map.get(id);
    if (!r) return;
    const now = performance.now() / 1000;
    r.buf.push({ t: now, s, lat, v });
    if (r.buf.length > BUF_MAX) r.buf.shift();
    if (r.first) {
      r.s = s; r.lat = lat; r.spd = v;
      r.first = false;
      r.group.visible = true;
    }
  }

  markCrashed(id) {
    const r = this.map.get(id);
    if (r) r.crashed = true;
  }

  disposeRival(r) {
    this.scene.remove(r.group);
    if (r.nickSprite) {
      if (r.nickSprite.material.map) r.nickSprite.material.map.dispose();
      r.nickSprite.material.dispose();
    }
    disposeCar(r.model);
  }

  clear() {
    for (const r of this.map.values()) this.disposeRival(r);
    this.map.clear();
  }

  update(dt, road, camera) {
    const now = performance.now() / 1000;
    const renderT = now - INTERP_DELAY;
    for (const r of this.map.values()) {
      if (r.buf.length) {
        // Ищем два пакета, между которыми лежит момент отрисовки.
        let a = null, b = null;
        for (let i = r.buf.length - 1; i >= 0; i--) {
          if (r.buf[i].t <= renderT) { a = r.buf[i]; b = r.buf[i + 1] || null; break; }
        }
        if (!a) { a = r.buf[0]; b = r.buf[1] || null; }
        let s, lat, v;
        if (b && renderT <= b.t) {
          const span = Math.max(1e-4, b.t - a.t);
          const f = clamp((renderT - a.t) / span, 0, 1);
          s = a.s + (b.s - a.s) * f;
          lat = a.lat + (b.lat - a.lat) * f;
          v = a.v + (b.v - a.v) * f;
        } else {
          // Пакетов не хватает — продолжаем движение по последней скорости.
          const last = b || a;
          const age = Math.min(MAX_EXTRAP, Math.max(0, renderT - last.t));
          s = last.s + last.v * age;
          lat = last.lat;
          v = last.v;
        }
        r.s = s; r.lat = lat;
        r.spd = damp(r.spd, v, 10, dt);
        // Текущая (не задержанная) позиция — по ней считаем столкновения.
        const last = r.buf[r.buf.length - 1];
        const ahead = Math.min(0.3, Math.max(0, now - last.t));
        r.sCol = last.s + last.v * ahead;
        r.latCol = last.lat;
      }
      const w = road.worldOf(r.s, r.lat, out);
      r.group.position.set(w.px, w.py, w.pz);
      r.group.rotation.y = w.h;
      r.spin += (r.spd * dt) / 0.38;
      for (const wh of r.wheels) wh.rotation.x = r.spin;
      // Ник: постоянный экранный размер + всегда над машиной.
      if (r.nickSprite) {
        r.nickSprite.position.set(0, 2.1, 0);
        if (camera) {
          const d = camera.position.distanceTo(r.group.position);
          // Высота ника ~2% высоты экрана при любом расстоянии.
          const k = clamp(d * 0.014, 0.26, 5);
          r.nickSprite.scale.set(r.nickSprite.userData.aspect * k, k, 1);
        }
      }
    }
  }

  // Столкновение с игроком: id столкнувшегося соперника или null.
  checkCollision(player) {
    for (const [id, r] of this.map) {
      if (r.crashed || r.first) continue; // соперник без первого пакета — его позиции ещё нет
      // Считаем по актуальной позиции (без задержки отрисовки).
      const rs = r.sCol !== undefined ? r.sCol : r.s;
      const rl = r.latCol !== undefined ? r.latCol : r.lat;
      if (Math.abs(rs - player.s) < (PLAYER.LENGTH + PLAYER.LENGTH) / 2 &&
          Math.abs(rl - player.lat) < (PLAYER.WIDTH + PLAYER.WIDTH) / 2) {
        return id;
      }
    }
    return null;
  }

  get count() { return this.map.size; }
}