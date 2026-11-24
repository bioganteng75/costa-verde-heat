// audio.js — tiny WebAudio synth: engine hum, shots, pickups, sirens, UI.
// One single `muted` flag lives here; every toggle path (M key, pause
// button) flips it through audio.toggleMute() and then hud.syncSoundLabel().
(function () {
  'use strict';
  var CVH = window.CVH;

  var ctx = null;
  var master = null;
  var engineOsc = null;
  var engineGain = null;
  var sirenOsc = null;
  var sirenGain = null;

  var audio = {
    muted: false,
    started: false,

    init: function () {
      if (audio.started) return;
      audio.started = true;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = audio.muted ? 0 : 0.5;
        master.connect(ctx.destination);
      } catch (e) {
        ctx = null;
      }
    },

    resume: function () {
      if (ctx && ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) { /* ignored */ }
      }
    },

    toggleMute: function () {
      audio.muted = !audio.muted;
      if (master && ctx) {
        master.gain.setValueAtTime(audio.muted ? 0 : 0.5, ctx.currentTime);
      }
      if (CVH.hud && CVH.hud.syncSoundLabel) CVH.hud.syncSoundLabel();
      return audio.muted;
    },

    setMuted: function (m) {
      audio.muted = !!m;
      if (master && ctx) master.gain.setValueAtTime(audio.muted ? 0 : 0.5, ctx.currentTime);
      if (CVH.hud && CVH.hud.syncSoundLabel) CVH.hud.syncSoundLabel();
    },

    blip: function (freq, dur, type, vol, slideTo) {
      if (!ctx || audio.muted) return;
      try {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
        g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        o.connect(g); g.connect(master);
        o.start(); o.stop(ctx.currentTime + dur);
      } catch (e) { /* ignored */ }
    },

    noise: function (dur, vol, lowFreq) {
      if (!ctx || audio.muted) return;
      try {
        var len = Math.max(1, (ctx.sampleRate * dur) | 0);
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = lowFreq || 1200;
        var g = ctx.createGain();
        g.gain.value = vol || 0.3;
        src.connect(filter); filter.connect(g); g.connect(master);
        src.start();
      } catch (e) { /* ignored */ }
    },

    shot: function (smg) {
      audio.noise(smg ? 0.07 : 0.12, 0.35, smg ? 2400 : 1500);
      audio.blip(smg ? 220 : 160, 0.06, 'sawtooth', 0.12, 60);
    },
    punch: function () { audio.noise(0.08, 0.25, 700); },
    pickup: function () { audio.blip(660, 0.09, 'square', 0.18); setTimeout(function () { audio.blip(990, 0.12, 'square', 0.18); }, 70); },
    cash: function () { audio.blip(880, 0.07, 'triangle', 0.22); setTimeout(function () { audio.blip(1320, 0.1, 'triangle', 0.22); }, 60); },
    door: function () { audio.blip(180, 0.08, 'triangle', 0.2, 120); },
    crash: function () { audio.noise(0.2, 0.4, 500); },
    heal: function () { audio.blip(520, 0.1, 'sine', 0.2, 780); },
    fail: function () { audio.blip(220, 0.25, 'sawtooth', 0.2, 110); },
    jobDone: function () {
      audio.blip(523, 0.1, 'square', 0.18);
      setTimeout(function () { audio.blip(659, 0.1, 'square', 0.18); }, 90);
      setTimeout(function () { audio.blip(784, 0.16, 'square', 0.18); }, 180);
    },

    engine: function (speedRatio, running) {
      if (!ctx) return;
      try {
        if (running && !engineOsc) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'sawtooth';
          engineGain.gain.value = 0.0;
          var f = ctx.createBiquadFilter();
          f.type = 'lowpass'; f.frequency.value = 400;
          engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
          engineOsc.start();
        }
        if (engineOsc) {
          var target = running ? 0.05 + Math.abs(speedRatio) * 0.05 : 0.0;
          engineGain.gain.setTargetAtTime(audio.muted ? 0 : target, ctx.currentTime, 0.1);
          engineOsc.frequency.setTargetAtTime(55 + Math.abs(speedRatio) * 140, ctx.currentTime, 0.1);
        }
      } catch (e) { /* ignored */ }
    },

    siren: function (active) {
      if (!ctx) return;
      try {
        if (active && !sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenGain = ctx.createGain();
          sirenOsc.type = 'triangle';
          sirenGain.gain.value = 0.0;
          sirenOsc.connect(sirenGain); sirenGain.connect(master);
          sirenOsc.start();
        }
        if (sirenOsc) {
          var t = ctx.currentTime;
          sirenGain.gain.setTargetAtTime(active && !audio.muted ? 0.045 : 0.0, t, 0.2);
          if (active) sirenOsc.frequency.setValueAtTime(700 + Math.sin(t * 4.2) * 180, t);
        }
      } catch (e) { /* ignored */ }
    }
  };

  CVH.audio = audio;
})();
