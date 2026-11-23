// audio.js — a tiny WebAudio synth: engine hum, police siren, gunshots,
// crashes, pickups and UI blips. No audio files, everything is oscillators
// and filtered noise created on the fly. M toggles mute.
window.CVH = window.CVH || {};

CVH.audio = {
  ctx: null,
  muted: false,
  _engine: null,     // {osc, gain, filter}
  _siren: null,      // {osc, gain, lfo}
  _noiseBuf: null,

  // AudioContext can only start after a user gesture; main calls this from
  // the menu buttons and the first canvas click.
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // Shared white-noise buffer for shots, crashes and surf-like hiss.
      const len = this.ctx.sampleRate * 0.5;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (err) { this.ctx = null; }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this._engine) this._engine.gain.gain.value = 0;
    if (this._siren) this._siren.gain.gain.value = 0;
    return this.muted;
  },

  _env(gainNode, t0, peak, dur) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
    g.exponentialRampToValueAtTime(0.0001, t0 + dur);
  },

  _blip(freq, dur, type, peak, slideTo) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    this._env(gain, t0, peak || 0.08, dur);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  },

  _noise(dur, peak, filterFreq, type) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = this.ctx.createGain();
    this._env(gain, t0, peak || 0.15, dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    src.start(t0); src.stop(t0 + dur + 0.05);
  },

  shot(kind) {
    if (kind === 'smg') { this._noise(0.09, 0.16, 2600, 'bandpass'); this._blip(190, 0.07, 'sawtooth', 0.06, 60); }
    else { this._noise(0.16, 0.24, 1800, 'bandpass'); this._blip(140, 0.13, 'sawtooth', 0.09, 45); }
  },
  punch() { this._noise(0.08, 0.12, 500); },
  crash(big) { this._noise(big ? 0.4 : 0.2, big ? 0.3 : 0.16, 700); this._blip(70, 0.25, 'triangle', 0.12, 35); },
  pickup() { this._blip(660, 0.09, 'square', 0.07); setTimeout(() => this._blip(990, 0.14, 'square', 0.07), 60); },
  cash() { this._blip(880, 0.08, 'triangle', 0.09); setTimeout(() => this._blip(1320, 0.16, 'triangle', 0.09), 70); },
  heal() { this._blip(520, 0.12, 'sine', 0.1, 780); },
  spray() { this._noise(0.7, 0.05, 4000, 'highpass'); this._blip(440, 0.5, 'sine', 0.05, 880); },
  ui() { this._blip(440, 0.06, 'square', 0.05); },
  jobDone() {
    if (!this.ctx || this.muted) return;
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this._blip(f, 0.18, 'triangle', 0.09), i * 90));
  },
  jobFail() { this._blip(220, 0.3, 'sawtooth', 0.08, 110); },

  // Continuous engine loop; call every frame with a 0..1 speed factor, or
  // with on=false when the player leaves the car.
  engine(on, speedFactor, isMoto) {
    if (!this.ctx) return;
    if (!on || this.muted) {
      if (this._engine) this._engine.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      return;
    }
    if (!this._engine) {
      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth'; osc2.type = 'square';
      filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = 2;
      gain.gain.value = 0;
      osc.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
      osc.start(); osc2.start();
      this._engine = { osc, osc2, gain, filter };
    }
    const base = isMoto ? 90 : 55;
    const f = base + speedFactor * (isMoto ? 320 : 210);
    const t = this.ctx.currentTime;
    this._engine.osc.frequency.setTargetAtTime(f, t, 0.06);
    this._engine.osc2.frequency.setTargetAtTime(f * 0.5 + 3, t, 0.06);
    this._engine.filter.frequency.setTargetAtTime(380 + speedFactor * 1500, t, 0.1);
    this._engine.gain.gain.setTargetAtTime(0.045 + speedFactor * 0.05, t, 0.09);
  },

  // Two-tone siren while any police car is actively chasing.
  siren(on) {
    if (!this.ctx) return;
    if (!on || this.muted) {
      if (this._siren) this._siren.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    if (!this._siren) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = 800;
      lfo.type = 'square'; lfo.frequency.value = 0.7; lfoGain.gain.value = 160;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      gain.gain.value = 0;
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(); lfo.start();
      this._siren = { osc, gain, lfo };
    }
    this._siren.gain.gain.setTargetAtTime(0.028, this.ctx.currentTime, 0.15);
  },
};
