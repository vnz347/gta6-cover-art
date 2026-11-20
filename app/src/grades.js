// Colour grades: the Vice City sunset and neon looks, painted as gradient
// washes with canvas blend modes, so the same cover paints identically on
// every machine. Each grade is a list of washes: colour stops along a
// top-to-bottom gradient, the blend mode to paint it with, and its strength.
// Grain and vignette finish the poster.

/** Every grade the editor offers: label, picker swatch, and its washes. */
export const GRADES = {
  sunset: {
    label: 'Sunset',
    swatch: ['#ffd319', '#ff2975'],
    washes: [
      { stops: [[0, 'rgba(255,196,64,0.12)'], [0.5, 'rgba(255,116,64,0.18)'], [1, 'rgba(255,42,122,0.36)']], mode: 'overlay', alpha: 1 },
      { stops: [[0, 'rgba(255,224,130,0.12)'], [1, 'rgba(110,18,78,0.24)']], mode: 'soft-light', alpha: 1 },
    ],
  },
  neon: {
    label: 'Neon Nights',
    swatch: ['#ff2975', '#00e5ff'],
    washes: [
      { stops: [[0, 'rgba(255,44,142,0.32)'], [0.5, 'rgba(124,44,224,0.14)'], [1, 'rgba(0,222,255,0.32)']], mode: 'overlay', alpha: 1 },
      { stops: [[0, 'rgba(255,0,172,0.14)'], [1, 'rgba(0,255,222,0.18)']], mode: 'screen', alpha: 0.5 },
    ],
  },
  golden: {
    label: 'Golden Hour',
    swatch: ['#ff9e00', '#ffe259'],
    washes: [
      { stops: [[0, 'rgba(255,204,96,0.24)'], [1, 'rgba(255,142,42,0.28)']], mode: 'soft-light', alpha: 1 },
      { stops: [[0, 'rgba(255,232,164,0.16)'], [1, 'rgba(158,82,12,0.22)']], mode: 'overlay', alpha: 1 },
    ],
  },
  noir: {
    label: 'Teal Noir',
    swatch: ['#0f2027', '#2c5364'],
    washes: [
      { stops: [[0, 'rgba(130,130,130,0.85)'], [1, 'rgba(130,130,130,0.85)']], mode: 'saturation', alpha: 0.8 },
      { stops: [[0, 'rgba(22,62,92,0.30)'], [1, 'rgba(6,16,26,0.44)']], mode: 'overlay', alpha: 1 },
    ],
  },
  vicepop: {
    label: 'Vice Pop',
    swatch: ['#ff00aa', '#00ffcc'],
    washes: [
      { stops: [[0, 'rgba(255,0,172,0.28)'], [0.5, 'rgba(255,0,172,0.06)'], [1, 'rgba(0,255,202,0.28)']], mode: 'overlay', alpha: 1 },
      { stops: [[0, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,0,152,0.20)']], mode: 'soft-light', alpha: 1 },
    ],
  },
  rosedusk: {
    label: 'Rose Dusk',
    swatch: ['#f857a6', '#7b2ff7'],
    washes: [
      { stops: [[0, 'rgba(250,92,172,0.28)'], [1, 'rgba(122,46,246,0.32)']], mode: 'overlay', alpha: 1 },
      { stops: [[0, 'rgba(255,182,202,0.12)'], [1, 'rgba(42,12,72,0.32)']], mode: 'multiply', alpha: 0.6 },
    ],
  },
};

/**
 * Paints a grade's washes over a rectangle. The caller clips to the panel
 * first; this only fills the rectangle with blended gradients.
 */
export function paintGrade(ctx, gradeId, x, y, w, h) {
  const grade = GRADES[gradeId];
  if (!grade) return;
  for (const wash of grade.washes) {
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    for (const [offset, colour] of wash.stops) gradient.addColorStop(offset, colour);
    ctx.save();
    ctx.globalCompositeOperation = wash.mode;
    ctx.globalAlpha = wash.alpha;
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}

/** A small seeded generator, so the grain is identical on every export. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Sprinkles film grain over the whole cover: thousands of single-pixel
 * specks, half light and half dark, from a fixed seed.
 */
export function paintGrain(ctx, w, h) {
  const random = seededRandom(20261120);
  const specks = Math.floor((w * h) / 850);
  ctx.save();
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < specks; i++) {
    ctx.fillStyle = random() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(Math.floor(random() * w), Math.floor(random() * h), 1, 1);
  }
  ctx.restore();
}

/** Darkens the cover's corners with a soft radial vignette. */
export function paintVignette(ctx, w, h) {
  const radius = Math.hypot(w, h) / 2;
  const gradient = ctx.createRadialGradient(w / 2, h / 2, radius * 0.42, w / 2, h / 2, radius);
  gradient.addColorStop(0, 'rgba(12,6,18,0)');
  gradient.addColorStop(1, 'rgba(12,6,18,0.44)');
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
