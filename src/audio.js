// Every sound is synthesized with the Web Audio API, so there are no audio files to license or load.

import { CONFIG } from './config.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function distortionCurve(amount) {
  const n = 2048;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.ambience = null;
    this.tension = 0;
    this.heartOn = false;
    this.heartTimer = null;
  }

  // Must be called from a user gesture (click) so the browser allows audio.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      this.ctx = ctx;

      // Acts as a limiter so the scream is loud but does not clip into mush.
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.15;

      this.master = ctx.createGain();
      this.master.gain.value = CONFIG.audio.masterVolume;
      this.master.connect(this.limiter);
      this.limiter.connect(ctx.destination);

      this.noise = this._makeNoise(3);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noise() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  _osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }

  _gain(value) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }

  // ---------- Ambience ----------

  startAmbience() {
    if (!this.ctx || this.ambience) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.45, t + 3);
    out.connect(this.master);

    // Low detuned drone through a slowly breathing lowpass filter.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    lp.Q.value = 4;
    lp.connect(out);

    const o1 = this._osc('sawtooth', 49);
    const o2 = this._osc('sawtooth', 49.7);
    const o3 = this._osc('sine', 98.3);
    o1.connect(this._gain(0.13)).connect(lp);
    o2.connect(this._gain(0.13)).connect(lp);
    o3.connect(this._gain(0.06)).connect(lp);

    const lfo = this._osc('sine', 0.07);
    lfo.connect(this._gain(70)).connect(lp.frequency);

    // Room tone: quiet filtered noise.
    const n = this._noise();
    const nlp = ctx.createBiquadFilter();
    nlp.type = 'lowpass';
    nlp.frequency.value = 450;
    n.connect(nlp).connect(this._gain(0.05)).connect(out);

    const nodes = [o1, o2, o3, lfo, n];
    nodes.forEach((node) => node.start(t));
    this.ambience = { out, nodes };
    this.startHeartbeat();
  }

  setTension(value) {
    this.tension = clamp01(value);
    if (this.ambience && this.ctx) {
      this.ambience.out.gain.setTargetAtTime(0.4 + 0.45 * this.tension, this.ctx.currentTime, 0.4);
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartOn = true;
    const beat = () => {
      if (!this.heartOn) return;
      this._thump(0, 1);
      this._thump(0.17, 0.7);
      this.heartTimer = setTimeout(beat, 1150 - 760 * this.tension);
    };
    beat();
  }

  stopHeartbeat() {
    this.heartOn = false;
    clearTimeout(this.heartTimer);
  }

  _thump(delay, vol) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = this._osc('sine', 70);
    o.frequency.setValueAtTime(72, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = ctx.createGain();
    const peak = 0.6 * vol * (0.35 + 0.65 * this.tension);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  // Fade to dead silence (the fake relief before the real scare).
  silence(fadeMs = 1200) {
    this.stopHeartbeat();
    if (this.ambience && this.ctx) {
      const g = this.ambience.out.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setTargetAtTime(0, this.ctx.currentTime, fadeMs / 3000);
    }
  }

  stopAll() {
    this.stopHeartbeat();
    if (this.ambience) {
      this.ambience.nodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      });
      this.ambience.out.disconnect();
      this.ambience = null;
    }
  }

  // ---------- One-shots ----------

  // "Something moved": a creaky floorboard plus a low thud.
  creak() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const n = this._noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 9;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.linearRampToValueAtTime(880 + Math.random() * 300, t + 0.28);
    bp.frequency.linearRampToValueAtTime(260, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t, Math.random() * 2);
    n.stop(t + 0.65);

    const o = this._osc('sine', 90);
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.45, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.35);
  }

  // A breathy whisper that drifts from one ear to the other. Best on headphones.
  whisper(duration = 2.8, volume = 0.28) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const end = t + duration;

    const n = this._noise();
    const b1 = ctx.createBiquadFilter();
    b1.type = 'bandpass';
    b1.frequency.value = 1900;
    b1.Q.value = 3;
    const b2 = ctx.createBiquadFilter();
    b2.type = 'bandpass';
    b2.frequency.value = 850;
    b2.Q.value = 5;

    // Syllable-like amplitude flutter.
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const flutter = this._osc('sine', 6.5);
    flutter.connect(this._gain(0.5)).connect(am.gain);
    const flutter2 = this._osc('sine', 2.3);
    flutter2.connect(this._gain(0.25)).connect(am.gain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(volume, t + 0.6);
    env.gain.setValueAtTime(volume, end - 0.7);
    env.gain.linearRampToValueAtTime(0.0001, end);

    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    n.connect(b1).connect(am);
    n.connect(b2).connect(am);
    if (pan) {
      pan.pan.setValueAtTime(-0.9, t);
      pan.pan.linearRampToValueAtTime(0.9, end);
      am.connect(env).connect(pan).connect(this.master);
    } else {
      am.connect(env).connect(this.master);
    }
    [n, flutter, flutter2].forEach((s) => {
      s.start(t);
      s.stop(end + 0.05);
    });
  }

  // Low swell, used when the CAPTCHA turns.
  rumble(duration = 3, volume = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this._noise();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 110;
    const o = this._osc('sine', 41);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(volume, t + duration * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + duration);
    n.connect(lp).connect(g);
    o.connect(this._gain(0.4)).connect(g);
    g.connect(this.master);
    [n, o].forEach((s) => {
      s.start(t);
      s.stop(t + duration + 0.05);
    });
  }

  // Loads a recorded sound into memory so it plays with no delay.
  // Accepts a normal path or a base64 data: URL (the preview build embeds files that way).
  async loadSample(name, src) {
    if (!this.ctx || !src) return;
    this.samples = this.samples || {};
    if (this.samples[name]) return;
    try {
      let bytes;
      if (src.startsWith('data:')) {
        const bin = atob(src.slice(src.indexOf(',') + 1));
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        bytes = bytes.buffer;
      } else {
        bytes = await (await fetch(src)).arrayBuffer();
      }
      this.samples[name] = await this.ctx.decodeAudioData(bytes);
      console.info(`[audio] loaded ${name} (${this.samples[name].duration.toFixed(1)}s)`);
    } catch (err) {
      console.warn('[audio] could not load', name, err);
    }
  }

  // Plays a loaded recording. Returns false if it is not loaded, so the caller can fall back.
  playSample(name, { volume = 1, maxSeconds } = {}) {
    const buffer = this.samples?.[name];
    if (!this.ctx || !buffer) return false;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.master);
    src.start(t);
    if (maxSeconds && maxSeconds < buffer.duration) {
      g.gain.setValueAtTime(volume, t + maxSeconds - 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + maxSeconds);
      src.stop(t + maxSeconds + 0.05);
    }
    return true;
  }

  // Camera shutter for the polaroids.
  shutter() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [at, len, freq] of [[0, 0.03, 3000], [0.07, 0.05, 1800]]) {
      const n = this._noise();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 1.5;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      n.connect(bp).connect(g).connect(this.master);
      n.start(t + at);
      n.stop(t + at + len + 0.02);
    }
  }

  // Countdown beep.
  beep() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this._osc('sine', 660);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  // Tiny UI tick for the CAPTCHA tiles.
  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this._osc('square', 1800);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.04);
  }

  // Short digital burst for glitch transitions.
  glitch(duration = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = this._osc('square', 200);
    for (let s = 0; s < duration; s += 0.03) {
      o.frequency.setValueAtTime(80 + Math.random() * 1600, t + s);
    }
    const n = this._noise();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.setValueAtTime(0.16, t + duration - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    n.connect(hp).connect(this._gain(0.7)).connect(g);
    g.connect(this.master);
    [o, n].forEach((s) => {
      s.start(t);
      s.stop(t + duration + 0.05);
    });
  }

  // The jump scare. A distorted multi-voice shriek, a noise crack and a sub boom.
  // opts.pitch shifts the whole shriek (below 1 sounds more mechanical).
  // opts.duration is the total length in seconds, matched to how long the scare image stays up.
  scream({ pitch = 1, duration = CONFIG.audio.screamSeconds } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const end = t + duration;
    const vol = CONFIG.audio.scareVolume;

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.linearRampToValueAtTime(vol, t + 0.006);
    bus.gain.setValueAtTime(vol, end - 1.0);
    bus.gain.exponentialRampToValueAtTime(0.0001, end);
    bus.connect(this.master);

    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(240);
    shaper.oversample = '4x';
    const pre = this._gain(0.9);
    pre.connect(shaper).connect(bus);

    const sources = [];

    [470, 590, 735, 915, 1240].map((f) => f * pitch).forEach((f, i) => {
      const o = this._osc(i % 2 ? 'sawtooth' : 'square', f);
      o.frequency.setValueAtTime(f * 1.4, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, end);
      const vib = this._osc('sine', 6 + Math.random() * 6);
      vib.connect(this._gain(f * 0.05)).connect(o.frequency);
      o.connect(this._gain(0.15)).connect(pre);
      sources.push(o, vib);
    });

    const n = this._noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(3300, t);
    bp.frequency.exponentialRampToValueAtTime(1300, end);
    n.connect(bp).connect(this._gain(0.8)).connect(pre);
    sources.push(n);

    // Clean transient crack so the onset is instant.
    const crack = this._noise();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(1, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    crack.connect(hp).connect(cg).connect(bus);
    sources.push(crack);

    // Sub boom you feel in your chest.
    const boom = this._osc('sine', 140);
    boom.frequency.setValueAtTime(150, t);
    boom.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(1, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    boom.connect(bg).connect(bus);
    sources.push(boom);

    sources.forEach((s) => {
      s.start(t);
      s.stop(end + 0.05);
    });
  }
}
