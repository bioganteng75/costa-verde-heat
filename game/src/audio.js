// audio.js — tiny WebAudio synth for Costa Verde Heat.
// No audio files: every effect is an oscillator or filtered noise burst
// shaped at run time. The engine hum and the police siren are looping
// nodes whose pitch follows the game state; M toggles a master mute.

class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engine = null;
    this.siren = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.25, freq = 800, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  click() { this.tone(660, 0.06, 'square', 0.12); }
  pickup() { this.tone(523, 0.09, 'sine', 0.22); this.tone(784, 0.14, 'sine', 0.22, null, 0.08); }
  cash() { this.tone(988, 0.07, 'triangle', 0.2); this.tone(1319, 0.12, 'triangle', 0.2, null, 0.06); }
  hit() { this.noise(0.12, 0.3, 500); this.tone(120, 0.12, 'sawtooth', 0.18, 60); }
  crash() { this.noise(0.3, 0.4, 350); this.tone(70, 0.3, 'sawtooth', 0.2, 40); }
  shot() { this.noise(0.09, 0.35, 1800); this.tone(220, 0.08, 'square', 0.15, 90); }
  punch() { this.noise(0.07, 0.22, 700); }
  horn() { this.tone(370, 0.25, 'square', 0.12); this.tone(466, 0.25, 'square', 0.1, null, 0.02); }
  missionDone() {
    this.tone(523, 0.12, 'triangle', 0.22);
    this.tone(659, 0.12, 'triangle', 0.22, null, 0.11);
    this.tone(784, 0.22, 'triangle', 0.24, null, 0.22);
  }
  bustedJingle() {
    this.tone(392, 0.18, 'square', 0.18);
    this.tone(330, 0.18, 'square', 0.18, null, 0.16);
    this.tone(262, 0.34, 'square', 0.18, null, 0.32);
  }

  setEngine(on, speedRatio = 0) {
    if (!this.ctx) return;
    if (on && !this.engine) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      gain.gain.value = 0.05;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start();
      this.engine = { osc, gain };
    } else if (!on && this.engine) {
      try { this.engine.osc.stop(); } catch { /* already stopped */ }
      this.engine = null;
    }
    if (this.engine) {
      this.engine.osc.frequency.value = 50 + Math.abs(speedRatio) * 130;
    }
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.siren) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 750;
      lfo.frequency.value = 0.9;
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = 0.035;
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.siren = { osc, lfo };
    } else if (!on && this.siren) {
      try { this.siren.osc.stop(); this.siren.lfo.stop(); } catch { /* already stopped */ }
      this.siren = null;
    }
  }
}

export const Sound = new AudioSys();
