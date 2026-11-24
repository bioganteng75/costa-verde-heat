// audio.js — WebAudio synth sound effects. One muted flag lives here;
// the HUD label is synced through CVH.hud.syncSoundLabel() on every toggle.
(function () {
  'use strict';
  var U = CVH.util;

  var ctx = null;
  var master = null;
  var muted = false;
  var sirenOsc = null;
  var sirenGain = null;
  var sirenTimer = 0;

  function ensureCtx() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted || !ensureCtx()) return;
    try {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch (e) { /* audio is best-effort */ }
  }

  function noise(dur, vol, freq) {
    if (muted || !ensureCtx()) return;
    try {
      var len = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq || 1200;
      var g = ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    } catch (e) { /* best-effort */ }
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.5;
    if (muted) stopSiren();
    if (CVH.hud && CVH.hud.syncSoundLabel) CVH.hud.syncSoundLabel();
  }

  function startSiren() {
    if (muted || !ensureCtx() || sirenOsc) return;
    try {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
    } catch (e) { sirenOsc = null; }
  }
  function stopSiren() {
    if (sirenOsc) {
      try { sirenOsc.stop(); } catch (e) {}
      sirenOsc = null; sirenGain = null;
    }
  }
  function updateSiren(dt, active) {
    if (!active) { stopSiren(); return; }
    startSiren();
    if (sirenOsc) {
      sirenTimer += dt;
      sirenOsc.frequency.value = 700 + Math.sin(sirenTimer * 6) * 250;
    }
  }

  CVH.audio = {
    get muted() { return muted; },
    setMuted: setMuted,
    toggleMute: function () { setMuted(!muted); return muted; },
    click: function () { tone(660, 0.06, 'square', 0.12); },
    pickup: function () { tone(880, 0.09, 'square', 0.18); setTimeout(function () { tone(1320, 0.12, 'square', 0.18); }, 60); },
    cash: function () { tone(990, 0.07, 'triangle', 0.22); setTimeout(function () { tone(1480, 0.1, 'triangle', 0.2); }, 50); },
    punch: function () { noise(0.08, 0.25, 500); },
    shot: function (auto) { noise(auto ? 0.09 : 0.14, 0.4, 2400); tone(160, 0.08, 'sawtooth', 0.15, 60); },
    hurt: function () { tone(220, 0.15, 'sawtooth', 0.2, 110); },
    success: function () {
      var notes = [523, 659, 784, 1046];
      notes.forEach(function (n, i) { setTimeout(function () { tone(n, 0.16, 'triangle', 0.22); }, i * 90); });
    },
    fail: function () { tone(300, 0.25, 'sawtooth', 0.2, 140); },
    engine: function () { tone(90, 0.2, 'sawtooth', 0.08, 140); },
    updateSiren: updateSiren,
    clamp01: function (v) { return U.clamp(v, 0, 1); }
  };
})();
