// "Don't Blink": the figure only moves when your eyes are closed.
//
// Phases:
//   calibrate  learn this player's open-eye blink score
//   hunt       every blink, it lurches closer down the hallway
//   vanish     it disappears and everything goes silent (the fake relief)
//   behind     it fades in behind the player on the webcam view
//   scare      full-screen face and scream
//   (then onEnd is called)

import { CONFIG, DEBUG } from './config.js';
import { BlinkDetector } from './vision.js';
import { drawStalker, drawScareImage } from './monster.js';
import { ASSETS } from './assets.js';
import { drawMirrored } from './camera.js';

const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Hallway geometry (world units, camera at the origin looking down +z).
const Z_NEAR = 0.6;
const Z_FAR = 9;
const HALF_WIDTH = 1.15;
const FLOOR = 1.0; // floor is 1 unit below the camera
const CEIL = 1.35; // ceiling is 1.35 units above it
const FIGURE_HEIGHT = 2.1;

const FLOOR_RGB = [44, 40, 35];
const WALL_RGB = [56, 54, 49];
const CEIL_RGB = [30, 30, 29];
const DOOR_RGB = [16, 15, 14];

const shade = (c, k) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
const fog = (z) => Math.exp(-(z - Z_NEAR) * 0.3);

function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

export class Game {
  constructor({ canvas, video, vision, audio, onEnd, debugEl }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = video;
    this.vision = vision;
    this.audio = audio;
    this.onEnd = onEnd;
    this.debugEl = debugEl;

    this.blink = new BlinkDetector();
    this.running = false;
    this.face = { present: false, blinkScore: 0, noseX: 0.5, noseY: 0.5, frame: 0 };
    this.lastFaceFrame = -1;
    this.fps = 0;

    this.mirrorCanvas = document.createElement('canvas');
    this.mirrorCtx = this.mirrorCanvas.getContext('2d');

    this._loop = this._loop.bind(this);
    this._makeGrain();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this._onKey(e));
    canvas.addEventListener('pointerdown', () => {
      if (this.running && this.manual) this._manualBlink();
    });
  }

  // No face tracking: blinks come from clicks or the B key.
  get manual() {
    return this.vision.status === 'failed' || this.vision.status === 'fake';
  }

  get fakeMode() {
    return this.vision.status === 'fake';
  }

  _manualBlink() {
    this.vision.fake?.blink();
    this.blink.simulate(performance.now());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.dpr = dpr;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this._makeVignette();
  }

  start() {
    const now = performance.now();
    this.resize();
    this.state = {
      phase: 'calibrate',
      phaseStart: now,
      calibStart: null,
      calibrating: false,
      distance: CONFIG.monster.startDistance,
      figX: 0,
      pose: 0,
      monsterVisible: true,
      blinks: 0,
      startedAt: now,
      lastFaceSeen: now,
      lastLookAwayCreak: 0,
      flickerUntil: 0,
      message: '',
      messageUntil: Infinity,
      behindAlpha: 0,
      behindSide: 1,
      scareAt: Infinity,
      turnedAround: false,
      scareStart: 0,
    };
    this.blink.reset();
    this.blink.onClose = (t) => this._onBlinkClose(t);
    this.canvas.classList.remove('hidden');
    this.running = true;
    this.lastFrame = now;
    requestAnimationFrame(this._loop);
  }

  _setPhase(phase, now = performance.now()) {
    this.state.phase = phase;
    this.state.phaseStart = now;
  }

  _say(text, ms = Infinity, now = performance.now()) {
    this.state.message = text;
    this.state.messageUntil = now + ms;
  }

  // ---------- Main loop ----------

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.fps = lerp(this.fps, 1 / Math.max(dt, 0.001), 0.05);
    this.lastFrame = now;
    const st = this.state;

    if (this.vision.ready) {
      const face = this.vision.updateFace();
      this.face = face;
      if (face.frame !== this.lastFaceFrame) {
        this.lastFaceFrame = face.frame;
        if (face.present) {
          if (st.phase === 'calibrate') {
            if (st.calibrating) this.blink.addCalibrationSample(face.blinkScore);
          } else {
            this.blink.update(face.blinkScore, now);
          }
        }
      }
    } else if (this.manual) {
      this.face = { ...this.face, present: true };
    }

    if (this.face.present) st.lastFaceSeen = now;
    const faceLost = !this.face.present && now - st.lastFaceSeen > 400;

    if (st.phase === 'vanish' || st.phase === 'behind') this.vision.updateMask();

    this._update(now, dt, faceLost);
    if (!this.running) return;
    this._draw(now, faceLost);
    if (DEBUG) this._drawDebug();
    requestAnimationFrame(this._loop);
  }

  _update(now, dt, faceLost) {
    const st = this.state;
    const cfg = CONFIG;

    switch (st.phase) {
      case 'calibrate': {
        if (this.manual) {
          if (!st.calibStart) {
            st.calibStart = now;
            this._say(
              this.fakeMode
                ? 'No webcam here. Click or press B every time you blink.'
                : 'Face tracking is unavailable. Click or press B to blink.',
              Infinity,
              now,
            );
          }
          if (now - st.calibStart > 2500) this._beginHunt(now);
          break;
        }
        if (!this.vision.ready) {
          this._say('Waking it up...', Infinity, now);
          break;
        }
        if (!this.face.present) {
          st.calibStart = null;
          st.calibrating = false;
          this.blink.samples = [];
          this._say("It can't see your face. Sit facing the screen, in some light.", Infinity, now);
          break;
        }
        if (!st.calibStart) {
          st.calibStart = now;
          st.calibrating = true;
        }
        const t = now - st.calibStart;
        const left = Math.max(1, Math.ceil((cfg.blink.calibrationMs - t) / 1000));
        this._say(`Look at the figure. Keep your eyes open.   ${left}`, Infinity, now);
        if (t >= cfg.blink.calibrationMs) {
          st.calibrating = false;
          const c = this.blink.finishCalibration();
          console.info('[game] calibrated', c);
          this._beginHunt(now);
        }
        break;
      }

      case 'hunt': {
        // Looking away, or keeping your eyes shut, does not save you.
        const eyesHeldShut = this.blink.closed && now - this.blink.closedAt > 700;
        if (faceLost || eyesHeldShut) {
          st.distance -= cfg.monster.lookAwaySpeed * dt;
          if (now - st.lastLookAwayCreak > 850) {
            this.audio.creak();
            st.lastLookAwayCreak = now;
            st.figX = rand(-0.35, 0.35);
          }
        }
        const tension = 1 - (st.distance - cfg.monster.vanishAt) / (1 - cfg.monster.vanishAt);
        this.audio.setTension(tension);
        if (Math.random() < dt * (0.12 + tension * 0.7)) st.flickerUntil = now + rand(50, 160);
        if (st.distance <= cfg.monster.vanishAt) this._vanish(now);
        break;
      }

      case 'vanish': {
        if (now - st.phaseStart > cfg.phases.vanishSilenceMs) this._behind(now);
        break;
      }

      case 'behind': {
        st.behindAlpha = clamp01((now - st.phaseStart) / cfg.phases.behindFadeMs);
        if (faceLost) st.turnedAround = true;
        // They turned around to check... and turned back.
        if (st.turnedAround && this.face.present) {
          st.turnedAround = false;
          st.scareAt = Math.min(st.scareAt, now + cfg.phases.turnAroundGraceMs);
        }
        if (now >= st.scareAt) this._scare(now);
        break;
      }

      case 'scare': {
        if (now - st.scareStart > cfg.phases.scareDurationMs) this._finish(now);
        break;
      }
    }
  }

  _beginHunt(now) {
    this._setPhase('hunt', now);
    this.state.startedAt = now;
    this._say("DON'T BLINK.", 2600, now);
    this.audio.startAmbience();
    this.audio.setTension(0);
  }

  _onBlinkClose(now) {
    const st = this.state;
    if (!this.running) return;
    if (st.phase === 'hunt') {
      st.blinks++;
      st.distance -= rand(CONFIG.monster.stepMin, CONFIG.monster.stepMax);
      st.figX = rand(-0.35, 0.35);
      st.pose = (st.pose + 1 + Math.floor(Math.random() * (ASSETS.poseCount - 1))) % ASSETS.poseCount;
      st.flickerUntil = now + 220;
      this.audio.creak();
      if (st.distance <= CONFIG.monster.vanishAt) this._vanish(now);
    } else if (st.phase === 'behind') {
      st.blinks++;
      if (st.behindAlpha > 0.35) this._scare(now);
    }
  }

  _vanish(now) {
    const st = this.state;
    if (st.phase !== 'hunt') return;
    this._setPhase('vanish', now);
    st.monsterVisible = false;
    st.message = '';
    this.audio.silence(900);
  }

  _behind(now) {
    const st = this.state;
    this._setPhase('behind', now);
    // Put it over the shoulder on the side the player's head is not.
    st.behindSide = this.face.noseX > 0.5 ? -1 : 1;
    st.turnedAround = false;
    st.scareAt =
      now +
      CONFIG.phases.behindFadeMs +
      rand(CONFIG.phases.scareFallbackMinMs, CONFIG.phases.scareFallbackMaxMs);
    this.audio.whisper();
  }

  _scare(now) {
    const st = this.state;
    if (st.phase === 'scare') return;
    this._setPhase('scare', now);
    st.scareStart = now;
    st.survived = (now - st.startedAt) / 1000;
    this.audio.stopAll();
    const seconds = CONFIG.phases.scareDurationMs / 1000 + 0.1;
    // The recorded scream, or the synthesized one if the file could not be loaded.
    if (!this.audio.playSample('scream', { volume: CONFIG.audio.scareVolume, maxSeconds: seconds })) {
      this.audio.scream({ duration: seconds });
    }
  }

  _finish() {
    const st = this.state;
    this.running = false;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.onEnd?.({ seconds: st.survived ?? 0, blinks: st.blinks });
  }

  // ---------- Drawing ----------

  _draw(now, faceLost) {
    const ctx = this.ctx;
    const { W, H } = this;
    const st = this.state;
    const time = now / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (st.phase === 'scare') {
      drawScareImage(ctx, W, H, now - st.scareStart);
      this._grain(ctx, 0, 0, W, H, 0.14);
      return;
    }

    let light = 1;
    if (st.phase === 'calibrate') light = 0.75;
    if (now < st.flickerUntil) light = Math.random() < 0.5 ? 0.04 : 0.3;
    if (this.blink.closed && st.phase === 'hunt') light = 0.02; // lights die while your eyes are shut

    const g = this._drawHallway(ctx, W, H, time, light);

    if (st.monsterVisible) {
      const z = lerp(1.25, Z_FAR - 0.45, st.distance);
      const h = (g.f * FIGURE_HEIGHT) / z;
      const footY = g.cy + (g.f * FLOOR) / z;
      const x = g.cx + (g.f * st.figX) / z;
      const faceLight = light * Math.max(0.3, Math.min(1, fog(z) * 1.8));
      drawStalker(ctx, x, footY, h, { time, light: faceLight, pose: st.pose });
    }

    ctx.drawImage(this.vignette, 0, 0, W, H);
    this._grain(ctx, 0, 0, W, H, 0.09);
    this._drawMirror(ctx, W, H, now);
    this._drawHud(ctx, W, H, now, faceLost);
  }

  _drawHallway(ctx, W, H, time, light) {
    const cx = W / 2;
    const cy = H * 0.45;
    const f = H * 0.9;
    const P = (z) => ({
      xl: cx - (f * HALF_WIDTH) / z,
      xr: cx + (f * HALF_WIDTH) / z,
      yf: cy + (f * FLOOR) / z,
      yc: cy - (f * CEIL) / z,
    });

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Back wall with a dim doorway the figure stands in.
    const back = P(Z_FAR);
    ctx.fillStyle = shade(WALL_RGB, fog(Z_FAR) * light * 0.8);
    ctx.fillRect(back.xl, back.yc, back.xr - back.xl, back.yf - back.yc);
    const dw = (f * 0.42) / Z_FAR;
    const dtop = cy - (f * 1.2) / Z_FAR;
    const doorGrad = ctx.createLinearGradient(0, dtop, 0, back.yf);
    doorGrad.addColorStop(0, shade([70, 84, 88], light * 0.55));
    doorGrad.addColorStop(1, shade([95, 110, 112], light * 0.85));
    ctx.fillStyle = doorGrad;
    ctx.fillRect(cx - dw, dtop, dw * 2, back.yf - dtop);

    // Corridor slices, far to near, with geometric depth spacing.
    const slices = 20;
    const zAt = (i) => Z_NEAR * Math.pow(Z_FAR / Z_NEAR, i / slices);
    for (let i = slices; i > 0; i--) {
      const zf = zAt(i);
      const zn = zAt(i - 1);
      const a = P(zf);
      const b = P(zn);
      const k = fog((zf + zn) / 2) * light;

      ctx.fillStyle = shade(FLOOR_RGB, k * (i % 2 ? 1 : 0.82));
      quad(ctx, b.xl, b.yf, b.xr, b.yf, a.xr, a.yf, a.xl, a.yf);
      ctx.fillStyle = shade(CEIL_RGB, k * 0.75);
      quad(ctx, b.xl, b.yc, b.xr, b.yc, a.xr, a.yc, a.xl, a.yc);
      ctx.fillStyle = shade(WALL_RGB, k * 0.92);
      quad(ctx, b.xl, b.yc, a.xl, a.yc, a.xl, a.yf, b.xl, b.yf);
      ctx.fillStyle = shade(WALL_RGB, k * 0.78);
      quad(ctx, b.xr, b.yc, a.xr, a.yc, a.xr, a.yf, b.xr, b.yf);
    }

    // Doors along the walls.
    const doors = [
      [-1, 2.1, 2.75],
      [1, 3.2, 3.85],
      [-1, 4.7, 5.3],
      [1, 6.4, 6.9],
    ];
    for (const [side, z0, z1] of doors) {
      const a = P(z0);
      const b = P(z1);
      const k = fog((z0 + z1) / 2) * light;
      const x0 = side < 0 ? a.xl : a.xr;
      const x1 = side < 0 ? b.xl : b.xr;
      const top0 = lerp(a.yf, a.yc, 0.78);
      const top1 = lerp(b.yf, b.yc, 0.78);
      ctx.fillStyle = shade(DOOR_RGB, Math.max(0.15, k * 1.4));
      quad(ctx, x0, a.yf, x0, top0, x1, top1, x1, b.yf);
    }

    // Ceiling lights with soft pools of light on the floor.
    for (const z of [2.4, 4.9, 7.4]) {
      const p = P(z);
      const k = fog(z) * light;
      const lw = (f * 0.3) / z;
      const lh = Math.max(1, (f * 0.05) / z);
      ctx.fillStyle = `rgba(225,232,222,${Math.min(1, k * 1.3)})`;
      ctx.fillRect(cx - lw, p.yc + 1, lw * 2, lh);
      const pool = ctx.createRadialGradient(cx, p.yf, 0, cx, p.yf, (f * 1.1) / z);
      pool.addColorStop(0, `rgba(200,205,190,${0.12 * k})`);
      pool.addColorStop(1, 'rgba(200,205,190,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(p.xl, p.yc, p.xr - p.xl, (p.yf - p.yc) * 1.4);
    }

    return { cx, cy, f };
  }

  _drawMirror(ctx, W, H, now) {
    const v = this.video;
    const st = this.state;
    if (!v.videoWidth) return;

    const mw = Math.round(Math.min(W * 0.26, 320));
    const mh = Math.round((mw * v.videoHeight) / v.videoWidth);
    const pad = Math.max(12, Math.round(W * 0.015));
    const x = W - mw - pad;
    const y = H - mh - pad;

    const mc = this.mirrorCanvas;
    if (mc.width !== mw || mc.height !== mh) {
      mc.width = mw;
      mc.height = mh;
    }
    const m = this.mirrorCtx;
    m.clearRect(0, 0, mw, mh);
    drawMirrored(m, v, 0, 0, mw, mh);

    if (st.phase === 'behind' && st.behindAlpha > 0) {
      const person = this.vision.personLayer();
      const flicker = Math.random() < 0.05 ? 0.25 : 1;
      if (person) {
        // Proper compositing: figure first, then the player's own pixels on top of it.
        const fh = mh * 1.5;
        const fx = mw * (0.5 + st.behindSide * 0.27);
        const footY = mh * 0.27 + 0.915 * fh;
        drawStalker(m, fx, footY, fh, {
          pose: 0,
          time: now / 1000,
          alpha: st.behindAlpha * flicker,
          light: 0.95,
          tilt: 0.3 * st.behindSide,
        });
        drawMirrored(m, person, 0, 0, mw, mh);
      } else {
        // No segmenter: keep it near the edge of the frame so it stays "behind" the player.
        const fh = mh * 1.15;
        const fx = mw * (0.5 + st.behindSide * 0.42);
        const footY = mh * 0.25 + 0.915 * fh;
        drawStalker(m, fx, footY, fh, {
          pose: 0,
          time: now / 1000,
          alpha: st.behindAlpha * 0.7 * flicker,
          light: 0.9,
          tilt: 0.3 * st.behindSide,
        });
      }
    }

    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 3, y - 3, mw + 6, mh + 6);
    ctx.filter = 'grayscale(1) contrast(1.2) brightness(0.72)';
    ctx.drawImage(mc, x, y, mw, mh);
    ctx.filter = 'none';
    ctx.beginPath();
    ctx.rect(x, y, mw, mh);
    ctx.clip();
    this._grain(ctx, x, y, mw, mh, 0.16);
    ctx.restore();

    // Security-camera labels.
    ctx.save();
    ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(230,230,230,0.8)';
    ctx.fillText('CAM 01', x + 8, y + 7);
    const secs = Math.floor((now - st.startedAt) / 1000);
    const stamp = `00:${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(stamp, x + 8, y + mh - 6);
    if (Math.floor(now / 700) % 2 === 0) {
      ctx.fillStyle = '#e02020';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillText('● REC', x + mw - 8, y + 7);
    }
    if (st.phase === 'behind' && st.behindAlpha > 0.2 && Math.floor(now / 450) % 2 === 0) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#ff3b3b';
      ctx.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('MOTION DETECTED', x + mw, y - 8);
    }
    ctx.restore();
  }

  _drawHud(ctx, W, H, now, faceLost) {
    const st = this.state;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(200,200,200,0.45)';
    if (st.phase !== 'calibrate') ctx.fillText(`BLINKS  ${st.blinks}`, 20, 18);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (st.message && now < st.messageUntil) {
      const fadeOut = Number.isFinite(st.messageUntil) ? clamp01((st.messageUntil - now) / 600) : 1;
      const big = st.message === "DON'T BLINK.";
      ctx.font = big
        ? `400 ${Math.round(Math.min(W, H) * 0.08)}px Georgia, 'Times New Roman', serif`
        : `500 ${Math.round(Math.max(15, Math.min(W, H) * 0.024))}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.fillStyle = big ? `rgba(200,20,20,${0.9 * fadeOut})` : `rgba(220,220,220,${0.85 * fadeOut})`;
      ctx.fillText(st.message, W / 2, big ? H * 0.2 : H * 0.12);
    }
    if (st.phase === 'hunt' && faceLost) {
      ctx.font = `700 ${Math.round(Math.max(16, Math.min(W, H) * 0.03))}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.fillStyle = 'rgba(230,40,40,0.9)';
      ctx.fillText('EYES ON THE SCREEN', W / 2, H * 0.12);
    }
    if (this.manual && st.phase !== 'calibrate' && st.phase !== 'scare') {
      ctx.font = '500 12px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillStyle = 'rgba(200,200,200,0.5)';
      ctx.fillText(this.fakeMode ? 'Click or press B to blink' : 'No face tracking. Click or press B to blink.', W / 2, H - 22);
    }
    ctx.restore();
  }

  _makeGrain() {
    this.grainPatterns = [];
    for (let n = 0; n < 4; n++) {
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      const g = c.getContext('2d');
      const img = g.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.grainPatterns.push(this.ctx.createPattern(c, 'repeat'));
    }
  }

  _grain(ctx, x, y, w, h, alpha) {
    const pattern = this.grainPatterns[Math.floor(Math.random() * this.grainPatterns.length)];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'overlay';
    ctx.translate(Math.random() * 160, Math.random() * 160);
    ctx.fillStyle = pattern;
    ctx.fillRect(x - 160, y - 160, w + 320, h + 320);
    ctx.restore();
  }

  _makeVignette() {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.W / 2));
    c.height = Math.max(1, Math.round(this.H / 2));
    const g = c.getContext('2d');
    const r = Math.hypot(c.width, c.height) / 2;
    const grad = g.createRadialGradient(c.width / 2, c.height * 0.48, r * 0.25, c.width / 2, c.height / 2, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.92)');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    this.vignette = c;
  }

  // ---------- Debug ----------

  _onKey(e) {
    if (!this.running) return;
    const key = e.key.toLowerCase();
    if ((DEBUG || this.manual) && (key === 'b' || key === ' ')) {
      e.preventDefault();
      this._manualBlink();
    }
    if (!DEBUG) return;
    const now = performance.now();
    if (key === 'v' && this.state.phase === 'hunt') this._vanish(now);
    if (key === 'h' && this.state.phase === 'vanish') this._behind(now);
    if (key === 's') this._scare(now);
  }

  _drawDebug() {
    if (!this.debugEl) return;
    const st = this.state;
    const b = this.blink;
    this.debugEl.textContent = [
      `phase      ${st.phase}`,
      `vision     ${this.vision.status}${this.vision.segmenter ? ' + seg' : ''}`,
      `face       ${this.face.present ? 'yes' : 'no'}`,
      `blink      ${b.score.toFixed(2)}  thr ${b.threshold.toFixed(2)}  base ${b.baseline.toFixed(2)}`,
      `eyes       ${b.closed ? 'CLOSED' : 'open'}`,
      `distance   ${st.distance.toFixed(2)}`,
      `blinks     ${st.blinks}`,
      `fps        ${this.fps.toFixed(0)}`,
      `keys       B blink  V vanish  H behind  S scare`,
    ].join('\n');
  }
}
