// HUD: DOM поверх канваса. Обновление каждый кадр — дёшево, DOM маленький.
export class HUD {
  constructor() {
    this.el = {
      score: document.getElementById('score'),
      distance: document.getElementById('distance'),
      combo: document.getElementById('combo'),
      best: document.getElementById('best'),
      speed: document.getElementById('speed'),
      nitro: document.getElementById('nitro-fill'),
      overlay: document.getElementById('overlay'),
      oTitle: document.getElementById('overlay-title'),
      oMsg: document.getElementById('overlay-msg'),
      oSub: document.getElementById('overlay-sub'),
      modeHint: document.getElementById('mode-hint'),
      menuHint: document.getElementById('menu-hint'),
      panel: document.getElementById('menu-panel'),
      trafficLabel: document.getElementById('traffic-label'),
      lanesLabel: document.getElementById('lanes-label'),
      toast: document.getElementById('toast'),
      ghostBtn: document.getElementById('ghost-toggle'),
      musicBtn: document.getElementById('music-toggle'),
      qualityBtn: document.getElementById('quality-toggle'),
      volumeLabel: document.getElementById('volume-label'),
      leaderboard: document.getElementById('leaderboard'),
      nickInput: document.getElementById('nick-input'),
      authBox: document.getElementById('auth-box'),
      authStatus: document.getElementById('auth-status'),
      authLogin: document.getElementById('auth-login'),
      authGuest: document.getElementById('auth-guest'),
      playRow: document.getElementById('play-row'),
      playBtn: document.getElementById('play-btn'),
      overButtons: document.getElementById('over-buttons'),
      overRestart: document.getElementById('over-restart'),
      overMenu: document.getElementById('over-menu'),
      raceCreate: document.getElementById('race-create'),
      raceJoin: document.getElementById('race-join'),
      raceModeRow: document.getElementById('race-mode-row'),
      raceModeEndless: document.getElementById('race-mode-endless'),
      raceModeTimed: document.getElementById('race-mode-timed'),
      readyRow: document.getElementById('ready-row'),
      raceReady: document.getElementById('race-ready'),
      customWarn: document.getElementById('custom-warn'),
      raceCodeRow: document.getElementById('race-code-row'),
      raceCode: document.getElementById('race-code'),
      raceStatus: document.getElementById('race-status'),
      racePlayers: document.getElementById('race-players'),
      raceStartRow: document.getElementById('ready-row'),
      raceStart: document.getElementById('race-ready'),
    };
  }

  setBest(v) { this.el.best.textContent = String(v); }

  update(score, combo, kmh, nitro, dist) {
    this.el.score.textContent = String(Math.floor(score));
    this.el.distance.textContent = Math.floor(Math.max(0, dist)) + ' m';
    this.el.speed.textContent = String(Math.round(kmh));
    this.el.nitro.style.width = (nitro * 100).toFixed(1) + '%';
    if (combo >= 2) {
      this.el.combo.textContent = 'COMBO x' + combo;
      this.el.combo.classList.remove('hidden');
    } else {
      this.el.combo.classList.add('hidden');
    }
  }

  comboPop() {
    const el = this.el.combo;
    el.classList.remove('pop');
    void el.offsetWidth; // перезапуск CSS-анимации
    el.classList.add('pop');
  }

  // Всплывашка по центру: НИТРО +, НОВЫЙ РЕКОРД.
  toast(msg) {
    const el = this.el.toast;
    el.textContent = msg;
    el.classList.remove('show');
    void el.offsetWidth; // перезапуск CSS-анимации
    el.classList.add('show');
  }

  // Подсказка режима управления. inMenu — ещё и тексты стартового оверлея.
  setMode(mode, inMenu) {
    const isMouse = mode === 'mouse';
    this.el.modeHint.textContent = isMouse
      ? 'РЕЖИМ: МЫШЬ · ЛКМ ГАЗ · ПКМ ТОРМОЗ · M — КЛАВИАТУРА · G — ПРИЗРАК · N — МУЗЫКА · P — ГРАФИКА · ESC — ПАУЗА'
      : 'РЕЖИМ: КЛАВИАТУРА · M — МЫШЬ · G — ПРИЗРАК · N — МУЗЫКА · P — ГРАФИКА · ESC — ПАУЗА';
    if (inMenu) {
      this.el.oMsg.textContent = isMouse ? 'CLICK TO START' : 'PRESS ANY KEY';
      this.el.oSub.textContent = isMouse
        ? 'ЛКМ — ГАЗ · ПКМ — ТОРМОЗ · ДВИЖЕНИЕ МЫШИ — РУЛЬ · SPACE — НИТРО'
        : 'WASD / СТРЕЛКИ — РУЛЬ · SPACE — НИТРО';
      this.el.oSub.classList.remove('hidden');
    }
  }

  setTrafficLabel(n) { this.el.trafficLabel.textContent = 'ТРАФИК: ' + n; }
  setLanesLabel(n) { this.el.lanesLabel.textContent = 'ПОЛОС: ' + n; }

  // Тексты кнопок меню под актуальные настройки.
  updateMenuLabels(s) {
    this.el.ghostBtn.textContent = 'ПРИЗРАК: ' + (s.ghostOn ? 'ВКЛ' : 'ВЫКЛ');
    this.el.musicBtn.textContent = 'МУЗЫКА: ' + (s.music ? 'ВКЛ' : 'ВЫКЛ');
    this.el.qualityBtn.textContent = 'ГРАФИКА: ' + (s.quality === 'high' ? 'МАКС' : 'ЭКОНОМ');
    this.el.volumeLabel.textContent = 'ГРОМКОСТЬ: ' + s.volume;
  }

  setPanel(v) {
    this.el.panel.style.display = v ? 'flex' : 'none';
    this.el.menuHint.style.display = v ? 'block' : 'none';
  }

  showOverlay(title, msg, sub = '') {
    this.el.oTitle.textContent = title;
    this.el.oMsg.textContent = msg;
    this.el.oSub.textContent = sub;
    this.el.oSub.classList.toggle('hidden', !sub);
    this.el.overlay.classList.remove('hidden');
  }

  hideOverlay() {
    this.el.overlay.classList.add('hidden');
    this.setOverButtons(false);
  }

  setPlaying(v) { document.body.classList.toggle('playing', v); }

  setMsg(text) { this.el.oMsg.textContent = text; }

  // --- Вход по нику ---
  setNick(v) { this.el.nickInput.value = v; }

  showAuth(v) {
    this.el.authBox.style.display = v ? 'flex' : 'none';
    this.authOpen = !!v;
  }

  setAuthStatus(text) { this.el.authStatus.textContent = text || ''; }

  // --- Кнопка ИГРАТЬ / ПРОДОЛЖИТЬ ---
  setPlayLabel(text) { this.el.playBtn.textContent = text; }

  setPlayVisible(v) { this.el.playRow.style.display = v ? 'flex' : 'none'; }

  // Кнопки после аварии (в гонке «ЗАНОВО» скрыта — рестартить сетевую гонку в одиночку нельзя).
  setOverButtons(v, showRestart = true) {
    this.el.overButtons.style.display = v ? 'flex' : 'none';
    this.el.overRestart.style.display = showRestart ? 'flex' : 'none';
  }

  renderLeaderboard(rows, meNick) {
    const el = this.el.leaderboard;
    let html = '<div class="lb-title">ТОП-10</div>';
    if (!rows || !rows.length) html += '<div class="lb-row"><span>ПУСТО — СТАНЬ ПЕРВЫМ</span><span></span></div>';
    for (const r of rows) {
      const me = meNick && r.nick.toLowerCase() === meNick.toLowerCase() ? ' me' : '';
      html += `<div class="lb-row${me}"><span>${escapeHtml(r.nick)}</span><span>${r.score}</span></div>`;
    }
    el.innerHTML = html;
  }

  // --- Панель гонки ---
  setRaceStatus(text) { this.el.raceStatus.textContent = text || ''; }

  // Выбор режима гонки: подсветка активной кнопки.
  setRaceMode(m) {
    this.el.raceModeEndless.classList.toggle('on', m !== 'timed');
    this.el.raceModeTimed.classList.toggle('on', m === 'timed');
  }

  renderRacePlayers(players, hostId, myId, doneIds) {
    const el = this.el.racePlayers;
    el.innerHTML = players.map((p) => {
      const cls = [];
      if (p.id === hostId) cls.push('host');
      if (doneIds && doneIds.has(p.id)) cls.push('dead');
      if (p.ready) cls.push('ready'); // галочка готовности в лобби
      const me = p.id === myId ? ' (ТЫ)' : '';
      return `<div class="${cls.join(' ')}">${escapeHtml(p.nick)}${me}</div>`;
    }).join('');
  }

  setRaceUi(mode) {
    // mode: 'menu' | 'lobby-host' | 'lobby-guest'
    const inLobby = mode !== 'menu';
    this.el.raceStartRow.style.display = inLobby ? 'flex' : 'none';
    // Выбор режима — только у хоста и только в созданной им комнате.
    this.el.raceModeRow.style.display = mode === 'lobby-host' ? 'flex' : 'none';
    this.setPlayVisible(!this.authOpen);
    this.setPlayLabel(inLobby ? 'ВЫЙТИ ИЗ КОМНАТЫ' : 'ИГРАТЬ');
  }

  // Кнопка «ГОТОВ» в лобби; locked — во время отсчёта кнопка неактивна.
  setReady(ready, locked) {
    this.el.raceStart.textContent = locked ? 'СТАРТ...' : (ready ? 'НЕ ГОТОВ' : 'ГОТОВ');
    this.el.raceStart.disabled = !!locked;
  }

  // Боковое предупреждение: настройки отличаются от стандартных — рекорд не запишется.
  setCustomWarn(v) {
    this.el.customWarn.style.display = v ? 'block' : 'none';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
