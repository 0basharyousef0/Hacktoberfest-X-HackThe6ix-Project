// All the knobs in one place. Tweak these at the event without touching game logic.

export const CONFIG = {
  blink: {
    // Blink score is the average of MediaPipe's eyeBlinkLeft / eyeBlinkRight (0 = open, 1 = shut).
    // The threshold is set per player during calibration: baseline + thresholdAboveBaseline,
    // clamped between minThreshold and maxThreshold.
    minThreshold: 0.38,
    maxThreshold: 0.72,
    thresholdAboveBaseline: 0.28,
    hysteresis: 0.1, // eyes count as open again once the score drops this far below the threshold
    cooldownMs: 260, // ignore a second "close" this soon after the last one
    calibrationMs: 2600,
  },

  monster: {
    startDistance: 1, // 1 = far end of the hallway, 0 = in your face
    stepMin: 0.09, // how far it lurches per blink (random between min and max)
    stepMax: 0.15,
    lookAwaySpeed: 0.2, // distance per second it moves while your face is not visible
    vanishAt: 0.22, // when it gets this close it disappears... and shows up behind you
  },

  phases: {
    vanishSilenceMs: 2600, // dead silence after it vanishes (the fake relief)
    behindFadeMs: 2600, // how long the figure takes to fade in behind the player
    scareFallbackMinMs: 1200, // if the player never blinks or turns, scare anyway after this window
    scareFallbackMaxMs: 4000, // (short and random on purpose, so it lands before they expect it)
    turnAroundGraceMs: 140, // delay between the player's face reappearing and the scare
    scareDurationMs: 3800, // how long the full-screen face stays up
    captchaScareMs: 3500, // how long Freddy stays up at the end of the CAPTCHA
    leanInMs: 3000, // wait after the tiny note finishes typing before Freddy appears
    getReadySeconds: 3, // countdown before the game starts
  },

  audio: {
    masterVolume: 0.9,
    scareVolume: 1.0,
    screamSeconds: 3.9,
  },

  mediapipe: {
    // 'auto' uses ./vendor if scripts/download-assets.sh has been run, otherwise the CDN.
    // Set true or false to force one or the other.
    local: 'auto',
    version: '1.1.1',
    faceModel:
      'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    segmenterModel:
      'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  },
};

const params = new URLSearchParams(location.search);

// ?debug shows blink scores and enables keyboard shortcuts (B = blink, V = vanish, S = scare)
export const DEBUG = params.has('debug');

// ?skip=captcha jumps straight to the game (handy while tuning)
export const SKIP_CAPTCHA = params.get('skip') === 'captcha';

// ?preview (or window.DONT_BLINK_PREVIEW) runs with a simulated webcam and click-to-blink.
export const PREVIEW = params.has('preview') || window.DONT_BLINK_PREVIEW === true;
