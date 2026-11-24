'use strict';
// Costa Verde Heat 3D — all DOM: HUD (cash, health, stars, weapon, bust
// meter, objective banner, speedometer, toasts, live minimap), the start /
// pause / busted / wasted / ending screens, and the prompt line.
//
// The pause menu's SOUND label has exactly one writer — syncMuteLabel() —
// and both the menu button and the M key end up calling it (main.js routes
// the M key through audio.toggleMute() + hud.syncMuteLabel()), so the label
// can never drift from the real mute state.

CVH.hud = {
  el: {},
  cb: {},
  _cashShown: null,
  _objShown: '',
  _promptShown: null,
  _mapT: 0,

  init: function (callbacks) {
    this.cb = callbacks || {};
    const ids = ['hud', 'hud-cash', 'hud-weapon', 'healthfill', 'hud-stars', 'bustwrap', 'bustfill',
      'objective', 'obj-title', 'obj-sub', 'speedo', 'speed-val', 'speed-car', 'prompt', 'toasts',
      'minimap', 'menu-main', 'menu-pause', 'screen-busted', 'screen-wasted', 'screen-ending',
      'btn-continue', 'busted-text', 'wasted-text', 'ending-stats', 'btn-sound'];
    for (let i = 0; i < ids.length; i++) this.el[ids[i]] = document.getElementById(ids[i]);
    const on = (id, fn) => {
      const n = document.getElementById(id);
      if (n) n.addEventListener('click', () => { CVH.audio.init(); CVH.audio.ui(); if (fn) fn(); });
    };
    on('btn-new', () => this.cb.onNew && this.cb.onNew());
    on('btn-continue', () => this.cb.onContinue && this.cb.onContinue());
    on('btn-resume', () => this.cb.onResume && this.cb.onResume());
    on('btn-save', () => this.cb.onSave && this.cb.onSave());
    on('btn-restart', () => this.cb.onRestart && this.cb.onRestart());
    on('btn-quit', () => this.cb.onQuit && this.cb.onQuit());
    on('btn-busted-ok', () => this.cb.onBustedOk && this.cb.onBustedOk());
    on('btn-wasted-ok', () => this.cb.onWastedOk && this.cb.onWastedOk());
    on('btn-roam', () => this.cb.onRoam && this.cb.onRoam());
    on('btn-ending-new', () => this.cb.onEndingNew && this.cb.onEndingNew());
    const soundBtn = document.getElementById('btn-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        CVH.audio.init();
        CVH.audio.toggleMute();
        CVH.hud.syncMuteLabel();
      });
    }
    this.syncMuteLabel();
  },

  // The single place the SOUND label is written. Ever.
  syncMuteLabel: function () {
    const n = this.el['btn-sound'] || document.getElementById('btn-sound');
    if (n) n.textContent = 'SOUND: ' + (CVH.audio.muted ? 'OFF' : 'ON');
  },

  showMain: function (hasSave) {
    this.hideAllMenus();
    this.el['menu-main'].style.display = 'flex';
    this.el['btn-continue'].style.display = hasSave ? 'block' : 'none';
    this.el.hud.style.display = 'none';
  },

  hideAllMenus: function () {
    for (const id of ['menu-main', 'menu-pause', 'screen-busted', 'screen-wasted', 'screen-ending']) {
      this.el[id].style.display = 'none';
    }
  },

  showHud: function () {
    this.hideAllMenus();
    this.el.hud.style.display = 'block';
  },

  showPause: function () {
    this.syncMuteLabel();
    this.el['menu-pause'].style.display = 'flex';
  },
  hidePause: function () { this.el['menu-pause'].style.display = 'none'; },

  showBusted: function (text) {
    this.el['busted-text'].textContent = text;
    this.el['screen-busted'].style.display = 'flex';
  },
  showWasted: function (text) {
    this.el['wasted-text'].textContent = text;
    this.el['screen-wasted'].style.display = 'flex';
  },
  showEnding: function (stats) {
    this.el['ending-stats'].innerHTML =
      'Cash earned: <b>' + CVH.fmtCash(stats.earned) + '</b><br>' +
      'Cash packages found: <b>' + stats.packages + ' / 14</b><br>' +
      'Story jobs complete: <b>6 / 6</b><br>' +
      'Final balance: <b>' + CVH.fmtCash(stats.cash) + '</b>';
    this.el['screen-ending'].style.display = 'flex';
  },

  toast: function (msg, ms) {
    const box = this.el.toasts;
    if (!box) return;
    while (box.children.length >= 4) box.removeChild(box.firstChild);
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    box.appendChild(d);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, ms || 3200);
  },

  setPrompt: function (text) {
    if (text === this._promptShown) return;
    this._promptShown = text;
    const n = this.el.prompt;
    if (!n) return;
    if (text) { n.textContent = text; n.style.display = 'block'; }
    else n.style.display = 'none';
  },

  update: function (dt) {
    const pl = CVH.player;
    if (!pl || !pl.mesh) return;
    // Cash.
    const cash = CVH.game ? CVH.game.cash : 0;
    if (cash !== this._cashShown) {
      this._cashShown = cash;
      this.el['hud-cash'].textContent = CVH.fmtCash(cash);
    }
    // Health.
    this.el.healthfill.style.width = CVH.clamp(pl.health, 0, 100) + '%';
    this.el.healthfill.style.background = pl.health < 30 ? '#e0483a' : '#57c84a';
    // Weapon.
    const wname = pl.inCar ? 'DRIVING' : (pl.weapon === 'fist' ? 'FISTS' : pl.weapon.toUpperCase());
    if (this._weaponShown !== wname) {
      this._weaponShown = wname;
      this.el['hud-weapon'].textContent = wname;
    }
    // Wanted stars.
    const stars = CVH.police ? CVH.police.stars : 0;
    if (this._starsShown !== stars) {
      this._starsShown = stars;
      let s = '';
      for (let i = 0; i < 5; i++) s += i < stars ? '★' : '☆';
      this.el['hud-stars'].textContent = s;
      this.el['hud-stars'].style.color = stars > 0 ? '#ffc93c' : 'rgba(255,255,255,0.35)';
    }
    // Bust meter.
    const bust = CVH.police ? CVH.police.bust : 0;
    this.el.bustwrap.style.display = bust > 0.02 ? 'block' : 'none';
    this.el.bustfill.style.width = Math.round(bust * 100) + '%';
    // Objective banner.
    const obj = CVH.missions ? CVH.missions.currentObjective() : null;
    if (!obj) {
      if (this._objShown !== '') { this._objShown = ''; this.el.objective.style.display = 'none'; }
    } else {
      let sub = '';
      const ppos = pl.mesh.position;
      if (typeof obj.x === 'number') {
        sub = Math.round(CVH.dist2d(ppos.x, ppos.z, obj.x, obj.z)) + ' m';
      }
      if (typeof obj.timer === 'number' && obj.timer !== null) {
        sub += (sub ? '  ·  ' : '') + CVH.fmtTime(obj.timer);
      }
      if (typeof obj.heat === 'number') {
        sub += (sub ? '  ·  ' : '') + 'heat ' + Math.round(obj.heat / 100 * 10) / 10 + ' ★';
      }
      const key = obj.label + '|' + sub;
      if (key !== this._objShown) {
        this._objShown = key;
        this.el.objective.style.display = 'block';
        this.el['obj-title'].textContent = obj.label;
        this.el['obj-sub'].textContent = sub;
      }
    }
    // Speedometer.
    if (pl.inCar) {
      this.el.speedo.style.display = 'block';
      this.el['speed-val'].textContent = Math.round(pl.inCar.speed * 3.6) + '';
      this.el['speed-car'].textContent = 'INTEGRITY ' + Math.max(0, Math.round(pl.inCar.health)) + '%';
      this.el['speed-car'].style.color = pl.inCar.health < 30 ? '#e0483a' : '#cfd6da';
    } else {
      this.el.speedo.style.display = 'none';
    }
    // Minimap.
    this._mapT -= dt;
    if (this._mapT <= 0) {
      this._mapT = 0.12;
      this._drawMinimap();
    }
  },

  _drawMinimap: function () {
    const cv = this.el.minimap;
    if (!cv) return;
    const g = cv.getContext('2d');
    const S = cv.width, C = S / 2, scale = 0.55;
    const pl = CVH.player;
    const ppos = pl.mesh.position;
    g.fillStyle = '#141e28';
    g.fillRect(0, 0, S, S);
    const toMap = (wx, wz) => [C + (wx - ppos.x) * scale, C + (wz - ppos.z) * scale];
    // Water + beach to the east.
    g.fillStyle = '#274b6e';
    let wp = toMap(252, 0);
    g.fillRect(wp[0], 0, S - wp[0], S);
    g.fillStyle = '#d9c491';
    wp = toMap(204, 0);
    g.fillRect(wp[0], 0, Math.max(0, toMap(252, 0)[0] - wp[0]), S);
    // Roads.
    g.strokeStyle = '#4a545e';
    g.lineWidth = 5;
    for (let i = 0; i < 8; i++) {
      const x = toMap(CVH.world.roadX(i), 0)[0];
      if (x < -6 || x > S + 6) continue;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke();
    }
    for (let j = 0; j < 6; j++) {
      const y = toMap(0, CVH.world.roadZ(j))[1];
      if (y < -6 || y > S + 6) continue;
      g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
    }
    // Cash packages.
    g.fillStyle = '#3aff70';
    for (let i = 0; i < CVH.world.packages.length; i++) {
      const pk = CVH.world.packages[i];
      if (pk.taken) continue;
      const p = toMap(pk.x, pk.z);
      if (p[0] < 0 || p[0] > S || p[1] < 0 || p[1] > S) continue;
      g.fillRect(p[0] - 2, p[1] - 2, 4, 4);
    }
    // Police blips.
    g.fillStyle = '#ff4030';
    for (let i = 0; i < CVH.police.cars.length; i++) {
      const cp = CVH.police.cars[i].mesh.position;
      const p = toMap(cp.x, cp.z);
      g.beginPath();
      g.arc(CVH.clamp(p[0], 5, S - 5), CVH.clamp(p[1], 5, S - 5), 3.4, 0, CVH.TAU);
      g.fill();
    }
    // Objective.
    const obj = CVH.missions ? CVH.missions.currentObjective() : null;
    if (obj && typeof obj.x === 'number') {
      const p = toMap(obj.x, obj.z);
      const cx = CVH.clamp(p[0], 7, S - 7), cy = CVH.clamp(p[1], 7, S - 7);
      g.fillStyle = '#ffc93c';
      g.beginPath(); g.arc(cx, cy, 5, 0, CVH.TAU); g.fill();
      g.strokeStyle = '#fff2c0'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(cx, cy, 7.5, 0, CVH.TAU); g.stroke();
    }
    // Player arrow, pointing where the camera faces.
    const f = pl._fwd || { x: 0, z: -1 };
    const a = Math.atan2(f.x, -f.z);
    g.save();
    g.translate(C, C);
    g.rotate(a);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -8); g.lineTo(5.4, 6); g.lineTo(0, 3); g.lineTo(-5.4, 6);
    g.closePath(); g.fill();
    g.restore();
    // Frame.
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, S - 2, S - 2);
  }
};
