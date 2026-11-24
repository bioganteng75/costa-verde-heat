'use strict';
// Costa Verde Heat 3D — a tiny WebAudio synth: engine hum tied to speed, a
// two-tone police siren, gunshots, crashes, pickups and UI blips. No audio
// files, everything is oscillators and filtered noise. M (or the pause menu)
// mutes through toggleMute(); the HUD label reads `muted` to stay in sync.

CVH.audio = {
  ctx: null,
  master: null,
  muted: false,
  _engine: null,
  _engineGain: null,
  _siren: null,
  _sirenGain: null,
  _noiseBuf: null,

  init: function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      this.ctx = null;
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);

    // A shared white-noise buffer for shots, crashes and skids.
    const len = this.ctx.sampleRate * 0.6;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  },

  toggleMute: function () {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  },

  _blip: function (freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  _noise: function (dur, vol, freq, q) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq || 1200; f.Q.value = q || 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },

  ui: function () { this._blip(660, 0.07, 'triangle', 0.16); },
  pickup: function () {
    this._blip(880, 0.09, 'sine', 0.2);
    const self = this;
    setTimeout(function () { self._blip(1320, 0.12, 'sine', 0.2); }, 70);
  },
  cash: function () { this._blip(990, 0.08, 'square', 0.1); this._blip(1480, 0.12, 'square', 0.08); },
  shot: function (kind) {
    if (kind === 'smg') { this._noise(0.09, 0.32, 2600); this._blip(190, 0.07, 'square', 0.16, 60); }
    else { this._noise(0.16, 0.42, 1800); this._blip(140, 0.12, 'square', 0.2, 45); }
  },
  punch: function () { this._noise(0.08, 0.25, 700); },
  crash: function (strength) {
    const v = CVH.clamp(strength, 0.05, 0.6);
    this._noise(0.28, v, 500);
    this._blip(70, 0.22, 'sawtooth', v * 0.7, 34);
  },
  skid: function () { this._noise(0.12, 0.06, 3200, 2); },
  alarm: function () { this._blip(1174, 0.14, 'square', 0.14); this._blip(1174, 0.14, 'square', 0.14); },

  // Continuous engine note; call every frame with speed ratio 0..1, or with
  // on=false to park it. Created lazily so menus stay silent.
  engine: function (ratio, on) {
    if (!this.ctx) return;
    if (on && !this._engine) {
      const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = this.ctx.createOscillator(); o2.type = 'square';
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 2;
      const g = this.ctx.createGain(); g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this._engine = { o1: o1, o2: o2, f: f };
      this._engineGain = g;
    }
    if (!this._engine) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + ratio * 0.05 : 0;
    this._engineGain.gain.setTargetAtTime(target, t, 0.08);
    if (on) {
      const fr = 55 + ratio * 175;
      this._engine.o1.frequency.setTargetAtTime(fr, t, 0.05);
      this._engine.o2.frequency.setTargetAtTime(fr * 0.5 + 3, t, 0.05);
      this._engine.f.frequency.setTargetAtTime(320 + ratio * 900, t, 0.1);
    }
  },

  // Two-tone siren for nearby police; on=false parks it.
  siren: function (on, dist01) {
    if (!this.ctx) return;
    if (on && !this._siren) {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 960;
      const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.55;
      const lg = this.ctx.createGain(); lg.gain.value = 190;
      lfo.connect(lg); lg.connect(o.frequency);
      const g = this.ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this._siren = { o: o, lfo: lfo };
      this._sirenGain = g;
    }
    if (!this._sirenGain) return;
    const v = on ? CVH.clamp(0.12 * (1 - (dist01 || 0)), 0, 0.12) : 0;
    this._sirenGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
  }
};
