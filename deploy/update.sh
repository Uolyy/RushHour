#!/bin/bash
# RUSH HOUR: обновление по кнопке «ПРОВЕРИТЬ ИЗМЕНЕНИЯ».
# Пул + пересборка + рестарт сервиса. На сервере запускается от www-data,
# рестарт разрешён через sudoers (NOPASSWD на systemctl restart rushhour).
set -u
cd "$(dirname "$0")/.." || exit 1

log() { echo "[$(date -Is)] $1" >> data/update.log; }

log "update started (user $(id -un))"

git pull --ff-only >> data/update.log 2>&1 \
  || { log "git pull failed"; exit 1; }

npm install --no-audit --no-fund >> data/update.log 2>&1 \
  || { log "npm install failed"; exit 1; }

npm run build >> data/update.log 2>&1 \
  || { log "build failed"; exit 1; }

log "build ok, restarting rushhour"
sudo -n /bin/systemctl restart rushhour \
  && log "service restarted, update done" \
  || log "restart failed (sudo?)"
