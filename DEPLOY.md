# Деплой RUSH HOUR на сервер (nginx + node)

Игра состоит из двух частей:

- **клиент** — Vite-приложение, после сборки это статика в `dist/`;
- **сервер** — `server/index.js` (Express + SQLite + WebSocket), порт `3001`
  (меняется переменной окружения `PORT`).

Nginx раздаёт статику и проксирует `/api/*` и `/race-ws` на node-сервер.

## 1. Сборка клиента

```bash
npm install
npm run build          # соберёт статику в dist/
```

## 2. Запуск сервера

Нужен Node.js 20+. better-sqlite3 — нативный модуль, на сервере он
пересоберётся при `npm install` (нужны build-essential/python на Debian/Ubuntu
или просто подождать — обычно хватает предсобранных бинарников).

```bash
npm install --omit=dev
PORT=3001 node server/index.js
```

Для постоянной работы — systemd-юнит `/etc/systemd/system/rushhour.service`:

```ini
[Unit]
Description=RUSH HOUR server (api + race-ws)
After=network.target

[Service]
WorkingDirectory=/var/www/rushhour
ExecStart=/usr/bin/node server/index.js
Environment=PORT=3001
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now rushhour
```

## 3. Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/rushhour
sudo ln -s /etc/nginx/sites-available/rushhour /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Конфиг рассчитан на то, что `dist/` лежит в `/var/www/rushhour/dist` —
переправь `root` под своё расположение. Важно проксировать `/race-ws`
с `Upgrade`/`Connection` — иначе сетевая гонка не заработает.

## 4. Обновление

```bash
git pull
npm install
npm run build
sudo systemctl restart rushhour
```

## Что где живёт

- `data/rushhour.db` — база рекордов, создаётся сервером автоматически
  (в git не входит).
- `dist/` — сборка клиента (в git не входит, собирается на сервере).
- `deploy/nginx.conf` — готовый конфиг nginx.
