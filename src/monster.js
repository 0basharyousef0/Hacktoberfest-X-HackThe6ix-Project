import { ASSETS } from './assets.js';

// Procedural monster art. Everything is drawn with canvas paths, so there are no image assets.
// Want a different monster? Add a new draw function here and swap it in game.js.

const DARK = [14, 14, 14];
const PALE = [216, 210, 199];
const PALE_MID = [176, 170, 160];
const PALE_EDGE = [92, 88, 82];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// Deterministic pseudo random so the hair does not jitter every frame.
const hash = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Tall, thin figure with long arms and a pale, tilted face.
 * (x, footY) is where its feet touch the floor; h is its full height in pixels.
 * opts.light (0..1) controls how lit the face is, opts.alpha its opacity.
 */
export function drawFigure(ctx, x, footY, h, opts = {}) {
  const { time = 0, alpha = 1, light = 1, tilt = 0.14 } = opts;
  if (h < 2 || alpha <= 0) return;
  const u = h;
  const body = '#050505';

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x + Math.sin(time * 0.7) * u * 0.004, footY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Body silhouette (right half, mirrored for the left).
  const outer = [
    [0.04, 0],
    [0.034, -0.03],
    [0.042, -0.24],
    [0.06, -0.46],
    [0.054, -0.56],
    [0.072, -0.66],
    [0.098, -0.752],
    [0.03, -0.785],
    [0.017, -0.835],
  ];
  const inner = [
    [0.012, 0],
    [0.018, -0.03],
    [0.013, -0.24],
    [0, -0.44],
  ];
  ctx.beginPath();
  outer.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(-px * u, py * u) : ctx.lineTo(-px * u, py * u)));
  for (let i = outer.length - 1; i >= 0; i--) ctx.lineTo(outer[i][0] * u, outer[i][1] * u);
  inner.forEach(([px, py]) => ctx.lineTo(px * u, py * u));
  for (let i = inner.length - 2; i >= 0; i--) ctx.lineTo(-inner[i][0] * u, inner[i][1] * u);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = body;
  ctx.lineWidth = u * 0.006;
  ctx.stroke();

  // Arms that hang far too low.
  for (const side of [-1, 1]) {
    const sway = Math.sin(time * 0.9 + side) * 0.006;
    ctx.lineWidth = u * 0.022;
    ctx.beginPath();
    ctx.moveTo(side * 0.088 * u, -0.74 * u);
    ctx.quadraticCurveTo(side * 0.124 * u, -0.5 * u, side * (0.112 + sway) * u, -0.24 * u);
    ctx.stroke();

    ctx.lineWidth = u * 0.006;
    for (let f = 0; f < 4; f++) {
      const fx = side * (0.104 + f * 0.006 + sway) * u;
      const fy = -0.245 * u;
      const len = 0.055 + (f === 1 || f === 2 ? 0.014 : 0);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(fx + side * 0.004 * u, fy + 0.03 * u, fx + side * (f - 1.5) * 0.004 * u, fy + len * u);
      ctx.stroke();
    }
  }

  // Head, tilted at an unnatural angle.
  ctx.save();
  ctx.translate(0, -0.915 * u);
  ctx.rotate(Math.sin(time * 0.35) * 0.05 + tilt);
  const hw = 0.05 * u;
  const hh = 0.088 * u;

  const skin = ctx.createRadialGradient(-hw * 0.3, -hh * 0.3, hw * 0.1, 0, 0, hh * 1.1);
  skin.addColorStop(0, rgb(mix(DARK, PALE, light)));
  skin.addColorStop(0.7, rgb(mix(DARK, PALE_MID, light)));
  skin.addColorStop(1, rgb(mix(DARK, PALE_EDGE, light * 0.6)));
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hollow, drooping eyes.
  ctx.fillStyle = '#000';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * hw * 0.4, -hh * 0.02, hw * 0.22, hh * 0.21, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Faint red pinpoints, same as the scare face, so it reads as the same creature.
  if (light > 0.3) {
    ctx.fillStyle = `rgba(255,42,26,${0.85 * light})`;
    ctx.shadowColor = 'rgba(255,42,26,0.9)';
    ctx.shadowBlur = Math.max(2, hw * 0.25);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * hw * 0.36, -hh * 0.03, Math.max(0.5, hw * 0.035), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // A thin grin stretched far too wide, slightly lopsided.
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(0.8, hh * 0.04);
  ctx.beginPath();
  ctx.moveTo(-hw * 0.66, hh * 0.38);
  ctx.quadraticCurveTo(0, hh * 0.66, hw * 0.7, hh * 0.32);
  ctx.stroke();

  // Long stringy hair.
  ctx.fillStyle = '#030303';
  ctx.beginPath();
  ctx.ellipse(0, -hh * 0.36, hw * 1.07, hh * 0.72, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#030303';
  ctx.lineWidth = Math.max(0.8, u * 0.005);
  const strands = 16;
  for (let i = 0; i < strands; i++) {
    const a = Math.PI + (i / (strands - 1)) * Math.PI;
    const sx = Math.cos(a) * hw * 1.02;
    const sy = Math.sin(a) * hh * 0.95 - hh * 0.2;
    const side = sx < 0 ? -1 : 1;
    if (Math.abs(sx) < hw * 0.35) continue; // keep the face visible
    const ex = side * hw * (0.85 + hash(i) * 0.5) + Math.sin(time * 0.6 + i) * hw * 0.04;
    const ey = hh * (0.9 + hash(i + 9) * 0.9);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx * 1.35, hh * 0.1, ex, ey);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

/**
 * Full-screen jump scare face. `elapsed` is ms since the scare started.
 * Avoids rapid strobing: one short flash at the start, then shake and glitch.
 */
export function drawScareFace(ctx, W, H, elapsed) {
  const s = Math.min(W, H);
  const lunge = Math.min(1, elapsed / 140);
  const eased = 1 - Math.pow(1 - lunge, 3);
  const zoom = 0.5 + 0.78 * eased + elapsed / 7000;
  const shake = Math.max(0.15, 1 - elapsed / 1500);
  const jx = (Math.random() - 0.5) * s * 0.05 * shake;
  const jy = (Math.random() - 0.5) * s * 0.05 * shake;

  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  bg.addColorStop(0, '#3a0303');
  bg.addColorStop(1, '#000');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2 + jx, H * 0.53 + jy);
  ctx.rotate((Math.random() - 0.5) * 0.06 * shake);
  ctx.scale(zoom, zoom);

  const rx = s * 0.36;
  const ry = s * 0.5;

  // Face
  const skin = ctx.createRadialGradient(-rx * 0.2, -ry * 0.3, rx * 0.05, 0, 0, ry * 1.05);
  skin.addColorStop(0, '#e2dfd2');
  skin.addColorStop(0.55, '#aeaa9a');
  skin.addColorStop(1, '#3d3b34');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sunken cheeks
  for (const side of [-1, 1]) {
    const c = ctx.createRadialGradient(side * rx * 0.55, ry * 0.18, 0, side * rx * 0.55, ry * 0.18, rx * 0.45);
    c.addColorStop(0, 'rgba(40,30,25,0.55)');
    c.addColorStop(1, 'rgba(40,30,25,0)');
    ctx.fillStyle = c;
    ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
  }

  // Bruised rings around the eyes
  for (const side of [-1, 1]) {
    const ex = side * rx * 0.4;
    const ey = -ry * 0.17;
    const ring = ctx.createRadialGradient(ex, ey, rx * 0.05, ex, ey, rx * 0.46);
    ring.addColorStop(0, 'rgba(18,6,6,0.9)');
    ring.addColorStop(0.55, 'rgba(45,22,20,0.45)');
    ring.addColorStop(1, 'rgba(45,22,20,0)');
    ctx.fillStyle = ring;
    ctx.fillRect(ex - rx * 0.5, ey - rx * 0.5, rx, rx);
  }

  // Drooping, dripping eye sockets (slightly different sizes, which reads as wrong)
  ctx.fillStyle = '#000';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = rx * 0.1;
  for (const side of [-1, 1]) {
    const w = rx * 0.22 * (side < 0 ? 1.08 : 1);
    const h = ry * 0.15 * (side < 0 ? 1.08 : 1);
    ctx.save();
    ctx.translate(side * rx * 0.4, -ry * 0.17);
    ctx.rotate(side * 0.32);
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.bezierCurveTo(-w, -h * 1.15, w, -h * 1.15, w, 0);
    ctx.bezierCurveTo(w, h * 0.9, w * 0.25, h * 1.5, 0, h * 2.1);
    ctx.bezierCurveTo(-w * 0.25, h * 1.5, -w, h * 0.9, -w, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.shadowBlur = 0;

  // Dark streaks running down from the eyes
  ctx.strokeStyle = 'rgba(10,0,0,0.7)';
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      ctx.lineWidth = rx * (0.02 + hash(k + side * 7) * 0.02);
      const sx = side * rx * (0.3 + k * 0.08);
      ctx.beginPath();
      ctx.moveTo(sx, -ry * 0.02);
      ctx.quadraticCurveTo(sx + side * rx * 0.02, ry * 0.14, sx - side * rx * 0.01, ry * (0.24 + hash(k + 3) * 0.16));
      ctx.stroke();
    }
  }

  // Tiny red pinpoints, looking straight at you
  ctx.fillStyle = '#ff2a1a';
  ctx.shadowColor = '#ff2a1a';
  ctx.shadowBlur = rx * 0.06;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * rx * 0.35, -ry * 0.16, rx * 0.017, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Nose slits
  ctx.fillStyle = '#1a1210';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * rx * 0.06, ry * 0.08, rx * 0.025, ry * 0.045, side * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Unhinged mouth with teeth. It keeps opening wider during the scare.
  const open = 0.55 + 0.45 * eased + Math.min(0.15, elapsed / 8000);
  const mx = 0;
  const my = ry * 0.5;
  const mrx = rx * 0.4;
  const mry = ry * 0.4 * open;

  // Cracks splitting from the corners of the mouth
  ctx.strokeStyle = 'rgba(30,6,6,0.85)';
  ctx.lineWidth = rx * 0.018;
  ctx.lineJoin = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * mrx * 0.95, my - mry * 0.1);
    ctx.lineTo(side * rx * 0.55, my - mry * 0.3);
    ctx.lineTo(side * rx * 0.62, my - mry * 0.55);
    ctx.lineTo(side * rx * 0.74, ry * 0.12);
    ctx.stroke();
  }

  ctx.fillStyle = '#0a0000';
  ctx.beginPath();
  ctx.ellipse(mx, my, mrx, mry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d2c7a6';
  const teeth = 12;
  for (const row of [-1, 1]) {
    for (let k = 0; k < teeth; k++) {
      const a0 = (row < 0 ? Math.PI : 0) + 0.2 + (k / teeth) * (Math.PI - 0.4);
      const a1 = (row < 0 ? Math.PI : 0) + 0.2 + ((k + 1) / teeth) * (Math.PI - 0.4);
      const am = (a0 + a1) / 2 + (hash(k + 20) - 0.5) * 0.08;
      const len = mry * (0.26 + hash(k + (row > 0 ? 50 : 0)) * 0.3);
      const tipX = mx + Math.cos(am) * mrx * 0.9;
      const tipY = my + Math.sin(am) * mry - Math.sign(Math.sin(am)) * len;
      ctx.beginPath();
      ctx.moveTo(mx + Math.cos(a0) * mrx, my + Math.sin(a0) * mry);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(mx + Math.cos(a1) * mrx, my + Math.sin(a1) * mry);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();

  // Glitch: shift random horizontal strips of what was just drawn.
  const canvas = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const strips = 2 + Math.floor(6 * shake);
  for (let i = 0; i < strips; i++) {
    const y = Math.random() * canvas.height;
    const h = 4 + Math.random() * canvas.height * 0.06;
    const dx = (Math.random() - 0.5) * canvas.width * 0.08 * shake;
    ctx.drawImage(canvas, 0, y, canvas.width, h, dx, y, canvas.width, h);
  }
  ctx.restore();

  ctx.fillStyle = `rgba(120,0,0,${0.22 * shake})`;
  ctx.fillRect(0, 0, W, H);

  // One flash at the very start (not a strobe).
  if (elapsed < 90) {
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - elapsed / 90)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- Image based art (the team's chosen figure and scare face) ----------


/**
 * Draws the stalker: the Slender Man image for `opts.pose` if it loaded,
 * otherwise the procedural figure above. Same arguments as drawFigure.
 */
export function drawStalker(ctx, x, footY, h, opts = {}) {
  const img = ASSETS.slender(opts.pose ?? 0);
  if (!img) {
    drawFigure(ctx, x, footY, h, opts);
    return;
  }
  const { time = 0, alpha = 1 } = opts;
  if (h < 2 || alpha <= 0) return;
  const w = (h * img.naturalWidth) / img.naturalHeight;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  // A slow, barely there sway so it never looks like a flat cutout.
  const sway = Math.sin(time * 0.7) * h * 0.004;
  ctx.translate(x + sway, footY);
  ctx.transform(1, 0, Math.sin(time * 0.45) * 0.012, 1, 0, 0);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
}

// Shake, glitch strips, red tint and a single opening flash (never a strobe).
function scareFx(ctx, W, H, elapsed, shake) {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const strips = 2 + Math.floor(6 * shake);
  for (let i = 0; i < strips; i++) {
    const y = Math.random() * canvas.height;
    const sh = 4 + Math.random() * canvas.height * 0.06;
    const dx = (Math.random() - 0.5) * canvas.width * 0.08 * shake;
    ctx.drawImage(canvas, 0, y, canvas.width, sh, dx, y, canvas.width, sh);
  }
  ctx.restore();
  ctx.fillStyle = `rgba(110,0,0,${0.2 * shake})`;
  ctx.fillRect(0, 0, W, H);
  if (elapsed < 80) {
    ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - elapsed / 80)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/**
 * Full-screen jump scare using the scare face image (cover fit, so it fills
 * every pixel of the screen). Falls back to the drawn face if the image is missing.
 */
export function drawScareImage(ctx, W, H, elapsed) {
  const img = ASSETS.scareFace;
  if (!img) {
    drawScareFace(ctx, W, H, elapsed);
    return;
  }
  const lunge = Math.min(1, elapsed / 110);
  const eased = 1 - Math.pow(1 - lunge, 3);
  // Starts already covering the whole screen, then lunges closer.
  const zoom = 1.06 + 0.1 * eased + elapsed / 9000 + Math.sin(elapsed / 40) * 0.006;
  const shake = Math.max(0.2, 1 - elapsed / 1500);
  const s = Math.min(W, H);
  const jx = (Math.random() - 0.5) * s * 0.06 * shake;
  const jy = (Math.random() - 0.5) * s * 0.06 * shake;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * cover;
  const dh = img.naturalHeight * cover;
  ctx.save();
  ctx.translate(W / 2 + jx, H / 2 + jy);
  ctx.rotate((Math.random() - 0.5) * 0.05 * shake);
  ctx.filter = 'contrast(1.15) brightness(1.08)';
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.filter = 'none';
  ctx.restore();

  scareFx(ctx, W, H, elapsed, shake);
}
