// A boring "verify you're human" check that slowly goes wrong.
//
// Round 1: traffic lights (completely normal)
// Round 1b: the event sponsors, hidden among pictures of Drake
// Round 2: faces (one of them is a snapshot of the player)
// Round 3: the grid is the player's live webcam... then "select all squares with two people"
// Round 4: "Are you alone right now?"
//
// "HumanCheck" is a made up brand on purpose. Do not restyle this to look like a real CAPTCHA product.

import { CONFIG } from './config.js';
import { drawMirrored } from './camera.js';
import { drawStalker } from './monster.js';
import { ASSETS } from './assets.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (arr, n) => shuffle(arr).slice(0, n);

const OBJECTS = ['🌳', '🚗', '🏠', '🚌', '🌲', '🚲', '🏢', '⛽', '🚕', '🛵', '🌉', '🚚'];
const FACES = ['😐', '🙂', '😶'];
const BACKDROPS = [
  ['#9fb7c9', '#6f8494'],
  ['#b9c2a5', '#7b8669'],
  ['#c9b8a0', '#8d7b66'],
  ['#a7a9b0', '#6c6e75'],
  ['#c4cfd6', '#8a979f'],
];

const TEMPLATE = `
  <div class="hc-page">
    <header class="hc-site hc-pending">
      <h1 class="hc-title">One quick check before you play</h1>
      <p class="hc-subtitle">Please verify you are human to continue.</p>
    </header>

    <div class="hc-widget hc-pending" role="group" aria-label="Human verification">
      <button class="hc-box" type="button" aria-label="I'm not a robot">
        <span class="hc-spinner" aria-hidden="true"></span>
        <svg class="hc-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
      </button>
      <span class="hc-label">I'm not a robot</span>
      <div class="hc-brand">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 3l10 4v8c0 6.5-4.3 11.6-10 14-5.7-2.4-10-7.5-10-14V7z" fill="#4a6fa5"/>
          <path d="M11 16l3.5 3.5L21.5 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="hc-brand-name">HumanCheck</span>
        <span class="hc-brand-links">Privacy &middot; Terms</span>
      </div>
    </div>

    <div class="hc-challenge hidden" role="dialog" aria-label="Verification challenge">
      <div class="hc-header">
        <span class="hc-pre"></span>
        <strong class="hc-target"></strong>
        <span class="hc-post"></span>
      </div>
      <div class="hc-body">
        <div class="hc-grid"></div>
        <div class="hc-question hidden">
          <p class="hc-q-big">Are you alone right now?</p>
          <div class="hc-q-buttons">
            <button type="button" data-answer="yes">Yes</button>
            <button type="button" data-answer="no">No</button>
          </div>
        </div>
      </div>
      <div class="hc-msg" aria-live="polite"></div>
      <div class="hc-footer">
        <div class="hc-tools">
          <button type="button" aria-label="Get a new challenge">&#x21bb;</button>
          <button type="button" aria-label="Audio challenge">&#x1F3A7;&#xFE0E;</button>
          <button type="button" aria-label="Help">?</button>
        </div>
        <button class="hc-verify" type="button">Verify</button>
      </div>
    </div>
  </div>
`;

export async function runCaptcha({ root, video, audio, vision }) {
  // Reset the intro pieces outside the CAPTCHA so a second run (Next player) starts fresh.
  document.querySelectorAll('.event-logo').forEach((logo) => logo.classList.remove('shown'));
  document.querySelector('.event-tagline')?.classList.remove('gone');
  root.innerHTML = TEMPLATE;
  const $ = (sel) => root.querySelector(sel);
  const box = $('.hc-box');
  const challenge = $('.hc-challenge');
  const grid = $('.hc-grid');
  const msg = $('.hc-msg');
  const verify = $('.hc-verify');
  let round = 0;
  let liveLoop = null;

  const setPrompt = (pre, target, post) => {
    $('.hc-pre').textContent = pre;
    $('.hc-target').textContent = target;
    $('.hc-post').textContent = post;
  };
  const showMsg = (text, kind = 'error') => {
    msg.textContent = text;
    msg.className = `hc-msg ${kind}`;
  };
  const clearMsg = () => {
    msg.textContent = '';
    msg.className = 'hc-msg';
  };
  const waitFor = (el, event = 'click') => new Promise((r) => el.addEventListener(event, r, { once: true }));

  root.querySelectorAll('.hc-tools button').forEach((b) =>
    b.addEventListener('click', () => {
      audio.click();
      if (round >= 3) showMsg("That won't help.");
    }),
  );

  function buildGrid(tiles) {
    grid.innerHTML = '';
    grid.classList.remove('live');
    return tiles.map((tile, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'hc-tile';
      el.dataset.i = i;
      if (tile.type === 'emoji') {
        const [a, b] = BACKDROPS[Math.floor(Math.random() * BACKDROPS.length)];
        el.style.background = `linear-gradient(${Math.floor(Math.random() * 360)}deg, ${a}, ${b})`;
        const span = document.createElement('span');
        span.className = 'hc-emoji';
        span.textContent = tile.emoji;
        span.style.transform = `rotate(${(Math.random() - 0.5) * 16}deg) scale(${0.85 + Math.random() * 0.3})`;
        el.appendChild(span);
      } else if (tile.type === 'canvas') {
        el.appendChild(tile.canvas);
      } else if (tile.type === 'img') {
        el.classList.add(tile.fit === 'contain' ? 'hc-logo-tile' : 'hc-photo-tile');
        const img = document.createElement('img');
        img.alt = tile.label;
        img.draggable = false;
        // If the image file is missing, show its name so the round still works.
        img.addEventListener('error', () => {
          const label = document.createElement('span');
          label.className = 'hc-tile-label';
          label.textContent = tile.label;
          img.replaceWith(label);
        });
        img.src = tile.src;
        el.appendChild(img);
      }
      el.addEventListener('click', () => {
        audio.click();
        el.classList.toggle('sel');
        clearMsg();
      });
      grid.appendChild(el);
      return el;
    });
  }

  const selected = (els) => els.filter((el) => el.classList.contains('sel')).map((el) => Number(el.dataset.i));

  async function waitForVerify(els, { requireSelection = true } = {}) {
    for (;;) {
      await waitFor(verify);
      audio.click();
      if (!requireSelection || selected(els).length > 0) return selected(els);
      showMsg('Please select all matching images.');
    }
  }

  function snapshotOfPlayer() {
    const c = document.createElement('canvas');
    c.width = c.height = 200;
    const g = c.getContext('2d');
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    // Square crop around the face if we know where it is, otherwise the middle of the frame.
    const face = vision.ready ? vision.updateFace() : null;
    const cw = (vh / vw) * 0.75;
    const cx = face?.present ? face.noseX : 0.5;
    const cy = face?.present ? face.noseY : 0.45;
    const crop = {
      x: Math.min(1 - cw, Math.max(0, cx - cw / 2)),
      y: Math.min(0.25, Math.max(0, cy - 0.375)),
      w: cw,
      h: 0.75,
    };
    drawMirrored(g, video, 0, 0, 200, 200, crop);
    c.classList.add('hc-snapshot');
    return c;
  }

  // ---------- Step 0: the checkbox ----------

  // Intro sequence: the line types out, then the logos fade in, then the check itself.
  await typeTagline(document.querySelector('.event-tagline'));
  await sleep(250);
  document.querySelectorAll('.event-logo').forEach((logo) => logo.classList.add('shown'));
  await sleep(1100);
  root.querySelectorAll('.hc-pending').forEach((el) => el.classList.remove('hc-pending'));

  await waitFor(box);
  audio.click();
  document.querySelector('.event-tagline')?.classList.add('gone');
  box.classList.add('loading');
  await sleep(1300);
  box.classList.remove('loading');
  challenge.classList.remove('hidden');

  const sameSet = (a, b) => a.length === b.length && a.every((i) => b.includes(i));

  async function reloadAnimation() {
    challenge.classList.add('reloading');
    await sleep(500);
    challenge.classList.remove('reloading');
  }

  async function rejectAnswer(els) {
    showMsg('Incorrect. Please try again.');
    challenge.classList.remove('shake');
    void challenge.offsetWidth; // restart the shake animation
    challenge.classList.add('shake');
    await sleep(350);
    els.forEach((el) => el.classList.remove('sel'));
  }

  // Runs one image round until it is answered correctly. `build` makes a fresh grid and
  // returns { els, check(picks) } where check returns true when the answer is right.
  // Like the real thing, two wrong answers get a brand new set of images.
  async function playRound(build) {
    for (;;) {
      const { els, check } = build();
      for (let tries = 0; tries < 2; tries++) {
        const picks = await waitForVerify(els);
        const result = check(picks, els);
        if (result) return result;
        await rejectAnswer(els);
      }
      await reloadAnimation();
    }
  }

  // ---------- Round 1: traffic lights ----------

  round = 1;
  setPrompt('Select all images with', 'traffic lights', 'Click verify once there are none left');
  await playRound(() => {
    const items = shuffle(['🚦', '🚦', '🚦', ...pick(OBJECTS, 6)]);
    const els = buildGrid(items.map((emoji) => ({ type: 'emoji', emoji })));
    const correct = items.flatMap((e, i) => (e === '🚦' ? [i] : []));
    return { els, check: (picks) => sameSet(picks, correct) };
  });

  // ---------- Round 1b: the event sponsors (and a lot of Drake) ----------

  clearMsg();
  await reloadAnimation();
  setPrompt('Select all images with', 'our sponsors', 'Click verify once there are none left');
  await playRound(() => {
    const tiles = shuffle([
      ...ASSETS.sponsorTiles.map((s) => ({ type: 'img', src: s.src, label: s.name, fit: s.fit || 'contain', sponsor: true })),
      ...ASSETS.drakeTiles.map((src, i) => ({ type: 'img', src, label: `Drake ${i + 1}`, fit: 'cover' })),
    ]);
    const els = buildGrid(tiles);
    const correct = tiles.flatMap((t, i) => (t.sponsor ? [i] : []));
    return { els, check: (picks) => sameSet(picks, correct) };
  });

  // ---------- Round 2: faces (one of them is you) ----------

  round = 2;
  clearMsg();
  await reloadAnimation();
  setPrompt('Select all images with', 'a face', 'Click verify once there are none left');
  const faceResult = await playRound(() => {
    const tiles = shuffle([
      ...pick(FACES, 2).map((emoji) => ({ type: 'emoji', emoji, face: true })),
      { type: 'canvas', canvas: snapshotOfPlayer(), you: true, face: true },
      ...pick(OBJECTS, 6).map((emoji) => ({ type: 'emoji', emoji })),
    ]);
    const els = buildGrid(tiles);
    const youIndex = tiles.findIndex((t) => t.you);
    const emojiFaces = tiles.flatMap((t, i) => (t.face && !t.you ? [i] : []));
    return {
      els,
      // Wrong if they picked a non-face or skipped an emoji face. Skipping only the
      // snapshot of themselves counts as right, so the game can point it out.
      check: (picks) => {
        const wrongPick = picks.some((i) => !tiles[i].face);
        const missedEmoji = emojiFaces.some((i) => !picks.includes(i));
        if (wrongPick || missedEmoji) return false;
        return { missedYou: !picks.includes(youIndex), youEl: els[youIndex] };
      },
    };
  });
  if (faceResult.missedYou) {
    showMsg('You missed one.');
    faceResult.youEl.classList.add('pulse');
    await sleep(1600);
  }

  // ---------- Round 3: your live webcam, then "two people" ----------

  round = 3;
  clearMsg();
  {
    challenge.classList.add('reloading');
    await sleep(500);
    challenge.classList.remove('reloading');

    const SIZE = 360;
    const frame = document.createElement('canvas');
    frame.width = frame.height = SIZE;
    const fg = frame.getContext('2d');
    const tileCanvases = Array.from({ length: 9 }, () => {
      const c = document.createElement('canvas');
      c.width = c.height = SIZE / 3;
      return c;
    });

    let figureStart = null;
    let figureCorner = 2;
    const hanging = upsideDownFace(ASSETS.peekFace);
    const draw = (now) => {
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const cw = vh / vw;
      fg.clearRect(0, 0, SIZE, SIZE);
      drawMirrored(fg, video, 0, 0, SIZE, SIZE, { x: (1 - cw) / 2, y: 0, w: cw, h: 1 });

      if (figureStart !== null) {
        const t = (now - figureStart) / 2600;
        const alpha = Math.min(0.42, t * 0.42) * (Math.random() < 0.06 ? 0.3 : 1);
        const hasMask = vision.updateMask();
        const person = hasMask ? vision.personLayer() : null;
        if (hanging) {
          // The face drops upside down into the top right corner, behind the player.
          // A quarter second with a small overshoot, so it snaps in rather than fades.
          const d = Math.min(1, (now - figureStart) / 260);
          const k = 1.9;
          const lower = 1 + (k + 1) * Math.pow(d - 1, 3) + k * Math.pow(d - 1, 2);
          const w = SIZE * 0.46;
          const h = (w * hanging.height) / hanging.width;
          const sway = Math.sin(now / 900) * SIZE * 0.004;
          fg.save();
          fg.globalAlpha = 0.9 * (Math.random() < 0.05 ? 0.4 : 1);
          fg.drawImage(hanging, SIZE - w + SIZE * 0.02 + sway, -h + h * 0.85 * lower, w, h);
          fg.restore();
        } else {
          const side = figureCorner === 0 ? -1 : 1;
          const fh = SIZE * (person ? 0.95 : 0.72);
          const fx = SIZE * (0.5 + side * (person ? 0.26 : 0.36));
          const footY = SIZE * 0.2 + 0.915 * fh;
          drawStalker(fg, fx, footY, fh, { time: now / 1000, alpha, light: 0.9, tilt: 0.3 * side, pose: 2 });
        }
        if (person) drawMirrored(fg, person, 0, 0, SIZE, SIZE, { x: (1 - cw) / 2, y: 0, w: cw, h: 1 });
      }

      tileCanvases.forEach((c, i) => {
        const g = c.getContext('2d');
        const sx = (i % 3) * (SIZE / 3);
        const sy = Math.floor(i / 3) * (SIZE / 3);
        g.drawImage(frame, sx, sy, SIZE / 3, SIZE / 3, 0, 0, c.width, c.height);
      });
      liveLoop = requestAnimationFrame(draw);
    };

    setPrompt('Select all squares with', 'a person', 'If there are none, click verify');
    const els = buildGrid(tileCanvases.map((canvas) => ({ type: 'canvas', canvas })));
    grid.classList.add('live');
    liveLoop = requestAnimationFrame(draw);
    audio.rumble(4, 0.3);

    await waitForVerify(els, { requireSelection: false });
    showMsg('Incorrect. Please try again.');
    els.forEach((el) => el.classList.remove('sel'));
    await sleep(1500);
    clearMsg();

    const face = vision.ready ? vision.updateFace() : null;
    figureCorner = face?.present && face.noseX > 0.5 ? 0 : 2;
    setPrompt('Select all squares with', 'two people', 'Look carefully');
    audio.rumble(5, 0.45);
    // A beat to read the new prompt, then it drops in with a thud.
    await sleep(700);
    figureStart = performance.now();
    audio.creak();

    await waitForVerify(els, { requireSelection: false });
    cancelAnimationFrame(liveLoop);
    liveLoop = null;
  }

  // ---------- Round 4: are you alone? ----------

  round = 4;
  clearMsg();
  {
    grid.classList.add('hidden');
    verify.classList.add('hidden');
    const q = $('.hc-question');
    q.classList.remove('hidden');
    setPrompt('Almost done', 'One last question', 'Answer honestly');

    const answer = await new Promise((resolve) =>
      q.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', () => resolve(b.dataset.answer), { once: true }),
      ),
    );
    audio.click();
    q.querySelectorAll('button').forEach((b) => (b.disabled = true));
    if (answer === 'yes') showMsg('Incorrect.');
    else showMsg('Correct.', 'ok');
    await sleep(1600);
  }

  // ---------- Outro ----------

  challenge.classList.add('hidden');
  box.classList.add('done');
  $('.hc-label').textContent = 'Verified';
  $('.hc-title').textContent = 'Verification complete.';
  $('.hc-subtitle').textContent = 'Please read the note below before continuing.';

  // Bait: a tiny, faint line typed out slowly so the player leans in to read it.
  // Three seconds after it finishes, while their face is close to the screen, Freddy.
  const note = document.createElement('p');
  note.className = 'hc-fineprint';
  $('.hc-page').appendChild(note);
  await sleep(900);
  await typeInto(
    note,
    'Note: for the best experience, sit close to your screen, stay very still, and keep reading until the game loads. Whatever happens, do not look behind you.',
    38,
  );
  await sleep(CONFIG.phases.leanInMs);
  await jumpScare(ASSETS.freddy, audio);
  root.innerHTML = '';
}

// Full-screen jump scare that covers the whole page, with the scream.
async function jumpScare(img, audio) {
  const overlay = document.createElement('div');
  overlay.className = 'jumpscare';
  if (img) {
    const pic = document.createElement('img');
    pic.src = img.src;
    pic.alt = '';
    overlay.appendChild(pic);
  }
  document.body.appendChild(overlay);
  audio.scream({ pitch: 0.8, duration: CONFIG.phases.captchaScareMs / 1000 + 0.4 });
  await sleep(CONFIG.phases.captchaScareMs);
  overlay.classList.add('gone');
  await sleep(700);
  // Remove after the game has painted its first black frame underneath.
  setTimeout(() => overlay.remove(), 400);
}

// Flips the face upside down. The image is already cut out of its background,
// so it sits in the webcam frame with no visible edge.
function upsideDownFace(img) {
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.translate(c.width, c.height);
  g.rotate(Math.PI);
  g.drawImage(img, 0, 0);
  return c;
}

// Types "Brought to you by" out one letter at a time with a blinking caret.
async function typeTagline(el) {
  if (!el) return;
  const text = el.getAttribute('aria-label') || el.textContent;
  const typed = document.createElement('span');
  typed.className = 'typed';
  typed.setAttribute('aria-hidden', 'true');
  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.setAttribute('aria-hidden', 'true');
  const rest = document.createElement('span');
  rest.className = 'rest';
  rest.setAttribute('aria-hidden', 'true');
  rest.textContent = text;
  el.replaceChildren(typed, caret, rest);
  await sleep(400);
  for (let i = 1; i <= text.length; i++) {
    typed.textContent = text.slice(0, i);
    rest.textContent = text.slice(i);
    await sleep(text[i - 1] === ' ' ? 40 : 75);
  }
}

async function typeInto(el, text, speed) {
  el.textContent = '';
  for (const ch of text) {
    el.textContent += ch;
    await sleep(ch === ' ' ? speed / 2 : speed);
  }
}
