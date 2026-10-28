import { buildCar } from './carModel.js';
import { TRACK, TRAFFIC, PLAYER } from './config.js';
import { clamp, damp } from './utils.js';

// Трафик: боты едут по полосам, следят за дистанцией (не таранят впереди
// идущего), перестраиваются в свободную полосу, полиция гоняет с мигалками.
// Пул фиксированный (TRAFFIC.MAX), «живых» машин — this.count.
const tmp = {};
const KINDS = [
  { kind: 'sedan', speed: [20, 33], w: 0.46 },
  { kind: 'van', speed: [17, 26], w: 0.27 },
  { kind: 'truck', speed: [14, 20], w: 0.2 },
  { kind: 'police', speed: [30, 38], w: TRAFFIC.POLICE_W },
];
const COLORS = ['#dcdcd8', '#b9b3a6', '#3d4f66', '#c9a13d', '#3f7a72', '#a84a3f', '#6b6f76', '#303239'];
// Задержка отрисовки удалённого трафика: рисуем чуть позади свежего снапшота,
// чтобы плавно интерполировать между пакетами (без рывков).
const TRAFFIC_SNAP_DELAY = 0.12;
const SNAP_BUF_MAX = 16;     // размер буфера снапшотов на машину

function pickKind() {
  const r = Math.random();
  let acc = 0;
  for (const k of KINDS) {
    acc += k.w;
    if (r < acc) return k;
  }
  return KINDS[0];
}

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.count = 0;
    this.effCount = 0;   // текущая «эффективная» сложность (с рампой)
    this.time = 0;
    this.remote = false; // гонка: позиции приходят от хоста, локальная симуляция выключена
    let colorI = 0;
    for (let i = 0; i < TRAFFIC.MAX; i++) {
      const k = pickKind();
      const colorI0 = colorI;
      const model = buildCar(k.kind, k.kind === 'police' ? 0xe8ecef : COLORS[colorI++ % COLORS.length]);
      scene.add(model.group);
      this.cars.push({
        model,
        kind: k.kind,
        speedBand: k.speed,
        cruise: 20,
        dims: model.dims,
        baseColorI: colorI0,
        s: 0, lat: 0, latTarget: 0,
        laneIdx: 0,
        speed: 20, prevDs: 1, wheelSpin: 0,
        blocked: 0,
        laneTick: 4 + Math.random() * 8,  // до первого спонтанного перестроения
      });
    }
    this.setCount(TRAFFIC.COUNT);
  }

  // Смена количества активных машин. Новичков ставим впереди игрока.
  setCount(n, playerS, road) {
    const prev = this.count;
    this.count = clamp(Math.round(n), 0, TRAFFIC.MAX);
    for (let i = 0; i < TRAFFIC.MAX; i++) this.cars[i].model.group.visible = i < this.count;
    if (road !== undefined) {
      for (let i = prev; i < this.count; i++) {
        this.setCarCruise(this.cars[i]);
        this.place(this.cars[i], playerS + TRAFFIC.SPAWN_AHEAD_MIN + Math.random() * 200, road);
      }
    }
  }

  setRemote(on) {
    this.remote = !!on;
  }

  // Пересобрать модель машины под тип из снапшота (пул у клиентов собран случайно).
  setKind(car, kindIdx) {
    const k = KINDS[kindIdx] || KINDS[0];
    this.scene.remove(car.model.group);
    car.model.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    const color = k.kind === 'police' ? 0xe8ecef : COLORS[(kindIdx * 3 + car.baseColorI) % COLORS.length];
    const model = buildCar(k.kind, color);
    this.scene.add(model.group);
    car.model = model;
    car.kind = k.kind;
    car.speedBand = k.speed;
    car.dims = model.dims;
  }

  // Снапшот от хоста: [{i, s, lat, v, k}]
  // Позиции не ставим «мгновенно» — копим снапшоты в буфер, а в update()
  // рисуем с задержкой, плавно интерполируя между соседними пакетами.
  applySnapshot(arr) {
    const seen = new Set();
    const now = performance.now() / 1000;
    for (const item of arr) {
      if (!item || item.i < 0 || item.i >= TRAFFIC.MAX) continue;
      const car = this.cars[item.i];
      seen.add(item.i);
      if (car.kind !== (KINDS[item.k] || KINDS[0]).kind) this.setKind(car, item.k);
      if (!car.snapBuf) car.snapBuf = [];
      car.snapBuf.push({ t: now, s: item.s, lat: item.lat, v: item.v });
      if (car.snapBuf.length > SNAP_BUF_MAX) car.snapBuf.shift();
      if (!car.snapInit) { // первая машина — сразу на место, без интерполяции
        car.s = item.s; car.lat = item.lat; car.speed = item.v;
        car.snapInit = true;
      }
      car.latTarget = car.lat; car.laneIdx = 0;
    }
    for (let i = 0; i < TRAFFIC.MAX; i++) {
      const car = this.cars[i];
      car.model.group.visible = seen.has(i);
      if (!seen.has(i)) {
        // Машины нет в кадре — сбрасываем снапшоты, чтобы в следующем заезде
        // она появилась сразу на месте, без интерполяции от старой позиции.
        car.snapBuf = null; car.snapInit = false;
        car.sCol = undefined; car.latCol = undefined;
      }
    }
  }

  // Снимок для рассылки (хост): только активные машины.
  snapshot() {
    const arr = [];
    for (let i = 0; i < this.count; i++) {
      const car = this.cars[i];
      const k = KINDS.findIndex((x) => x.kind === car.kind);
      arr.push({ i, s: Math.round(car.s * 100) / 100, lat: Math.round(car.lat * 100) / 100, v: Math.round(car.speed * 10) / 10, k: k < 0 ? 0 : k });
    }
    return arr;
  }

  setCarCruise(car) {
    car.cruise = car.speedBand[0] + Math.random() * (car.speedBand[1] - car.speedBand[0]);
    car.speed = car.cruise;
  }

  reset(playerS, road) {
    for (let i = 0; i < this.count; i++) {
      const car = this.cars[i];
      this.setCarCruise(car);
      this.place(car, playerS + 80 + Math.random() * 400, road);
    }
  }

  laneCenter(road, laneIdx) {
    return -road.roadwayHalf + road.laneWidth * (laneIdx + 0.5);
  }

  // Ищем свободное место: та же полоса ближе 32 м — занято, пробуем ещё.
  place(car, sTarget, road) {
    for (let t = 0; t < 14; t++) {
      const s = sTarget + Math.random() * 40;
      const laneIdx = Math.floor(Math.random() * road.laneCount);
      const lat = this.laneCenter(road, laneIdx) + (Math.random() - 0.5) * 1.4;
      let ok = true;
      for (let j = 0; j < this.count; j++) {
        const o = this.cars[j];
        if (o !== car && Math.abs(o.s - s) < 32 && Math.abs(o.lat - lat) < 3.2) { ok = false; break; }
      }
      if (ok) {
        car.s = s; car.lat = lat; car.latTarget = lat;
        car.laneIdx = laneIdx; car.prevDs = s; car.blocked = 0;
        return;
      }
    }
    // Fallback: не нашли место — рассыпаем подальше, чтобы не кучковались
    car.s = sTarget + 200 + Math.random() * 120;
    car.laneIdx = Math.floor(Math.random() * road.laneCount);
    car.lat = car.latTarget = this.laneCenter(road, car.laneIdx);
    car.prevDs = car.s;
  }

  respawn(car, playerS, road) {
    this.setCarCruise(car);
    this.place(car, playerS + TRAFFIC.SPAWN_AHEAD_MIN + Math.random() * (TRAFFIC.SPAWN_AHEAD_MAX - TRAFFIC.SPAWN_AHEAD_MIN), road);
  }

  // Перестроение в свободную соседнюю полосу, если застряли за тихоходом.
  tryLaneChange(car, road) {
    if (road.laneCount < 2) return;
    const options = [car.laneIdx - 1, car.laneIdx + 1].filter((l) => l >= 0 && l < road.laneCount);
    if (!options.length) return;
    options.sort(() => Math.random() - 0.5); // случайный порядок — трафик не механический
    for (const l of options) {
      const latC = this.laneCenter(road, l);
      let free = true;
      for (let j = 0; j < this.count; j++) {
        const o = this.cars[j];
        if (o === car) continue;
        if (Math.abs(o.lat - latC) < 2.9 && Math.abs(o.s - car.s) < 38) { free = false; break; }
      }
      if (free) {
        car.laneIdx = l;
        car.latTarget = latC + (Math.random() - 0.5) * 0.8;
        car.blocked = 0;
        return;
      }
    }
  }

  update(dt, player, road) {
    this.time += dt;
    const near = [];
    let crash = false;
    const t = this.time;
    const n = this.remote ? TRAFFIC.MAX : this.count;
    for (let i = 0; i < n; i++) {
      const car = this.cars[i];
      if (this.remote && !car.model.group.visible) continue;

      // --- 0. Удалённый режим: плавная интерполяция между снапшотами хоста ---
      if (this.remote && car.snapBuf && car.snapBuf.length) {
        const now = performance.now() / 1000;
        const renderT = now - TRAFFIC_SNAP_DELAY;
        const buf = car.snapBuf;
        // Ищем два снапшота, между которыми лежит момент отрисовки.
        let a = null, b = null;
        for (let i = buf.length - 1; i >= 0; i--) {
          if (buf[i].t <= renderT) { a = buf[i]; b = buf[i + 1] || null; break; }
        }
        if (!a) { a = buf[0]; b = buf[1] || null; }
        let s, lat, v;
        if (b && renderT <= b.t) {
          const span = Math.max(1e-4, b.t - a.t);
          const f = clamp((renderT - a.t) / span, 0, 1);
          s = a.s + (b.s - a.s) * f;
          lat = a.lat + (b.lat - a.lat) * f;
          v = a.v + (b.v - a.v) * f;
        } else {
          // Снапшотов не хватает — продолжаем движение по последней скорости.
          const last = b || a;
          const age = Math.min(0.3, Math.max(0, renderT - last.t));
          s = last.s + last.v * age;
          lat = last.lat;
          v = last.v;
        }
        car.s = s; car.lat = lat; car.speed = v;
        // Актуальная позиция (без задержки отрисовки) — по ней считаем столкновения.
        const last = buf[buf.length - 1];
        const ahead = Math.min(0.3, Math.max(0, now - last.t));
        car.sCol = last.s + last.v * ahead;
        car.latCol = last.lat;
      }

      // --- 1-3. Локальная симуляция (дистанция, разгон, перестроения) ---
      if (!this.remote) {
        let aheadDs = Infinity;
        let ahead = null;
        for (let j = 0; j < this.count; j++) {
          if (j === i) continue;
          const o = this.cars[j];
          const ds = o.s - car.s;
          if (ds > 0 && ds < 42 && Math.abs(o.lat - car.lat) < 2.7 && ds < aheadDs) { aheadDs = ds; ahead = o; }
        }
        if (ahead && aheadDs < 34) {
          car.blocked += dt;
          const safe = 7 + car.speed * 0.5;
          let target = car.cruise;
          if (aheadDs < safe) target = Math.min(ahead.speed - 1.5, car.cruise);
          if (target < car.speed) car.speed = Math.max(4, target, car.speed - TRAFFIC.AI_BRAKE * dt);
          else car.speed = Math.min(target, car.speed + TRAFFIC.AI_ACCEL * dt);
          if (car.blocked > TRAFFIC.AI_BLOCKED_LANE) this.tryLaneChange(car, road);
        } else {
          car.blocked = 0;
          if (car.speed < car.cruise) car.speed = Math.min(car.cruise, car.speed + TRAFFIC.AI_ACCEL * dt);
          else car.speed = Math.max(car.cruise, car.speed - TRAFFIC.AI_ACCEL * dt);
          // Спонтанные перестроения: изредка и неохотно, чтобы трафик был живым,
          // но не превратился в хаос (шанс и длинный таймер отсекают суету).
          car.laneTick -= dt;
          if (car.laneTick <= 0) {
            car.laneTick = TRAFFIC.LANE_TICK_MIN + Math.random() * (TRAFFIC.LANE_TICK_MAX - TRAFFIC.LANE_TICK_MIN);
            if (Math.random() < TRAFFIC.LANE_TICK_CHANCE) this.tryLaneChange(car, road);
          }
        }
        car.s += car.speed * dt;
        car.lat = damp(car.lat, car.latTarget, 2.2, dt);
        if (car.s < player.s - TRAFFIC.DESPAWN_BEHIND || car.s > player.s + TRAFFIC.SPAWN_AHEAD_MAX + 80) {
          this.respawn(car, player.s, road);
        }
      }
      const w = road.worldOf(car.s, car.lat, tmp);
      car.model.group.position.set(w.px, w.py, w.pz);
      car.model.group.rotation.y = w.h;
      car.wheelSpin += (car.speed * dt) / 0.4;
      for (const wh of car.model.wheels) wh.rotation.x = car.wheelSpin;

      // мигалки полиции
      if (car.model.siren) {
        const ph = Math.floor(t * 6) % 2 === 0;
        car.model.siren.r.emissiveIntensity = ph ? 5 : 0.15;
        car.model.siren.b.emissiveIntensity = ph ? 0.15 : 5;
      }

      // --- 4. коллизия с игроком и near-miss ---
      // В удалённом режиме берём актуальную позицию (без задержки отрисовки).
      const cs = this.remote && car.sCol !== undefined ? car.sCol : car.s;
      const cl = this.remote && car.latCol !== undefined ? car.latCol : car.lat;
      const ds = cs - player.s;
      const dl = Math.abs(cl - player.lat);
      if (!crash && Math.abs(ds) < (car.dims.len + PLAYER.LENGTH) / 2 && dl < (car.dims.w + PLAYER.WIDTH) / 2) {
        crash = true;
      }
      if (car.prevDs > 0 && ds <= 0 && player.speed > 10 && dl < TRAFFIC.NEAR_MISS_LAT) {
        near.push(dl);
      }
      car.prevDs = ds;
    }
    return { crash, near };
  }
}
