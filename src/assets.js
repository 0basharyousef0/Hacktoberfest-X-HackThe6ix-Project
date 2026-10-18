// Image assets. Preloaded and decoded up front so the jump scares appear instantly.
// The preview build swaps these paths for embedded data via window.DONT_BLINK_ASSETS.

const PATHS = {
  slender: ['assets/slender-1.png', 'assets/slender-2.png', 'assets/slender-3.png'],
  scareFace: 'assets/scare-face.jpg',
  freddy: 'assets/freddy.png',
  peekFace: 'assets/peek-face.png',
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
  ready: Promise.all([...entries.slender, entries.scareFace, entries.freddy, entries.peekFace].map((e) => e.ready)),
};
