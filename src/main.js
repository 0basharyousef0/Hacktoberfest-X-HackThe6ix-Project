// Wires the screens together: warning -> fake CAPTCHA -> game -> end screen.

import { CONFIG, DEBUG, SKIP_CAPTCHA, PREVIEW } from './config.js';
import { startCamera } from './camera.js';
import { FakeCamera } from './fakecam.js';
import { Vision } from './vision.js';
import { SoundEngine } from './audio.js';
import { runCaptcha } from './captcha.js';
import { Game } from './game.js';
import { ASSETS } from './assets.js';
import { keepPhotos, allPhotos, photoCount } from './wall.js';
import { judgeReactions } from './judge.js';

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
  for (const s of ['intro', 'captcha', 'nameentry', 'getready', 'end', 'wall']) $(s).classList.toggle('hidden', s !== id);
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

// Reaction photos: Freddy's is taken during the CAPTCHA, the hallway one at the final scare.
// They wait here until the player chooses Keep (saved to the wall) or Delete (gone for good).
let freddyShot = null;
let pendingShots = [];
let pendingVerdict = Promise.resolve(null);

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
    const result = await runCaptcha({ root: $('captcha-root'), video: source, audio, vision });
    freddyShot = result?.freddyShot || null;
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

function showEnd({ seconds, blinks, shot }) {
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

  pendingShots = [
    freddyShot && { scare: 'Freddy', dataUrl: freddyShot },
    shot && { scare: 'The hallway', dataUrl: shot },
  ].filter(Boolean);
  freddyShot = null;
  setupKeepPrompt();
  updateWallCount();

  // Send the photos to the AI scream judge on DigitalOcean while the polaroids develop.
  $('taunt').textContent = '';
  const shots = pendingShots;
  const verdict = judgeReactions({ name: playerName, seconds, blinks, photos: shots }).then((result) => {
    if (result) {
      shots.forEach((s, i) => {
        s.rating = result.rating;
        s.caption = result.captions?.[i] || '';
      });
      if (result.taunt) $('taunt').textContent = `\u201C${result.taunt}\u201D`;
    }
    return result;
  });

  pendingVerdict = verdict;

  setTimeout(async () => {
    show('end');
    if (shots.length) await revealPolaroids(shots, verdict);
  }, 400);
}

// Same player goes again: no name prompt, straight to the countdown, same leaderboard row.
$('again').addEventListener('click', () => {
  audio.unlock();
  discardPending();
  play({ askForName: false });
});

// Someone new: the full experience again, CAPTCHA included. The board is kept.
$('next').addEventListener('click', () => {
  audio.unlock();
  discardPending();
  run();
});

// Back to the title screen. Turns the webcam off and leaves fullscreen.
// The leaderboard is kept until the tab is closed or refreshed.
$('quit').addEventListener('click', () => {
  audio.click();
  discardPending();
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

// ---------- Reaction photos ----------

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const tilt = () => `${(Math.random() * 10 - 5).toFixed(1)}deg`;

function fillVerdict(card, { rating, caption }) {
  const stamp = card.querySelector('.stamp');
  if (rating) {
    stamp.textContent = `Terror ${rating}/10`;
    stamp.classList.remove('judging');
    stamp.classList.add('rated');
    stamp.hidden = false;
  }
  const line = card.querySelector('.ai-cap');
  if (caption) {
    line.textContent = caption;
    line.hidden = false;
  }
}

function makePolaroid({ dataUrl, scare, name, rating, caption }, { unsaved = false, judging = false } = {}) {
  const card = document.createElement('figure');
  card.className = 'polaroid';
  card.style.setProperty('--tilt', tilt());
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = `${name} reacting to ${scare}`;
  const cap = document.createElement('figcaption');
  cap.className = 'cap';
  cap.textContent = name;
  const sub = document.createElement('span');
  sub.className = 'sub';
  sub.textContent = scare;
  const frame = document.createElement('div');
  frame.className = 'photo';
  const stamp = document.createElement('span');
  stamp.className = 'stamp';
  stamp.hidden = !judging;
  if (judging) {
    stamp.classList.add('judging');
    stamp.textContent = 'Judging your scream...';
  }
  frame.append(img, stamp);
  const aiCap = document.createElement('span');
  aiCap.className = 'ai-cap';
  aiCap.hidden = true;
  card.append(frame, cap, aiCap, sub);
  fillVerdict(card, { rating, caption });
  if (unsaved) {
    const r = document.createElement('span');
    r.className = 'ribbon';
    r.textContent = 'Not saved yet';
    card.appendChild(r);
  }
  return card;
}

// Shows the photos big over the end screen, then shrinks them into the Reaction wall button.
async function revealPolaroids(shots, verdict) {
  const overlay = document.createElement('div');
  overlay.className = 'reveal';
  const cards = shots.map((s) => makePolaroid({ ...s, name: playerName }, { judging: !PREVIEW }));
  overlay.append(...cards);
  document.body.appendChild(overlay);
  audio.shutter?.();

  // Hold the photos until the AI has rated them (up to about 9 seconds), then show the verdict.
  const result = await Promise.race([
    Promise.all([verdict, sleepMs(2200)]).then(([r]) => r),
    sleepMs(9000).then(() => null),
  ]);
  if (result) {
    cards.forEach((card, i) => fillVerdict(card, shots[i]));
    audio.creak?.();
    await sleepMs(2600);
  } else {
    cards.forEach((card) => (card.querySelector('.stamp').hidden = true));
    await sleepMs(800);
  }

  const target = $('wall-open').getBoundingClientRect();
  const tx = target.left + target.width / 2;
  const ty = target.top + target.height / 2;
  overlay.classList.add('leaving');
  await Promise.all(
    cards.map((card, i) => {
      const r = card.getBoundingClientRect();
      const dx = tx - (r.left + r.width / 2);
      const dy = ty - (r.top + r.height / 2);
      return card
        .animate(
          [
            { transform: `rotate(${card.style.getPropertyValue('--tilt')})`, opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.06) rotate(20deg)`, opacity: 0.3 },
          ],
          { duration: 750, delay: i * 120, easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)', fill: 'forwards' },
        )
        .finished.catch(() => {});
    }),
  );
  overlay.remove();
  const btn = $('wall-open');
  btn.classList.remove('bump');
  void btn.offsetWidth;
  btn.classList.add('bump');
}

function setupKeepPrompt() {
  const keep = $('keep');
  const n = pendingShots.length;
  keep.classList.toggle('hidden', n === 0);
  $('keep-buttons').classList.remove('hidden');
  $('keep-text').textContent =
    n === 2
      ? 'Keep your 2 reaction photos on the wall? Kept photos stay on this laptop for good. Deleted ones are gone for good.'
      : 'Keep your reaction photo on the wall? Kept photos stay on this laptop for good. Deleted ones are gone for good.';
}

function discardPending() {
  pendingShots = [];
  $('keep').classList.add('hidden');
}

async function updateWallCount() {
  const saved = await photoCount().catch(() => 0);
  $('wall-count').textContent = saved + pendingShots.length;
}

$('keep-yes').addEventListener('click', async () => {
  audio.click();
  $('keep-buttons').classList.add('hidden');
  // Wait briefly for the AI verdict so the rating and caption are saved with the photos.
  await Promise.race([pendingVerdict, sleepMs(6000)]);
  const photos = pendingShots.map((s) => ({ ...s, name: playerName }));
  pendingShots = [];
  $('keep-buttons').classList.add('hidden');
  try {
    await keepPhotos(photos);
    $('keep-text').textContent = 'Saved to the reaction wall. They stay until someone clears this browser.';
  } catch (err) {
    console.error(err);
    $('keep-text').textContent = 'This browser would not save them, so they were not kept.';
  }
  updateWallCount();
});

$('keep-no').addEventListener('click', () => {
  audio.click();
  pendingShots = [];
  $('keep-buttons').classList.add('hidden');
  $('keep-text').textContent = 'Deleted. Those photos are gone for good.';
  updateWallCount();
});

async function renderWall() {
  const grid = $('wall-grid');
  grid.replaceChildren();
  const unsaved = pendingShots.map((s) => makePolaroid({ ...s, name: playerName }, { unsaved: true }));
  const saved = (await allPhotos().catch(() => [])).map((p) => makePolaroid(p));
  const total = unsaved.length + saved.length;
  $('wall-sub').textContent = total
    ? `${saved.length} kept photo${saved.length === 1 ? '' : 's'}${unsaved.length ? `, plus ${unsaved.length} of yours waiting for you to choose` : ''}.`
    : 'No reaction photos yet. Be the first.';
  if (!total) {
    const empty = document.createElement('p');
    empty.className = 'wall-empty';
    empty.textContent = 'Nobody has kept their photos yet.';
    grid.appendChild(empty);
    return;
  }
  grid.append(...unsaved, ...saved);
}

$('wall-open').addEventListener('click', async () => {
  audio.click();
  await renderWall();
  show('wall');
  $('wall').scrollTop = 0;
});

$('wall-back').addEventListener('click', () => {
  audio.click();
  show('end');
});

updateWallCount();
