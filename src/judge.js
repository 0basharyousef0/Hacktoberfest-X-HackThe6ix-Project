// Asks the scream judge (api/server.js, running on DigitalOcean) to rate the reaction photos.
// Returns { rating, captions, taunt } or null if the judge is not available, for example when
// the game runs locally without the api server. The game works the same either way.

import { PREVIEW } from './config.js';

export async function judgeReactions({ name, seconds, blinks, photos }) {
  if (PREVIEW || !photos.length) return null;
  try {
    const res = await fetch('api/judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        seconds,
        blinks,
        photos: photos.map(({ scare, dataUrl }) => ({ scare, dataUrl })),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.rating !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}
