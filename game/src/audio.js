// audio.js — a small WebAudio synth: engine hum, two-tone siren, gunshots,
// crashes, pickups and UI blips. No audio files; everything is oscillators
// and filtered noise, created lazily on the first user gesture.
CVH.audio = {
  ctx: null,
  muted: false,
  _engine: null,   // { osc, gain }
  _siren: null,    // { osc, gain, lfo }
  _noiseBuf: null,

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      const len = this.ctx.sampleRate * 0.5;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) {
      return false;
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this._engine) this._engine.gain.gain.value = 0;
    if (this._siren) this._siren.gain.gain.value = 0;
    return this.muted;
  },

  _tone(freq, dur, type, vol, slideTo) {
    if (this.muted || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  },

  _noise(dur, vol, freq) {
    if (this.muted || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = freq || 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(t); src.stop(t + dur + 0.02);
  },

  click() { this._tone(660, 0.06, 'square', 0.06); },
  pickup() { this._tone(880, 0.09, 'sine', 0.14); setTimeout(() => this._tone(1320, 0.12, 'sine', 0.12), 60); },
  cash() { this._tone(1180, 0.07, 'triangle', 0.14); setTimeout(() => this._tone(1560, 0.1, 'triangle', 0.12), 55); },
  shot() { this._noise(0.11, 0.22, 2600); this._tone(160, 0.08, 'sawtooth', 0.1, 60); },
  punch() { this._noise(0.07, 0.16, 700); },
  crash(big) { this._noise(big ? 0.4 : 0.2, big ? 0.3 : 0.18, big ? 500 : 800); },
  heal() { this._tone(520, 0.1, 'sine', 0.1); setTimeout(() => this._tone(780, 0.14, 'sine', 0.1), 80); },
  spray() { this._noise(0.7, 0.06, 4000); },
  jobDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, 0.16, 'triangle', 0.13), i * 95));
  },
  jobFail() { this._tone(220, 0.25, 'sawtooth', 0.1, 110); },
  busted() { this._tone(392, 0.2, 'square', 0.1); setTimeout(() => this._tone(330, 0.35, 'square', 0.1), 160); },

  // Continuous engine loop; speed01 is 0..1. Truck/motorcycle flavours via base.
  engine(on, speed01, base) {
    if (!this.ensure()) return;
    if (!on) {
      if (this._engine) { this._engine.gain.gain.value = 0; }
      return;
    }
    if (!this._engine) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      gain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 420;
      osc.connect(filter).connect(gain).connect(this.ctx.destination);
      osc.start();
      this._engine = { osc, gain };
    }
    if (this.muted) { this._engine.gain.gain.value = 0; return; }
    const b = base || 55;
    this._engine.osc.frequency.value = b + speed01 * b * 2.4;
    this._engine.gain.gain.value = 0.035 + speed01 * 0.03;
  },

  // Two-tone police siren, on while any cruiser is actively chasing.
  siren(on) {
    if (!this.ensure()) return;
    if (!on) {
      if (this._siren) this._siren.gain.gain.value = 0;
      return;
    }
    if (!this._siren) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 750;
      gain.gain.value = 0;
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.55; lfoGain.gain.value = 110;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(); lfo.start();
      this._siren = { osc, gain };
    }
    this._siren.gain.gain.value = this.muted ? 0 : 0.018;
  },
};
