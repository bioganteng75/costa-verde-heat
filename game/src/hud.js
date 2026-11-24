// Costa Verde Heat — HUD: cash, stars, health, bust meter, objective line,
// prompts, banners, toasts, the SOUND label, and the 2D minimap whose player
// arrow rotates with the live heading (published to CVH.debug.lastArrowAngle
// on every draw).
CVH.hud = (function () {
  let els = {};
  let bannerUntil = 0, toastUntil = 0;
  let mapCtx = null;

  function el(id) { return document.getElementById(id); }

  const api = {
    init: function () {
      els = {
        cash: el('hudCash'), stars: el('hudStars'), health: el('hudHealthFill'),
        objective: el('hudObjective'), prompt: el('hudPrompt'),
        banner: el('banner'), bannerTitle: el('bannerTitle'), bannerSub: el('bannerSub'),
        toast: el('toast'), sound: el('soundLabel'), speed: el('hudSpeed'),
        bustWrap: el('bustWrap'), bustFill: el('bustFill'),
        map: el('minimap')
      };
      if (els.map) mapCtx = els.map.getContext('2d');
      if (els.sound) els.sound.addEventListener('click', function () { CVH.audio.ensure(); CVH.audio.toggleMuted(); });
      api.refreshSoundLabel();
    },

    // The ONLY writer of sound-label text: called on init and by
    // audio.setMuted, so the M key, HUD button and pause button never desync.
    refreshSoundLabel: function () {
      const label = 'SOUND: ' + (CVH.audio.muted ? 'OFF' : 'ON');
      if (els.sound) els.sound.textContent = label;
      const pb = el('pauseSoundBtn');
      if (pb) pb.textContent = label;
    },

    banner: function (title, sub) {
      if (!els.banner) return;
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub || '';
      els.banner.classList.add('show');
      bannerUntil = performance.now() + 2800;
    },

    toast: function (msg) {
      if (!els.toast) return;
      els.toast.textContent = msg;
      els.toast.classList.add('show');
      toastUntil = performance.now() + 2300;
    },

    setObjective: function (t) { if (els.objective) els.objective.textContent = t || ''; },
    setPrompt: function (t) {
      if (!els.prompt) return;
      els.prompt.textContent = t || '';
      els.prompt.style.opacity = t ? '1' : '0';
    },

    update: function () {
      const now = performance.now();
      if (els.banner && now > bannerUntil) els.banner.classList.remove('show');
      if (els.toast && now > toastUntil) els.toast.classList.remove('show');
      const p = CVH.player;
      if (els.cash) els.cash.textContent = '$' + Math.floor(p.cash);
      if (els.stars) {
        const w = CVH.police.wanted();
        els.stars.textContent = '★★★★★'.slice(0, w) + '☆☆☆☆☆'.slice(0, 5 - w);
        els.stars.style.color = w > 0 ? '#ffc93c' : '#5a6068';
      }
      if (els.health) els.health.style.width = CVH.clamp(p.health, 0, 100) + '%';
      if (els.bustWrap) {
        const b = CVH.police.bust;
        els.bustWrap.style.opacity = b > 0.02 ? '1' : '0';
        if (els.bustFill) els.bustFill.style.width = Math.round(b * 100) + '%';
      }
      if (els.speed) {
        if (p.state === 'car' && p.car) {
          els.speed.textContent = Math.round(Math.abs(p.car.speed) * 3.6) + ' km/h';
          els.speed.style.opacity = '1';
        } else els.speed.style.opacity = '0';
      }
      api.drawMinimap();
    },

    drawMinimap: function () {
      if (!mapCtx || !els.map) return;
      const g = mapCtx;
      const S = els.map.width;         // 176
      const C = S / 2;
      const scale = S / 300;           // 300 m across the map
      const p = CVH.player;
      function mx(wx) { return C + (wx - p.pos.x) * scale; }
      function mz(wz) { return C + (wz - p.pos.z) * scale; }
      g.clearRect(0, 0, S, S);
      g.fillStyle = '#20262c';
      g.fillRect(0, 0, S, S);
      // water + beach
      g.fillStyle = '#1d5f73';
      g.fillRect(mx(CVH.world.WATER_X), 0, S, S);
      g.fillStyle = '#d9c08a';
      g.fillRect(mx(CVH.world.BEACH_X), 0, Math.max(0, mx(CVH.world.WATER_X) - mx(CVH.world.BEACH_X)), S);
      // roads
      g.strokeStyle = '#4a5058';
      g.lineWidth = Math.max(1.5, CVH.world.ROAD_W * scale);
      CVH.world.AVENUES_X.forEach(function (ax) {
        g.beginPath(); g.moveTo(mx(ax), 0); g.lineTo(mx(ax), S); g.stroke();
      });
      CVH.world.STREETS_Z.forEach(function (sz) {
        g.beginPath(); g.moveTo(0, mz(sz)); g.lineTo(S, mz(sz)); g.stroke();
      });
      // cash packages still out there
      g.fillStyle = '#f2c230';
      CVH.world.points.packages.forEach(function (pt, i) {
        if (CVH.missions.packagesFound[i]) return;
        g.fillRect(mx(pt.x) - 1.5, mz(pt.z) - 1.5, 3, 3);
      });
      // objective
      const obj = CVH.missions.objectivePoint ? CVH.missions.objectivePoint() : null;
      if (obj) {
        g.fillStyle = '#ffc93c';
        g.beginPath(); g.arc(mx(obj.x), mz(obj.z), 4, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,201,60,0.5)';
        g.lineWidth = 2;
        g.beginPath(); g.arc(mx(obj.x), mz(obj.z), 6.5, 0, Math.PI * 2); g.stroke();
      }
      // police
      g.fillStyle = '#5a8cff';
      CVH.police.cars.forEach(function (c) {
        if (c.dead) return;
        g.fillRect(mx(c.mesh.position.x) - 2, mz(c.mesh.position.z) - 2, 4, 4);
      });
      // player arrow — rotated by the LIVE heading (car heading while driving)
      const heading = (p.state === 'car' && p.car) ? p.car.heading : p.heading;
      const angle = CVH.wrapAngle(-heading);
      CVH.debug.lastArrowAngle = angle;
      g.save();
      g.translate(C, C);
      g.rotate(angle);
      g.beginPath();
      g.moveTo(0, -8);
      g.lineTo(5.4, 6.4);
      g.lineTo(0, 3.4);
      g.lineTo(-5.4, 6.4);
      g.closePath();
      g.fillStyle = '#ffffff';
      g.fill();
      g.lineWidth = 1.6;
      g.strokeStyle = '#101216';
      g.stroke();
      g.restore();
      // frame
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 2;
      g.strokeRect(1, 1, S - 2, S - 2);
    }
  };
  return api;
})();
