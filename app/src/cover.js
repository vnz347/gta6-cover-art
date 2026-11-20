// The cover renderer: one entry point that paints the whole poster onto
// any canvas, used for the live preview and for the exported PNG alike. It
// paints the photo panels (clipped to the layout's shapes, graded), the
// caption stack (display lettering, neon script subtitle, tagline), the
// poster furniture (footer strip, seal, barcode, badges), and the grain and
// vignette finish.

import { panelsFor, darkBackdrop, captionEdge, frameStyle } from './layouts.js';
import { paintGrade, paintGrain, paintVignette } from './grades.js';

/** The export sizes the app offers, in pixels. */
export const SIZES = {
  '1080x1080': { w: 1080, h: 1080, label: 'Square · 1080 × 1080' },
  '1080x1350': { w: 1080, h: 1350, label: 'Portrait · 1080 × 1350' },
  '1920x1080': { w: 1920, h: 1080, label: 'Wide · 1920 × 1080' },
  '1080x1920': { w: 1080, h: 1920, label: 'Story · 1080 × 1920' },
};

/** The pixel size of a photo source: an Image or a downscaled canvas. */
export function imageSize(source) {
  return {
    w: source.naturalWidth || source.width,
    h: source.naturalHeight || source.height,
  };
}

/**
 * The crop of a panel's photo: zoom (1 = cover fit) and pan in fractions of
 * the panel. The pan is clamped so the photo always covers the whole panel.
 */
export function fitCrop(crop, img, panel) {
  const zoom = Math.min(4, Math.max(1, crop.zoom || 1));
  const { w: iw, h: ih } = imageSize(img);
  const cover = Math.max(panel.w / iw, panel.h / ih);
  const scale = cover * zoom;
  const drawnW = iw * scale;
  const drawnH = ih * scale;
  const slackX = Math.max(0, (drawnW - panel.w) / 2 / panel.w);
  const slackY = Math.max(0, (drawnH - panel.h) / 2 / panel.h);
  return {
    zoom,
    dx: Math.min(slackX, Math.max(-slackX, crop.dx || 0)),
    dy: Math.min(slackY, Math.max(-slackY, crop.dy || 0)),
  };
}

/** Paints one photo cover-filling a panel rect, with the panel's crop applied. */
function paintPhoto(ctx, img, panel, crop) {
  const fitted = fitCrop(crop, img, panel);
  const { w: iw, h: ih } = imageSize(img);
  const cover = Math.max(panel.w / iw, panel.h / ih);
  const scale = cover * fitted.zoom;
  const drawnW = iw * scale;
  const drawnH = ih * scale;
  const centreX = panel.x + panel.w / 2 + fitted.dx * panel.w;
  const centreY = panel.y + panel.h / 2 + fitted.dy * panel.h;
  ctx.drawImage(img, centreX - drawnW / 2, centreY - drawnH / 2, drawnW, drawnH);
}

/** Clips the context to a panel's outline: rectangle, or polygon for diagonal cuts. */
function clipToPanel(ctx, panel) {
  ctx.beginPath();
  if (panel.shape) {
    ctx.moveTo(panel.shape[0][0], panel.shape[0][1]);
    for (let i = 1; i < panel.shape.length; i++) {
      ctx.lineTo(panel.shape[i][0], panel.shape[i][1]);
    }
    ctx.closePath();
  } else {
    ctx.rect(panel.x, panel.y, panel.w, panel.h);
  }
  ctx.clip();
}

/** Strokes a panel's outline (used for the gold frames). */
function strokePanel(ctx, panel) {
  ctx.beginPath();
  if (panel.shape) {
    ctx.moveTo(panel.shape[0][0], panel.shape[0][1]);
    for (let i = 1; i < panel.shape.length; i++) {
      ctx.lineTo(panel.shape[i][0], panel.shape[i][1]);
    }
    ctx.closePath();
  } else {
    ctx.rect(panel.x, panel.y, panel.w, panel.h);
  }
  ctx.stroke();
}

/** What an empty panel shows: a deep plum gradient and its number. */
function paintPlaceholder(ctx, panel, index) {
  const gradient = ctx.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.h);
  gradient.addColorStop(0, '#2d1e3c');
  gradient.addColorStop(1, '#181022');
  ctx.fillStyle = gradient;
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  const size = Math.max(14, Math.min(panel.w, panel.h) * 0.11);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Panel ${index + 1}`, panel.x + panel.w / 2, panel.y + panel.h / 2);
  ctx.restore();
}

/** A panel's role tag: a dark strip near the panel's foot with a gold edge. */
function paintRoleStrip(ctx, panel, role) {
  const size = Math.max(9, Math.min(Math.min(panel.w, panel.h) * 0.072, panel.w * 0.1));
  ctx.save();
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  const text = role.trim().toUpperCase();
  const textW = ctx.measureText(text).width;
  const padX = size * 0.7;
  const padY = size * 0.42;
  const stripW = Math.min(panel.w * 0.92, textW + padX * 2 + size * 0.5);
  const stripH = size + padY * 2;
  const x = panel.x + Math.max(0, (panel.w - stripW) / 2);
  const y = panel.y + panel.h - stripH - panel.h * 0.055;
  ctx.fillStyle = 'rgba(14,7,20,0.88)';
  ctx.fillRect(x, y, stripW, stripH);
  ctx.fillStyle = '#ffd319';
  ctx.fillRect(x, y, size * 0.26, stripH);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + stripW / 2 + size * 0.13, y + stripH / 2 + size * 0.04);
  ctx.restore();
}

/**
 * Paints one panel: the photo (or placeholder) clipped to the panel's shape,
 * the grade wash over it, the role strip, and for tilted panels a white
 * snapshot frame with a drop shadow. `frame` is the frame style ('gold' for
 * the slanted poster).
 */
function paintOnePanel(ctx, panel, photo, crop, grade, index, role, frame) {
  ctx.save();
  if (panel.tilt) {
    ctx.translate(panel.x + panel.w / 2, panel.y + panel.h / 2);
    ctx.rotate((panel.tilt * Math.PI) / 180);
    ctx.translate(-panel.w / 2, -panel.h / 2);
    const border = Math.min(panel.w, panel.h) * 0.032;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = panel.w * 0.045;
    ctx.shadowOffsetY = panel.w * 0.02;
    ctx.fillStyle = '#fdfaf3';
    ctx.fillRect(-border, -border, panel.w + border * 2, panel.h + border * 2);
    ctx.shadowColor = 'transparent';
  }
  clipToPanel(ctx, panel);
  if (photo) paintPhoto(ctx, photo, panel, crop);
  else paintPlaceholder(ctx, panel, index);
  paintGrade(ctx, grade, panel.x, panel.y, panel.w, panel.h);
  if (role) paintRoleStrip(ctx, panel, role);
  ctx.restore();
  if (frame === 'gold') {
    ctx.save();
    ctx.strokeStyle = '#ffd319';
    ctx.lineWidth = Math.max(1.5, Math.min(panel.w, panel.h) * 0.011);
    strokePanel(ctx, panel);
    ctx.restore();
  }
}

/** The diagonal layout's white seam where its two triangles meet. */
function paintSeam(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = '#fdfaf3';
  ctx.lineWidth = Math.min(w, h) * 0.011;
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(0, h);
  ctx.stroke();
  ctx.restore();
}

/**
 * Fits a line of text into the cover: starts at `wanted` pixels and shrinks
 * until it fits inside 92% of the cover width. `fontFor` builds the font
 * string from a size; `tracking` is the letter spacing in pixels at the
 * wanted size, scaled down with the font. Returns the fitted size.
 */
function fitFont(ctx, text, wanted, w, fontFor, tracking = 0) {
  let size = wanted;
  const limit = w * 0.92;
  const apply = () => {
    ctx.font = fontFor(size);
    try { ctx.letterSpacing = `${(tracking * size) / wanted}px`; } catch (e) { /* Older browsers ignore it. */ }
  };
  apply();
  while (size > 9 && ctx.measureText(text).width > limit) {
    size *= 0.92;
    apply();
  }
  try { ctx.letterSpacing = '0px'; } catch (e) { /* Older browsers ignore it. */ }
  return size;
}

/** A soft drop shadow for white lettering over photos. */
function textShadow(ctx, blur, colour = 'rgba(0,0,0,0.7)') {
  ctx.shadowColor = colour;
  ctx.shadowBlur = blur;
}

/**
 * The caption stack, measured first so it can hang from the chosen edge: the
 * heat meter, the review quote, the big display caption, the neon script
 * subtitle, and the tagline. Each line carries its own height and a paint
 * function, so the stack is just a list of lines drawn top to bottom.
 * `artBottom` is where the artwork ends (above the footer strip when the
 * poster extras are on); the stack sits above it.
 */
function captionLines(ctx, state, w, h) {
  const small = Math.min(w, h);
  const caption = (state.caption || '').trim().toUpperCase();
  const subtitle = (state.subtitle || '').trim();
  const quote = (state.quote || '').trim();
  const tagline = (state.tagline || '').trim().toUpperCase();
  const lines = [];

  if (state.stars > 0) {
    const size = small * 0.032;
    lines.push({
      height: size * 1.4,
      paint(y) {
        ctx.font = `${size}px system-ui, sans-serif`;
        ctx.fillStyle = '#ffd319';
        ctx.lineWidth = Math.max(1, size / 12);
        ctx.strokeStyle = 'rgba(15,5,20,0.85)';
        const text = '★'.repeat(state.stars);
        ctx.strokeText(text, w / 2, y);
        ctx.fillText(text, w / 2, y);
      },
    });
  }
  if (quote) {
    const size = fitFont(ctx, quote, small * 0.027, w, (s) => `italic ${s}px Georgia, serif`);
    lines.push({
      height: size * 1.5,
      paint(y) {
        ctx.font = `italic ${size}px Georgia, serif`;
        ctx.fillStyle = '#ffffff';
        textShadow(ctx, size * 0.3);
        ctx.fillText(quote, w / 2, y);
        ctx.shadowColor = 'transparent';
      },
    });
  }
  if (caption) {
    const wanted = small * 0.115 * (state.captionSize || 1);
    const size = fitFont(ctx, caption, wanted, w, (s) => `${s}px Anton, 'Arial Black', sans-serif`);
    lines.push({
      height: size * 1.04,
      paint(y) {
        ctx.font = `${size}px Anton, 'Arial Black', sans-serif`;
        const textW = ctx.measureText(caption).width;
        const x0 = w / 2 - textW / 2;
        if (state.captionStyle === 'white') {
          ctx.fillStyle = '#ffffff';
        } else if (state.captionStyle === 'outline') {
          ctx.fillStyle = 'rgba(20,8,20,0.35)';
        } else if (state.captionStyle === 'chrome') {
          // Retro chrome: bright metal bands with a dark seam, warmed at the
          // foot of each letter by the sunset.
          const chrome = ctx.createLinearGradient(0, y, 0, y + size);
          chrome.addColorStop(0, '#ffffff');
          chrome.addColorStop(0.34, '#e2ecf7');
          chrome.addColorStop(0.45, '#7e92a9');
          chrome.addColorStop(0.52, '#f6faff');
          chrome.addColorStop(0.6, '#8fa3ba');
          chrome.addColorStop(0.78, '#e9eff8');
          chrome.addColorStop(1, '#ff9e5f');
          ctx.fillStyle = chrome;
        } else {
          const sunset = ctx.createLinearGradient(x0, y, x0 + textW, y);
          sunset.addColorStop(0, '#ffe259');
          sunset.addColorStop(0.45, '#ff7e5f');
          sunset.addColorStop(0.75, '#ff2975');
          sunset.addColorStop(1, '#b537f2');
          ctx.fillStyle = sunset;
        }
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, size / 16);
        ctx.strokeStyle = 'rgba(15,5,20,0.9)';
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = size * 0.12;
        ctx.shadowOffsetY = size * 0.05;
        ctx.strokeText(caption, w / 2, y);
        ctx.fillText(caption, w / 2, y);
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetY = 0;
      },
    });
  }
  if (subtitle) {
    const size = fitFont(ctx, subtitle, small * 0.045, w, (s) => `${s}px Pacifico, cursive`);
    lines.push({
      height: size * 1.3,
      paint(y) {
        ctx.font = `${size}px Pacifico, cursive`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,41,117,0.95)';
        ctx.shadowBlur = size * 0.45;
        ctx.fillText(subtitle, w / 2, y);
        ctx.fillText(subtitle, w / 2, y);
        ctx.shadowColor = 'transparent';
      },
    });
  }
  if (tagline) {
    const wanted = small * 0.026;
    const size = fitFont(ctx, tagline, wanted, w,
      (s) => `700 ${s}px system-ui, sans-serif`, wanted * 0.28);
    lines.push({
      height: size * 1.7,
      paint(y) {
        ctx.font = `700 ${size}px system-ui, sans-serif`;
        ctx.fillStyle = '#ffffff';
        textShadow(ctx, size * 0.3);
        try { ctx.letterSpacing = `${Math.round(size * 0.28)}px`; } catch (e) { /* Older browsers ignore it. */ }
        ctx.fillText(tagline, w / 2, y);
        try { ctx.letterSpacing = '0px'; } catch (e) { /* Older browsers ignore it. */ }
        ctx.shadowColor = 'transparent';
      },
    });
  }
  return lines;
}

/** Draws the caption stack, hanging from the top or sitting on the artwork's foot. */
function paintCaptionStack(ctx, state, w, h, artBottom) {
  const edge = state.captionPos === 'auto' ? captionEdge(state.layout) : state.captionPos;
  const lines = captionLines(ctx, state, w, h);
  if (!lines.length) return;
  const total = lines.reduce((sum, line) => sum + line.height, 0);
  // The bottom margin clears the role strips at the panels' feet when they
  // are on; the top margin just clears the corner badges.
  const topGap = h * 0.03;
  const bottomGap = state.roleTags ? h * 0.11 : h * 0.03;
  let y = edge === 'top' ? topGap : (artBottom || h) - bottomGap - total;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const line of lines) {
    line.paint(y);
    y += line.height;
  }
  ctx.restore();
}

/**
 * The billing line, centred in the footer between the barcode and the seal.
 * The text centres on the free space between them — not on the cover — so a
 * long line never runs under the barcode or the seal.
 */
function paintBilling(ctx, state, w, footerY, footerH, margin, dark) {
  const text = (state.billing || '').trim().toUpperCase();
  if (!text) return;
  const base = Math.min(w, footerH * 12);
  const barcodeW = state.barcode ? Math.min(w * 0.11, footerH * 2.6) : 0;
  const sealD = state.seal ? footerH * 0.84 : 0;
  const pad = base * 0.02;
  const leftEdge = margin + barcodeW + pad;
  const rightEdge = w - margin - sealD - pad;
  const room = Math.max(0, rightEdge - leftEdge);
  const centreX = (leftEdge + rightEdge) / 2;
  let size = Math.min(Math.max(9, base * 0.016), footerH * 0.3);
  ctx.save();
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  while (size > 8 && ctx.measureText(text).width > room) {
    size *= 0.92;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
  }
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.85)' : 'rgba(20,15,30,0.72)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, centreX, footerY + footerH / 2);
  ctx.restore();
}

/** A barcode: a white patch, fixed-seed bars, and a number underneath. */
function paintBarcode(ctx, w, footerY, footerH, margin) {
  const bw = Math.min(w * 0.11, footerH * 2.6);
  const bh = footerH * 0.72;
  const x = margin;
  const y = footerY + (footerH - bh) / 2;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, bw, bh);
  let seed = 987654321;
  const next = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  ctx.fillStyle = '#111111';
  let bx = x + bw * 0.06;
  while (bx < x + bw * 0.94) {
    const barW = (0.006 + next() * 0.02) * bw;
    if (next() > 0.45) ctx.fillRect(bx, y + bh * 0.1, barW, bh * 0.62);
    bx += barW + bw * 0.012;
  }
  ctx.font = `600 ${Math.max(8, bh * 0.2)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('8 90123 45678 9', x + bw / 2, y + bh * 0.86);
  ctx.restore();
}

/** A round stamp: double gold ring, a star, and two lines of text. */
function paintSeal(ctx, w, footerY, footerH, margin) {
  const r = footerH * 0.42;
  const cx = w - margin - r;
  const cy = footerY + footerH / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.21);
  ctx.fillStyle = 'rgba(12,6,18,0.88)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd319';
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd319';
  ctx.font = `${r * 0.42}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', 0, -r * 0.34);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${r * 0.26}px system-ui, sans-serif`;
  ctx.fillText('ORIGINAL', 0, r * 0.08);
  ctx.fillText('ARTWORK', 0, r * 0.36);
  ctx.restore();
}

/** The top corners: the issue badge on the right, COMING SOON on the left. */
function paintBadges(ctx, w, margin) {
  const size = Math.max(10, Math.min(w, 1080) * 0.02);
  ctx.save();
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const badge = 'VOL. 1';
  const bw = ctx.measureText(badge).width + size * 1.4;
  const bh = size * 2;
  ctx.fillStyle = 'rgba(12,6,18,0.85)';
  ctx.strokeStyle = '#ffd319';
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.beginPath();
  ctx.roundRect(w - margin - bw, margin, bw, bh, bh / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd319';
  ctx.textAlign = 'center';
  ctx.fillText(badge, w - margin - bw / 2, margin + bh / 2 + size * 0.05);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = size * 0.4;
  try { ctx.letterSpacing = `${Math.round(size * 0.3)}px`; } catch (e) { /* Older browsers ignore it. */ }
  ctx.fillText('COMING SOON', margin, margin + bh / 2);
  ctx.restore();
}

/**
 * The poster's finishing furniture: the footer strip (billing line centred,
 * barcode at the left, seal at the right) and the corner badges at the top.
 * The footer sits below the artwork, so the barcode and seal never cover a
 * panel or a role strip.
 */
function paintFurniture(ctx, state, w, h, footerY, footerH) {
  const margin = w * 0.025;
  const dark = darkBackdrop(state.layout);
  if (footerH > 0) {
    if (state.billingOn && state.billing) paintBilling(ctx, state, w, footerY, footerH, margin, dark);
    if (state.barcode) paintBarcode(ctx, w, footerY, footerH, margin);
    if (state.seal) paintSeal(ctx, w, footerY, footerH, margin);
  }
  if (state.badges) paintBadges(ctx, w, margin);
}

/**
 * Renders the whole cover onto `canvas` at the canvas's own size. `state`
 * is the editor state (layout, grade, caption, panels) and `library` is the
 * list of loaded images the panels point at by index.
 */
export function paintCover(canvas, state, library) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // Backdrop: dark for tilted snaps, warm white gutters for the rest.
  ctx.fillStyle = darkBackdrop(state.layout) ? '#17121f' : '#fdfaf3';
  ctx.fillRect(0, 0, w, h);

  // With the poster extras on, the artwork ends a little above the foot and
  // the barcode, billing line, and seal live in the footer strip below it.
  const footerOn = state.barcode || state.seal || (state.billingOn && state.billing);
  const artH = footerOn ? h * 0.932 : h;
  const panels = panelsFor(state.layout, w, artH);
  const frame = frameStyle(state.layout);
  panels.forEach((panel, index) => {
    const slot = state.panels[index] || {};
    const photo = typeof slot.photo === 'number' ? library[slot.photo] || null : null;
    const role = state.roleTags && state.roles ? state.roles[index] || null : null;
    paintOnePanel(ctx, panel, photo, slot, state.grade, index, role, frame);
  });
  if (state.layout === 'diagonal') paintSeam(ctx, w, artH);

  paintCaptionStack(ctx, state, w, h, artH);
  paintFurniture(ctx, state, w, h, artH, h - artH);
  if (state.grain) paintGrain(ctx, w, h);
  if (state.vignette) paintVignette(ctx, w, h);
  ctx.restore();
}
