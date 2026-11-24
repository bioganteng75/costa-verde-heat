// audio.js — every sound in the game is synthesized with WebAudio:
// engine hum tied to speed, a two-tone police siren, gunshots, crashes,
// pickup chimes and UI blips. No audio files, no network. Owns CVH.audio.
// The mute flag flips only here; hud.js asks audio.muted to draw its
// SOUND label, which keeps the two in sync by construction (QA item 6).
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};

  var ctx = null, master = null;
  var engineOsc = null, engineGain = null, engineFilter = null;
  var sirenOsc = null, sirenGain = null, sirenTimer = 0, sirenHigh = false;

  var audio = CVH.audio = {
    muted: false,
    ready: false
  };

  audio.unlock = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = audio.muted ? 0 : 0.5;
      master.connect(ctx.destination);
      audio.ready = true;
    } catch (e) { ctx = null; }
  };

  audio.toggleMute = function () {
    audio.muted = !audio.muted;
    if (master && ctx) master.gain.setValueAtTime(audio.muted ? 0 : 0.5, ctx.currentTime);
    return audio.muted;
  };
  audio.setMuted = function (m) {
    if (audio.muted !== m) audio.toggleMute();
  };

  function env(node, t0, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function tone(freq, type, a, peak, d, slideTo) {
    if (!ctx || audio.muted) return;
    var t0 = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + a + d);
    env(g, t0, a, peak, d);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + a + d + 0.05);
  }
  function noise(dur, peak, freq, q) {
    if (!ctx || audio.muted) return;
    var t0 = ctx.currentTime;
    var len = Math.max(1, (dur * ctx.sampleRate) | 0);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 0.8;
    var g = ctx.createGain(); g.gain.value = peak;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  audio.ui = function () { tone(660, 'sine', 0.005, 0.15, 0.07); };
  audio.pickup = function () { tone(880, 'sine', 0.005, 0.18, 0.09); setTimeout(function () { tone(1320, 'sine', 0.005, 0.18, 0.12); }, 55); };
  audio.cash = function () { tone(990, 'triangle', 0.005, 0.2, 0.08); setTimeout(function () { tone(1480, 'triangle', 0.005, 0.2, 0.14); }, 60); };
  audio.shot = function () { noise(0.11, 0.5, 1800, 0.4); tone(150, 'square', 0.002, 0.25, 0.06, 60); };
  audio.punch = function () { noise(0.07, 0.35, 500, 0.7); };
  audio.crash = function (hard) { noise(hard ? 0.35 : 0.18, hard ? 0.6 : 0.35, 300, 0.5); tone(90, 'sine', 0.002, 0.3, 0.2, 40); };
  audio.busted = function () { tone(392, 'square', 0.01, 0.16, 0.25); setTimeout(function () { tone(311, 'square', 0.01, 0.16, 0.4); }, 180); };
  audio.mission = function () { tone(523, 'triangle', 0.01, 0.2, 0.12); setTimeout(function () { tone(784, 'triangle', 0.01, 0.2, 0.2); }, 110); };

  // Continuous engine voice while the player drives.
  audio.engine = function (on, speed01) {
    if (!ctx) return;
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
      engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400;
      engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    }
    if (!engineOsc) return;
    var t = ctx.currentTime;
    if (on) {
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, t, 0.06);
      engineFilter.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.06);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, t, 0.08);
    } else {
      engineGain.gain.setTargetAtTime(0.0, t, 0.05);
    }
  };

  // Two-tone siren while police are actively hunting nearby.
  audio.siren = function (on, dt) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle';
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0.045;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      sirenTimer = 0; sirenHigh = false;
    }
    if (!sirenOsc) return;
    if (!on) {
      try { sirenOsc.stop(); } catch (e) {}
      sirenOsc = null; sirenGain = null;
      return;
    }
    sirenTimer -= dt;
    if (sirenTimer <= 0) {
      sirenTimer = 0.42;
      sirenHigh = !sirenHigh;
      sirenOsc.frequency.setValueAtTime(sirenHigh ? 950 : 700, ctx.currentTime);
    }
  };
})();
