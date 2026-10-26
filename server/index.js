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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const qPlayerByName = db.prepare('SELECT id, nick FROM players WHERE nick = ? COLLATE NOCASE');
const qInsertPlayer = db.prepare('INSERT INTO players (nick) VALUES (?)');
const qInsertScore = db.prepare('INSERT INTO scores (player_id, score) VALUES (?, ?)');
const qBestOfPlayer = db.prepare('SELECT MAX(score) AS best FROM scores WHERE player_id = ?');
const qRank = db.prepare(`SELECT COUNT(*) AS c FROM (
  SELECT player_id, MAX(score) AS m FROM scores GROUP BY player_id
) t WHERE t.m > ?`);
const qPlayersCount = db.prepare('SELECT COUNT(DISTINCT player_id) AS c FROM scores');
const qLeaderboard = db.prepare(`
  SELECT p.nick AS nick, MAX(s.score) AS score
  FROM scores s JOIN players p ON p.id = s.player_id
  GROUP BY s.player_id ORDER BY score DESC LIMIT 10`);

const NICK_RE = /^[\p{L}\p{N}_ -]{2,15}$/u;
function normNick(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
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
  if (!NICK_RE.test(nick) || !Number.isFinite(score) || score < 0) {
    return res.status(400).json({ error: 'bad request' });
  }
  let p = qPlayerByName.get(nick);
  if (!p) {
    const info = qInsertPlayer.run(nick);
    p = { id: Number(info.lastInsertRowid), nick };
  }
  qInsertScore.run(p.id, score);
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
    countdown: !!room.countdown,
    players: [...room.players].map((p) => ({ id: p.id, nick: p.nick, host: p === room.host, ready: !!p.ready })),
  };
}
function broadcast(room, msg, exceptWs = null) {
  const data = JSON.stringify(msg);
  for (const p of room.players) {
    if (p.ws !== exceptWs && p.ws.readyState === 1) p.ws.send(data);
  }
}
function closeRoom(room, why) {
  if (room.countdownTimer) { clearTimeout(room.countdownTimer); room.countdownTimer = null; }
  broadcast(room, { t: 'aborted', msg: why || '' });
  for (const p of room.players) {
    p.ws.raceRoom = null;
    try { p.ws.close(); } catch { /* */ }
  }
  rooms.delete(room.code);
}

// Все нажали «ГОТОВ» — отсчёт 3..1, затем старт с настройками хоста.
function beginCountdown(room) {
  room.countdown = true;
  broadcast(room, { t: 'countdown' });
  room.countdownTimer = setTimeout(() => {
    room.countdownTimer = null;
    if (!rooms.has(room.code) || !room.countdown || room.started) return;
    room.started = true;
    const cfg = room.cfg || {};
    broadcast(room, {
      t: 'started',
      seed: room.seed,
      mode: cfg.mode === 'timed' ? 'timed' : 'endless',
      lanes: Math.min(6, Math.max(2, Math.floor(Number(cfg.lanes) || 4))),
      traffic: Math.min(30, Math.max(0, Math.floor(Number(cfg.traffic) || TRAFFIC_DEFAULT))),
    });
  }, 3200);
}

// Все доехали до финиша или выбыли — рассылаем таблицу результатов и закрываем комнату.
// Возвращает true, если гонка завершена.
function checkRaceOver(room) {
  if (!room.players.every((p) => p.crashed || p.finished)) return false;
  const rows = [...room.players].sort((a, b) => b.score - a.score)
    .map((p) => ({ nick: p.nick, score: p.score }));
  broadcast(room, { t: 'results', rows });
  for (const p of room.players) p.ws.raceRoom = null;
  rooms.delete(room.code);
  return true;
}

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
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
        const r = { code, host: null, players: [], started: false, countdown: false, countdownTimer: null, cfg: null, seed: (Math.random() * 1e9) | 0 };
        const player = { ws, id: playerIdSeq++, nick: normNick(msg.nick) || 'PLAYER', crashed: false, finished: false, ready: false, score: 0 };
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
        const player = { ws, id: playerIdSeq++, nick: normNick(msg.nick) || 'PLAYER', crashed: false, finished: false, ready: false, score: 0 };
        r.players.push(player);
        ws.raceRoom = r;
        ws.racePlayer = player;
        ws.send(JSON.stringify({ ...lobbyMsg(r), t: 'joined', code: r.code, you: player.id }));
        broadcast(r, lobbyMsg(r), ws);
        break;
      }
      case 'cfg': {
        // Хост сообщает настройки заезда (режим/полосы/трафик); применятся на старте.
        if (!room || me !== room.host || room.started || room.countdown) return;
        room.cfg = {
          mode: msg.mode === 'timed' ? 'timed' : 'endless',
          lanes: Math.min(6, Math.max(2, Math.floor(Number(msg.lanes) || 4))),
          traffic: Math.min(30, Math.max(0, Math.floor(Number(msg.traffic) || TRAFFIC_DEFAULT))),
        };
        break;
      }
      case 'ready': {
        if (!room || room.started || room.countdown || !me) return;
        me.ready = !!msg.val;
        broadcast(room, lobbyMsg(room));
        if (room.players.every((p) => p.ready)) beginCountdown(room);
        break;
      }
      case 'state': {
        if (!room || !room.started || !me) return;
        broadcast(room, { t: 'state', id: me.id, s: +msg.s, lat: +msg.lat, v: +msg.v }, ws);
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
        broadcast(room, { t: 'crashed', id: me.id, score: me.score }, ws);
        checkRaceOver(room);
        break;
      }
      case 'finish': {
        // Финишировал в гонке на время: очки фиксируются, ждём остальных.
        if (!room || !room.started || !me || me.finished) return;
        me.finished = true;
        me.score = Math.floor(Number(msg.score) || 0);
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
    rooms.delete(room.code);
    return;
  }
  if (room.started) {
    if (wasHost) {
      // Хост ушёл посреди гонки — трафик больше никем не симулируется, сворачиваем.
      closeRoom(room, 'Хост вышел из гонки');
      return;
    }
    if (checkRaceOver(room)) return;
  } else if (room.countdown) {
    // Ушли во время отсчёта — откатываем комнату в лобби.
    if (room.countdownTimer) { clearTimeout(room.countdownTimer); room.countdownTimer = null; }
    room.countdown = false;
  }
  if (wasHost) room.host = room.players[0];
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