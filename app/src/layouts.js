// Poster layouts for the cover: each one names its panels as fractions of the
// cover, so a single layout fits every export size. A panel is a rectangle
// {x, y, w, h} in fractions of the cover's width and height, or a polygon
// {poly: [[x, y], ...]} for diagonal cuts, with an optional rotation in
// degrees for the tilted snapshot look. Panels are listed in draw order.

/** Every layout the editor offers, with its label and panel count. */
export const LAYOUTS = {
  'slant5': { label: 'Slanted Five', panels: 5 },
  'hero-trio': { label: 'Hero + Trio', panels: 4 },
  'grid4': { label: 'Four Panel', panels: 4 },
  'fullbleed': { label: 'Full Bleed', panels: 1 },
  'triptych': { label: 'Triptych', panels: 3 },
  'mosaic9': { label: 'Nine Mosaic', panels: 9 },
  'tilted': { label: 'Tilted Snaps', panels: 3 },
  'diagonal': { label: 'Diagonal Split', panels: 2 },
};

/** The gutter between panels, as a fraction of the cover's shorter side. */
const GUTTER = 0.014;

/** A rectangle panel from fractions, inset by half the gutter on each side. */
function rect(x, y, w, h, rot = 0) {
  return { x, y, w, h, rot, poly: null };
}

/** Panels for a layout, as fractions of the cover. `gap` is the gutter in fractions. */
function panelFractions(layoutId, gap) {
  const g = gap;
  switch (layoutId) {
    case 'slant5': {
      // Five parallelograms with a shared slant: one wide hero on top, four
      // below. Each panel is a polygon so the photo clips to the slant.
      const slant = 0.035;
      const heroH = 0.56;
      const panels = [
        { x: 0, y: 0, w: 1, h: heroH, rot: 0, poly: [[slant, 0], [1, 0], [1 - slant, heroH], [0, heroH]] },
      ];
      for (let i = 0; i < 4; i++) {
        const colW = (1 - 3 * g) / 4;
        const x0 = i * (colW + g);
        const x1 = x0 + colW;
        const y0 = heroH + g;
        panels.push({
          x: x0, y: y0, w: x1 - x0, h: 1 - y0, rot: 0,
          poly: [[x0 + slant, y0], [x1, y0], [x1 - slant, 1], [x0, 1]],
        });
      }
      return panels;
    }
    case 'hero-trio':
      return [
        rect(0, 0, 1, 0.62),
        rect(0, 0.62 + g, 1 / 3 - (2 * g) / 3, 0.38 - g),
        rect(1 / 3 + g / 3, 0.62 + g, 1 / 3 - (2 * g) / 3, 0.38 - g),
        rect(2 / 3 + (2 * g) / 3, 0.62 + g, 1 / 3 - (2 * g) / 3, 0.38 - g),
      ];
    case 'grid4':
      return [
        rect(0, 0, 0.5 - g / 2, 0.5 - g / 2),
        rect(0.5 + g / 2, 0, 0.5 - g / 2, 0.5 - g / 2),
        rect(0, 0.5 + g / 2, 0.5 - g / 2, 0.5 - g / 2),
        rect(0.5 + g / 2, 0.5 + g / 2, 0.5 - g / 2, 0.5 - g / 2),
      ];
    case 'fullbleed':
      return [rect(0, 0, 1, 1)];
    case 'triptych':
      return [
        rect(0, 0, 1 / 3 - (2 * g) / 3, 1),
        rect(1 / 3 + g / 3, 0, 1 / 3 - (2 * g) / 3, 1),
        rect(2 / 3 + (2 * g) / 3, 0, 1 / 3 - (2 * g) / 3, 1),
      ];
    case 'mosaic9': {
      const out = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          out.push(rect(
            col / 3 + (col === 0 ? 0 : g / 3) + (col === 2 ? g / 3 : 0) - (col === 1 ? 0 : 0),
            row / 3 + (row === 0 ? 0 : g / 3) + (row === 2 ? g / 3 : 0),
            1 / 3 - (2 * g) / 3,
            1 / 3 - (2 * g) / 3,
          ));
        }
      }
      // Fix the middle column/row offsets so gutters are even.
      out[1].x = 1 / 3 + g / 3;
      out[2].x = 2 / 3 + (2 * g) / 3;
      out[4].x = 1 / 3 + g / 3;
      out[5].x = 2 / 3 + (2 * g) / 3;
      out[7].x = 1 / 3 + g / 3;
      out[8].x = 2 / 3 + (2 * g) / 3;
      out[3].y = 1 / 3 + g / 3;
      out[4].y = 1 / 3 + g / 3;
      out[5].y = 1 / 3 + g / 3;
      out[6].y = 2 / 3 + (2 * g) / 3;
      out[7].y = 2 / 3 + (2 * g) / 3;
      out[8].y = 2 / 3 + (2 * g) / 3;
      return out;
    }
    case 'tilted':
      return [
        rect(0.05, 0.12, 0.56, 0.58, -5),
        rect(0.42, 0.06, 0.53, 0.52, 4),
        rect(0.22, 0.56, 0.58, 0.38, -2),
      ];
    case 'diagonal':
      return [
        { x: 0, y: 0, w: 1, h: 1, rot: 0, poly: [[0, 0], [1, 0], [0, 1]] },
        { x: 0, y: 0, w: 1, h: 1, rot: 0, poly: [[1, 0], [1, 1], [0, 1]] },
      ];
    default:
      return [rect(0, 0, 1, 1)];
  }
}

/**
 * The panels of a layout in pixels for a cover of `w` by `h`. Each panel is
 * {x, y, w, h, rot, poly} with a polygon in pixels when the layout cuts
 * diagonally. The gutter scales with the cover's shorter side.
 */
export function layoutPanels(layoutId, w, h) {
  const gap = GUTTER * Math.min(w, h);
  const gx = gap / w;
  const gy = gap / h;
  return panelFractions(layoutId, Math.min(gx, gy)).map((p) => {
    if (p.poly) {
      // A polygon panel's box is its bounding box, so its photo cover-fits
      // the panel itself and clips to the slanted shape.
      const px = p.poly.map(([fx, fy]) => [fx * w, fy * h]);
      const xs = px.map(([x]) => x);
      const ys = px.map(([, y]) => y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return {
        x: minX, y: minY,
        w: Math.max(...xs) - minX, h: Math.max(...ys) - minY,
        rot: 0, poly: px,
      };
    }
    return { x: p.x * w, y: p.y * h, w: p.w * w, h: p.h * h, rot: p.rot, poly: null };
  });
}

/** The frame a layout draws around each panel: 'gold' for the slanted poster, none otherwise. */
export function layoutPanelFrame(layoutId) {
  return layoutId === 'slant5' ? 'gold' : null;
}

/** Whether the layout draws its panels over a dark backdrop (tilted snaps) rather than white gutters. */
export function layoutHasDarkBackdrop(layoutId) {
  return layoutId === 'tilted';
}

/** The point on the cover where the caption band sits for a layout: 'top' or 'bottom'. */
export function layoutCaptionSide(layoutId) {
  return layoutId === 'tilted' ? 'top' : 'bottom';
}
