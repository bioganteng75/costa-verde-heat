// hud.js — DOM heads-up display: cash, health, wanted stars, objective
// banner, speedometer, bust meter, toasts, menus, and the 2D minimap.
window.CVH = window.CVH || {};

CVH.hud = {
  el: {},
  _toastUntil: 0,
  _mm: null, _mmCtx: null,

  init() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), cash: $('cash'), hpBar: $('hpBar'), weapon: $('weapon'),
      stars: $('stars'), bustWrap: $('bustWrap'), bustBar: $('bustBar'),
      banner: $('banner'), objLabel: $('objLabel'), objSub: $('objSub'),
      speedo: $('speedo'), toast: $('toast'), toastTitle: $('toastTitle'), toastBody: $('toastBody'),
      prompt: $('prompt'), crosshair: $('crosshair'),
      menu: $('menu'), pause: $('pause'), end: $('end'), endTitle: $('endTitle'), endText: $('endText'),
      btnContinue: $('btnContinue'), muteState: $('muteState'),
    };
    this._mm = $('minimap');
    this._mmCtx = this._mm.getContext('2d');
    const M = () => CVH.main;
    $('btnNew').addEventListener('click', () => { CVH.audio.init(); M().newGame(); });
    this.el.btnContinue.addEventListener('click', () => { CVH.audio.init(); M().continueGame(); });
    $('btnResume').addEventListener('click', () => M().resume());
    $('btnSave').addEventListener('click', () => { M().saveGame(); this.toast('Saved', 'Progress tucked away safely.', 1800); });
    $('btnRestart').addEventListener('click', () => M().restart());
    $('btnMute').addEventListener('click', () => { const m = CVH.audio.toggleMute(); this.el.muteState.textContent = m ? 'off' : 'on'; });
    $('btnAgain').addEventListener('click', () => M().respawn());
  },

  showMenu(canContinue) {
    this.el.menu.style.display = 'flex';
    this.el.btnContinue.style.display = canContinue ? 'block' : 'none';
    this.el.hud.style.display = 'none';
  },
  hideMenu() { this.el.menu.style.display = 'none'; this.el.hud.style.display = 'block'; },
  showPause() { this.el.pause.style.display = 'flex'; },
  hidePause() { this.el.pause.style.display = 'none'; },
  showEnd(title, text) {
    this.el.endTitle.textContent = title;
    this.el.endText.textContent = text;
    this.el.end.style.display = 'flex';
  },
  hideEnd() { this.el.end.style.display = 'none'; },

  toast(title, body, ms) {
    this.el.toastTitle.textContent = title;
    this.el.toastBody.textContent = body;
    this.el.toast.style.opacity = '1';
    this.el.toast.style.transform = 'translateY(0)';
    this._toastUntil = performance.now() + (ms || 3000);
  },

  setPrompt(text) {
    if (text) { this.el.prompt.textContent = text; this.el.prompt.style.opacity = '1'; }
    else this.el.prompt.style.opacity = '0';
  },

  update(dt) {
    const G = CVH.G, P = CVH.playerCtl, POL = CVH.police;
    if (performance.now() > this._toastUntil) {
      this.el.toast.style.opacity = '0';
      this.el.toast.style.transform = 'translateY(-8px)';
    }
    if (G.state !== 'playing' && G.state !== 'paused') return;
    this.el.cash.textContent = '$' + Math.floor(G.cash);
    const hpFrac = Math.max(0, P.hp / P.maxHp);
    this.el.hpBar.style.width = (hpFrac * 100).toFixed(0) + '%';
    this.el.hpBar.style.background = hpFrac < 0.3 ? '#e23b3b' : '#59d977';
    this.el.weapon.textContent = G.playerCar ? G.playerCar.type.toUpperCase() : (P.weapon === 'fist' ? 'FISTS' : P.weapon.toUpperCase());
    // Wanted stars
    let starsHtml = '';
    for (let i = 0; i < 5; i++) starsHtml += '<span class="' + (i < POL.stars ? 'on' : '') + '">★</span>';
    if (this._starsCache !== starsHtml) { this.el.stars.innerHTML = starsHtml; this._starsCache = starsHtml; }
    this.el.stars.style.opacity = POL.stars > 0 ? '1' : '0.25';
    // Bust meter
    if (POL.bust > 0.02) {
      this.el.bustWrap.style.display = 'block';
      this.el.bustBar.style.width = (POL.bust * 100).toFixed(0) + '%';
    } else this.el.bustWrap.style.display = 'none';
    // Objective banner
    const obj = CVH.missions.objective();
    const focus = G.focusPos();
    if (obj) {
      this.el.banner.style.opacity = '1';
      this.el.objLabel.textContent = obj.label;
      let sub = '';
      if (obj.shake) sub = POL.stars > 0 ? ('Heat: ' + POL.stars + '★ — stay out of sight') : 'Clear!';
      else if (obj.x !== null && obj.x !== undefined) sub = Math.round(CVH.util.dist2D(focus.x, focus.z, obj.x, obj.z)) + ' m';
      if (obj.timer !== null && obj.timer !== undefined) sub += (sub ? '  •  ' : '') + '⏱ ' + Math.max(0, Math.ceil(obj.timer)) + 's';
      this.el.objSub.textContent = sub;
    } else this.el.banner.style.opacity = '0';
    // Speedometer
    if (G.playerCar) {
      this.el.speedo.style.opacity = '1';
      this.el.speedo.textContent = Math.round(G.playerCar.speed2D() * 3.6) + ' km/h';
    } else this.el.speedo.style.opacity = '0';
    // Crosshair only on foot with a gun out
    this.el.crosshair.style.opacity = (!G.playerCar && P.weapon !== 'fist' && G.state === 'playing') ? '1' : '0';
    this._drawMinimap(focus);
  },

  _drawMinimap(focus) {
    const ctx = this._mmCtx, W = CVH.world;
    const cw = this._mm.width, ch = this._mm.height;
    const sx = cw / (W.MAX_X - W.MIN_X), sz = ch / (W.MAX_Z - W.MIN_Z);
    const X = (x) => (x - W.MIN_X) * sx, Z = (z) => (z - W.MIN_Z) * sz;
    ctx.fillStyle = '#20313a'; ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#c9b078'; ctx.fillRect(X(262), 0, (W.MAX_X - 262) * sx, ch);       // beach
    ctx.strokeStyle = 'rgba(200,215,225,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const rx of W.roadXs) { ctx.moveTo(X(rx), 0); ctx.lineTo(X(rx), ch); }
    for (const rz of W.roadZs) { ctx.moveTo(0, Z(rz)); ctx.lineTo(cw, Z(rz)); }
    ctx.stroke();
    // Services
    const L = W.landmarks;
    ctx.fillStyle = '#39d98a';
    ctx.fillRect(X(L.paynspray.x) - 2, Z(L.paynspray.z) - 2, 4, 4);
    // Objective
    const obj = CVH.missions.objective();
    if (obj && obj.x !== null && obj.x !== undefined) {
      const pulse = 3 + Math.sin(performance.now() * 0.008) * 1.2;
      ctx.fillStyle = obj.taxi ? '#59d6ff' : '#ffc93f';
      ctx.beginPath(); ctx.arc(X(obj.x), Z(obj.z), pulse, 0, 6.29); ctx.fill();
    }
    // Police blips
    ctx.fillStyle = (performance.now() % 600 < 300) ? '#ff4444' : '#4477ff';
    for (const c of CVH.police.cars) {
      if (c.dead) continue;
      ctx.fillRect(X(c.group.position.x) - 2, Z(c.group.position.z) - 2, 4, 4);
    }
    // Player arrow
    const heading = CVH.G.playerCar ? CVH.G.playerCar.heading : CVH.playerCtl.heading;
    ctx.save();
    ctx.translate(X(focus.x), Z(focus.z));
    ctx.rotate(Math.PI - heading); // arrow tip starts pointing up (-z world)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -5.5); ctx.lineTo(3.6, 4); ctx.lineTo(-3.6, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  },
};
