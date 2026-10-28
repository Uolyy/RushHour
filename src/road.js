import * as THREE from 'three';
import { TRACK } from './config.js';
import { makeNoise1D, mulberry32, lerp, clamp } from './utils.js';

// Процедурная бесконечная трасса.
// Центральная линия считается из шума (курс + высота), дорога строится
// лентой-чанками: впереди достраиваем, позади выбрасываем.
// Всё живёт в «координатах трассы»: s (дистанция, м) + lat (смещение вбок, м).
// lat > 0 — ВПРАВО по экрану. Число полос меняется на лету (setLaneCount).
export class Road {
  constructor(scene, seed) {
    this.scene = scene;
    const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
    this.roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), roadMat);
    this.roadMesh.receiveShadow = true;
    this.roadMesh.frustumCulled = false;
    scene.add(this.roadMesh);

    const skirtMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
    this.skirtMesh = new THREE.Mesh(new THREE.BufferGeometry(), skirtMat);
    this.skirtMesh.receiveShadow = true;
    this.skirtMesh.frustumCulled = false;
    scene.add(this.skirtMesh);

    this.setLaneCount(4);
    this.reset(seed);
  }

  // Геометрия под число полос: полоса всегда 3.5 м, обочины по 2 м.
  // Обочина: градиент начинается СТРОГО ОТ КРАЯ дороги и уходит наружу
  // (старый баг «градиент не от края» — починен).
  setLaneCount(n) {
    this.laneCount = clamp(Math.round(n), 2, 6);
    this.laneWidth = 3.5;
    this.roadwayHalf = (this.laneCount * this.laneWidth) / 2;
    this.halfWidth = this.roadwayHalf + 2;

    this.columns = [-this.halfWidth];
    this.colTypes = ['curb'];
    this.colPhase = [null];
    const push = (x, type, phase = null) => {
      this.columns.push(x);
      this.colTypes.push(type);
      this.colPhase.push(phase);
    };
    // левая обочина: отбойник -> плавный переход -> дорога
    push(-this.halfWidth + 0.28, 'shoulder', 0.9);
    push(-(this.roadwayHalf + 0.06), 'shoulder', 0.42);
    push(-this.roadwayHalf, 'line');            // сплошная прямо на кромке
    push(-(this.roadwayHalf - 0.75), 'road');  // градиент уходит ВНУТЬ дороги
    for (let k = 1; k < this.laneCount; k++) {
      const x = -this.roadwayHalf + this.laneWidth * k;
      push(x - 0.15, 'road');
      push(x, 'dash', k % 2);                  // пунктиры вразбежку
      push(x + 0.15, 'road');
    }
    push(this.roadwayHalf - 0.75, 'road');
    push(this.roadwayHalf, 'line');
    push(this.roadwayHalf + 0.06, 'shoulder', 0.42);
    push(this.halfWidth - 0.28, 'shoulder', 0.9);
    push(this.halfWidth, 'curb');
    this.lastBuildS = undefined; // перестраиваем полотно при следующем апдейте
  }

  reset(seed) {
    this.seed = seed >>> 0;
    this.noiseH = makeNoise1D(seed, TRACK.CURVE_PERIOD);
    this.noiseE = makeNoise1D(seed + 1013, TRACK.ELEV_PERIOD);
    this.rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    this.n = 0;
    this.x = []; this.y = []; this.z = []; this.h = [];
    this.extendTo(220);
    this.props = [];
    this.propsEndI = 0;
    this.nextLampS = 60;
    this.nextBoardS = 300;
    this.lampSide = 1;
    this.lastBuildS = undefined;
  }

  extendTo(i) {
    while (this.n <= i) this.pushSample();
  }

  pushSample() {
    const i = this.n;
    const s = i * TRACK.STEP;
    const h = TRACK.TURN_MAX * this.noiseH(s);
    const y = TRACK.ELEVATION_AMP * this.noiseE(s);
    if (i === 0) {
      this.x.push(0); this.z.push(0);
    } else {
      // Позицию интегрируем по курсу в средней точке — так трасса не «пилит».
      const hm = TRACK.TURN_MAX * this.noiseH(s - TRACK.STEP / 2);
      this.x.push(this.x[i - 1] + Math.sin(hm) * TRACK.STEP);
      this.z.push(this.z[i - 1] + Math.cos(hm) * TRACK.STEP);
    }
    this.y.push(y);
    this.h.push(h);
    this.n++;
  }

  // Интерполированное состояние трассы на дистанции s.
  // out: { x, y, z, h (курс), c (кривизна) }
  sampleAt(s, out = {}) {
    const fi = Math.floor(s / TRACK.STEP);
    if (fi + 2 > this.n) this.extendTo(fi + 2);
    const i = Math.max(0, Math.min(this.n - 2, fi));
    const t = s / TRACK.STEP - i;
    out.x = lerp(this.x[i], this.x[i + 1], t);
    out.y = lerp(this.y[i], this.y[i + 1], t);
    out.z = lerp(this.z[i], this.z[i + 1], t);
    out.h = lerp(this.h[i], this.h[i + 1], t);
    out.c = (this.h[i + 1] - this.h[i]) / TRACK.STEP;
    return out;
  }

  sampleY(s) {
    this._yTmp = this._yTmp || {};
    return this.sampleAt(s, this._yTmp).y;
  }

  // Мировая точка на дистанции s со смещением lat вбок.
  // out: { px, py, pz, h, c }
  worldOf(s, lat, out = {}) {
    this.sampleAt(s, out);
    out.px = out.x - Math.cos(out.h) * lat;
    out.py = out.y;
    out.pz = out.z + Math.sin(out.h) * lat;
    return out;
  }

  setPalette(p) { this.palette = p; }

  update(playerS) {
    this.extendTo(Math.ceil((playerS + TRACK.AHEAD) / TRACK.STEP) + 3);
    // Перестраиваем, если игрок уехал вперёд ИЛИ откатился назад (рестарт/телепорт).
    if (this.lastBuildS === undefined || Math.abs(playerS - this.lastBuildS) >= TRACK.REBUILD_EVERY) {
      this.lastBuildS = playerS;
      const i0 = Math.max(0, Math.floor((playerS - TRACK.BEHIND) / TRACK.STEP));
      const i1 = Math.ceil((playerS + TRACK.AHEAD) / TRACK.STEP);
      this.buildRoad(i0, i1);
      this.buildSkirts(i0, i1);
      this.updateProps(i0, i1);
    }
  }

  // Цвет колонки c в сегменте i. Палитра — текущая, перестройка каждые 30 м,
  // поэтому переходы биомов на полотне незаметны.
  columnColor(c, i) {
    const p = this.palette;
    const type = this.colTypes[c];
    if (type === 'curb') return Math.floor(i / 4) % 2 === 0 ? p.curb : p.line;
    if (type === 'line') return p.line;
    if (type === 'dash') return (i + this.colPhase[c]) % 2 === 0 ? p.line : p.road;
    if (type === 'shoulder') {
      this._sc = this._sc || new THREE.Color();
      return this._sc.copy(p.road).lerp(p.shoulder, this.colPhase[c]);
    }
    return p.road;
  }

  buildRoad(i0, i1) {
    const C = this.columns.length;
    const m = i1 - i0 + 1;
    const pos = new Float32Array(m * C * 3);
    const col = new Float32Array(m * C * 3);
    const idx = [];
    for (let r = 0; r < m; r++) {
      const i = i0 + r;
      const x = this.x[i], y = this.y[i], z = this.z[i], h = this.h[i];
      const rx = Math.cos(h), rz = -Math.sin(h); // вправо от курса
      for (let c = 0; c < C; c++) {
        const lat = this.columns[c];
        const o = (r * C + c) * 3;
        pos[o] = x + rx * lat;
        pos[o + 1] = y;
        pos[o + 2] = z + rz * lat;
        const cc = this.columnColor(c, i);
        col[o] = cc.r; col[o + 1] = cc.g; col[o + 2] = cc.b;
      }
    }
    for (let r = 0; r < m - 1; r++) {
      for (let c = 0; c < C - 1; c++) {
        const a = r * C + c, b = a + 1, d = a + C, e = a + C + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.roadMesh.geometry.dispose();
    this.roadMesh.geometry = geo;
  }

  buildSkirts(i0, i1) {
    // «Дамбы» по бокам: от кромки дороги вниз до уровня земли.
    const m = i1 - i0 + 1;
    const pos = new Float32Array(m * 4 * 3);
    const col = new Float32Array(m * 4 * 3);
    const idx = [];
    const p = this.palette;
    const topC = p.skirt;
    const botC = p.skirt.clone().multiplyScalar(0.55);
    const W = this.halfWidth;
    const botY = -TRACK.SKIRT_DEPTH;
    for (let r = 0; r < m; r++) {
      const i = i0 + r;
      const x = this.x[i], y = this.y[i], z = this.z[i], h = this.h[i];
      const rx = Math.cos(h), rz = -Math.sin(h);
      const lx = x - rx * W, lz = z - rz * W;
      const gx = x + rx * W, gz = z + rz * W;
      const set = (v, px, py, pz, cc) => {
        const o = v * 3;
        pos[o] = px; pos[o + 1] = py; pos[o + 2] = pz;
        col[o] = cc.r; col[o + 1] = cc.g; col[o + 2] = cc.b;
      };
      set(r * 4, lx, y, lz, topC);
      set(r * 4 + 1, lx, botY, lz, botC);
      set(r * 4 + 2, gx, y, gz, topC);
      set(r * 4 + 3, gx, botY, gz, botC);
    }
    for (let r = 0; r < m - 1; r++) {
      const lt = r * 4, lb = r * 4 + 1, rt = r * 4 + 2, rb = r * 4 + 3;
      const lt2 = lt + 4, lb2 = lb + 4, rt2 = rt + 4, rb2 = rb + 4;
      idx.push(lt, lb, lt2, lt2, lb2, lb);      // левая стенка
      idx.push(rt, rt2, rb, rt2, rb2, rb);      // правая стенка
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.skirtMesh.geometry.dispose();
    this.skirtMesh.geometry = geo;
  }

  updateProps(i0, i1) {
    const p = this.palette;
    // Выбрасываем пропсы, оставшиеся позади окна.
    const minS = i0 * TRACK.STEP;
    if (this.props.length) this.props = this.props.filter((pr) => pr.s >= minS);
    for (let i = Math.max(this.propsEndI, i0); i <= i1; i++) {
      const s = i * TRACK.STEP;
      const cityHere = p.city > 0.12;
      for (const side of [-1, 1]) {
        if (cityHere) {
          // многоэтажки вместо природы
          if (this.rand() < p.city * 0.16) {
            this.props.push(this.makeBuilding(s, side * (this.halfWidth + 10 + this.rand() * 58), p));
          }
          // редкие деревья между домами
          if (this.rand() < 0.03) {
            this.props.push(this.makeProp('tree', s, side * (this.halfWidth + 5 + this.rand() * 26), p));
          }
        } else if (this.rand() < p.density * 0.5) {
          const t = this.rand();
          const type = t < p.treeW ? 'tree' : t < p.treeW + p.rockW ? 'rock' : null;
          if (type) {
            this.props.push(this.makeProp(type, s, side * (this.halfWidth + 4 + this.rand() * 46), p));
          }
        }
      }
      // неон-вывески вдоль дороги — только в городе
      if (cityHere && s >= this.nextBoardS) {
        this.props.push(this.makeBillboard(s, this.lampSide * (this.halfWidth + 5.5)));
        this.nextBoardS = s + 170 + this.rand() * 150;
      }
    }
    // Фонари — равномерно, поочерёдно слева/справа.
    while (this.nextLampS <= i1 * TRACK.STEP) {
      this.props.push(this.makeProp('lamp', this.nextLampS, this.lampSide * (this.halfWidth + 1.6), p));
      this.lampSide *= -1;
      this.nextLampS += 64;
    }
    this.propsEndI = i1 + 1;
  }

  makeProp(type, s, lat, p) {
    this._pTmp = this._pTmp || {};
    const w = this.worldOf(s, lat, this._pTmp);
    const prop = {
      type, s,
      x: w.px, y: -TRACK.SKIRT_DEPTH, z: w.pz,
      rot: this.rand() * Math.PI * 2,
      scale: 1,
    };
    if (type === 'tree') {
      prop.scale = 1.4 + this.rand() * 1.6;
      prop.crown = p.tree.clone().offsetHSL(0, 0, (this.rand() - 0.5) * 0.12);
      prop.trunk = p.trunk;
    } else if (type === 'rock') {
      prop.scale = 0.8 + this.rand() * 2.4;
      prop.rock = p.rock.clone().offsetHSL(0, 0, (this.rand() - 0.5) * 0.1);
    }
    return prop;
  }

  makeBuilding(s, lat, p) {
    this._bTmp = this._bTmp || {};
    const w = this.worldOf(s, lat, this._bTmp);
    return {
      type: 'building', s,
      x: w.px, y: -TRACK.SKIRT_DEPTH, z: w.pz,
      rot: (this.rand() - 0.5) * 0.7,
      w: 8 + this.rand() * 18,
      h: 14 + this.rand() * 44,
      d: 8 + this.rand() * 16,
      color: p.building.clone().offsetHSL(0, 0, (this.rand() - 0.5) * 0.08),
    };
  }

  makeBillboard(s, lat) {
    this._bbTmp = this._bbTmp || {};
    const w = this.worldOf(s, lat, this._bbTmp);
    return {
      type: 'billboard', s,
      x: w.px, y: -TRACK.SKIRT_DEPTH, z: w.pz,
      rot: w.h + Math.PI,   // щит смотрит НАВСТРЕЧУ игроку
      tex: Math.floor(this.rand() * 4),
    };
  }
}
