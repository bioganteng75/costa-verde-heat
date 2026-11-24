// hud.js — everything drawn over the 3D view: cash/health/weapon panel,
// wanted stars, bust meter, objective banner, speedometer, toasts, the live
// 2D minimap, and the full-screen menus (start, pause, busted/wasted, and
// the story ending). Buttons call straight into CVH.main.
CVH.hud = {
  el: {},

  init() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), cash: $('cash'), healthFill: $('healthFill'), weapon: $('weapon'),
      stars: $('stars'), bustWrap: $('bustWrap'), bustFill: $('bustFill'),
      banner: $('banner'), bannerLabel: $('bannerLabel'), bannerMeta: $('bannerMeta'),
      speedo: $('speedo'), speedVal: $('speedVal'), speedCar: $('speedCar'), integrityFill: $('integrityFill'),
      toasts: $('toasts'), minimap: $('minimap'), damage: $('damage'),
      menu: $('menu'), btnNew: $('btnNew'), btnContinue: $('btnContinue'), menuNote: $('menuNote'),
      pauseMenu: $('pauseMenu'), btnResume: $('btnResume'), btnSave: $('btnSave'),
      btnRestart: $('btnRestart'), btnSound: $('btnSound'), muteState: $('muteState'),
      endScreen: $('endScreen'), endTitle: $('endTitle'), endText: $('endText'), btnRespawn: $('btnRespawn'),
      endingScreen: $('endingScreen'), endingStats: $('endingStats'),
      btnRoam: $('btnRoam'), btnNewGame2: $('btnNewGame2'),
    };
    const M = CVH.main;
    this.el.btnNew.addEventListener('click', () => { CVH.audio.ensure(); CVH.audio.click(); M.newGame(); });
    this.el.btnContinue.addEventListener('click', () => { CVH.audio.ensure(); CVH.audio.click(); M.continueGame(); });
    this.el.btnResume.addEventListener('click', () => { CVH.audio.click(); M.resume(); });
    this.el.btnSave.addEventListener('click', () => { CVH.audio.click(); M.saveGame(); this.toast('Saved', 'Progress tucked away safely.', 1400); });
    this.el.btnRestart.addEventListener('click', () => { CVH.audio.click(); M.restartStory(); });
    this.el.btnSound.addEventListener('click', () => { M.toggleMute(); });
    this.el.btnRespawn.addEventListener('click', () => { CVH.audio.click(); M.respawn(); });
    this.el.btnRoam.addEventListener('click', () => { CVH.audio.click(); M.closeEnding(); });
    this.el.btnNewGame2.addEventListener('click', () => { CVH.audio.click(); M.newGame(); });
    this._mm = this.el.minimap.getContext('2d');
    this.syncMuteLabel();
  },

  // QA fix: the SOUND label is refreshed from the audio module's real state
  // through this one function, whichever control toggled the mute.
  syncMuteLabel() {
    if (this.el.muteState) this.el.muteState.textContent = CVH.audio.muted ? 'OFF' : 'ON';
  },

  toast(title, body, ms) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.innerHTML = '<b></b><span></span>';
    div.querySelector('b').textContent = title;
    div.querySelector('span').textContent = body;
    this.el.toasts.appendChild(div);
    setTimeout(() => { div.classList.add('out'); setTimeout(() => div.remove(), 450); }, ms || 2600);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
  },

  setBanner(label, meta) {
    if (!label) { this.el.banner.style.opacity = '0'; return; }
    this.el.banner.style.opacity = '1';
    this.el.bannerLabel.textContent = label;
    this.el.bannerMeta.textContent = meta || '';
  },

  flashDamage() {
    this.el.damage.style.opacity = '0.55';
    setTimeout(() => { this.el.damage.style.opacity = '0'; }, 90);
  },

  showMenu(hasSave) {
    this.el.menu.style.display = 'flex';
    this.el.btnContinue.style.display = hasSave ? 'block' : 'none';
    this.el.menuNote.textContent = hasSave ? 'A saved run is waiting for you.' : 'No saved run yet — start a new one.';
  },
  hideMenu() { this.el.menu.style.display = 'none'; },
  showPause() { this.el.pauseMenu.style.display = 'flex'; this.syncMuteLabel(); },
  hidePause() { this.el.pauseMenu.style.display = 'none'; },
  showEnd(kind, text) {
    this.el.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    this.el.endTitle.style.color = kind === 'busted' ? '#7fb5ff' : '#ff7a6b';
    this.el.endText.textContent = text;
    this.el.endScreen.style.display = 'flex';
  },
  hideEnd() { this.el.endScreen.style.display = 'none'; },

  showEnding(stats) {
    this.el.endingStats.innerHTML =
      '<div>Jobs completed <b>6 / 6</b></div>' +
      '<div>Total earnings <b>' + CVH.u.fmtMoney(stats.earned) + '</b></div>' +
      '<div>Cash in pocket <b>' + CVH.u.fmtMoney(stats.cash) + '</b></div>' +
      '<div>Cash packages found <b>' + stats.packages + ' / ' + stats.packagesTotal + '</b></div>';
    this.el.endingScreen.style.display = 'flex';
  },
  hideEnding() { this.el.endingScreen.style.display = 'none'; },

  // Per-frame refresh of the small stuff.
  frame(state) {
    const M = CVH.main;
    this.el.cash.textContent = CVH.u.fmtMoney(M.cash);
    this.el.healthFill.style.width = CVH.u.clamp(CVH.player.health, 0, 100) + '%';
    this.el.healthFill.style.background = CVH.player.health < 30 ? '#e03c31' : '#57c256';
    this.el.weapon.textContent = { fists: 'FISTS', pistol: 'PISTOL', smg: 'SMG' }[CVH.player.weapon];
    const st = CVH.police.stars;
    this.el.stars.textContent = '★★★★★'.slice(0, st) + '☆☆☆☆☆'.slice(0, 5 - st);
    this.el.stars.style.opacity = st > 0 ? '1' : '0.25';
    const bust = CVH.police.bust;
    this.el.bustWrap.style.opacity = bust > 0.02 ? '1' : '0';
    this.el.bustFill.style.width = (bust * 100) + '%';
    const obj = CVH.missions.objective();
    if (obj) {
      let meta = '';
      if (obj.x !== null && obj.x !== undefined) {
        const f = M.playerCar ? M.playerCar.group.position : CVH.player.pos;
        meta = Math.round(CVH.u.dist2(f.x, f.z, obj.x, obj.z)) + ' m';
      }
      if (obj.timer > 0) meta += (meta ? ' · ' : '') + CVH.u.fmtTime(obj.timer);
      this.setBanner(obj.label, meta);
    } else {
      this.setBanner(M.storyDoneCache ? 'Free roam — Costa Verde is yours.' : null);
    }
    if (M.playerCar) {
      this.el.speedo.style.opacity = '1';
      this.el.speedVal.textContent = Math.round(Math.abs(M.playerCar.speed) * 3.6);
      this.el.speedCar.textContent = M.playerCar.type.toUpperCase();
      this.el.integrityFill.style.width = M.playerCar.health + '%';
    } else {
      this.el.speedo.style.opacity = '0';
    }
    this._drawMinimap();
  },

  _drawMinimap() {
    const g = this._mm;
    const W = CVH.world;
    const cw = 190, ch = 150;
    const sx = cw / (W.X1 - W.X0), sz = ch / (W.Z1 - W.Z0);
    const X = (x) => (x - W.X0) * sx, Z = (z) => (z - W.Z0) * sz;
    g.fillStyle = '#274b63';
    g.fillRect(0, 0, cw, ch);
    g.fillStyle = '#8fa36b';
    g.fillRect(0, 0, X(W.WATER_X), ch);
    g.fillStyle = '#e6d6a4';
    g.fillRect(X(224), 0, X(W.WATER_X) - X(224), ch);
    g.strokeStyle = 'rgba(30,32,36,0.8)';
    g.lineWidth = 2.4;
    for (let i = 0; i <= W.COLS; i++) { g.beginPath(); g.moveTo(X(W.roadX(i)), 0); g.lineTo(X(W.roadX(i)), ch); g.stroke(); }
    for (let j = 0; j <= W.ROWS; j++) { g.beginPath(); g.moveTo(0, Z(W.roadZ(j))); g.lineTo(X(W.WATER_X), Z(W.roadZ(j))); g.stroke(); }
    // Objective.
    const obj = CVH.missions.objective();
    if (obj && obj.x !== null && obj.x !== undefined) {
      g.fillStyle = '#ffc93e';
      g.beginPath(); g.arc(X(obj.x), Z(obj.z), 4, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,201,62,0.6)';
      g.beginPath(); g.arc(X(obj.x), Z(obj.z), 6.5 + Math.sin(performance.now() / 240) * 1.6, 0, 7); g.stroke();
    }
    // Police blips.
    g.fillStyle = '#ff4d4d';
    for (const c of CVH.police.cars) {
      if (c.dead) continue;
      const p = c.group.position;
      g.fillRect(X(p.x) - 2, Z(p.z) - 2, 4, 4);
    }
    // Player arrow (or the car they're driving).
    const M = CVH.main;
    const f = M.playerCar ? M.playerCar.group.position : CVH.player.pos;
    const hd = M.playerCar ? M.playerCar.heading : CVH.player.heading;
    g.save();
    g.translate(X(f.x), Z(f.z));
    g.rotate(Math.PI - hd);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -5.5); g.lineTo(3.8, 4.4); g.lineTo(0, 2.4); g.lineTo(-3.8, 4.4);
    g.closePath(); g.fill();
    g.restore();
  },
};
