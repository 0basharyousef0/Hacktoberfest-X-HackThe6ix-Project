// Image assets. Preloaded and decoded up front so the jump scares appear instantly.
// The preview build swaps these paths for embedded data via window.DONT_BLINK_ASSETS.

const PATHS = {
  slender: ['assets/slender-1.png', 'assets/slender-2.png', 'assets/slender-3.png'],
  scareFace: 'assets/scare-face.jpg',
  freddy: 'assets/freddy.png',
  peekFace: 'assets/peek-face.png',
  // Sponsor round: drop the logo files into assets/sponsors with these names.
  sponsors: [
    { name: 'Shopify', src: 'assets/sponsors/shopify.png' },
    { name: 'Google DeepMind Gemma 4', src: 'assets/sponsors/gemma.png', fit: 'cover' },
    { name: 'DigitalOcean', src: 'assets/sponsors/digitalocean.png' },
    { name: 'MLH', src: 'assets/sponsors/mlh.png', fit: 'cover' },
  ],
  // The wrong answers in the sponsor round.
  drake: [1, 2, 3, 4, 5].map((n) => `assets/drake/drake-${n}.jpg`),
};

const urls = { ...PATHS, ...(window.DONT_BLINK_ASSETS || {}) };

function load(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  const ready = img
    .decode()
    .then(() => true)
    .catch(() => {
      console.warn('[assets] could not load', src);
      return false;
    });
  return { img, ready, ok: false };
}

const entries = {
  slender: urls.slender.map(load),
  scareFace: load(urls.scareFace),
  freddy: load(urls.freddy),
  peekFace: load(urls.peekFace),
};
[...entries.slender, entries.scareFace, entries.freddy, entries.peekFace].forEach((e) => e.ready.then((ok) => (e.ok = ok)));

export const ASSETS = {
  // Returns the image for a pose, or null if it is not loaded (callers fall back to drawn art).
  slender(pose) {
    const e = entries.slender[pose % entries.slender.length];
    return e.ok ? e.img : null;
  },
  get poseCount() {
    return entries.slender.length;
  },
  get scareFace() {
    return entries.scareFace.ok ? entries.scareFace.img : null;
  },
  get peekFace() {
    return entries.peekFace.ok ? entries.peekFace.img : null;
  },
  get freddy() {
    return entries.freddy.ok ? entries.freddy.img : null;
  },
  // Plain paths for <img> tiles; a missing file shows a text label instead.
  sponsorTiles: urls.sponsors,
  drakeTiles: urls.drake,
  ready: Promise.all([...entries.slender, entries.scareFace, entries.freddy, entries.peekFace].map((e) => e.ready)),
};
