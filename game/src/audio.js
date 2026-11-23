// audio.js — a tiny WebAudio synth for Costa Verde Heat.
// Everything is oscillators and filtered noise: an engine hum whose
// pitch follows the car, a two-tone siren, gunshots, crashes and UI
// blips. No audio files are loaded, ever.

export function createAudio() {
  let ac = null;
  let master = null;
  let muted = false;

  // Engine voice: sawtooth through a lowpass, gain follows throttle.
  let engOsc = null, engFilter = null, engGain = null;
  // Siren voice: triangle wave whose frequency is swept by an LFO.
  let sirOsc = null, sirGain = null;

  function ensure() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.42;
    master.connect(ac.destination);

    engOsc = ac.createOscillator();
    engOsc.type = 'sawtooth';
    engFilter = ac.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 320;
    engGain = ac.createGain();
    engGain.gain.value = 0;
    engOsc.connect(engFilter).connect(engGain).connect(master);
    engOsc.start();

    sirOsc = ac.createOscillator();
    sirOsc.type = 'triangle';
    sirOsc.frequency.value = 760;
    const sirLfo = ac.createOscillator();
    sirLfo.type = 'sine';
    sirLfo.frequency.value = 0.55;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 190;
    sirLfo.connect(lfoGain).connect(sirOsc.frequency);
    sirGain = ac.createGain();
    sirGain.gain.value = 0;
    sirOsc.connect(sirGain).connect(master);
    sirOsc.start();
    sirLfo.start();
    return true;
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!ac || muted) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, freq, q = 1, delay = 0) {
    if (!ac || muted) return;
    const t0 = ac.currentTime + delay;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  }

  return {
    ensure,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.42;
      return muted;
    },
    // Continuous voices, driven once per frame from the game loop.
    engine(ratio, active) {
      if (!ac) return;
      const target = active && !muted ? 0.045 + Math.abs(ratio) * 0.05 : 0;
      engGain.gain.setTargetAtTime(target, ac.currentTime, 0.08);
      engOsc.frequency.setTargetAtTime(55 + Math.abs(ratio) * 165, ac.currentTime, 0.06);
      engFilter.frequency.setTargetAtTime(280 + Math.abs(ratio) * 900, ac.currentTime, 0.1);
    },
    siren(on) {
      if (!ac) return;
      sirGain.gain.setTargetAtTime(on && !muted ? 0.026 : 0, ac.currentTime, 0.25);
    },
    shot() { noise(0.11, 0.5, 900, 0.6); tone(140, 0.08, 'square', 0.12, 60); },
    smgShot() { noise(0.07, 0.36, 1200, 0.7); tone(170, 0.05, 'square', 0.09, 80); },
    punch() { noise(0.06, 0.3, 300, 1); },
    crash(power) { noise(0.22, Math.min(0.6, 0.2 + power * 0.4), 220, 0.5); tone(70, 0.2, 'sine', 0.25, 40); },
    pickup() { tone(660, 0.09, 'sine', 0.18); tone(990, 0.14, 'sine', 0.18, null, 0.07); },
    cash() { tone(880, 0.07, 'square', 0.1); tone(1320, 0.12, 'square', 0.1, null, 0.06); },
    heal() { tone(520, 0.12, 'sine', 0.15, 780); },
    ui() { tone(440, 0.05, 'sine', 0.12); },
    start() { tone(392, 0.1, 'triangle', 0.16); tone(523, 0.1, 'triangle', 0.16, null, 0.09); tone(659, 0.16, 'triangle', 0.16, null, 0.18); },
    fail() { tone(330, 0.16, 'triangle', 0.16, 220); tone(196, 0.24, 'triangle', 0.16, 130, 0.14); },
    bustedJingle() { tone(494, 0.14, 'square', 0.12); tone(392, 0.14, 'square', 0.12, null, 0.14); tone(330, 0.3, 'square', 0.12, null, 0.28); },
  };
}
