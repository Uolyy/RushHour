// RUSH HOUR server: API таблицы рекордов (SQLite) + комнаты гонок (WebSocket).
// Запуск: npm run server (порт 3001). Клиент ходит через прокси vite: /api, /race-ws.

import express from 'express';
import Database from 'better-sqlite3';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const TRAFFIC_DEFAULT = 14; // стандартная плотность трафика
// Серия раундов сетевой гонки: 3 заезда, каждый следующий на ROUND_STEP длиннее.
// Победитель раунда получает 1 победное очко, итоговый победитель — по очкам.
const ROUNDS_TOTAL = 3;
const RACE_LENGTH_BASE = 2000; // дистанция финиша 1-го раунда (режим «на время»), м
const ROUND_STEP = 2000;      // прибавка к дистанции финиша за раунд, м
const NEXT_ROUND_DELAY = 7000; // пауза между раундами (показ результатов), мс
const FINISH_GRACE_MS = 25000; // сколько ждём остальных после первого финиша, мс
const STATE_BROADCAST_MS = 25; // частота рассылки позиций игроков, мс (40 раз/с)

// Лог в файл: data/server.log — чтобы причину падения можно было прислать.
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const LOG = (msg) => {
  try { fs.appendFileSync(path.join(dataDir, 'server.log'), new Date().toISOString() + '  ' + msg + '\n'); } catch { /* */ }
};
LOG('--- server starting, pid ' + process.pid + ' ---');
process.on('uncaughtException', (e) => {
  LOG('FATAL: ' + (e && e.stack || e));
  console.error('[FATAL] ' + (e && e.message || e) + '  (подробности: data/server.log)');
});
process.on('unhandledRejection', (e) => {
  LOG('REJECTION: ' + (e && e.stack || e));
});
// ---------- База данных ----------
let db;
try {
  db = new Database(path.join(dataDir, 'rushhour.db'));
} catch (e) {
  LOG('DB open failed: ' + (e && e.stack || e));
  console.error('[ERROR] Не открылась база data/rushhour.db: ' + (e && e.message));
  console.error('        Если ошибка про NODE_MODULE_VERSION — удали папку node_modules и запусти run.bat заново.');
  process.exit(1);
}
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nick TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS players_nick ON players (nick COLLATE NOCASE);
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id),
    score INTEGER NOT NULL,
    run_time REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
// Старые базы без колонки времени — добавляем (ALTER на уже существующей таблице).
try {
  const cols = db.prepare('PRAGMA table_info(scores)').all().map((c) => c.name);
  if (!cols.includes('run_time')) db.exec('ALTER TABLE scores ADD COLUMN run_time REAL NOT NULL DEFAULT 0');
} catch (e) {
  LOG('scores migration failed: ' + (e && e.message));
}

const qPlayerByName = db.prepare('SELECT id, nick FROM players WHERE nick = ? COLLATE NOCASE');
const qInsertPlayer = db.prepare('INSERT INTO players (nick) VALUES (?)');
const qInsertScore = db.prepare('INSERT INTO scores (player_id, score, run_time) VALUES (?, ?, ?)');
const qBestOfPlayer = db.prepare('SELECT MAX(score) AS best FROM scores WHERE player_id = ?');
const qRank = db.prepare(`SELECT COUNT(*) AS c FROM (
  SELECT player_id, MAX(score) AS m FROM scores GROUP BY player_id
) t WHERE t.m > ?`);
const qPlayersCount = db.prepare('SELECT COUNT(DISTINCT player_id) AS c FROM scores');
// Лучший результат игрока + время заезда, за который он достигнут.
const qLeaderboard = db.prepare(`
  SELECT p.nick AS nick, s.score AS score, MIN(s.run_time) AS run_time
  FROM scores s
  JOIN players p ON p.id = s.player_id
  JOIN (
    SELECT player_id, MAX(score) AS ms FROM scores GROUP BY player_id
  ) b ON b.player_id = s.player_id AND s.score = b.ms
  GROUP BY s.player_id
  ORDER BY score DESC, run_time ASC LIMIT 10`);

const NICK_RE = /^[\p{L}\p{N}_ -]{2,15}$/u;
function normNick(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

// Кастомизация машины: белый список скинов и цветов (из клиента не доверяем).
const SKIN_IDS = ['stock', 'taxi', 'icecream', 'neon', 'police', 'rainbow'];
const COLOR_IDS = ['red', 'blue', 'green', 'sand', 'violet', 'pink', 'white', 'dark'];
const COLOR_HEX = {
  red: 0xc9403a, blue: 0x3a8fc9, green: 0x3ac96f, sand: 0xc9a13a,
  violet: 0x9a3ac9, pink: 0xc93a8f, white: 0xe6e8ee, dark: 0x2b2f3a,
};
function normSkin(raw) {
  const id = String(raw ?? '');
  return SKIN_IDS.includes(id) ? id : 'stock';
}
function normColor(raw) {
  const id = String(raw ?? '');
  return COLOR_IDS.includes(id) ? id : 'red';
}

// ---------- REST API ----------
const app = express();
app.use(express.json());

app.post('/api/login', (req, res) => {
  const nick = normNick(req.body?.nick);
  if (!NICK_RE.test(nick)) {
    return res.status(400).json({ error: 'Ник: 2–15 символов, буквы/цифры/пробел/дефис' });
  }
  let p = qPlayerByName.get(nick);
  if (!p) {
    try {
      const info = qInsertPlayer.run(nick);
      p = { id: Number(info.lastInsertRowid), nick };
    } catch (e) {
      p = qPlayerByName.get(nick); // гонка процессов — уже создан
    }
  }
  res.json(p);
});

app.post('/api/scores', (req, res) => {
  const nick = normNick(req.body?.nick);
  const score = Math.floor(Number(req.body?.score));
  // Время заезда в секундах — показываем в таблице рекордов.
  const runTime = Math.max(0, Math.min(86400, Number(req.body?.run_time) || 0));
  if (!NICK_RE.test(nick) || !Number.isFinite(score) || score < 0) {
    return res.status(400).json({ error: 'bad request' });
  }
  let p = qPlayerByName.get(nick);
  if (!p) {
    const info = qInsertPlayer.run(nick);
    p = { id: Number(info.lastInsertRowid), nick };
  }
  qInsertScore.run(p.id, score, runTime);
  const best = qBestOfPlayer.get(p.id).best;
  const rank = qRank.get(best).c + 1;
  const total = qPlayersCount.get().c;
  res.json({ best, rank, total });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ rows: qLeaderboard.all() });
});

// ---------- Обновление по кнопке «ПРОВЕРИТЬ ИЗМЕНЕНИЯ» ----------
let updating = false; // единовременный запуск, сбрасывается по таймауту ниже

app.post('/api/update', (req, res) => {
  if (updating) return res.status(409).json({ ok: false, error: 'Обновление уже идёт' });
  updating = true;
  setTimeout(() => { updating = false; }, 5 * 60 * 1000); // страховка: скрипт упал без рестарта
  const child = spawn('bash', [path.join(__dirname, '..', 'deploy', 'update.sh')], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref(); // скрипт живёт отдельно: переживает рестарт сервера в конце
  child.on('error', (e) => { updating = false; LOG('update spawn error: ' + (e && e.message)); });
  LOG('update triggered via POST /api/update');
  res.json({ ok: true, started: true });
});

// ---------- Комнаты гонок ----------
const rooms = new Map(); // code -> room
let playerIdSeq = 1;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  for (let t = 0; t < 50; t++) {
    const code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    if (!rooms.has(code)) return code;
  }
  return null;
}

function lobbyMsg(room) {
  return {
    t: 'lobby',
    code: room.code,
    hostId: room.host.id,
    players: [...room.players].map((p) => ({
      id: p.id, nick: p.nick, host: p === room.host, skin: p.skin, color: p.color,
    })),
  };
}
function broadcast(room, msg, exceptWs = null) {
  const data = JSON.stringify(msg);
  for (const p of room.players) {
    if (p.ws !== exceptWs && p.ws.readyState === 1) p.ws.send(data);
  }
}
// Вернуть комнату в состояние лобби: заезд сброшен, но комната и её код живут.
// Так группа сохраняется между заездами — заново создавать комнату не нужно.
// Серия раундов при этом обнуляется: следующий «ИГРАТЬ» хоста — это раунд 1.
function resetRoomToLobby(room) {
  room.started = false;
  room.gridCountdown = false;
  if (room.goTimer) { clearTimeout(room.goTimer); room.goTimer = null; }
  if (room.pendingStart) { clearTimeout(room.pendingStart); room.pendingStart = null; }
  if (room.finishGrace) { clearTimeout(room.finishGrace); room.finishGrace = null; }
  room.round = 0;
  room.roundOver = false;
  room.wins = {};
  room.firstFinisher = null;
  room.lastCrashed = null;
  room.seed = (Math.random() * 1e9) | 0; // следующий заезд — по новой трассе
  for (const p of room.players) {
    p.crashed = false;
    p.finished = false;
    p.ready2 = false;
    p.score = 0;
  }
  broadcast(room, lobbyMsg(room));
}

// Все в лобби нажали «ГОТОВ» — грузим всех на трассу (на стартовую решётку).
// Каждый запуск — один раунд серии: round растёт до ROUNDS_TOTAL, у победителя
// раунда копится победное очко. Дистанция финиша (режим «на время») растёт с раундом.
function startRace(room) {
  if (room.round >= ROUNDS_TOTAL) { room.round = 0; room.wins = {}; } // серия кончилась — начинаем новую
  room.round++;
  room.roundOver = false;
  room.firstFinisher = null;
  room.lastCrashed = null;
  if (room.finishGrace) { clearTimeout(room.finishGrace); room.finishGrace = null; }
  for (const p of room.players) {
    p.crashed = false;
    p.finished = false;
    p.ready2 = false;
    p.score = 0;
  }
  room.started = true;
  room.seed = (Math.random() * 1e9) | 0; // каждый раунд — своя трасса
  const cfg = room.cfg || {};
  const timed = cfg.mode === 'timed';
  broadcast(room, {
    t: 'started',
    seed: room.seed,
    mode: timed ? 'timed' : 'endless',
    lanes: Math.min(6, Math.max(2, Math.floor(Number(cfg.lanes) || 4))),
    traffic: Math.min(30, Math.max(0, Math.floor(Number(cfg.traffic) || TRAFFIC_DEFAULT))),
    round: room.round,
    rounds: ROUNDS_TOTAL,
    length: timed ? RACE_LENGTH_BASE + (room.round - 1) * ROUND_STEP : undefined,
  });
}

// На решётке все нажали «ГОТОВ» — отсчёт 5 секунд, машины стоят, затем «ПОЕХАЛИ!».
function beginGridCountdown(room) {
  room.gridCountdown = true;
  broadcast(room, { t: 'countdown' });
  room.goTimer = setTimeout(() => {
    room.goTimer = null;
    if (!rooms.has(room.code) || !room.gridCountdown) return;
    room.gridCountdown = false;
    broadcast(room, { t: 'go' });
  }, 5000);
}

// Все доехали до финиша или выбыли — рассылаем таблицу результатов.
// Серия из ROUNDS_TOTAL раундов: победитель раунда получает 1 победное очко
// (в гонке на время — первый финишировавший, в бесконечной — последний выживший).
// После промежуточного раунда следующий стартует автоматически; после последнего —
// комната возвращается в лобби, победитель серии объявляется по победным очкам.
// Возвращает true, если гонка (раунд) завершена.
function checkRaceOver(room) {
  if (room.roundOver) return false; // раунд уже завершён — не завершаем второй раз
  if (!room.players.every((p) => p.crashed || p.finished)) return false;
  room.roundOver = true;
  if (room.finishGrace) { clearTimeout(room.finishGrace); room.finishGrace = null; }
  // Победное очко даём только при двух и более игроках: соло-доехавший
  // после выхода соперников победы не получает.
  const enough = room.players.length >= 2;
  const winnerId = enough
    ? ((room.cfg && room.cfg.mode) === 'timed' ? room.firstFinisher : room.lastCrashed)
    : null;
  if (winnerId != null) room.wins[winnerId] = (room.wins[winnerId] || 0) + 1;
  const rows = [...room.players]
    .map((p) => ({ id: p.id, nick: p.nick, score: p.score, wins: room.wins[p.id] || 0, roundWin: p.id === winnerId }))
    .sort((a, b) => b.wins - a.wins || b.score - a.score);
  const final = room.round >= ROUNDS_TOTAL;
  broadcast(room, { t: 'results', rows, round: room.round, rounds: ROUNDS_TOTAL, final });
  if (final) {
    room.round = 0;
    room.wins = {};
    resetRoomToLobby(room); // серия кончилась — лобби, хост может начать новую
    return true;
  }
  // Промежуточный раунд: через паузу автоматически грузим следующий заезд.
  if (room.pendingStart) clearTimeout(room.pendingStart);
  room.pendingStart = setTimeout(() => {
    room.pendingStart = null;
    if (!rooms.has(room.code)) return;
    if (room.players.length < 2) { // остался один — серия бессмысленна, в лобби
      room.round = 0;
      room.wins = {};
      resetRoomToLobby(room);
      return;
    }
    startRace(room);
  }, NEXT_ROUND_DELAY);
  return true;
}

const wss = new WebSocketServer({ noServer: true });

// Ровный поток позиций: раз в STATE_BROADCAST_MS рассылаем по комнатам один
// кадр со свежими позициями всех игроков. Клиенты шлют пакеты кто как успел,
// а клиенты-получатели всегда получают кадры через равные промежутки — на них
// и рассчитана интерполяция машин.
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.started) continue;
    const arr = [];
    for (const p of room.players) {
      if (p.lastState) arr.push({ id: p.id, s: p.lastState.s, lat: p.lastState.lat, v: p.lastState.v });
    }
    if (arr.length > 1) broadcast(room, { t: 'states', arr });
  }
}, STATE_BROADCAST_MS);

wss.on('connection', (ws) => {
  // Алгоритм Нейгла копит мелкие пакеты до полного TCP-пакета — это даёт
  // задержки и бурсты до 40-200 мс. Для гонки нужна немедленная отправка.
  if (ws._socket) {
    ws._socket.setNoDelay(true);
    ws._socket.setKeepAlive(true, 30000);
  }
  ws.raceRoom = null;
  ws.racePlayer = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.raceRoom;
    const me = ws.racePlayer;

    switch (msg.t) {
      case 'create': {
        if (room) return;
        const code = makeCode();
        if (!code) return ws.send(JSON.stringify({ t: 'error', msg: 'Нет свободных кодов' }));
        const r = { code, host: null, players: [], started: false, gridCountdown: false, goTimer: null, cfg: null, seed: (Math.random() * 1e9) | 0, round: 0, wins: {}, firstFinisher: null, lastCrashed: null, pendingStart: null, roundOver: false, finishGrace: null };
        const player = {
          ws, id: playerIdSeq++, nick: normNick(msg.nick) || 'PLAYER',
          crashed: false, finished: false, ready2: false, score: 0,
          skin: normSkin(msg.skin), color: normColor(msg.color),
        };
        r.host = player;
        r.players.push(player);
        rooms.set(code, r);
        ws.raceRoom = r;
        ws.racePlayer = player;
        ws.send(JSON.stringify({ ...lobbyMsg(r), t: 'joined', code, you: player.id }));
        break;
      }
      case 'join': {
        if (room) return;
        const r = rooms.get(String(msg.code || '').toUpperCase());
        if (!r || r.players.length >= 4) {
          return ws.send(JSON.stringify({ t: 'error', msg: 'Комната не найдена или полна (до 4 игроков)' }));
        }
        if (r.started) return ws.send(JSON.stringify({ t: 'error', msg: 'Гонка уже началась' }));
        if (r.countdown) return ws.send(JSON.stringify({ t: 'error', msg: 'Идёт отсчёт — гонка уже начинается' }));
        const player = {
          ws, id: playerIdSeq++, nick: normNick(msg.nick) || 'PLAYER',
          crashed: false, finished: false, ready2: false, score: 0,
          skin: normSkin(msg.skin), color: normColor(msg.color),
        };
        r.players.push(player);
        ws.raceRoom = r;
        ws.racePlayer = player;
        ws.send(JSON.stringify({ ...lobbyMsg(r), t: 'joined', code: r.code, you: player.id }));
        broadcast(r, lobbyMsg(r), ws);
        break;
      }
      case 'look': {
        // Игрок сменил вид машины в лобби — запоминаем и сообщаем остальным.
        if (!room || !me) return;
        me.skin = normSkin(msg.skin);
        me.color = normColor(msg.color);
        broadcast(room, lobbyMsg(room));
        break;
      }
      case 'cfg': {
        // Хост сообщает настройки заезда (режим/полосы/трафик); применятся на старте.
        if (!room || me !== room.host || room.started || room.gridCountdown) return;
        room.cfg = {
          mode: msg.mode === 'timed' ? 'timed' : 'endless',
          lanes: Math.min(6, Math.max(2, Math.floor(Number(msg.lanes) || 4))),
          traffic: Math.min(30, Math.max(0, Math.floor(Number(msg.traffic) || TRAFFIC_DEFAULT))),
        };
        break;
      }
      case 'launch': {
        // Хост нажал «ИГРАТЬ» — грузим всех на стартовую решётку.
        if (!room || me !== room.host || room.started) return;
        startRace(room);
        break;
      }
      case 'ready2': {
        // Подтверждение готовности уже НА РЕШЁТКЕ: все готовы — отсчёт 5 секунд.
        if (!room || !room.started || room.gridCountdown || !me) return;
        me.ready2 = !!msg.val;
        broadcast(room, { t: 'ready2', players: room.players.map((p) => ({ id: p.id, ready2: !!p.ready2 })) });
        if (room.players.every((p) => p.ready2)) beginGridCountdown(room);
        break;
      }
      case 'state': {
        if (!room || !room.started || !me) return;
        // Не пересылаем каждый пакет сразу: позиция копится, а рассылает её
        // общий тик (см. STATE_BROADCAST_MS) одним кадром 'states' — поток
        // пакетов к клиентам получается ровным, без бурстов и дрожания.
        me.lastState = { s: +msg.s, lat: +msg.lat, v: +msg.v };
        break;
      }
      case 'traffic': {
        // Снимок трафика от хоста: [{i, s, lat, v, k}]
        if (!room || !room.started || me !== room.host) return;
        broadcast(room, { t: 'traffic', arr: msg.arr }, ws);
        break;
      }
      case 'crash': {
        if (!room || !room.started || !me || me.crashed) return;
        me.crashed = true;
        me.score = Math.floor(Number(msg.score) || 0);
        room.lastCrashed = me.id; // в бесконечном режиме последний на ходу — победитель раунда
        broadcast(room, { t: 'crashed', id: me.id, score: me.score }, ws);
        checkRaceOver(room);
        break;
      }
      case 'finish': {
        // Финишировал в гонке на время: очки фиксируются, ждём остальных.
        if (!room || !room.started || !me || me.finished) return;
        me.finished = true;
        me.score = Math.floor(Number(msg.score) || 0);
        if (room.firstFinisher == null) {
          room.firstFinisher = me.id; // первый финишировавший — победитель раунда
          // Не даём раунду зависнуть на «ждём остальных»: у остальных 25 с на
          // то, чтобы доехать. Не успели — их текущий результат, раунд завершаем.
          if ((room.cfg && room.cfg.mode) === 'timed' && !room.roundOver) {
            if (room.finishGrace) clearTimeout(room.finishGrace);
            room.finishGrace = setTimeout(() => {
              room.finishGrace = null;
              if (!rooms.has(room.code) || room.roundOver) return;
              for (const p of room.players) {
                if (!p.crashed && !p.finished) p.crashed = true;
              }
              checkRaceOver(room);
            }, FINISH_GRACE_MS);
          }
        }
        broadcast(room, { t: 'finished', id: me.id }, ws);
        checkRaceOver(room);
        break;
      }
      case 'leave': {
        if (room) removeFromRoom(room, me);
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = ws.raceRoom;
    if (room) removeFromRoom(room, ws.racePlayer);
  });
});

function removeFromRoom(room, me) {
  if (!me) return;
  const wasHost = me === room.host;
  room.players = room.players.filter((p) => p !== me);
  me.ws.raceRoom = null;
  me.ws.racePlayer = null;
  if (!room.players.length) {
    if (room.pendingStart) { clearTimeout(room.pendingStart); room.pendingStart = null; }
    rooms.delete(room.code);
    return;
  }
  if (wasHost) room.host = room.players[0];
  if (room.started) {
    if (wasHost) {
      // Хост ушёл посреди гонки — трафик больше никем не симулируется.
      // Гонку прерываем, но комнату оставляем: группа собирается в лобби заново.
      broadcast(room, { t: 'aborted', msg: 'Хост вышел из гонки' });
      resetRoomToLobby(room);
      return;
    }
    if (room.gridCountdown) {
      // Ушли во время отсчёта — откатываемся к кнопке «ГОТОВ» на решётке.
      if (room.goTimer) { clearTimeout(room.goTimer); room.goTimer = null; }
      room.gridCountdown = false;
    }
    broadcast(room, { t: 'ready2', players: room.players.map((p) => ({ id: p.id, ready2: !!p.ready2 })) });
    if (checkRaceOver(room)) return;
  }
  broadcast(room, lobbyMsg(room));
}

// ---------- HTTP + upgrade ----------
const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/race-ws') wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  else socket.destroy();
});

server.listen(PORT, () => {
  LOG('listening on http://localhost:' + PORT);
  console.log(`[RUSH HOUR] server on http://localhost:${PORT} (api + race-ws)`);
});
server.on('error', (e) => {
  LOG('listen error: ' + (e && e.stack || e));
  if (e && e.code === 'EADDRINUSE') {
    console.error('[ERROR] Порт ' + PORT + ' занят другим процессом.');
    console.error('        Скорее всего, висит старое окно сервера — закрой его и запусти run.bat заново.');
  } else {
    console.error('[ERROR] Сервер не смог стартовать: ' + (e && e.message));
  }
});