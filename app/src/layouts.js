// Poster layouts: how a cover divides its face into photo panels.
//
// Every layout is described in unit coordinates (0..1 across the cover), so
// one description fits every export size. A panel is
//   { x, y, w, h, tilt, shape }
// where x/y/w/h is the panel's bounding box, tilt is a rotation in degrees
// (tilted snapshots), and shape is null for a rectangle or a list of unit
// points for a panel cut on a diagonal. Panels come back in draw order.
//
// The gap between panels is a fixed fraction of the cover's shorter side,
// so gutters stay proportional from a square post to a tall story.

/** Every layout the editor offers: its label and how many panels it has. */
export const LAYOUTS = {
  slant5: { label: 'Slanted Five', count: 5 },
  'hero-trio': { label: 'Hero + Trio', count: 4 },
  grid4: { label: 'Four Panel', count: 4 },
  fullbleed: { label: 'Full Bleed', count: 1 },
  triptych: { label: 'Triptych', count: 3 },
  mosaic9: { label: 'Nine Mosaic', count: 9 },
  tilted: { label: 'Tilted Snaps', count: 3 },
  diagonal: { label: 'Diagonal Split', count: 2 },
};

/** The gutter between panels, as a fraction of the cover's shorter side. */
const GAP = 0.012;

/** A plain rectangle panel in unit coordinates. */
function box(x, y, w, h, tilt = 0) {
  return { x, y, w, h, tilt, shape: null };
}

/** A polygon panel in unit coordinates, from a list of [x, y] points. */
function shape(points) {
  const xs = points.map(([px]) => px);
  const ys = points.map(([, py]) => py);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    w: Math.max(...xs) - minX,
    h: Math.max(...ys) - minY,
    tilt: 0,
    shape: points,
  };
}

/**
 * A regular grid of `cols` by `rows` panels with even gutters. The gap is
 * given in unit fractions; each cell shrinks by its share of the gutters.
 */
function grid(cols, rows, gap) {
  const cells = [];
  const cellW = (1 - (cols - 1) * gap) / cols;
  const cellH = (1 - (rows - 1) * gap) / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push(box(col * (cellW + gap), row * (cellH + gap), cellW, cellH));
    }
  }
  return cells;
}

/** A row of `n` equal columns, full height, with even gutters. */
function columns(n, gap) {
  return grid(n, 1, gap);
}

/** The panels of a layout in unit coordinates. */
function unitPanels(layoutId, gap) {
  switch (layoutId) {
    case 'slant5': {
      // The poster look: one wide hero across the top, four columns below,
      // every edge sheared by the same slant so the panels lean together.
      const slant = 0.04;
      const heroH = 0.55;
      const stripY = heroH + gap;
      const colW = (1 - 3 * gap) / 4;
      const panels = [
        shape([[slant, 0], [1, 0], [1 - slant, heroH], [0, heroH]]),
      ];
      for (let i = 0; i < 4; i++) {
        const x0 = i * (colW + gap);
        const x1 = x0 + colW;
        panels.push(shape([
          [x0 + slant, stripY],
          [x1, stripY],
          [x1 - slant, 1],
          [x0, 1],
        ]));
      }
      return panels;
    }
    case 'hero-trio': {
      const heroH = 0.62;
      const stripY = heroH + gap;
      const stripH = 1 - stripY;
      const colW = (1 - 2 * gap) / 3;
      return [
        box(0, 0, 1, heroH),
        box(0, stripY, colW, stripH),
        box(colW + gap, stripY, colW, stripH),
        box(2 * (colW + gap), stripY, colW, stripH),
      ];
    }
    case 'grid4':
      return grid(2, 2, gap);
    case 'fullbleed':
      return [box(0, 0, 1, 1)];
    case 'triptych':
      return columns(3, gap);
    case 'mosaic9':
      return grid(3, 3, gap);
    case 'tilted':
      // Three overlapping snapshots, each tipped a few degrees, over a dark
      // backdrop. The boxes overlap on purpose; draw order is the stack.
      return [
        box(0.04, 0.13, 0.57, 0.57, -4),
        box(0.41, 0.05, 0.55, 0.53, 3),
        box(0.21, 0.57, 0.59, 0.38, -2),
      ];
    case 'diagonal':
      return [
        shape([[0, 0], [1, 0], [0, 1]]),
        shape([[1, 0], [1, 1], [0, 1]]),
      ];
    default:
      return [box(0, 0, 1, 1)];
  }
}

/**
 * The panels of a layout in pixels for a cover of `width` by `height`.
 * Each panel is { x, y, w, h, tilt, shape } with the polygon in pixels when
 * the layout cuts diagonally. A polygon panel's box is its bounding box, so
 * its photo cover-fits the panel and clips to the slanted shape.
 */
export function panelsFor(layoutId, width, height) {
  const gapPx = GAP * Math.min(width, height);
  const gap = Math.min(gapPx / width, gapPx / height);
  return unitPanels(layoutId, gap).map((panel) => {
    if (!panel.shape) {
      return {
        x: panel.x * width,
        y: panel.y * height,
        w: panel.w * width,
        h: panel.h * height,
        tilt: panel.tilt,
        shape: null,
      };
    }
    const pts = panel.shape.map(([fx, fy]) => [fx * width, fy * height]);
    const xs = pts.map(([px]) => px);
    const ys = pts.map(([, py]) => py);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      w: Math.max(...xs) - minX,
      h: Math.max(...ys) - minY,
      tilt: 0,
      shape: pts,
    };
  });
}

/** The frame drawn around each panel: 'gold' for the slanted poster, none elsewhere. */
export function frameStyle(layoutId) {
  return layoutId === 'slant5' ? 'gold' : null;
}

/** Whether the layout paints its panels over a dark backdrop (tilted snaps) instead of light gutters. */
export function darkBackdrop(layoutId) {
  return layoutId === 'tilted';
}

/** Which edge the caption block stacks from for a layout: 'top' or 'bottom'. */
export function captionEdge(layoutId) {
  return layoutId === 'tilted' ? 'top' : 'bottom';
}
