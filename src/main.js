// Wires the screens together: warning -> fake CAPTCHA -> game -> end screen.

import { CONFIG, DEBUG, SKIP_CAPTCHA, PREVIEW } from './config.js';
import { startCamera } from './camera.js';
import { FakeCamera } from './fakecam.js';
import { Vision } from './vision.js';
import { SoundEngine } from './audio.js';
import { runCaptcha } from './captcha.js';
import { Game } from './game.js';
import { ASSETS } from './assets.js';

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
  for (const s of ['intro', 'captcha', 'nameentry', 'getready', 'end']) $(s).classList.toggle('hidden', s !== id);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Countdown right before the hallway, telling the player not to blink or look away.
async function getReady() {
  show('getready');
  const count = $('getready-count');
  for (let n = CONFIG.phases.getReadySeconds; n > 0; n--) {
    count.textContent = n;
    audio.beep();
    await sleep(1000);
  }
  show(null);
}

// The leaderboard lives only in memory: it survives Try again and Next player,
// and disappears when the tab is closed or refreshed.
const board = [];
let entryId = 0;
let currentEntry = null;
let playerName = '';
let source = null;

function askName(prefill = '') {
  show('nameentry');
  const input = $('player-name');
  const error = $('name-error');
  input.value = prefill;
  error.textContent = '';
  setTimeout(() => {
    input.focus();
    input.select();
  }, 60);
  return new Promise((resolve) => {
    $('name-form').onsubmit = (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/\s+/g, ' ');
      if (!name) {
        error.textContent = 'Type a name first, then press Enter.';
        return;
      }
      $('name-form').onsubmit = null;
      input.blur();
      audio.click();
      resolve(name.slice(0, 16));
    };
  });
}

function getGame() {
  if (!game) {
    game = new Game({
      canvas: $('stage'),
      video: source,
      vision,
      audio,
      debugEl: DEBUG ? $('debug') : null,
      onEnd: showEnd,
    });
  }
  return game;
}

// Asks for a name unless the same player is going again.
async function play({ askForName = true } = {}) {
  if (askForName) playerName = await askName('');
  await getReady();
  getGame().start();
}

async function run() {
  document.documentElement.requestFullscreen?.().catch(() => {});
  if (!SKIP_CAPTCHA) {
    show('captcha');
    await runCaptcha({ root: $('captcha-root'), video: source, audio, vision });
  }
  await play();
}

$('start').addEventListener('click', async () => {
  const btn = $('start');
  btn.disabled = true;
  $('intro-error').textContent = '';
  audio.unlock();
  audio.loadSample('scream', ASSETS.screamSrc);

  try {
    // After Quit the simulated camera is kept; a real camera is switched off and asked for again.
    if (!source) source = await getSource(PREVIEW);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    $('intro-error').textContent = cameraErrorMessage(err);
    $('demo').classList.remove('hidden');
    return;
  }
  run();
});

// Backup for a camera that will not cooperate during judging.
$('demo').addEventListener('click', async () => {
  audio.unlock();
  audio.loadSample('scream', ASSETS.screamSrc);
  source = await getSource(true);
  run();
});

function renderBoard() {
  const body = $('board-body');
  body.replaceChildren();
  if (!board.length) {
    const tr = document.createElement('tr');
    tr.className = 'empty';
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = 'No scores yet';
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }
  board.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (entry === currentEntry) tr.className = 'you';
    const rank = document.createElement('td');
    rank.textContent = i + 1;
    const name = document.createElement('td');
    name.className = 'name';
    name.textContent = entry.name; // textContent, so a name can never inject HTML
    const time = document.createElement('td');
    time.textContent = `${entry.seconds.toFixed(1)}s`;
    tr.append(rank, name, time);
    body.appendChild(tr);
  });
  body.querySelector('.you')?.scrollIntoView({ block: 'nearest' });
}

function showEnd({ seconds, blinks }) {
  // One row per player. Names match ignoring capitals, so "bashar" and "Bashar" are the same row.
  const key = playerName.toLowerCase();
  let entry = board.find((e) => e.name.toLowerCase() === key);
  let note = '';
  if (entry) {
    // A row keeps the player's best (longest) run.
    if (seconds > entry.seconds) {
      note = ' New best!';
      entry.seconds = seconds;
      entry.blinks = blinks;
    } else {
      note = ` Your best is still ${entry.seconds.toFixed(1)}s.`;
    }
  } else {
    entry = { id: ++entryId, name: playerName, seconds, blinks };
    board.push(entry);
  }
  currentEntry = entry;
  // More seconds ranks higher. Ties go to whoever played first.
  board.sort((a, b) => b.seconds - a.seconds || a.id - b.id);
  const rank = board.indexOf(currentEntry) + 1;
  $('stage').classList.add('hidden');
  $('end-stats').textContent = `${playerName}, you lasted ${seconds.toFixed(1)} seconds and blinked ${blinks} ${
    blinks === 1 ? 'time' : 'times'
  }.${note} You are #${rank} of ${board.length}.`;
  renderBoard();
  setTimeout(() => show('end'), 400);
}

// Same player goes again: no name prompt, straight to the countdown, same leaderboard row.
$('again').addEventListener('click', () => {
  audio.unlock();
  play({ askForName: false });
});

// Someone new: the full experience again, CAPTCHA included. The board is kept.
$('next').addEventListener('click', () => {
  audio.unlock();
  run();
});

// Back to the title screen. Turns the webcam off and leaves fullscreen.
// The leaderboard is kept until the tab is closed or refreshed.
$('quit').addEventListener('click', () => {
  audio.click();
  if (source === video && video.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    source = null;
  }
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  $('start').disabled = false;
  $('intro-error').textContent = '';
  show('intro');
});
