import * as THREE from 'three';
import { buildCar } from './carModel.js';
import { PLAYER, TRACK } from './config.js';
import { clamp, damp } from './utils.js';

// Машинка игрока. Ездит в «координатах трассы» (s — вперёд, lat — вбок),
// а в мир переводится через Road.worldOf. lat > 0 — ВПРАВО по экрану.
// Два режима руления: клавиатура (с физикой сноса) и мышь (курсор = позиция).
const tmpA = {};
const tmpB = {};

export class Player {
  constructor(scene) {
    this.model = buildCar('player', 0xc9403a);
    this.group = this.model.group;
    this.group.rotation.order = 'YXZ'; // сначала yaw, потом pitch, потом крен
    scene.add(this.group);

    // Фары: SpotLight, включается ночью (интенсивность задаёт биом).
    this.head = new THREE.SpotLight(0xfff0cc, 0, 90, 0.45, 0.6, 1.3);
    this.head.position.set(0, 1.0, 1.6);
    this.headTarget = new THREE.Object3D();
    this.headTarget.position.set(0, 0.3, 34);
    this.group.add(this.head, this.headTarget);
    this.head.target = this.headTarget;

    this.wheelSpin = 0;
    this.time = 0;
    this.reset();
  }

  reset() {
    this.s = 30;
    this.lat = 0;
    this.latVel = 0;
    this.speed = 0;
    this.nitro = 0;
    this.boosting = false;
    this.spin = 0;      // вращение фюзеляжа после аварии
    this.spinV = 0;
    this.wx = 0; this.wy = 0; this.wz = 0; this.wh = 0;
  }

  get speedNorm() {
    return this.speed / (PLAYER.MAX_SPEED * PLAYER.NITRO_MULT);
  }

  update(dt, input, road) {
    this.time += dt;

    // Продольная физика. На обочине газ «не тянет» выше безопасного потолка.
    const onShoulder = Math.abs(this.lat) > road.roadwayHalf;
    this.onShoulder = onShoulder;
    const cap = PLAYER.MAX_SPEED * (this.boosting ? PLAYER.NITRO_MULT : 1) * (onShoulder ? PLAYER.SHOULDER_FRAC : 1);
    if (input.gas && this.speed < cap) this.speed += PLAYER.ACCEL * (this.boosting ? 1.6 : 1) * dt;
    else if (!input.gas) this.speed -= PLAYER.COAST * dt;
    if (input.brake) this.speed -= PLAYER.BRAKE * dt;
    if (onShoulder && this.speed > cap) this.speed -= PLAYER.SHOULDER_DRAG * dt;
    if (input.nitro && this.nitro > 0.01 && input.gas) {
      this.boosting = true;
      this.nitro = Math.max(0, this.nitro - PLAYER.NITRO_DRAIN * dt);
    } else {
      this.boosting = false;
    }
    this.speed = clamp(this.speed, 0, cap);

    // Боковая физика
    const sm = road.sampleAt(this.s, tmpA);
    const lim = road.halfWidth - 1.25;
    let steer = 0;

    if (input.steerTarget === null) {
      // Клавиатура: руление + центробежный снос.
      // c > 0 — поворот влево по экрану, сносит вправо (наружу поворота).
      steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const target = steer * PLAYER.STEER_SPEED * (0.35 + 0.65 * this.speed / PLAYER.MAX_SPEED);
      this.latVel = damp(this.latVel, target, 9, dt);
      this.latVel += sm.c * this.speed * this.speed * PLAYER.CENTRIFUGAL * dt;
      this.lat = clamp(this.lat + this.latVel * dt, -lim, lim);
      if (Math.abs(this.lat) >= lim && Math.sign(this.latVel) === Math.sign(this.lat)) {
        this.latVel *= 0.4; // упёрлись в отбойник
      }
    } else {
      // Мышь (Audiosurf-style): позиция стремится к курсору, сноса нет — чилл.
      const target = clamp(input.steerTarget * lim, -lim, lim);
      const prev = this.lat;
      this.lat = damp(this.lat, target, 9, dt);
      this.latVel = dt > 0 ? (this.lat - prev) / dt : 0;
    }
    this.s += this.speed * dt;

    this.place(road, steer, dt);
    this.model.tailMat.emissiveIntensity = input.brake ? 4.5 : 1.4;
  }

  // Расстановка меша в мир по текущим s/lat.
  place(road, steer = 0, dt = 0) {
    const w = road.worldOf(this.s, this.lat, tmpB);
    this.wx = w.px; this.wy = w.py; this.wz = w.pz; this.wh = w.h;
    this.group.position.set(w.px, w.py, w.pz);
    const slope = (road.sampleY(this.s + 3) - road.sampleY(this.s - 3)) / 6;
    this.group.rotation.y = w.h + this.spin;
    this.group.rotation.x = -Math.atan(slope);
    // Крен корпуса от инерции: валит НАРУЖУ поворота (правый поворот — крен влево).
    this.group.rotation.z = -(steer * 0.06 + this.latVel * 0.01);
    // Лёгкая тряска подвески на скорости
    this.group.position.y += Math.sin(this.time * 17) * 0.015 * (this.speed / PLAYER.MAX_SPEED);
    this.wheelSpin += (this.speed * dt) / 0.38;
    for (const wh of this.model.wheels) wh.rotation.x = this.wheelSpin;
  }

  // После аварии: машина останавливается и докручивается.
  freeze(dt, road) {
    this.time += dt;
    this.speed = Math.max(0, this.speed - 45 * dt);
    this.spinV *= Math.exp(-2.2 * dt);
    this.spin += this.spinV * dt;
    this.latVel *= Math.exp(-1.5 * dt);
    this.lat = clamp(this.lat + this.latVel * dt, -(road.halfWidth - 1.25), road.halfWidth - 1.25);
    this.place(road, 0, dt);
    this.model.tailMat.emissiveIntensity = 4.5;
  }

  crash() {
    this.spinV = 3.5 + Math.random() * 2;
  }

  setHeadlight(v) {
    this.head.intensity = v * 260;
  }
}
