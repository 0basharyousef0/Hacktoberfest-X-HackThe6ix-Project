// The scream judge. A tiny server (no dependencies) that sends the player's reaction photos
// to an AI model on DigitalOcean serverless inference and returns a terror rating, a caption
// for each photo, and a taunt.
//
// It keeps the model access key on the server, so it never reaches the browser.
// Photos are only passed through to the model. Nothing is saved here.
//
// Environment variables:
//   MODEL_ACCESS_KEY  required, a DigitalOcean model access key (set it as an encrypted secret)
//   JUDGE_MODELS      optional, comma separated model ids to try in order
//   PORT              set by App Platform

import http from 'node:http';

const PORT = Number(process.env.PORT) || 8080;
const KEY = process.env.MODEL_ACCESS_KEY || '';
const MODELS = (process.env.JUDGE_MODELS || 'gemma-4-31B-it,nemotron-nano-12b-v2-vl')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const ENDPOINT = process.env.INFERENCE_URL || 'https://inference.do-ai.run/v1/chat/completions';

const MAX_BODY = 3 * 1024 * 1024;
const MAX_PHOTOS = 2;
const MAX_PHOTO_CHARS = 900 * 1024;

// A light per-visitor limit so nobody can drain the credits by spamming the endpoint.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 8;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const clean = (s, max) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

function prompt({ name, seconds, blinks, photos }) {
  const which = photos.map((p, i) => `Photo ${i + 1}: caught during "${p.scare}".`).join(' ');
  return [
    'You are the creature in a Halloween webcam horror game called "Don\'t Blink".',
    `The player "${name}" lasted ${seconds.toFixed(1)} seconds and blinked ${blinks} times before you got them.`,
    `You are looking at ${photos.length} photo(s) of their reaction to the jump scares. ${which}`,
    'Rate how scared they look from 1 (unbothered) to 10 (pure terror), based only on their facial expression and body language.',
    'Write one short, spooky, playful caption for each photo, at most 9 words, in your voice as the creature.',
    'Write one short taunt for the player, at most 16 words, that mentions their name or their time.',
    'Keep it fun and PG. Talk only about the reaction. Never comment on looks, body, age, gender, race, clothing, background, or anything personal.',
    'If a photo is dark, blurry, or shows no one, joke that they hid from you.',
    'Reply with JSON only, no other text, in this exact shape:',
    `{"rating": 7, "captions": [${photos.map(() => '"..."').join(', ')}], "taunt": "..."}`,
  ].join('\n');
}

function parseJudgement(text, photoCount) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  let data;
  try {
    data = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const rating = clamp(Math.round(Number(data.rating) || 0), 1, 10);
  const captions = Array.isArray(data.captions) ? data.captions.map((c) => clean(c, 80)) : [];
  while (captions.length < photoCount) captions.push('');
  const taunt = clean(data.taunt, 140);
  if (!data.rating && !taunt) return null;
  return { rating, captions: captions.slice(0, photoCount), taunt };
}

async function askModel(model, input) {
  const content = [
    { type: 'text', text: prompt(input) },
    ...input.photos.map((p) => ({ type: 'image_url', image_url: { url: p.dataUrl } })),
  ];
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      max_tokens: 300,
      temperature: 0.9,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`${model} returned ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const judgement = parseJudgement(data?.choices?.[0]?.message?.content, input.photos.length);
  if (!judgement) throw new Error(`${model} did not return usable JSON`);
  return { ...judgement, model };
}

async function judge(input) {
  let lastError;
  for (const model of MODELS) {
    try {
      return await askModel(model, input);
    } catch (err) {
      lastError = err;
      console.warn('[judge]', err.message);
    }
  }
  throw lastError || new Error('no models configured');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function validate(body) {
  const photos = (Array.isArray(body.photos) ? body.photos : [])
    .slice(0, MAX_PHOTOS)
    .filter(
      (p) =>
        typeof p?.dataUrl === 'string' &&
        p.dataUrl.startsWith('data:image/jpeg;base64,') &&
        p.dataUrl.length < MAX_PHOTO_CHARS,
    )
    .map((p) => ({ scare: clean(p.scare, 40) || 'a jump scare', dataUrl: p.dataUrl }));
  if (!photos.length) return null;
  return {
    name: clean(body.name, 16) || 'Someone',
    seconds: clamp(Number(body.seconds) || 0, 0, 3600),
    blinks: clamp(Math.round(Number(body.blinks) || 0), 0, 9999),
    photos,
  };
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // App Platform may or may not strip the /api route prefix, so accept both.
  const path = new URL(req.url, 'http://x').pathname.replace(/^\/api(?=\/|$)/, '') || '/';

  if (req.method === 'GET' && (path === '/' || path === '/health')) {
    return send(res, 200, { ok: true, judge: Boolean(KEY), models: MODELS });
  }

  if (req.method === 'POST' && path === '/judge') {
    if (!KEY) return send(res, 503, { error: 'The judge is asleep: MODEL_ACCESS_KEY is not set.' });
    const ip = String(req.headers['do-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress)
      .split(',')[0]
      .trim();
    if (rateLimited(ip)) return send(res, 429, { error: 'Too many screams. Try again in a minute.' });
    try {
      const input = validate(JSON.parse(await readBody(req)));
      if (!input) return send(res, 400, { error: 'Send one or two JPEG photos.' });
      return send(res, 200, await judge(input));
    } catch (err) {
      if (err.status === 413) return send(res, 413, { error: 'Photos are too large.' });
      if (err instanceof SyntaxError) return send(res, 400, { error: 'Body must be JSON.' });
      console.error('[judge] failed', err.message);
      return send(res, 502, { error: 'The judge could not decide.' });
    }
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => console.log(`[judge] listening on ${PORT}, models: ${MODELS.join(', ')}`));
