import * as THREE from 'three';
import { TRACK, PLAYER, TRAFFIC, PICKUP, PARTICLES, MOUSE, RACE } from './config.js';
import { Road } from './road.js';
import { PropPool } from './props.js';
import { Biomes } from './biomes.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { GameAudio } from './audio.js';
import { Music } from './music.js';
import { HUD } from './hud.js';
import { SkyDome } from './sky.js';
import { Snowfall } from './snow.js';
import { SpeedLines } from './speedlines.js';
import { ParticlePool, Debris, flame, tireSmoke, sparks, yawRot } from './particles.js';
import { PostFX } from './postfx.js';
import { Minimap } from './minimap.js';
import { NitroPickups } from './pickups.js';
import { Ghost, GhostRecorder } from './ghost.js';
import { RaceNet } from './net.js';
import { Rivals } from './rivals.js';
import { clamp, damp } from './utils.js';

// --- Рендер ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe8c8a8, 60, 640);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2400);
scene.add(camera); // камера в графе сцены — на ней висят спидлайны

// --- Небо: купол + солнце/луна + звёзды ---
const sky = new SkyDome(scene);

// --- Свет ---
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
sun.shadow.camera.near = 20; sun.shadow.camera.far = 460;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfd8e8, 0x7d9a6f, 0.6);
scene.add(hemi);
const amb = new THREE.AmbientLight(0x8a9bb8, 0.5);
scene.add(amb);

// --- Земля (следует за игроком, прячется в тумане) ---
const terrain = new THREE.Mesh(
  new THREE.PlaneGeometry(2400, 2400),
  new THREE.MeshStandardMaterial({ color: 0x7d9a6f, roughness: 1, flatShading: true })
);
terrain.rotation.x = -Math.PI / 2;
terrain.position.y = -TRACK.SKIRT_DEPTH;
terrain.receiveShadow = true;
scene.add(terrain);

// --- Игровые объекты ---
const hud = new HUD();
const audio = new GameAudio();
const music = new Music();

const seed = (Math.random() * 1e9) | 0;
const road = new Road(scene, seed);
const biomes = new Biomes();
road.setPalette(biomes.get(0));
const LANES_KEY = 'rushhour_lanes';
const savedLanes = localStorage.getItem(LANES_KEY);
let laneCount = clamp(savedLanes !== null && Number.isFinite(Number(savedLanes)) ? Number(savedLanes) : 4, 2, 6);
road.setLaneCount(laneCount);
const propPool = new PropPool(scene);
const player = new Player(scene);
const traffic = new Traffic(scene);
const TRAFFIC_KEY = 'rushhour_traffic';
const savedTraffic = localStorage.getItem(TRAFFIC_KEY);
let trafficCount = clamp(savedTraffic !== null && Number.isFinite(Number(savedTraffic)) ? Number(savedTraffic) : TRAFFIC.COUNT, 0, TRAFFIC.MAX);
traffic.setCount(trafficCount);

// --- Эффекты и системы ---
const postfx = new PostFX(renderer, scene, camera);
const snow = new Snowfall(scene);
const speedlines = new SpeedLines(camera);
const fxAdd = new ParticlePool(scene, PARTICLES.MAX_ADD, true);
const fxSoft = new ParticlePool(scene, PARTICLES.MAX_SOFT, false);
const debris = new Debris(scene);
const minimap = new Minimap();
const pickups = new NitroPickups(scene);
const ghost = new Ghost(scene);
const recorder = new GhostRecorder();
const rivals = new Rivals(scene);
const net = new RaceNet();

// --- Финишная арка: видна только в сетевой гонке на время ---
const finishGate = new THREE.Group();
{
  const postMat = new THREE.MeshStandardMaterial({ color: 0x161a24, roughness: 0.55, metalness: 0.2 });
  const postGeo = new THREE.BoxGeometry(0.55, 7.2, 0.55);
  const postL = new THREE.Mesh(postGeo, postMat); postL.name = 'postL'; postL.position.y = 3.6;
  const postR = new THREE.Mesh(postGeo, postMat); postR.name = 'postR'; postR.position.y = 3.6;
  // Клетчатая текстура: баннер с надписью и полоса на полотне.
  const checkerTex = (w, h, cell, draw) => {
    const cnv = document.createElement('canvas');
    cnv.width = w; cnv.height = h;
    const g = cnv.getContext('2d');
    for (let y = 0; y < h / cell; y++) for (let x = 0; x < w / cell; x++) {
      g.fillStyle = (x + y) % 2 ? '#10141d' : '#f2f3f5';
      g.fillRect(x * cell, y * cell, cell, cell);
    }
    if (draw) draw(g);
    const tex = new THREE.CanvasTexture(cnv);
    tex.anisotropy = 4;
    return tex;
  };
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(15.5, 2.4),
    new THREE.MeshBasicMaterial({ map: checkerTex(512, 80, 20, (g) => {
      g.fillStyle = '#ffd257';
      g.font = 'bold 56px Chakra Petch, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('ФИНИШ', 256, 40);
    }) })
  );
  banner.name = 'banner';
  banner.position.set(0, 6.1, -0.3);
  banner.rotation.y = Math.PI; // смотрит навстречу едущим
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(15.5, 3),
    new THREE.MeshBasicMaterial({ map: checkerTex(512, 96, 32) })
  );
  strip.name = 'strip';
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.07;
  finishGate.add(postL, postR, banner, strip);
}
finishGate.visible = false;
scene.add(finishGate);

// Поставить арку на дистанции финиша (вызывать после resetWorld).
function placeFinishGate() {
  if (!race || !race.active || race.mode !== 'timed') { finishGate.visible = false; return; }
  road.extendTo(Math.ceil(RACE.LENGTH / TRACK.STEP) + 4);
  const w = road.worldOf(RACE.LENGTH, 0, {});
  finishGate.position.set(w.px, w.py, w.pz);
  finishGate.rotation.y = w.h;
  const half = road.roadwayHalf;
  finishGate.getObjectByName('postL').position.x = -(half + 1);
  finishGate.getObjectByName('postR').position.x = half + 1;
  finishGate.getObjectByName('banner').scale.x = (half * 2 + 3) / 15.5;
  finishGate.getObjectByName('strip').scale.x = (half * 2) / 15.5;
  finishGate.visible = true;
}

// --- Настройки (сохраняются в localStorage) ---
const loadSetting = (key, def) => {
  const v = localStorage.getItem(key);
  return v === null ? def : v;
};
const settings = {
  quality: loadSetting('rushhour_quality', 'high') === 'low' ? 'low' : 'high',
  music: loadSetting('rushhour_music', '1') !== '0',
  volume: clamp(parseInt(loadSetting('rushhour_volume', '6'), 10) || 6, 0, 10),
  ghostOn: loadSetting('rushhour_ghoston', '0') === '1',
};
postfx.setEnabled(settings.quality === 'high');

// Миграция со старых версий: убираем ключи удалённых режимов.
localStorage.removeItem('rushhour_gamemode');
localStorage.removeItem('rushhour_ta_best');
localStorage.removeItem('rushhour_ta_ghost');

let best = Number(localStorage.getItem('rushhour_best') || 0);
hud.setBest(best);

// --- Ник и общая таблица рекордов ---
const NICK_KEY = 'rushhour_nick';
let myNick = localStorage.getItem(NICK_KEY) || '';
hud.setNick(myNick);
const auth = { done: false }; // ник выбран (или «без рейтинга») в этом запуске

function refreshLeaderboard() {
  fetch('/api/leaderboard')
    .then((r) => r.json())
    .then((d) => hud.renderLeaderboard(d.rows, myNick))
    .catch(() => { /* сервер недоступен — таблица просто не обновится */ });
}

async function submitScore(nick, score) {
  if (!nick) return; // гость — без рейтинга
  try {
    const r = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nick, score }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      refreshLeaderboard();
      hud.toast('ЗАПИСАНО: ' + d.rank + '-Е МЕСТО ИЗ ' + d.total);
    } else if (r.status === 404) {
      hud.toast('РЕКОРДЫ НЕ РАБОТАЮТ — ПЕРЕЗАПУСТИ run.bat');
    } else {
      hud.toast('СЕРВЕР РЕКОРДОВ НЕ ОТВЕЧАЕТ — СМ. ОКНО «RUSH HOUR server»');
    }
  } catch (e) {
    hud.toast('СЕРВЕР НЕДОСТУПЕН — РЕЗУЛЬТАТ НЕ ЗАПИСАН');
  }
}

// Экран входа: спрашиваем ник при каждом заходе.
function showAuthGate() {
  hud.showOverlay('RUSH HOUR', '', '');
  hud.setMsg('ВПИШИ НИК — ИЛИ ИГРАЙ БЕЗ РЕЙТИНГА');
  hud.showAuth(true);
  hud.setPanel(false);
  hud.setOverButtons(false);
  hud.setPlayVisible(false);
}

function enterMenu() {
  hud.showAuth(false);
  hud.setAuthStatus('');
  hud.setPanel(true);
  hud.setMsg('');
  hud.setPlayLabel('ИГРАТЬ');
  hud.setRaceUi('menu');
  hud.setMode(mode, true);
}

// --- Гонка по сети ---
const race = {
  active: false,  // заезд идёт
  inLobby: false, // стоим в комнате
  myId: 0,
  hostId: 0,
  code: '',
  players: [],    // [{id, nick, host}]
  crashed: new Set(),
  finished: new Set(), // финишировавшие (гонка на время)
  finishedMe: false,
  mode: 'endless',     // 'endless' | 'timed'
  finishS: Infinity,   // дистанция финиша (timed)
  milestone: 0,        // сколько подсказок «ФИНИШ ЧЕРЕЗ ...» уже показали
  isHost: false,
};
// Все, кто закончил заезд (финишировал или разбился) — для списка игроков.
const raceDoneSet = () => new Set([...race.crashed, ...race.finished]);
let stateTimer = 0, trafficTimer = 0;

// --- Состояние партии ---
let state = 'menu'; // menu | play | over | pause
let mode = 'keys'; // 'keys' | 'mouse'
const mouse = { x: 0.5, virt: 0, gas: false, brake: false }; // virt: виртуальный курсор (-1..1) для pointer lock
let score = 0, combo = 0, comboTimer = 0;
let shake = 0, overTimer = 0, overShown = false, overTitle = 'CRASHED';
let timeScale = 1;
const tmpW = {};

function resetWorld(newSeed) {
  road.reset(newSeed);
  player.reset();
  player.place(road);
  road.setPalette(biomes.get(player.s));
  road.update(player.s);
  propPool.sync(road.props);
  traffic.reset(player.s, road);
  pickups.reset(player.s, road);
  score = 0; combo = 0; comboTimer = 0;
  shake = 0; overTimer = 0; overShown = false; timeScale = 1;
  fxAdd.clear();
  fxSoft.clear();
  debris.clear();
  finishGate.visible = false;
  applyEnv(biomes.get(player.s));
  // Камеру ставим за машиной сразу, без полёта через полкарты.
  const fx = Math.sin(player.wh), fz = Math.cos(player.wh);
  camPos.set(player.wx - fx * 8.5, player.wy + 5.0, player.wz - fz * 8.5);
}

// --- Применение палитры биома к сцене ---
const sunDir = new THREE.Vector3();
function applyEnv(p) {
  sky.apply(p);
  scene.fog.color.copy(p.fog);
  scene.fog.far = p.fogFar;
  scene.fog.near = p.fogFar * 0.12;
  sun.color.copy(p.sun);
  sun.intensity = p.sunInt;
  sunDir.set(Math.cos(p.sunAz) * Math.cos(p.sunEl), Math.sin(p.sunEl), Math.sin(p.sunAz) * Math.cos(p.sunEl));
  sun.position.copy(player.group.position).addScaledVector(sunDir, 200);
  sun.target.position.copy(player.group.position);
  amb.color.copy(p.amb); amb.intensity = p.ambInt;
  hemi.color.copy(p.hemiSky); hemi.groundColor.copy(p.hemiGround); hemi.intensity = p.hemiInt;
  terrain.material.color.copy(p.ground);
  propPool.setGlow(p.lampGlow, p.neon);
  player.setHeadlight(p.headlight);
  snow.setIntensity(p.snow);
}

// --- Камера ---
const camPos = new THREE.Vector3(0, 5, -14);
const camLook = new THREE.Vector3();
let fov = 62;
function updateCamera(dt, menu) {
  const p = player;
  if (menu) {
    // На старте — медленный облёт машинки.
    const t = performance.now() * 0.00018;
    camera.position.set(p.wx + Math.sin(t) * 10, p.wy + 3.0, p.wz + Math.cos(t) * 10);
    camLook.set(p.wx, p.wy + 1.2, p.wz);
    camera.lookAt(camLook);
    return;
  }
  const fx = Math.sin(p.wh), fz = Math.cos(p.wh);
  const dx = p.wx - fx * 8.5, dy = p.wy + 5.0, dz = p.wz - fz * 8.5;
  const k = 1 - Math.exp(-7 * dt);
  camPos.x += (dx - camPos.x) * k;
  camPos.y += (dy - camPos.y) * k;
  camPos.z += (dz - camPos.z) * k;
  camera.position.copy(camPos);
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.4);
    const a = shake * shake * 0.8;
    camera.position.x += (Math.random() - 0.5) * a;
    camera.position.y += (Math.random() - 0.5) * a;
    camera.position.z += (Math.random() - 0.5) * a;
  }
  camLook.set(p.wx + fx * 16, p.wy + 1.3, p.wz + fz * 16);
  camera.lookAt(camLook);
  const targetFov = 62 + p.speedNorm * 13 + (p.boosting ? 7 : 0);
  fov = damp(fov, targetFov, 3.5, dt);
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

// --- Старт/рестарт заезда ---
function beginRun() {
  audio.init();
  music.init(audio.ctx);
  audio.setVolume(settings.volume / 10);
  music.setVolume(settings.volume / 10 * 0.9);
  music.setMuted(!settings.music);
  if (settings.music) music.start();
  music.duck(1);
  resetWorld((Math.random() * 1e9) | 0);
  state = 'play';
  hud.setPanel(false);
  hud.hideOverlay();
  hud.setPlaying(true);
  mouse.virt = 0;
  ghost.enabled = settings.ghostOn;
  ghost.loadData(localStorage.getItem('rushhour_ghost'));
  ghost.start();
  recorder.start(player.s, player.lat);
  if (mode === 'mouse') lockPointer();
}

function startGame() {
  if (!auth.done) return;
  beginRun();
}

function restart() {
  beginRun();
}

// --- Сетевая гонка ---
function beginRace(cfg) {
  audio.init();
  music.init(audio.ctx);
  audio.setVolume(settings.volume / 10);
  music.setVolume(settings.volume / 10 * 0.9);
  music.setMuted(!settings.music);
  if (settings.music) music.start();
  music.duck(1);

  race.active = true;
  race.inLobby = false;
  race.crashed.clear();
  race.finished.clear();
  race.finishedMe = false;
  race.milestone = 0;
  race.mode = cfg.mode === 'timed' ? 'timed' : 'endless';
  race.finishS = race.mode === 'timed' ? RACE.LENGTH : Infinity;
  laneCount = cfg.lanes;
  trafficCount = cfg.traffic;
  road.setLaneCount(laneCount);
  resetWorld(cfg.seed);
  placeFinishGate();

  // Стартовая решётка: рассредотачиваем машины, иначе все стартуют в одной
  // точке и мгновенно сталкиваются (s=30, lat=0 у всех).
  const lim = road.halfWidth - 1.25;
  const slot = Math.max(0, race.players.findIndex((p) => p.id === race.myId));
  const spacing = race.players.length > 1 ? Math.min(2.4, (2 * lim) / (race.players.length - 1)) : 0;
  player.lat = clamp((slot - (race.players.length - 1) / 2) * spacing, -lim, lim);
  player.latVel = 0;
  player.place(road);

  if (race.isHost) {
    traffic.setRemote(false);
    traffic.setCount(trafficCount, player.s, road);
    traffic.reset(player.s, road);
    traffic.effCount = trafficCount;
  } else {
    // Трафик приходит снапшотами от хоста — локальная симуляция выключена.
    traffic.setRemote(true);
    traffic.setCount(0);
    traffic.applySnapshot([]);
  }

  rivals.sync(race.players.filter((p) => p.id !== race.myId), road);
  ghost.enabled = false;
  ghost.stop();

  state = 'play';
  hud.setPanel(false);
  hud.hideOverlay();
  hud.setPlaying(true);
  hud.setRaceUi('menu');
  mouse.virt = 0;
  hud.setTrafficLabel(trafficCount);
  hud.setLanesLabel(laneCount);
  stateTimer = 0;
  trafficTimer = 0;
  hud.toast(race.mode === 'timed' ? 'ГОНКА НА ВРЕМЯ — ФИНИШ ЧЕРЕЗ ' + RACE.LENGTH + ' М' : 'ГОНКА!');
  if (mode === 'mouse') lockPointer();
}

// Вернуть мир к обычной конфигурации после гонки.
function endRaceCleanup() {
  race.active = false;
  race.inLobby = false;
  race.crashed.clear();
  race.finished.clear();
  race.finishedMe = false;
  race.milestone = 0;
  race.mode = 'endless';
  race.finishS = Infinity;
  rivals.clear();
  traffic.setRemote(false);
  net.leave();
  net.disconnect();
  laneCount = clamp(Number(localStorage.getItem(LANES_KEY) ?? 4), 2, 6);
  trafficCount = clamp(Number(localStorage.getItem(TRAFFIC_KEY) ?? TRAFFIC.COUNT), 0, TRAFFIC.MAX);
  road.setLaneCount(laneCount);
  resetWorld(seed);
  traffic.setCount(trafficCount, player.s, road);
  traffic.effCount = trafficCount;
  hud.setRaceStatus('');
  hud.renderRacePlayers([], 0, 0);
  hud.setRaceUi('menu');
  hud.setTrafficLabel(trafficCount);
  hud.setLanesLabel(laneCount);
  hud.setBest(best);
  refreshLeaderboard();
}

function exitRaceToMenu() {
  endRaceCleanup();
  state = 'menu';
  hud.setPlaying(false);
  hud.setPanel(true);
  hud.setPlayLabel('ИГРАТЬ');
  hud.showOverlay('RUSH HOUR', '', '');
  hud.setMode(mode, true);
}

function showRaceResults(rows) {
  exitRaceToMenu();
  const table = rows.map((r, i) => (i + 1) + '. ' + r.nick + ' — ' + r.score).join('   ·   ');
  hud.showOverlay('РЕЗУЛЬТАТЫ ГОНКИ', 'PRESS ANY KEY', table);
}

function abortRace(reason) {
  if (!race.active && !race.inLobby) return;
  exitRaceToMenu();
  hud.setRaceStatus(reason || '');
}

// Обработка сообщений сервера
net.onMessage = (msg) => {
  switch (msg.t) {
    case 'joined':
      race.inLobby = true;
      race.myId = msg.you;
      race.code = msg.code;
      race.players = msg.players;
      race.hostId = msg.hostId;
      race.isHost = msg.hostId === race.myId;
      hud.setRaceStatus('КОМНАТА: ' + msg.code);
      hud.renderRacePlayers(msg.players, msg.hostId, race.myId);
      hud.setRaceUi(msg.hostId === race.myId ? 'lobby-host' : 'lobby-guest');
      break;
    case 'lobby':
      race.players = msg.players;
      race.hostId = msg.hostId;
      race.isHost = msg.hostId === race.myId;
      hud.renderRacePlayers(msg.players, msg.hostId, race.myId);
      hud.setRaceStatus((race.inLobby ? 'КОМНАТА: ' + race.code + ' · ' : '') + 'ИГРОКОВ: ' + msg.players.length);
      hud.setRaceUi(race.inLobby ? (race.isHost ? 'lobby-host' : 'lobby-guest') : 'menu');
      break;
    case 'error':
      hud.setRaceStatus('ОШИБКА: ' + msg.msg);
      break;
    case 'started':
      beginRace(msg);
      break;
    case 'state':
      if (race.active) rivals.setState(msg.id, msg.s, msg.lat, msg.v);
      break;
    case 'traffic':
      if (race.active && !race.isHost) traffic.applySnapshot(msg.arr);
      break;
    case 'crashed': {
      race.crashed.add(msg.id);
      rivals.markCrashed(msg.id);
      const p = race.players.find((x) => x.id === msg.id);
      if (p && msg.id !== race.myId) hud.toast(p.nick + ' ВЫБЫЛ');
      hud.renderRacePlayers(race.players, race.hostId, race.myId, raceDoneSet());
      break;
    }
    case 'finished': {
      // Соперник доехал до финиша (гонка на время).
      race.finished.add(msg.id);
      rivals.markCrashed(msg.id); // больше не участвует в коллизиях
      const p = race.players.find((x) => x.id === msg.id);
      if (p && msg.id !== race.myId) hud.toast(p.nick + ' ФИНИШИРОВАЛ');
      hud.renderRacePlayers(race.players, race.hostId, race.myId, raceDoneSet());
      break;
    }
    case 'results':
      showRaceResults(msg.rows);
      break;
    case 'aborted':
      abortRace(msg.msg || 'ГОНКА ПРЕРВАНА');
      break;
  }
};
net.onClose = () => {
  if (race.active || race.inLobby) abortRace('СЕРВЕР НЕДОСТУПЕН');
};

// Пауза: мир заморожен, настройки доступны; любой ключ/клик — продолжение заезда.
function pauseGame() {
  if (document.pointerLockElement) document.exitPointerLock();
  state = 'pause';
  hud.setPlaying(false);
  hud.setPanel(true);
  hud.setPlayLabel('ПРОДОЛЖИТЬ');
  hud.showOverlay('PAUSED', '', '');
  hud.setMode(mode, true);
  // ЗАНОВО — только в бесконечном режиме; В МЕНЮ — всегда (в гонке это выход из гонки).
  hud.setOverButtons(true, !race.active);
  music.duck(0.35);
}

function resumeGame() {
  state = 'play';
  hud.setPanel(false);
  hud.hideOverlay();
  hud.setPlaying(true);
  hud.setPlayLabel('ИГРАТЬ');
  music.duck(1);
  if (mode === 'mouse') lockPointer();
}

// Из аварии — в меню (сольный режим).
function gameOverToMenu() {
  state = 'menu';
  hud.setPlaying(false);
  hud.setPanel(true);
  hud.setOverButtons(false);
  hud.setPlayLabel('ИГРАТЬ');
  hud.showOverlay('RUSH HOUR', '', '');
  hud.setMode(mode, true);
  hud.setBest(best);
}

function finishRace() {
  // Финиш в гонке на время: машина плавно тормозит (шаг stepOver), результат уходит на сервер.
  race.finishedMe = true;
  race.finished.add(race.myId);
  state = 'over';
  overTimer = 0;
  overShown = false;
  overTitle = 'ФИНИШ';
  timeScale = 1;
  music.duck(0.25);
  net.finish(Math.floor(score));
}

function gameOver(reason) {
  state = 'over';
  overTimer = 0;
  overShown = false;
  overTitle = 'CRASHED';
  timeScale = 0.22; // слоу-мо на момент аварии
  music.duck(0.25);
  shake = 1;
  player.crash();
  audio.crash();
  postfx.bump(0.9);
  const [fwdX, , fwdZ] = yawRot(0, 0, 1, player.wh);
  debris.burst(player.wx, player.wy, player.wz, fwdX, fwdZ, player.wy);
  sparks(fxAdd, player.wx, player.wy, player.wz, 36, true);
  // Рекорд и призрак (в сетевой гонке рекорды не пишем).
  const metric = Math.floor(score);
  if (race.active) {
    race.crashed.add(race.myId);
    net.crash(metric);
    hud.renderRacePlayers(race.players, race.hostId, race.myId, raceDoneSet());
  } else {
    const isRecord = metric > best;
    if (isRecord) {
      best = metric;
      localStorage.setItem('rushhour_best', String(best));
      localStorage.setItem('rushhour_ghost', JSON.stringify(recorder.finish(metric)));
      hud.setBest(metric);
      hud.toast('НОВЫЙ РЕКОРД: ' + metric);
    }
    submitScore(myNick, metric);
  }
}

function adjustLanes(d) {
  laneCount = clamp(laneCount + d, 2, 6);
  localStorage.setItem(LANES_KEY, String(laneCount));
  road.setLaneCount(laneCount);
  resetWorld((Math.random() * 1e9) | 0); // в меню — новая трасса под новую ширину
  if (state === 'pause') {
    // Ширина дороги изменилась — заезд начинается заново, пауза сбрасывается.
    state = 'menu';
    hud.setOverButtons(false);
    hud.showOverlay('RUSH HOUR', '', '');
    hud.setMode(mode, true);
  }
  hud.setLanesLabel(laneCount);
}

function adjustTraffic(d) {
  trafficCount = clamp(trafficCount + d, 0, TRAFFIC.MAX);
  localStorage.setItem(TRAFFIC_KEY, String(trafficCount));
  traffic.setCount(trafficCount, player.s, road);
  traffic.effCount = trafficCount;
  hud.setTrafficLabel(trafficCount);
  hud.setLanesLabel(laneCount);
}

// Сброс к стандартной конфигурации: трафик 14, полосы 4, бесконечный режим.
function applyStandard() {
  trafficCount = 14;
  laneCount = 4;
  localStorage.setItem(TRAFFIC_KEY, String(trafficCount));
  localStorage.setItem(LANES_KEY, String(laneCount));
  traffic.setCount(trafficCount, player.s, road);
  traffic.effCount = trafficCount;
  road.setLaneCount(laneCount);
  resetWorld((Math.random() * 1e9) | 0);
  if (state === 'pause') {
    state = 'menu';
    hud.setOverButtons(false);
    hud.showOverlay('RUSH HOUR', '', '');
    hud.setMode(mode, true);
  }
  hud.setTrafficLabel(trafficCount);
  hud.setLanesLabel(laneCount);
}

// Захват курсора: прячет системный курсор, движение мыши не упирается в края экрана.
function lockPointer() {
  const el = renderer.domElement;
  if (!el.requestPointerLock) return;
  try {
    const pr = el.requestPointerLock();
    if (pr && pr.catch) pr.catch(() => {});
  } catch (err) { /* не удалось — работаем фолбэком */ }
}

function toggleMode() {
  mode = mode === 'keys' ? 'mouse' : 'keys';
  hud.setMode(mode, state === 'menu' || state === 'pause');
  if (state === 'play') {
    if (mode === 'mouse') {
      mouse.virt = clamp(player.lat / (TRACK.HALF_WIDTH - 1.25), -1, 1); // синхронизация с текущей позицией
      lockPointer();
    } else if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
}

// Сборка эффективного ввода под текущий режим управления.
function effectiveInput() {
  if (mode === 'mouse') {
    const steer = document.pointerLockElement ? mouse.virt : mouse.x * 2 - 1;
    return { gas: mouse.gas, brake: mouse.brake, nitro: input.nitro, steerTarget: steer };
  }
  return { gas: input.gas, brake: input.brake, nitro: input.nitro, left: input.left, right: input.right, steerTarget: null };
}

// --- Ввод ---
const input = { left: false, right: false, gas: false, brake: false, nitro: false };
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'gas', KeyW: 'gas',
  ArrowDown: 'brake', KeyS: 'brake',
  Space: 'nitro',
};

function saveSettings() {
  localStorage.setItem('rushhour_quality', settings.quality);
  localStorage.setItem('rushhour_music', settings.music ? '1' : '0');
  localStorage.setItem('rushhour_volume', String(settings.volume));
  localStorage.setItem('rushhour_ghoston', settings.ghostOn ? '1' : '0');
}

function applyMusicSettings() {
  music.setMuted(!settings.music);
  if (settings.music) music.start();
  else music.stop();
}

addEventListener('keydown', (e) => {
  // Не мешаем набирать ник/код комнаты.
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    if (e.code === 'Escape') e.target.blur();
    return;
  }
  if (KEYS[e.code]) { input[KEYS[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Escape') {
    if (state === 'play') pauseGame();        // гонка жива — ставим на паузу
    else if (state === 'pause') resumeGame(); // ESC — снятие паузы
    else if (state === 'over' && overTimer > 0.9) {
      if (race.active) exitRaceToMenu();      // ESC после аварии — в меню
      else gameOverToMenu();
    }
    return;
  }
  // Хоткеи: не стартуют игру, только переключают настройки.
  if (!auth.done) return; // пока не выбран ник — управление меню закрыто
  if (e.code === 'KeyN') {
    settings.music = !settings.music;
    applyMusicSettings();
    saveSettings();
    hud.updateMenuLabels(settings);
    return;
  }
  if (e.code === 'KeyG') {
    settings.ghostOn = !settings.ghostOn;
    ghost.enabled = settings.ghostOn;
    if (state !== 'play') {
      ghost.loadData(localStorage.getItem('rushhour_ghost'));
      ghost.start();
    }
    saveSettings();
    hud.updateMenuLabels(settings);
    return;
  }
  if (e.code === 'KeyP') {
    settings.quality = settings.quality === 'high' ? 'low' : 'high';
    postfx.setEnabled(settings.quality === 'high');
    saveSettings();
    hud.updateMenuLabels(settings);
    return;
  }
  if (e.code === 'KeyM') { toggleMode(); return; } // в меню не стартует — только смена режима
  if (state === 'menu' && !race.inLobby) startGame();
  else if (state === 'pause') resumeGame();
  else if (state === 'over' && overTimer > 0.9) {
    if (race.active) exitRaceToMenu();
    else if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') restart();
  }
});
addEventListener('pointermove', (e) => {
  if (document.pointerLockElement) {
    // Захват курсора: руль = СКОРОСТЬ движения мыши, привязанная к виртуальному курсору.
    mouse.virt = clamp(mouse.virt + e.movementX * 0.003 * MOUSE.GAIN, -1, 1);
  } else {
    mouse.x = e.clientX / innerWidth;
  }
});
addEventListener('pointerdown', (e) => {
  // Клик по элементам меню — не газ и не «продолжить заезд».
  const ui = e.target && e.target.closest && e.target.closest('#menu-panel, #over-buttons, #leaderboard, #check-btn');
  if (ui) return;
  if (e.button === 0) mouse.gas = true;
  if (e.button === 2) mouse.brake = true;
  if (state === 'play' && mode === 'mouse' && !document.pointerLockElement) lockPointer(); // переподхват после потери захвата
  if (state === 'menu' && !race.inLobby) startGame();
  else if (state === 'pause') resumeGame();
});
addEventListener('pointerup', (e) => {
  if (e.button === 0) mouse.gas = false;
  if (e.button === 2) mouse.brake = false;
});
addEventListener('contextmenu', (e) => e.preventDefault()); // ПКМ — тормоз, а не меню
document.addEventListener('pointerlockchange', () => {
  // Esc при захваченном курсоре браузер разлочивает сам — считаем это паузой.
  if (!document.pointerLockElement && state === 'play' && mode === 'mouse') pauseGame();
});
document.getElementById('traffic-minus').addEventListener('click', () => adjustTraffic(-1));
document.getElementById('lanes-minus').addEventListener('click', () => adjustLanes(-1));
document.getElementById('lanes-plus').addEventListener('click', () => adjustLanes(1));
document.getElementById('traffic-plus').addEventListener('click', () => adjustTraffic(1));
document.getElementById('standard-toggle').addEventListener('click', () => {
  applyStandard();
  saveSettings();
  hud.updateMenuLabels(settings);
});

// --- Вход по нику, кнопки ИГРАТЬ и кнопки после аварии ---
hud.el.nickInput.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') hud.el.authLogin.click();
});
hud.el.authLogin.addEventListener('click', () => {
  const nick = hud.el.nickInput.value.trim();
  if (!nick) { hud.setAuthStatus('ВПИШИ НИК ИЛИ НАЖМИ «ИГРАТЬ БЕЗ РЕЙТИНГА»'); return; }
  hud.setAuthStatus('ПРОВЕРЯЕМ...');
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick }),
  })
    .then((r) => {
      if (r.status === 404) throw new Error('NO_PROXY');   // страница есть, /api нет — старый сервер без прокси
      if (r.status >= 500) throw new Error('NO_API');      // прокси есть, node-сервер не отвечает
      return r.json();
    })
    .then((p) => {
      if (p.error) { hud.setAuthStatus(p.error); return; }
      myNick = p.nick;
      localStorage.setItem(NICK_KEY, p.nick);
      hud.setNick(p.nick);
      auth.done = true;
      refreshLeaderboard();
      enterMenu();
    })
    .catch((e) => {
      if (e && e.message === 'NO_PROXY') {
        hud.setAuthStatus('СТАРЫЙ СЕРВЕР БЕЗ РЕКОРДОВ — ЗАКРОЙ СТАРЫЕ ОКНА КОНСОЛИ И ЗАПУСТИ run.bat ЗАНОВО');
      } else if (e && e.message === 'NO_API') {
        hud.setAuthStatus('СЕРВЕР РЕКОРДОВ НЕ ОТВЕЧАЕТ — ПОСМОТРИ ОШИБКУ В ОКНЕ «RUSH HOUR server»');
      } else {
        hud.setAuthStatus('СЕРВЕР НЕДОСТУПЕН — ЗАПУСТИ run.bat ИЛИ ИГРАЙ БЕЗ РЕЙТИНГА');
      }
    });
});
hud.el.authGuest.addEventListener('click', () => {
  myNick = '';
  auth.done = true;
  enterMenu();
});
hud.el.playBtn.addEventListener('click', () => {
  if (!auth.done) return;
  if (race.inLobby) { exitRaceToMenu(); return; } // выход из лобби и обычное меню
  if (state === 'menu') startGame();
  else if (state === 'pause') resumeGame();
});
hud.el.overRestart.addEventListener('click', () => {
  if (race.active) return; // сетевую гонку рестартить в одиночку нельзя
  if (state === 'over' && overTimer > 0.9) restart();
  else if (state === 'pause') restart(); // рестарт бесконечного режима прямо из паузы
});
hud.el.overMenu.addEventListener('click', () => {
  if (state === 'pause') {
    // Выход из паузы: из гонки — с выходом из комнаты, из обычного заезда — в меню.
    if (race.active) exitRaceToMenu();
    else gameOverToMenu();
    return;
  }
  if (state === 'over' && overTimer > 0.9) {
    if (race.active) exitRaceToMenu();
    else gameOverToMenu();
  }
});
document.getElementById('race-create').addEventListener('click', () => {
  if (race.inLobby) endRaceCleanup(); // уже стоим в комнате — выходим и создаём новую
  net.create(myNick);
  hud.setRaceStatus('СОЗДАЁМ КОМНАТУ...');
});
document.getElementById('race-join').addEventListener('click', () => {
  const row = hud.el.raceCodeRow;
  if (row.style.display === 'none' || !row.style.display) {
    if (race.inLobby) endRaceCleanup(); // из чужой комнаты — сначала выходим
    row.style.display = 'flex';
    hud.el.raceCode.focus();
    return;
  }
  const code = hud.el.raceCode.value.trim().toUpperCase();
  if (code.length === 4) {
    if (race.inLobby) endRaceCleanup();
    net.join(code, myNick);
    hud.setRaceStatus('ПОДКЛЮЧЕНИЕ К ' + code + '...');
  }
});
document.getElementById('race-start').addEventListener('click', () => {
  if (race.isHost && race.inLobby) net.start(laneCount, trafficCount, raceMode);
});

// --- Режим сетевой гонки: бесконечная / на время ---
let raceMode = loadSetting('rushhour_racemode', 'endless') === 'timed' ? 'timed' : 'endless';
const setRaceMode = (m) => {
  raceMode = m;
  localStorage.setItem('rushhour_racemode', m);
  hud.setRaceMode(m);
};
hud.setRaceMode(raceMode);
hud.el.raceModeEndless.addEventListener('click', () => setRaceMode('endless'));
hud.el.raceModeTimed.addEventListener('click', () => setRaceMode('timed'));

document.getElementById('ghost-toggle').addEventListener('click', () => {
  settings.ghostOn = !settings.ghostOn;
  ghost.enabled = settings.ghostOn;
  if (state !== 'play') {
    ghost.loadData(localStorage.getItem('rushhour_ghost'));
    ghost.start();
  }
  saveSettings();
  hud.updateMenuLabels(settings);
});
document.getElementById('music-toggle').addEventListener('click', () => {
  settings.music = !settings.music;
  applyMusicSettings();
  saveSettings();
  hud.updateMenuLabels(settings);
});
document.getElementById('quality-toggle').addEventListener('click', () => {
  settings.quality = settings.quality === 'high' ? 'low' : 'high';
  postfx.setEnabled(settings.quality === 'high');
  saveSettings();
  hud.updateMenuLabels(settings);
});
document.getElementById('volume-minus').addEventListener('click', () => {
  settings.volume = clamp(settings.volume - 1, 0, 10);
  audio.setVolume(settings.volume / 10);
  music.setVolume(settings.volume / 10 * 0.9);
  saveSettings();
  hud.updateMenuLabels(settings);
});
document.getElementById('volume-plus').addEventListener('click', () => {
  settings.volume = clamp(settings.volume + 1, 0, 10);
  audio.setVolume(settings.volume / 10);
  music.setVolume(settings.volume / 10 * 0.9);
  saveSettings();
  hud.updateMenuLabels(settings);
});

addEventListener('blur', () => {
  input.left = input.right = input.gas = input.brake = input.nitro = false;
  mouse.gas = mouse.brake = false;
});
addEventListener('keyup', (e) => {
  if (KEYS[e.code]) input[KEYS[e.code]] = false;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postfx.setSize(innerWidth, innerHeight);
});

// --- Шаги состояний ---
function stepPlay(dt) {
  const eff = effectiveInput();
  player.update(dt, eff, road);
  const p = biomes.get(player.s);
  road.setPalette(p);
  road.update(player.s);
  propPool.sync(road.props);

  // Плотность трафика растёт с дистанцией: медленно, с потолком RAMP_MAX.
  // Если игрок сам выставил трафик выше потолка — его выбор уважаем.
  // В гонке рампу крутит только хост — у остальных трафик приходит снапшотами.
  if (!race.active || race.isHost) {
    const cap = Math.max(trafficCount, TRAFFIC.RAMP_MAX);
    const want = Math.min(cap, trafficCount + Math.floor(player.s / TRAFFIC.RAMP_EVERY));
    if (want !== traffic.effCount) {
      traffic.effCount = want;
      traffic.setCount(want, player.s, road);
    }
  }

  const res = traffic.update(dt, player, road);
  for (const dl of res.near) {
    combo = Math.min(combo + 1, 9);
    comboTimer = TRAFFIC.COMBO_TIME;
    score += TRAFFIC.NEAR_MISS_SCORE * combo;
    player.nitro = clamp(player.nitro + TRAFFIC.NEAR_MISS_NITRO, 0, 1);
    audio.whoosh();
    hud.comboPop();
  }
  if (res.crash) { gameOver('crash'); return; }
  comboTimer -= dt;
  if (comboTimer <= 0) combo = 0;
  score += player.speed * dt;

  // --- Сетевая гонка: рассылка состояния, снапшоты трафика, соперники ---
  if (race.active) {
    stateTimer += dt;
    if (stateTimer >= 0.07) { stateTimer = 0; net.state(player.s, player.lat, player.speed); }
    if (race.isHost) {
      trafficTimer += dt;
      if (trafficTimer >= 0.1) { trafficTimer = 0; net.traffic(traffic.snapshot()); }
    }
    rivals.update(dt, road);
    // Гонка на время: финишная арка на фиксированной дистанции.
    if (race.mode === 'timed' && !race.finishedMe) {
      const remaining = race.finishS - player.s;
      while (race.milestone < RACE.MILESTONES.length && remaining <= RACE.MILESTONES[race.milestone]) {
        hud.toast('ФИНИШ ЧЕРЕЗ ' + RACE.MILESTONES[race.milestone] + ' М');
        race.milestone++;
      }
      if (remaining <= 0) { finishRace(); return; }
    }
    // Все соперники выбыли — гонка окончена, шлём свой результат и получаем таблицу.
    // В гонке на время ждём своего финиша: доезжать — наша работа.
    if (race.mode !== 'timed' && race.players.length > 1 && race.players.every((p) => p.id === race.myId || race.crashed.has(p.id))) {
      gameOver('crash');
      return;
    }
    if (rivals.checkCollision(player) !== null) { gameOver('crash'); return; }
  }

  // Пламя нитро из выхлопов
  if (player.boosting) flame(fxAdd, player.wx, player.wy, player.wz, player.group.rotation.y);
  // Дым из-под колёс при торможении (зимой — снежная крошка)
  if (eff.brake && player.speed > 12 && Math.random() < 0.8) {
    tireSmoke(fxSoft, player.wx, player.wy, player.wz, player.group.rotation.y, p.snow > 0.4);
  }
  // Обочина: пыль или снег из-под колёс
  if (player.onShoulder && player.speed > 16 && Math.random() < 0.5) {
    tireSmoke(fxSoft, player.wx, player.wy, player.wz, player.group.rotation.y, p.snow > 0.4);
  }

  // Кислы с нитро прямо на дороге
  pickups.update(dt, player, road, (w) => {
    player.nitro = clamp(player.nitro + PICKUP.NITRO, 0, 1);
    audio.chime();
    sparks(fxAdd, w.px, w.py, w.pz, 14, false);
    hud.toast('НИТРО +');
  });

  // Призрак: запись текущего заезда + повтор лучшего
  recorder.update(dt, player);
  ghost.update(dt, road);

  // Сирена полиции — по ближайшей патрульной машине (в remote-режиме часть машин скрыта)
  let sirenVol = 0;
  for (const c of traffic.cars) {
    if (!c.model.group.visible || c.kind !== 'police') continue;
    const d = Math.abs(c.s - player.s);
    if (d < 130) sirenVol = Math.max(sirenVol, 1 - d / 130);
  }
  audio.sirenUpdate(dt, sirenVol);

  // Эффекты
  fxAdd.update(dt);
  fxSoft.update(dt);
  debris.update(dt);
  snow.update(dt, camera.position, player.speed);
  speedlines.update(dt, player.speedNorm, player.boosting);

  applyEnv(p);
  updateCamera(dt, false);
  audio.engine(player.speed, player.boosting, true, eff.gas);
  hud.update(score, combo, player.speed * 3.6, player.nitro, player.s - 30);
  minimap.draw(player, road, traffic, pickups, ghost, rivals);
}

function stepOver(dt) {
  overTimer += dt;               // оверлей считаем по реальному времени
  timeScale = Math.min(1, timeScale + dt * 0.7); // слоу-мо плавно отпускает
  const wdt = dt * timeScale;
  player.freeze(wdt, road);
  const p = biomes.get(player.s);
  road.setPalette(p);
  road.update(player.s);
  propPool.sync(road.props);
  traffic.update(wdt, player, road);
  ghost.update(wdt, road);       // призрак доезжает своё даже после твоей аварии
  fxAdd.update(wdt);
  fxSoft.update(wdt);
  debris.update(wdt);
  snow.update(wdt, camera.position, player.speed);
  applyEnv(p);
  updateCamera(dt, false);
  audio.engine(player.speed, false, true, false);
  audio.sirenUpdate(dt, 0);
  hud.update(score, combo, player.speed * 3.6, player.nitro, player.s - 30);
  minimap.draw(player, road, traffic, pickups, ghost, rivals);
  if (overTimer > 1.1 && !overShown) {
    overShown = true;
    const metric = race.active
      ? 'ОЧКИ ' + Math.floor(score) + '  —  ЖДЁМ ОСТАЛЬНЫХ...'
      : 'ОЧКИ ' + Math.floor(score) + '  —  ЛУЧШИЙ ' + best;
    hud.showOverlay(overTitle, race.active ? '' : 'R — ЗАНОВО · ESC — В МЕНЮ', metric);
    hud.setOverButtons(true, !race.active);
  }
}

function stepMenu(dt) {
  const p = biomes.get(player.s);
  road.update(player.s);
  propPool.sync(road.props);
  traffic.update(dt, player, road);
  fxAdd.update(dt);
  fxSoft.update(dt);
  snow.update(dt, camera.position, 0);
  applyEnv(p);
  updateCamera(0.016, true);
  audio.engine(0, false, false, false);
  audio.sirenUpdate(dt, 0);
}

// Пауза: ничего не обновляем, только глушим мотор.
function stepPause() {
  audio.engine(0, false, false, false);
  audio.sirenUpdate(0.016, 0);
}

// --- Главный цикл ---
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'play') stepPlay(dt);
  else if (state === 'over') stepOver(dt);
  else if (state === 'pause') stepPause();
  else stepMenu(dt);
  sky.update(camera.position);
  terrain.position.x = player.wx;
  terrain.position.z = player.wz;
  postfx.render(dt, player.speedNorm, player.boosting);
}

resetWorld(seed);
hud.setMode(mode, true);
hud.setTrafficLabel(trafficCount);
hud.setLanesLabel(laneCount);
hud.updateMenuLabels(settings);
hud.renderLeaderboard([], null);
refreshLeaderboard();
showAuthGate(); // спрашиваем ник при каждом заходе
requestAnimationFrame(frame);

// Отладочный крюк (для проверки из консоли/Playwright).
window.__game = {
  player, road, traffic, pickups, ghost, camera, startGame, restart,
  get state() { return state; },
  get mode() { return mode; },
  settings, race, rivals, net,
  refreshLeaderboard,
};
