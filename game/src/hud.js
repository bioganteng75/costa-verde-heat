// hud.js — DOM HUD (cash, hp, stars, heat, speed, objective banner, toasts)
// and the 2D minimap. The player marker is a TRIANGLE rotated by the live
// heading on every redraw; the drawn angle is published to
// CVH.debug.lastArrowAngle for verification.
(function () {
  'use strict';
  var U = CVH.util;
  var W = CVH.world;

  var el = {};
  var toastTimer = null;

  function grab() {
    ['hudCash', 'hudHpFill', 'hudStars', 'hudHeatFill', 'hudSpeed', 'hudWeapon',
     'bannerText', 'bannerDist', 'toast', 'minimap', 'bustWrap', 'bustFill'].forEach(function (id) {
      el[id] = document.getElementById(id);
    });
  }

  function toast(msg, ms) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.style.opacity = '0'; }, ms || 2600);
  }

  function syncSoundLabel() {
    var label = CVH.audio.muted ? 'OFF' : 'ON';
    var nodes = document.querySelectorAll('.soundState');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = label;
  }

  function update() {
    var P = CVH.player.data;
    if (el.hudCash) el.hudCash.textContent = '$' + P.cash;
    if (el.hudHpFill) el.hudHpFill.style.width = Math.max(0, P.hp) + '%';
    if (el.hudStars) {
      var s = '';
      for (var i = 0; i < 5; i++) s += i < CVH.police.stars ? '★' : '☆';
      el.hudStars.textContent = s;
    }
    if (el.hudHeatFill) el.hudHeatFill.style.width = (CVH.police.heat / 250 * 100) + '%';
    if (el.hudSpeed) el.hudSpeed.textContent = P.driving ? Math.round(Math.abs(P.driving.speed) * 3.6) + ' km/h' : '';
    if (el.hudWeapon) el.hudWeapon.textContent = P.weapon === 'fist' ? 'FISTS' : P.weapon.toUpperCase();
    if (el.bustWrap) {
      var b = CVH.police.bust;
      el.bustWrap.style.display = b > 2 ? 'block' : 'none';
      if (el.bustFill) el.bustFill.style.width = b + '%';
    }
    var obj = CVH.missions.currentObjective();
    if (el.bannerText) {
      var txt = obj.label;
      if (obj.job) txt = obj.job + ' — ' + txt;
      if (obj.timer !== null && obj.timer !== undefined) txt += ' · ' + Math.ceil(obj.timer) + 's';
      el.bannerText.textContent = txt;
    }
    if (el.bannerDist) {
      if (obj.x !== null && obj.x !== undefined) {
        var d = Math.round(U.dist(P.x, P.z, obj.x, obj.z));
        el.bannerDist.textContent = d + ' m';
      } else el.bannerDist.textContent = '';
    }
    drawMinimap(P);
  }

  function drawMinimap(P) {
    var cv = el.minimap;
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var S = cv.width; // 190
    var EXT = 580, OFF = 290;
    function mx(x) { return (x + OFF) / EXT * S; }
    function mz(z) { return (z + OFF) / EXT * S; }
    ctx.fillStyle = '#20303c';
    ctx.fillRect(0, 0, S, S);
    // water + sand
    ctx.fillStyle = '#2e6f9e';
    ctx.fillRect(mx(W.WATER_X), 0, S - mx(W.WATER_X), S);
    ctx.fillStyle = '#e3cf9e';
    ctx.fillRect(mx(W.SAND_X), 0, mx(W.WATER_X) - mx(W.SAND_X), S);
    // roads
    ctx.strokeStyle = '#596068';
    ctx.lineWidth = Math.max(1, 14 / EXT * S);
    W.VX.forEach(function (x) { ctx.beginPath(); ctx.moveTo(mx(x), 0); ctx.lineTo(mx(x), S); ctx.stroke(); });
    W.HZ.forEach(function (z) { ctx.beginPath(); ctx.moveTo(0, mz(z)); ctx.lineTo(S, mz(z)); ctx.stroke(); });
    // packages
    ctx.fillStyle = '#51e06a';
    W.PACKAGES.forEach(function (pk) { ctx.fillRect(mx(pk.x) - 1.5, mz(pk.z) - 1.5, 3, 3); });
    // objective blip
    var obj = CVH.missions.currentObjective();
    if (obj.x !== null && obj.x !== undefined) {
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath(); ctx.arc(mx(obj.x), mz(obj.z), 3.6, 0, Math.PI * 2); ctx.fill();
    }
    // police blips
    CVH.vehicles.cars.forEach(function (c) {
      if (c.type !== 'police' || c.dead) return;
      ctx.fillStyle = (Math.floor(performance.now() / 300) % 2) ? '#ff5252' : '#4d7cff';
      ctx.beginPath(); ctx.arc(mx(c.x), mz(c.z), 2.6, 0, Math.PI * 2); ctx.fill();
    });
    // player arrow — rotated by the LIVE heading every redraw
    var f = U.fwd(P.heading);
    var ang = Math.atan2(f.x, -f.z);
    if (!CVH.debug) CVH.debug = {};
    CVH.debug.lastArrowAngle = ang;
    ctx.save();
    ctx.translate(mx(P.x), mz(P.z));
    ctx.rotate(ang);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#10131a';
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(0, 2.4);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  CVH.hud = {
    grab: grab, toast: toast, update: update,
    syncSoundLabel: syncSoundLabel, drawMinimap: drawMinimap,
    get el() { return el; }
  };
  if (!CVH.debug) CVH.debug = {};
})();
