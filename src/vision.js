// Face tracking (blink detection) and person segmentation with MediaPipe Tasks.
// Everything runs locally in the browser on the webcam feed.

import { CONFIG } from './config.js';

const MP = CONFIG.mediapipe;
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP.version}`;
const vendor = (path) => new URL(`../vendor/${path}`, import.meta.url).href;

// Prefer local copies (offline friendly) when they exist.
async function resolveAssets() {
  let local = MP.local === true;
  if (MP.local === 'auto') {
    try {
      const res = await fetch(vendor('models/face_landmarker.task'), { method: 'HEAD' });
      local = res.ok;
    } catch {
      local = false;
    }
  }
  if (local) {
    return {
      bundle: vendor('tasks-vision/vision_bundle.mjs'),
      wasm: vendor('tasks-vision/wasm'),
      faceModel: vendor('models/face_landmarker.task'),
      segmenterModel: vendor('models/selfie_multiclass_256x256.tflite'),
      source: 'local',
    };
  }
  return {
    bundle: `${CDN}/vision_bundle.mjs`,
    wasm: `${CDN}/wasm`,
    faceModel: MP.faceModel,
    segmenterModel: MP.segmenterModel,
    source: 'cdn',
  };
}

async function withGpuFallback(create) {
  try {
    return await create('GPU');
  } catch (err) {
    console.warn('[vision] GPU delegate failed, using CPU instead', err);
    return create('CPU');
  }
}

export class Vision {
  constructor(video) {
    this.video = video;
    this.face = null;
    this.segmenter = null;
    this.status = 'idle'; // idle | loading | ready | failed | fake
    this.fake = null; // a FakeCamera when running without a real webcam
    this.error = null;

    this.lastFaceVideoTime = -1;
    this.lastFaceTs = 0;
    this.lastSegVideoTime = -1;
    this.lastSegTs = 0;
    this.blinkIdx = null;
    this.frame = 0;
    this.result = { present: false, blinkScore: 0, noseX: 0.5, noseY: 0.5, frame: 0 };

    // Person mask (white where the player is, transparent elsewhere), in camera orientation.
    this.maskCanvas = document.createElement('canvas');
    this.maskCtx = this.maskCanvas.getContext('2d');
    this.maskImage = null;
    this.hasMask = false;
    this.personCanvas = document.createElement('canvas');
    this.personCtx = this.personCanvas.getContext('2d');
  }

  load() {
    if (!this.loading) this.loading = this._load();
    return this.loading;
  }

  // No real webcam: no face tracking, and the fake camera provides the person mask.
  useFake(fakeCamera) {
    this.fake = fakeCamera;
    this.status = 'fake';
  }

  async _load() {
    this.status = 'loading';
    try {
      const assets = await resolveAssets();
      console.info(`[vision] loading MediaPipe from ${assets.source}`);
      const mp = await import(assets.bundle);
      const fileset = await mp.FilesetResolver.forVisionTasks(assets.wasm);

      this.face = await withGpuFallback((delegate) =>
        mp.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: assets.faceModel, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        }),
      );
      if (this.status === 'fake') return;
      this.status = 'ready';
      console.info('[vision] face landmarker ready');

      // The segmenter is only needed for the "behind you" moment, so it loads second
      // and the game still works without it.
      withGpuFallback((delegate) =>
        mp.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: assets.segmenterModel, delegate },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        }),
      )
        .then((seg) => {
          this.segmenter = seg;
          console.info('[vision] segmenter ready');
        })
        .catch((err) => console.warn('[vision] segmenter failed, using fallback overlay', err));
    } catch (err) {
      console.error('[vision] failed to load face tracking', err);
      if (this.status === 'fake') return;
      this.status = 'failed';
      this.error = err;
    }
  }

  get ready() {
    return this.status === 'ready';
  }

  // Runs face tracking on the newest webcam frame. Returns the latest result;
  // result.frame increases only when a new frame was processed.
  updateFace() {
    const v = this.video;
    if (!this.ready || !v.videoWidth || v.readyState < 2) return this.result;
    if (v.currentTime === this.lastFaceVideoTime) return this.result;
    this.lastFaceVideoTime = v.currentTime;

    const ts = Math.max(performance.now(), this.lastFaceTs + 1);
    this.lastFaceTs = ts;

    let res;
    try {
      res = this.face.detectForVideo(v, ts);
    } catch (err) {
      console.warn('[vision] detect failed', err);
      return this.result;
    }

    this.frame++;
    const shapes = res.faceBlendshapes?.[0]?.categories;
    const landmarks = res.faceLandmarks?.[0];
    if (!shapes || !landmarks) {
      this.result = { ...this.result, present: false, frame: this.frame };
      return this.result;
    }

    if (!this.blinkIdx) {
      const left = shapes.findIndex((c) => c.categoryName === 'eyeBlinkLeft');
      const right = shapes.findIndex((c) => c.categoryName === 'eyeBlinkRight');
      this.blinkIdx = { left, right };
    }
    const { left, right } = this.blinkIdx;
    const blinkScore = (shapes[left].score + shapes[right].score) / 2;
    const nose = landmarks[1];

    this.result = {
      present: true,
      blinkScore,
      noseX: 1 - nose.x, // mirrored, to match what the player sees
      noseY: nose.y,
      frame: this.frame,
    };
    return this.result;
  }

  // Updates the person mask from the newest webcam frame. Returns true once a mask exists.
  updateMask() {
    if (this.fake) return true;
    const v = this.video;
    if (!this.segmenter || !v.videoWidth || v.readyState < 2) return this.hasMask;
    if (v.currentTime === this.lastSegVideoTime) return this.hasMask;
    this.lastSegVideoTime = v.currentTime;

    const ts = Math.max(performance.now(), this.lastSegTs + 1);
    this.lastSegTs = ts;

    try {
      this.segmenter.segmentForVideo(v, ts, (result) => {
        const mask = result.categoryMask;
        if (!mask) return;
        const { width: w, height: h } = mask;
        if (this.maskCanvas.width !== w || this.maskCanvas.height !== h || !this.maskImage) {
          this.maskCanvas.width = w;
          this.maskCanvas.height = h;
          this.maskImage = this.maskCtx.createImageData(w, h);
        }
        // Category 0 is background in the multiclass selfie model; anything else is the person.
        const cats = mask.getAsUint8Array();
        const px = this.maskImage.data;
        for (let i = 0, j = 0; i < cats.length; i++, j += 4) {
          px[j] = px[j + 1] = px[j + 2] = 255;
          px[j + 3] = cats[i] > 0 ? 255 : 0;
        }
        this.maskCtx.putImageData(this.maskImage, 0, 0);
        this.hasMask = true;
      });
    } catch (err) {
      console.warn('[vision] segmentation failed', err);
    }
    return this.hasMask;
  }

  // Returns a canvas (camera orientation, video size) containing only the player's pixels.
  personLayer() {
    if (!this.hasMask && !this.fake) return null;
    const v = this.fake ? this.fake.canvas : this.video;
    const mask = this.fake ? this.fake.personCanvas : this.maskCanvas;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (this.personCanvas.width !== w || this.personCanvas.height !== h) {
      this.personCanvas.width = w;
      this.personCanvas.height = h;
    }
    const c = this.personCtx;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    c.imageSmoothingEnabled = true;
    c.drawImage(mask, 0, 0, w, h); // upscaling softens the mask edges
    c.globalCompositeOperation = 'source-in';
    c.drawImage(v, 0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    return this.personCanvas;
  }
}

// Turns a stream of blink scores into "eyes closed" and "eyes opened" events.
export class BlinkDetector {
  constructor() {
    this.reset();
  }

  reset() {
    this.samples = [];
    this.baseline = 0.1;
    this.threshold = 0.5;
    this.closed = false;
    this.closedAt = 0;
    this.lastCloseAt = -Infinity;
    this.score = 0;
    this.onClose = null;
    this.onOpen = null;
  }

  addCalibrationSample(score) {
    this.samples.push(score);
  }

  finishCalibration() {
    const cfg = CONFIG.blink;
    if (this.samples.length >= 5) {
      // Use the lower half of samples so a stray blink during calibration does not skew it.
      const sorted = [...this.samples].sort((a, b) => a - b);
      const half = sorted.slice(0, Math.ceil(sorted.length / 2));
      this.baseline = half.reduce((a, b) => a + b, 0) / half.length;
    }
    const t = this.baseline + cfg.thresholdAboveBaseline;
    this.threshold = Math.min(cfg.maxThreshold, Math.max(cfg.minThreshold, t));
    return { baseline: this.baseline, threshold: this.threshold };
  }

  update(score, now) {
    const cfg = CONFIG.blink;
    this.score = score;
    if (!this.closed && score > this.threshold) {
      this.closed = true;
      this.closedAt = now;
      if (now - this.lastCloseAt > cfg.cooldownMs) {
        this.lastCloseAt = now;
        this.onClose?.(now);
      }
    } else if (this.closed && score < this.threshold - cfg.hysteresis) {
      this.closed = false;
      this.onOpen?.(now - this.closedAt);
    }
  }

  // For debug mode and the no-camera fallback.
  simulate(now) {
    this.closed = true;
    this.closedAt = now;
    this.lastCloseAt = now;
    this.onClose?.(now);
    setTimeout(() => {
      this.closed = false;
      this.onOpen?.(120);
    }, 120);
  }
}
