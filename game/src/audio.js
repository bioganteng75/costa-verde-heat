// Costa Verde Heat — WebAudio synth sounds. One muted flag lives here
// (CVH.audio.muted); every toggle path (M key, HUD button, pause button)
// goes through CVH.audio.setMuted so the HUD label can never desync.
CVH.audio = (function () {
  let ctx = null;
  let master = null;
  let sirenOsc = null;
  let sirenGain = null;

  const api = {
    muted: CVH.store.get('cvhMuted', '0') === '1',

    ensure: function () {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = api.muted ? 0 : 0.5;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; }
    },

    setMuted: function (m) {
      api.muted = !!m;
      CVH.store.set('cvhMuted', api.muted ? '1' : '0');
      if (master && ctx) master.gain.setTargetAtTime(api.muted ? 0 : 0.5, ctx.currentTime, 0.02);
      if (CVH.hud && CVH.hud.refreshSoundLabel) CVH.hud.refreshSoundLabel();
    },
    toggleMuted: function () { api.setMuted(!api.muted); },

    tone: function (freq, dur, type, vol, slideTo) {
      if (!ctx || api.muted) return;
      try {
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
        g.gain.setValueAtTime(vol || 0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + 0.02);
      } catch (e) { /* sound is best-effort */ }
    },

    noise: function (dur, vol, low) {
      if (!ctx || api.muted) return;
      try {
        const t = ctx.currentTime;
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low || 1200;
        const g = ctx.createGain(); g.gain.value = vol || 0.3;
        src.connect(f); f.connect(g); g.connect(master);
        src.start(t);
      } catch (e) { /* best-effort */ }
    },

    blip: function () { api.tone(660, 0.08, 'square', 0.15); },
    pickup: function () { api.tone(523, 0.09, 'square', 0.18); setTimeout(function () { api.tone(784, 0.14, 'square', 0.18); }, 70); },
    cash: function () { api.tone(880, 0.07, 'triangle', 0.22); setTimeout(function () { api.tone(1174, 0.12, 'triangle', 0.22); }, 60); },
    shot: function () { api.noise(0.12, 0.35, 2600); },
    crash: function () { api.noise(0.25, 0.4, 500); api.tone(90, 0.25, 'sawtooth', 0.2, 40); },
    hurt: function () { api.tone(160, 0.15, 'sawtooth', 0.2, 70); },
    jobDone: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { api.tone(f, 0.16, 'square', 0.18); }, i * 90); }); },
    bustedJingle: function () { [392, 330, 262].forEach(function (f, i) { setTimeout(function () { api.tone(f, 0.22, 'triangle', 0.22); }, i * 140); }); },

    setSiren: function (on) {
      if (!ctx) return;
      try {
        if (on && !sirenOsc && !api.muted) {
          sirenOsc = ctx.createOscillator();
          sirenGain = ctx.createGain();
          sirenOsc.type = 'triangle';
          sirenGain.gain.value = 0.05;
          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          lfo.frequency.value = 0.7; lfoGain.gain.value = 180;
          lfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
          sirenOsc.frequency.value = 820;
          sirenOsc.connect(sirenGain); sirenGain.connect(master);
          sirenOsc.start(); lfo.start();
          sirenOsc._lfo = lfo;
        } else if (!on && sirenOsc) {
          sirenOsc.stop(); if (sirenOsc._lfo) sirenOsc._lfo.stop();
          sirenOsc = null; sirenGain = null;
        }
      } catch (e) { /* best-effort */ }
    }
  };
  return api;
})();
