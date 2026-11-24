// hud.js — all DOM presentation: the HUD (cash, health, wanted stars,
// objective banner, speedometer, bust meter, prompts, toasts, mission
// intros), the live 2D minimap, and the menu / pause / busted / wasted /
// ending screens. Owns CVH.hud. Buttons report to CVH.hud.onAction,
// which main.js assigns.
//
// OWNER FIX 1 — the minimap player arrow ROTATES with the player's
// heading: every redraw it is drawn under a canvas rotation derived from
// the live heading (character facing on foot, vehicle yaw while
// driving), and the exact angle used is published on
// CVH.debug.lastArrowAngle so the playtest can assert it numerically.
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};

  var hud = CVH.hud = { onAction: null };
  var R = {};            // cached element refs
  var mapCtx = null;
  var toasts = [];       // {el, until}
  var introUntil = 0;
  var lastCash = null, lastWeapon = null, lastStars = -1, lastPrompt = undefined;
  var lastBanner = '', lastHpW = -1;

  function action(name) {
    return function () {
      CVH.audio.unlock();
      CVH.audio.ui();
      if (typeof hud.onAction === 'function') hud.onAction(name);
    };
  }

  hud.init = function () {
    var ids = ['hud', 'cash', 'hpfill', 'weapon', 'stars', 'banner', 'bannerLabel', 'bannerMeta',
      'speedo', 'speedVal', 'carhp', 'minimap', 'bustwrap', 'bustfill', 'prompt', 'toasts',
      'intro', 'introTitle', 'introText', 'menu', 'btnNew', 'btnContinue', 'pause', 'btnResume',
      'btnSave', 'btnRestart', 'btnSound', 'soundState', 'over', 'overTitle', 'overText', 'btnOver',
      'ending', 'endStats', 'btnRoam', 'btnEndNew', 'tickerTrack'];
    for (var i = 0; i < ids.length; i++) R[ids[i]] = CVH.$(ids[i]);
    mapCtx = R.minimap.getContext('2d');

    R.btnNew.addEventListener('click', action('new'));
    R.btnContinue.addEventListener('click', action('continue'));
    R.btnResume.addEventListener('click', action('resume'));
    R.btnSave.addEventListener('click', action('save'));
    R.btnRestart.addEventListener('click', action('restart'));
    R.btnSound.addEventListener('click', action('sound'));
    R.btnOver.addEventListener('click', action('over'));
    R.btnRoam.addEventListener('click', action('roam'));
    R.btnEndNew.addEventListener('click', action('endnew'));
    hud.syncSoundLabel();
  };

  // QA item 6: one function owns the SOUND label, and it reads the true
  // mute state from the audio module — menu button and M key alike.
  hud.syncSoundLabel = function () {
    if (R.soundState) R.soundState.textContent = CVH.audio.muted ? 'OFF' : 'ON';
  };

  // ------------------------------------------------------------- screens
  function show(el, on) { if (el) el.style.display = on ? 'flex' : 'none'; }
  hud.showMenu = function (hasSave) {
    show(R.menu, true); show(R.pause, false); show(R.over, false); show(R.ending, false);
    R.btnContinue.style.display = hasSave ? 'block' : 'none';
    R.hud.style.display = 'none';
  };
  hud.showHud = function () {
    show(R.menu, false); show(R.pause, false); show(R.over, false); show(R.ending, false);
    R.hud.style.display = 'block';
  };
  hud.showPause = function (on) {
    show(R.pause, on);
    if (on) hud.syncSoundLabel();
  };
  hud.showOver = function (kind, text) {
    R.overTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    R.overTitle.className = kind === 'busted' ? 'over-title busted' : 'over-title wasted';
    R.overText.textContent = text;
    show(R.over, true);
  };
  hud.hideOver = function () { show(R.over, false); };
  hud.showEnding = function (stats) {
    R.endStats.innerHTML =
      '<div><span>Cash earned</span><b>' + CVH.fmtCash(stats.earned) + '</b></div>' +
      '<div><span>Story jobs done</span><b>' + stats.jobs + ' / 6</b></div>' +
      '<div><span>Cash packages</span><b>' + stats.packages + ' / 14</b></div>' +
      '<div><span>Wallet now</span><b>' + CVH.fmtCash(CVH.player.cash) + '</b></div>';
    show(R.ending, true);
  };
  hud.hideEnding = function () { show(R.ending, false); };

  // -------------------------------------------------------------- toasts
  hud.toast = function (text, secs) {
    var el = CVH.el('div', 'toast', R.toasts, text);
    toasts.push({ el: el, until: CVH.time + (secs || 2) });
    while (toasts.length > 3) {
      var old = toasts.shift();
      if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
  };
  hud.showIntro = function (title, text) {
    R.introTitle.textContent = title;
    R.introText.textContent = text;
    R.intro.style.display = 'block';
    introUntil = CVH.time + 6.5;
  };
  hud.setPrompt = function (text) {
    if (text === lastPrompt) return;
    lastPrompt = text;
    if (text) {
      R.prompt.textContent = text;
      R.prompt.style.display = 'block';
    } else {
      R.prompt.style.display = 'none';
    }
  };

  // -------------------------------------------------------------- update
  hud.update = function () {
    var player = CVH.player;
    var police = CVH.police;

    if (player.cash !== lastCash) {
      lastCash = player.cash;
      R.cash.textContent = CVH.fmtCash(player.cash);
    }
    var hpW = Math.round(CVH.clamp(player.hp / player.maxHp, 0, 1) * 100);
    if (hpW !== lastHpW) {
      lastHpW = hpW;
      R.hpfill.style.width = hpW + '%';
      R.hpfill.style.background = hpW > 45 ? '#53d769' : (hpW > 22 ? '#f2b134' : '#e03a2e');
    }
    var wname = player.weapon === 'fist' ? 'FISTS' : (player.weapon === 'pistol' ? 'PISTOL' : 'SMG');
    if (wname !== lastWeapon) { lastWeapon = wname; R.weapon.textContent = wname; }

    if (police.stars !== lastStars) {
      lastStars = police.stars;
      var s = '';
      for (var i = 0; i < 5; i++) s += i < police.stars ? '★' : '☆';
      R.stars.textContent = s;
      R.stars.className = police.stars >= 4 ? 'stars hot' : 'stars';
    }

    // objective banner
    var obj = CVH.missions ? CVH.missions.currentObjective() : null;
    var bannerTxt = obj ? obj.label : '';
    if (bannerTxt !== lastBanner) {
      lastBanner = bannerTxt;
      R.banner.style.display = obj ? 'block' : 'none';
      if (obj) R.bannerLabel.textContent = obj.label;
    }
    if (obj) {
      var meta = '';
      if (obj.dist !== null && obj.dist !== undefined) meta = Math.round(obj.dist) + ' m';
      if (obj.timeLeft !== null && obj.timeLeft !== undefined) {
        meta += (meta ? ' · ' : '') + CVH.fmtTime(obj.timeLeft);
        R.bannerMeta.className = obj.timeLeft < 15 ? 'banner-meta urgent' : 'banner-meta';
      } else {
        R.bannerMeta.className = 'banner-meta';
      }
      R.bannerMeta.textContent = meta;
    }

    // speedometer while driving
    if (player.car) {
      R.speedo.style.display = 'block';
      R.speedVal.textContent = Math.round(Math.abs(player.car.speed) * 3.6);
      R.carhp.style.width = Math.round(player.car.hp) + '%';
    } else {
      R.speedo.style.display = 'none';
    }

    // bust meter
    if (police.bust > 0.02) {
      R.bustwrap.style.display = 'block';
      R.bustfill.style.width = Math.round(police.bust * 100) + '%';
    } else {
      R.bustwrap.style.display = 'none';
    }

    // toasts & intro lifetimes
    for (var j = toasts.length - 1; j >= 0; j--) {
      if (CVH.time > toasts[j].until) {
        if (toasts[j].el.parentNode) toasts[j].el.parentNode.removeChild(toasts[j].el);
        toasts.splice(j, 1);
      }
    }
    if (introUntil && CVH.time > introUntil) {
      R.intro.style.display = 'none';
      introUntil = 0;
    }

    drawMinimap();
  };

  // ------------------------------------------------------------- minimap
  // North is up: world -z is the top of the map, world +x is right.
  var VIEW_R = 96; // metres visible from centre to edge
  function drawMinimap() {
    if (!mapCtx || R.hud.style.display === 'none') return;
    var g = mapCtx;
    var S = R.minimap.width;         // 176
    var C = S / 2;
    var scale = C / VIEW_R;
    var player = CVH.player;
    var px = player.x, pz = player.z;
    function mx(x) { return C + (x - px) * scale; }
    function mz(z) { return C + (z - pz) * scale; }

    g.clearRect(0, 0, S, S);
    g.fillStyle = '#20262e';
    g.fillRect(0, 0, S, S);

    // sea & sand to the east
    var W = CVH.WORLD;
    if (mx(W.WATER_X) < S) {
      g.fillStyle = '#e6cf9f';
      g.fillRect(mx(198), 0, Math.max(0, mx(W.WATER_X) - mx(198)), S);
      g.fillStyle = '#2f7ea6';
      g.fillRect(mx(W.WATER_X), 0, S - mx(W.WATER_X), S);
    }

    // roads
    g.strokeStyle = '#454b54';
    g.lineCap = 'butt';
    var i;
    for (i = 0; i < W.ROAD_XS.length; i++) {
      var x = mx(W.ROAD_XS[i]);
      if (x < -10 || x > S + 10) continue;
      g.lineWidth = W.ROAD_W * scale;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke();
    }
    for (i = 0; i < W.ROAD_ZS.length; i++) {
      var z = mz(W.ROAD_ZS[i]);
      if (z < -10 || z > S + 10) continue;
      g.lineWidth = W.ROAD_W * scale;
      g.beginPath(); g.moveTo(0, z); g.lineTo(S, z); g.stroke();
    }

    // traffic (faint) and police (red blips)
    for (i = 0; i < CVH.cars.length; i++) {
      var c = CVH.cars[i];
      var cx = mx(c.pos.x), cz = mz(c.pos.z);
      if (cx < -4 || cx > S + 4 || cz < -4 || cz > S + 4) continue;
      if (c.driver === 'police') {
        g.fillStyle = (Math.sin(CVH.time * 10) > 0) ? '#ff3b30' : '#3b82ff';
        g.beginPath(); g.arc(cx, cz, 3.4, 0, 6.29); g.fill();
      } else if (c !== player.car) {
        g.fillStyle = 'rgba(230,230,230,0.5)';
        g.fillRect(cx - 1.6, cz - 1.6, 3.2, 3.2);
      }
    }

    // objective marker (clamped to the rim when far away)
    var obj = CVH.missions ? CVH.missions.currentObjective() : null;
    if (obj && obj.x !== null && obj.x !== undefined) {
      var ox = mx(obj.x), oz = mz(obj.z);
      var dx = ox - C, dz = oz - C;
      var dl = Math.sqrt(dx * dx + dz * dz);
      if (dl > C - 8) { ox = C + dx / dl * (C - 8); oz = C + dz / dl * (C - 8); }
      g.fillStyle = '#ffc93c';
      g.beginPath(); g.arc(ox, oz, 4.4, 0, 6.29); g.fill();
      g.strokeStyle = '#7a5b00';
      g.lineWidth = 1.4;
      g.beginPath(); g.arc(ox, oz, 4.4, 0, 6.29); g.stroke();
    }

    // ---- the player arrow (owner fix 1): rotated by the live heading
    var heading = player.car ? player.car.yaw : player.heading;
    var hx = Math.sin(heading), hz = Math.cos(heading);
    var angle = Math.atan2(hx, -hz);
    CVH.debug.lastArrowAngle = angle;
    CVH.debug.arrowHeading = heading;
    g.save();
    g.translate(C, C);
    g.rotate(angle);
    g.beginPath();
    g.moveTo(0, -9.5);
    g.lineTo(6.4, 7.5);
    g.lineTo(0, 3.6);
    g.lineTo(-6.4, 7.5);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = '#12303f';
    g.lineWidth = 1.6;
    g.stroke();
    g.restore();

    // north marker
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 11px Arial';
    g.textAlign = 'center';
    g.fillText('N', C, 13);
  }
})();
