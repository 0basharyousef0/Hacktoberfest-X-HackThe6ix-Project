// Webcam access. Frames never leave the browser.

export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support webcam access. Try Chrome or Edge.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
  }
  return stream;
}

// Draws a video (or a canvas the same size as the video) mirrored, like a selfie cam,
// into a destination rectangle. `crop` is a rectangle in normalized 0..1 coordinates
// of the mirrored image.
export function drawMirrored(ctx, video, dx, dy, dw, dh, crop = { x: 0, y: 0, w: 1, h: 1 }) {
  const vw = video.videoWidth || video.width;
  const vh = video.videoHeight || video.height;
  if (!vw || !vh) return;
  // In the mirrored image, normalized x maps to (1 - x) in the source.
  const sx = (1 - crop.x - crop.w) * vw;
  const sy = crop.y * vh;
  const sw = crop.w * vw;
  const sh = crop.h * vh;
  ctx.save();
  ctx.translate(dx + dw, dy);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
  ctx.restore();
}
