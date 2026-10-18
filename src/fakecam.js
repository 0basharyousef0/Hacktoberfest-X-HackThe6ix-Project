// A stand-in webcam: a dim room with a person sitting in it.
// Used for the in-chat preview (no camera access there) and as a demo mode
// when a laptop camera refuses to start. The person blinks when you blink.

export class FakeCamera {
  constructor(width = 640, height = 480) {
    this.w = width;
    this.h = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');

    // White where the person is, transparent elsewhere (stands in for segmentation).
    this.personCanvas = document.createElement('canvas');
    this.personCanvas.width = width;
    this.personCanvas.height = height;
    this.pctx = this.personCanvas.getContext('2d');

    this.blinkUntil = 0;
    this.frameTime = 0;
    this.running = false;
    this._noise = this._makeNoise();
    this._tick = this._tick.bind(this);

    // Make the canvas quack like a <video> so the rest of the code needs no special cases.
    const self = this;
    Object.defineProperties(this.canvas, {
      videoWidth: { get: () => self.w },
      videoHeight: { get: () => self.h },
      readyState: { get: () => 4 },
      currentTime: { get: () => self.frameTime },
    });
  }

  start() {
    if (!this.running) {
      this.running = true;
      this._draw(performance.now());
      requestAnimationFrame(this._tick);
    }
    return this.canvas;
  }

  blink() {
    this.blinkUntil = performance.now() + 160;
  }

  _tick(now) {
    if (!this.running) return;
    this._draw(now);
    requestAnimationFrame(this._tick);
  }

  _makeNoise() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  _draw(now) {
    this.frameTime = now / 1000;
    const { ctx, w, h } = this;
    const t = now / 1000;

    // The room
    const wall = ctx.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, '#3b3631');
    wall.addColorStop(1, '#1b1916');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);

    // A doorway with a dim hallway light behind it
    const hall = ctx.createLinearGradient(0, h * 0.12, 0, h);
    hall.addColorStop(0, '#5a5650');
    hall.addColorStop(1, '#2c2a26');
    ctx.fillStyle = hall;
    ctx.fillRect(w * 0.06, h * 0.12, w * 0.17, h * 0.88);
    ctx.fillStyle = '#2a2622';
    ctx.fillRect(w * 0.06, h * 0.12, w * 0.045, h * 0.88);

    // A picture frame on the wall
    ctx.fillStyle = '#2a2723';
    ctx.fillRect(w * 0.74, h * 0.17, w * 0.16, h * 0.23);
    ctx.fillStyle = '#4b453e';
    ctx.fillRect(w * 0.757, h * 0.19, w * 0.126, h * 0.19);

    // Lamp light from the top right
    const glow = ctx.createRadialGradient(w * 0.86, h * 0.04, 0, w * 0.86, h * 0.04, w * 0.65);
    glow.addColorStop(0, 'rgba(255,228,190,0.2)');
    glow.addColorStop(1, 'rgba(255,228,190,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    this._person(ctx, t, now, false);

    const p = this.pctx;
    p.clearRect(0, 0, w, h);
    this._person(p, t, now, true);

    // Sensor noise
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(this._noise, 'repeat');
    ctx.translate(Math.random() * 128, Math.random() * 128);
    ctx.fillRect(-128, -128, w + 256, h + 256);
    ctx.restore();
  }

  _person(ctx, t, now, mask) {
    const { w, h } = this;
    const sway = Math.sin(t * 0.5) * w * 0.006;
    const breath = Math.sin(t * 1.3) * h * 0.004;
    const cx = w * 0.52 + sway;
    const solid = '#fff';

    // Shoulders and torso
    ctx.fillStyle = mask ? solid : '#1f2228';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.34, h);
    ctx.bezierCurveTo(cx - w * 0.33, h * 0.78 + breath, cx - w * 0.22, h * 0.7 + breath, cx - w * 0.07, h * 0.68 + breath);
    ctx.lineTo(cx + w * 0.07, h * 0.68 + breath);
    ctx.bezierCurveTo(cx + w * 0.22, h * 0.7 + breath, cx + w * 0.33, h * 0.78 + breath, cx + w * 0.34, h);
    ctx.closePath();
    ctx.fill();

    // Neck
    ctx.fillStyle = mask ? solid : '#6a5c51';
    ctx.fillRect(cx - w * 0.045, h * 0.55, w * 0.09, h * 0.16);

    // Head
    const hx = cx + Math.sin(t * 0.37) * w * 0.004;
    const hy = h * 0.42;
    const rx = w * 0.1;
    const ry = h * 0.165;

    if (mask) {
      ctx.beginPath();
      ctx.ellipse(hx, hy, rx * 1.08, ry * 1.04, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const skin = ctx.createRadialGradient(hx - rx * 0.3, hy - ry * 0.3, 0, hx, hy, ry * 1.2);
    skin.addColorStop(0, '#9c8877');
    skin.addColorStop(0.6, '#7a6858');
    skin.addColorStop(1, '#463b33');
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(hx, hy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = '#16120f';
    ctx.beginPath();
    ctx.ellipse(hx, hy - ry * 0.42, rx * 1.08, ry * 0.64, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hx + side * rx * 0.92, hy - ry * 0.32, rx * 0.18, ry * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Brows
    ctx.strokeStyle = '#2a211b';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, h * 0.008);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + side * rx * 0.22, hy - ry * 0.2);
      ctx.lineTo(hx + side * rx * 0.58, hy - ry * 0.18);
      ctx.stroke();
    }

    // Eyes, shut while blinking
    const closed = now < this.blinkUntil;
    for (const side of [-1, 1]) {
      const ex = hx + side * rx * 0.4;
      const ey = hy - ry * 0.04;
      if (closed) {
        ctx.strokeStyle = '#2a211b';
        ctx.lineWidth = Math.max(2, h * 0.006);
        ctx.beginPath();
        ctx.moveTo(ex - rx * 0.14, ey);
        ctx.quadraticCurveTo(ex, ey + ry * 0.04, ex + rx * 0.14, ey);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#e4ddd2';
        ctx.beginPath();
        ctx.ellipse(ex, ey, rx * 0.14, ry * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c1611';
        ctx.beginPath();
        ctx.arc(ex, ey, ry * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Nose shadow and mouth
    ctx.strokeStyle = 'rgba(40,30,24,0.6)';
    ctx.lineWidth = Math.max(2, h * 0.006);
    ctx.beginPath();
    ctx.moveTo(hx + rx * 0.04, hy + ry * 0.05);
    ctx.lineTo(hx + rx * 0.08, hy + ry * 0.24);
    ctx.lineTo(hx - rx * 0.04, hy + ry * 0.26);
    ctx.stroke();
    ctx.strokeStyle = '#3b2a24';
    ctx.beginPath();
    ctx.moveTo(hx - rx * 0.28, hy + ry * 0.46);
    ctx.quadraticCurveTo(hx, hy + ry * 0.5, hx + rx * 0.28, hy + ry * 0.45);
    ctx.stroke();
  }
}
