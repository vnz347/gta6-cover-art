// Colour grades: the Vice City sunset and neon looks, painted as gradient
// washes with canvas blend modes so they are deterministic on every machine.
// Each grade is a list of washes: a gradient's colour stops, the blend mode
// to paint it with, and its strength. Grain and vignette finish the poster.

/** Every grade the editor offers, with its label and swatch colours for the picker. */
export const GRADES = {
  sunset: { label: 'Sunset', swatch: ['#ffd319', '#ff2975'] },
  neon: { label: 'Neon Nights', swatch: ['#ff2975', '#00e5ff'] },
  golden: { label: 'Golden Hour', swatch: ['#ff9e00', '#ffe259'] },
  noir: { label: 'Teal Noir', swatch: ['#0f2027', '#2c5364'] },
  vicepop: { label: 'Vice Pop', swatch: ['#ff00aa', '#00ffcc'] },
  rosedusk: { label: 'Rose Dusk', swatch: ['#f857a6', '#7b2ff7'] },
};

/**
 * The washes of a grade: each is {stops, blend, alpha} where stops is a list
 * of [offset, colour] along a top-to-bottom gradient over the panel.
 */
function gradeWashes(gradeId) {
  switch (gradeId) {
    case 'sunset':
      return [
        { stops: [[0, 'rgba(255,190,60,0.10)'], [0.55, 'rgba(255,110,60,0.16)'], [1, 'rgba(255,40,120,0.38)']], blend: 'overlay', alpha: 1 },
        { stops: [[0, 'rgba(255,220,120,0.10)'], [1, 'rgba(120,20,80,0.22)']], blend: 'soft-light', alpha: 1 },
      ];
    case 'neon':
      return [
        { stops: [[0, 'rgba(255,40,140,0.34)'], [0.5, 'rgba(120,40,220,0.12)'], [1, 'rgba(0,220,255,0.34)']], blend: 'overlay', alpha: 1 },
        { stops: [[0, 'rgba(255,0,170,0.12)'], [1, 'rgba(0,255,220,0.16)']], blend: 'screen', alpha: 0.55 },
      ];
    case 'golden':
      return [
        { stops: [[0, 'rgba(255,200,90,0.22)'], [1, 'rgba(255,140,40,0.30)']], blend: 'soft-light', alpha: 1 },
        { stops: [[0, 'rgba(255,230,160,0.14)'], [1, 'rgba(160,80,10,0.20)']], blend: 'overlay', alpha: 1 },
      ];
    case 'noir':
      return [
        { stops: [[0, 'rgba(128,128,128,0.85)'], [1, 'rgba(128,128,128,0.85)']], blend: 'saturation', alpha: 0.8 },
        { stops: [[0, 'rgba(20,60,90,0.28)'], [1, 'rgba(5,15,25,0.42)']], blend: 'overlay', alpha: 1 },
      ];
    case 'vicepop':
      return [
        { stops: [[0, 'rgba(255,0,170,0.30)'], [0.5, 'rgba(255,0,170,0.05)'], [1, 'rgba(0,255,200,0.30)']], blend: 'overlay', alpha: 1 },
        { stops: [[0, 'rgba(255,255,255,0.10)'], [1, 'rgba(255,0,150,0.18)']], blend: 'soft-light', alpha: 1 },
      ];
    case 'rosedusk':
      return [
        { stops: [[0, 'rgba(248,90,170,0.26)'], [1, 'rgba(120,45,245,0.34)']], blend: 'overlay', alpha: 1 },
        { stops: [[0, 'rgba(255,180,200,0.10)'], [1, 'rgba(40,10,70,0.30)']], blend: 'multiply', alpha: 0.6 },
      ];
    default:
      return [];
  }
}

/**
 * Paints a grade's washes over a rectangle of the context. The caller clips
 * to the panel first; this only fills the rectangle with blended gradients.
 */
export function applyGrade(ctx, gradeId, x, y, w, h) {
  for (const wash of gradeWashes(gradeId)) {
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    for (const [offset, colour] of wash.stops) gradient.addColorStop(offset, colour);
    ctx.save();
    ctx.globalCompositeOperation = wash.blend;
    ctx.globalAlpha = wash.alpha;
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}

/** A tiny deterministic random generator, so the grain looks the same on every export. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sprinkles film grain over the whole cover: a few thousand single-pixel
 * specks, half light and half dark, from a fixed seed.
 */
export function applyGrain(ctx, w, h) {
  const random = mulberry32(20261119);
  const specks = Math.floor((w * h) / 900);
  ctx.save();
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < specks; i++) {
    const light = random() > 0.5;
    ctx.fillStyle = light ? '#ffffff' : '#000000';
    ctx.fillRect(Math.floor(random() * w), Math.floor(random() * h), 1, 1);
  }
  ctx.restore();
}

/** Darkens the cover's corners with a soft radial vignette. */
export function applyVignette(ctx, w, h) {
  const radius = Math.hypot(w, h) / 2;
  const gradient = ctx.createRadialGradient(w / 2, h / 2, radius * 0.45, w / 2, h / 2, radius);
  gradient.addColorStop(0, 'rgba(10,5,15,0)');
  gradient.addColorStop(1, 'rgba(10,5,15,0.42)');
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
