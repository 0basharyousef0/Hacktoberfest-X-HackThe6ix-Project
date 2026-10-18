// Wires the screens together: warning -> fake CAPTCHA -> game -> end screen.

import { DEBUG, SKIP_CAPTCHA, PREVIEW } from './config.js';
import { startCamera } from './camera.js';
import { FakeCamera } from './fakecam.js';
import { Vision } from './vision.js';
import { SoundEngine } from './audio.js';
import { runCaptcha } from './captcha.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const video = $('cam');
const audio = new SoundEngine();
const vision = new Vision(video);
let game = null;

// Start downloading the models while the player reads the warning.
if (!PREVIEW) vision.load();

if (DEBUG) $('debug').classList.remove('hidden');

if (PREVIEW) {
  $('warn-camera').textContent =
    'Preview mode: this page cannot use a webcam, so a simulated camera feed stands in for you. Click or press B every time you blink.';
  $('start').textContent = 'Begin the preview';
}

function show(id) {
  for (const s of ['intro', 'captcha', 'end']) $(s).classList.toggle('hidden', s !== id);
}

function cameraErrorMessage(err) {
  if (err?.name === 'NotAllowedError') return 'Camera access was blocked. Allow it from the address bar, then try again.';
  if (err?.name === 'NotFoundError') return 'No camera was found on this device.';
  if (err?.name === 'NotReadableError') return 'The camera is busy in another app. Close it and try again.';
  return err?.message || 'Could not start the camera.';
}

// Returns something that behaves like the webcam <video>: the real one, or a simulated feed.
async function getSource(fake) {
  if (fake) {
    const cam = new FakeCamera();
    vision.useFake(cam);
    return cam.start();
  }
  await startCamera(video);
  return video;
}

async function run(source) {
  document.documentElement.requestFullscreen?.().catch(() => {});
  if (!SKIP_CAPTCHA) {
    show('captcha');
    await runCaptcha({ root: $('captcha-root'), video: source, audio, vision });
  }
  show(null);
  game = new Game({
    canvas: $('stage'),
    video: source,
    vision,
    audio,
    debugEl: DEBUG ? $('debug') : null,
    onEnd: showEnd,
  });
  game.start();
}

$('start').addEventListener('click', async () => {
  const btn = $('start');
  btn.disabled = true;
  $('intro-error').textContent = '';
  audio.unlock();

  let source;
  try {
    source = await getSource(PREVIEW);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    $('intro-error').textContent = cameraErrorMessage(err);
    $('demo').classList.remove('hidden');
    return;
  }
  run(source);
});

// Backup for a camera that will not cooperate during judging.
$('demo').addEventListener('click', async () => {
  audio.unlock();
  run(await getSource(true));
});

function showEnd({ seconds, blinks }) {
  $('stage').classList.add('hidden');
  $('end-stats').textContent = `You lasted ${seconds.toFixed(1)} seconds and blinked ${blinks} ${
    blinks === 1 ? 'time' : 'times'
  }.`;
  setTimeout(() => show('end'), 400);
}

$('again').addEventListener('click', () => {
  show(null);
  game.start();
});

// Full run, CAPTCHA included, for the next person in line.
$('next').addEventListener('click', () => location.reload());
