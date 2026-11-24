// hud.js — DOM HUD (cash, stars, health, weapon, speedo, banner, toast)
// and the 2D minimap. The minimap player marker is a TRIANGLE rotated
// by the live heading — character facing on foot, vehicle yaw while
// driving — recomputed on every draw, and the drawn angle is published
// to CVH.debug.lastArrowAngle for the playtest.
(function () {
  'use strict';
  var CVH = window.CVH;
  var U = CVH.util;

  var el = {};
  var toastTimer = null;

  var hud = {
    el: el,

    init: function () {
      ['cash', 'stars', 'healthFill', 'weapon', 'speedo', 'banner', 'bannerText', 'toast',
       'minimap', 'soundState', 'bustFill', 'bustWrap', 'objective', 'jobTitle'].forEach(function (id) {
        el[id] = document.getElementById(id);
      });
      hud.syncSoundLabel();
    },

    // The one place the SOUND label is written; audio.toggleMute and
    // audio.setMuted both call this, so every toggle path stays in sync.
    syncSoundLabel: function () {
      var s = document.getElementById('soundState');
      if (s) s.textContent = CVH.audio && CVH.audio.muted ? 'OFF' : 'ON';
      var b = document.getElementById('btnSound');
      if (b) b.textContent = 'SOUND: ' + (CVH.audio && CVH.audio.muted ? 'OFF' : 'ON');
    },

    toast: function (msg, ms) {
      if (!el.toast) return;
      el.toast.textContent = msg;
      el.toast.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { el.toast.style.opacity = '0'; }, ms || 3400);
    },

    update: function () {
      var player = CVH.player;
      if (el.cash) el.cash.textContent = '$' + player.cash;
      if (el.stars) {
        var st = CVH.police.stars();
        var s = '';
        for (var i = 0; i < 5; i++) s += i < st ? '★' : '☆';
        el.stars.textContent = s;
        el.stars.style.color = st > 0 ? '#ffd34f' : '#8a93a3';
      }
      if (el.healthFill) el.healthFill.style.width = U.clamp(player.health, 0, 100) + '%';
      if (el.weapon) {
        var w = player.weapon;
        el.weapon.textContent = w === 'fist' ? 'FISTS' :
          w === 'pistol' ? 'PISTOL · ' + player.ammoPistol : 'SMG · ' + player.ammoSmg;
      }
      if (el.speedo) {
        if (player.driving && player.car) {
          el.speedo.style.display = 'block';
          el.speedo.textContent = Math.round(Math.abs(player.car.speed) * 3.6) + ' km/h';
        } else el.speedo.style.display = 'none';
      }
      if (el.bustWrap) {
        var bust = CVH.police.bust;
        el.bustWrap.style.display = bust > 0.02 ? 'block' : 'none';
        if (el.bustFill) el.bustFill.style.width = Math.round(bust * 100) + '%';
      }
      // objective banner
      var t = CVH.missions.targetPoint();
      if (el.banner && el.bannerText) {
        if (t) {
          el.banner.style.display = 'block';
          var pos = player.pos();
          var d = Math.round(U.dist(pos.x, pos.z, t.x, t.z));
          var txt = t.label + '  ·  ' + d + ' m';
          if (t.timer > 0) txt += '  ·  ' + Math.ceil(t.timer) + 's';
          if (t.kind === 'job') {
            var job = CVH.missions.JOBS[CVH.missions.active];
            if (job) txt = job.title.replace(/^Job \d+ — /, '') + ': ' + txt;
          }
          el.bannerText.textContent = txt;
        } else {
          el.banner.style.display = 'none';
        }
      }
      hud.drawMinimap();
    },

    // ------------------------------------------------------------
    // Minimap: north-up. World x -> canvas x, world z -> canvas y.
    // The player arrow is a triangle whose tip is the facing vector
    // rotated into canvas space: drawnAngle = atan2(f.x, -f.z).
    // ------------------------------------------------------------
    drawMinimap: function () {
      var cv = el.minimap;
      if (!cv) return;
      var g = cv.getContext('2d');
      var W = cv.width, H = cv.height;
      var world = CVH.world;
      var scale = W / 560;
      function mx(x) { return (x + 260) * scale; }
      function mz(z) { return (z + 260) * scale; }

      g.fillStyle = '#3d5a34';
      g.fillRect(0, 0, W, H);
      // water + sand
      g.fillStyle = '#2e6f9e';
      g.fillRect(mx(world.waterX), 0, W - mx(world.waterX), H);
      g.fillStyle = '#e3cf9e';
      g.fillRect(mx(228), 0, mx(world.waterX) - mx(228), H);
      // roads
      g.fillStyle = '#3a3d44';
      world.avenues.forEach(function (z) { g.fillRect(0, mz(z) - 7 * scale, W, 14 * scale); });
      world.streets.forEach(function (x) { g.fillRect(mx(x) - 7 * scale, 0, 14 * scale, H); });
      // pier
      g.fillStyle = '#8a6f4d';
      g.fillRect(mx(world.pier.minX), mz(world.pier.minZ), (world.pier.maxX - world.pier.minX) * scale, (world.pier.maxZ - world.pier.minZ) * scale);

      var player = CVH.player;
      var pos = player.pos();

      function blip(x, z, color, r) {
        g.fillStyle = color;
        g.beginPath();
        g.arc(mx(x), mz(z), r || 3, 0, Math.PI * 2);
        g.fill();
      }
      // objective + services
      var t = CVH.missions.targetPoint();
      if (t) blip(t.x, t.z, t.kind === 'taxi' ? '#4fc3ff' : '#ffd34f', 4);
      blip(world.porch.x, world.porch.z, '#ff9d5c', 3);
      blip(world.payNSpray.x, world.payNSpray.z, '#3fd97e', 3);
      // police
      CVH.police.force.forEach(function (c) { if (!c.dead) blip(c.x, c.z, '#4f8dff', 3); });
      // traffic
      g.fillStyle = '#c8ccd4';
      CVH.vehicles.traffic.forEach(function (c) {
        g.fillRect(mx(c.x) - 1.5, mz(c.z) - 1.5, 3, 3);
      });

      // --- the rotating player arrow ---
      var heading = player.driving && player.car ? player.car.yaw : player.heading;
      var f = U.facing(heading);
      var drawn = Math.atan2(f.x, -f.z);
      CVH.debug.lastArrowAngle = drawn;
      var cx = mx(pos.x), cy = mz(pos.z);
      g.save();
      g.translate(cx, cy);
      g.rotate(drawn);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#14161f';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(0, -8);      // tip (facing)
      g.lineTo(5.5, 6);
      g.lineTo(0, 3.4);
      g.lineTo(-5.5, 6);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  };

  CVH.hud = hud;
})();
