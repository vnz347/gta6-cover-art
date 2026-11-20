// The cover renderer: one function that draws the whole poster onto any
// canvas, used for both the live preview and the exported PNG. It draws the
// panels (photos clipped to each layout's shapes, graded), the caption block
// (bold display lettering with a neon script subtitle), the heat meter, and
// the grain and vignette finish.

import { layoutPanels, layoutHasDarkBackdrop, layoutCaptionSide, layoutPanelFrame } from './layouts.js';
import { applyGrade, applyGrain, applyVignette } from './grades.js';

/** The export sizes the app offers, in pixels. */
export const SIZES = {
  '1080x1080': { w: 1080, h: 1080, label: 'Square · 1080 × 1080' },
  '1080x1350': { w: 1080, h: 1350, label: 'Portrait · 1080 × 1350' },
  '1920x1080': { w: 1920, h: 1080, label: 'Wide · 1920 × 1080' },
  '1080x1920': { w: 1080, h: 1920, label: 'Story · 1080 × 1920' },
};

/** The pixel size of a photo source: an Image or a downscaled canvas. */
export function sourceSize(source) {
  return {
    w: source.naturalWidth || source.width,
    h: source.naturalHeight || source.height,
  };
}

/**
 * The crop of a panel's photo: zoom (1 = cover fit) and pan in fractions of
 * the panel. Clamps the pan so the photo always covers the whole panel.
 */
export function clampCrop(crop, img, panel) {
  const zoom = Math.min(4, Math.max(1, crop.zoom || 1));
  const { w: iw, h: ih } = sourceSize(img);
  const base = Math.max(panel.w / iw, panel.h / ih);
  const scale = base * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const maxDx = Math.max(0, (dw - panel.w) / 2 / panel.w);
  const maxDy = Math.max(0, (dh - panel.h) / 2 / panel.h);
  return {
    zoom,
    dx: Math.min(maxDx, Math.max(-maxDx, crop.dx || 0)),
    dy: Math.min(maxDy, Math.max(-maxDy, crop.dy || 0)),
  };
}

/** Draws one photo cover-filling a panel rect, with the panel's crop applied. */
function drawPhoto(ctx, img, panel, crop) {
  const c = clampCrop(crop, img, panel);
  const { w: iw, h: ih } = sourceSize(img);
  const base = Math.max(panel.w / iw, panel.h / ih);
  const scale = base * c.zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const cx = panel.x + panel.w / 2 + c.dx * panel.w;
  const cy = panel.y + panel.h / 2 + c.dy * panel.h;
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
}

/** Clips the context to a panel's shape: a rectangle, or a polygon for diagonal cuts. */
function clipPanel(ctx, panel) {
  ctx.beginPath();
  if (panel.poly) {
    ctx.moveTo(panel.poly[0][0], panel.poly[0][1]);
    for (let i = 1; i < panel.poly.length; i++) ctx.lineTo(panel.poly[i][0], panel.poly[i][1]);
    ctx.closePath();
  } else {
    ctx.rect(panel.x, panel.y, panel.w, panel.h);
  }
  ctx.clip();
}

/** The placeholder a panel shows when no photo is assigned to it yet. */
function drawEmptyPanel(ctx, panel, index) {
  const gradient = ctx.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.h);
  gradient.addColorStop(0, '#2b1d3a');
  gradient.addColorStop(1, '#171020');
  ctx.fillStyle = gradient;
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  const size = Math.min(panel.w, panel.h) * 0.12;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `600 ${Math.max(14, size)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Panel ${index + 1}`, panel.x + panel.w / 2, panel.y + panel.h / 2);
  ctx.restore();
}

/**
 * Draws one panel: the photo (or placeholder) clipped to the panel's shape,
 * the grade wash over it, and for tilted panels a white frame and shadow.
 * `role` is the panel's role tag (drawn as a strip along the panel's foot)
 * and `frame` the frame style ('gold' for the slanted poster).
 */
function drawPanel(ctx, panel, photo, crop, grade, index, role, frame) {
  ctx.save();
  if (panel.rot) {
    ctx.translate(panel.x + panel.w / 2, panel.y + panel.h / 2);
    ctx.rotate((panel.rot * Math.PI) / 180);
    ctx.translate(-panel.w / 2, -panel.h / 2);
    const white = Math.min(panel.w, panel.h) * 0.035;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = panel.w * 0.04;
    ctx.shadowOffsetY = panel.w * 0.02;
    ctx.fillStyle = '#fdfaf3';
    ctx.fillRect(-white, -white, panel.w + white * 2, panel.h + white * 2);
    ctx.shadowColor = 'transparent';
  }
  clipPanel(ctx, panel);
  if (photo) drawPhoto(ctx, photo, panel, crop);
  else drawEmptyPanel(ctx, panel, index);
  applyGrade(ctx, grade, panel.x, panel.y, panel.w, panel.h);
  if (role) drawRoleTag(ctx, panel, role);
  ctx.restore();
  if (frame === 'gold') {
    // A thin gold rule around the panel's shape, drawn outside the clip.
    ctx.save();
    ctx.strokeStyle = '#ffd319';
    ctx.lineWidth = Math.max(1.5, Math.min(panel.w, panel.h) * 0.012);
    ctx.beginPath();
    if (panel.poly) {
      ctx.moveTo(panel.poly[0][0], panel.poly[0][1]);
      for (let i = 1; i < panel.poly.length; i++) ctx.lineTo(panel.poly[i][0], panel.poly[i][1]);
      ctx.closePath();
    } else {
      ctx.rect(panel.x, panel.y, panel.w, panel.h);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** A panel's role tag: a dark strip along the panel's foot with a gold edge. */
function drawRoleTag(ctx, panel, role) {
  const size = Math.min(panel.w, panel.h) * 0.075;
  const fontSize = Math.max(9, Math.min(size, panel.w * 0.11));
  ctx.save();
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  const text = role.trim().toUpperCase();
  const textWidth = ctx.measureText(text).width;
  const padX = fontSize * 0.7;
  const padY = fontSize * 0.45;
  const stripW = Math.min(panel.w * 0.92, textWidth + padX * 2 + fontSize * 0.5);
  const stripH = fontSize + padY * 2;
  const x = panel.x + Math.max(0, (panel.w - stripW) / 2);
  const y = panel.y + panel.h - stripH - panel.h * 0.06;
  ctx.fillStyle = 'rgba(12,6,18,0.88)';
  ctx.fillRect(x, y, stripW, stripH);
  ctx.fillStyle = '#ffd319';
  ctx.fillRect(x, y, fontSize * 0.28, stripH);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + stripW / 2 + fontSize * 0.14, y + stripH / 2 + fontSize * 0.04);
  ctx.restore();
}

/** The diagonal layout's white seam between its two triangles. */
function drawDiagonalSeam(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = '#fdfaf3';
  ctx.lineWidth = Math.min(w, h) * 0.012;
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(0, h);
  ctx.stroke();
  ctx.restore();
}

/**
 * Fits text into the cover's width: starts from the requested size and shrinks
 * until the text fits inside 92% of the cover width. `font` is a function of
 * the size returning the font string; `spacing` is the letter spacing in
 * pixels at the requested size, scaled with the font.
 */
function fitTextFont(ctx, text, size, w, font, spacing = 0) {
  let fontSize = size;
  const maxWidth = w * 0.92;
  const set = () => {
    ctx.font = font(fontSize);
    try { ctx.letterSpacing = `${(spacing * fontSize) / size}px`; } catch (e) { /* Older browsers ignore it. */ }
  };
  set();
  while (fontSize > 9 && ctx.measureText(text).width > maxWidth) {
    fontSize *= 0.92;
    set();
  }
  try { ctx.letterSpacing = '0px'; } catch (e) { /* Older browsers ignore it. */ }
  return fontSize;
}

/**
 * The caption block, stacked from the chosen edge: the heat meter, the review
 * quote, the big display caption, the neon script subtitle, and the tagline.
 * `artBottom` is where the artwork ends (above the footer strip when the
 * poster extras are on); the block sits above it.
 */
function drawCaptionBlock(ctx, state, w, h, artBottom) {
  const side = state.captionPos === 'auto' ? layoutCaptionSide(state.layout) : state.captionPos;
  const base = Math.min(w, h);
  const captionSize = base * 0.115 * (state.captionSize || 1);
  const caption = (state.caption || '').trim().toUpperCase();
  const subtitle = (state.subtitle || '').trim();
  const quote = (state.quote || '').trim();
  const tagline = (state.tagline || '').trim().toUpperCase();
  const bottom = artBottom || h;
  // The bottom margin clears the role tags at the panels' feet when they
  // are on; the top margin just clears the corner badges.
  const topMargin = h * 0.03;
  const bottomMargin = state.roleTags ? h * 0.11 : h * 0.03;

  // Measure first so the block can be stacked from the chosen edge.
  const lines = [];
  if (state.stars > 0) {
    const size = Math.min(w, h) * 0.032;
    lines.push({ kind: 'stars', text: '★'.repeat(state.stars), size, height: size * 1.4 });
  }
  if (quote) {
    const size = fitTextFont(ctx, quote, Math.min(w, h) * 0.027, w,
      (s) => `italic ${s}px Georgia, serif`);
    lines.push({ kind: 'quote', text: quote, size, height: size * 1.5 });
  }
  if (caption) {
    const size = fitTextFont(ctx, caption, captionSize, w,
      (s) => `${s}px Anton, 'Arial Black', sans-serif`);
    lines.push({ kind: 'caption', text: caption, size, height: size * 1.04 });
  }
  if (subtitle) {
    const size = fitTextFont(ctx, subtitle, Math.min(w, h) * 0.045, w,
      (s) => `${s}px Pacifico, cursive`);
    lines.push({ kind: 'subtitle', text: subtitle, size, height: size * 1.3 });
  }
  if (tagline) {
    const requested = Math.min(w, h) * 0.026;
    const size = fitTextFont(ctx, tagline, requested, w,
      (s) => `700 ${s}px system-ui, sans-serif`, requested * 0.28);
    lines.push({ kind: 'tagline', text: tagline, size, height: size * 1.7 });
  }
  if (lines.length === 0) return;

  const total = lines.reduce((sum, line) => sum + line.height, 0);
  let y = side === 'top' ? topMargin : bottom - bottomMargin - total;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const line of lines) {
    if (line.kind === 'caption') {
      ctx.font = `${line.size}px Anton, 'Arial Black', sans-serif`;
      const textWidth = ctx.measureText(line.text).width;
      const x0 = w / 2 - textWidth / 2;
      if (state.captionStyle === 'white') {
        ctx.fillStyle = '#ffffff';
      } else if (state.captionStyle === 'outline') {
        ctx.fillStyle = 'rgba(20,8,20,0.35)';
      } else if (state.captionStyle === 'chrome') {
        // Retro chrome: horizontal stripes of bright and dark metal, with a
        // warm sunset kiss at the foot of each letter.
        const chrome = ctx.createLinearGradient(0, y, 0, y + line.size);
        chrome.addColorStop(0, '#ffffff');
        chrome.addColorStop(0.38, '#dfe9f5');
        chrome.addColorStop(0.46, '#7d90a8');
        chrome.addColorStop(0.54, '#f4f8ff');
        chrome.addColorStop(0.62, '#93a7bf');
        chrome.addColorStop(0.8, '#e8eef7');
        chrome.addColorStop(1, '#ff9e5f');
        ctx.fillStyle = chrome;
      } else {
        const gradient = ctx.createLinearGradient(x0, y, x0 + textWidth, y);
        gradient.addColorStop(0, '#ffe259');
        gradient.addColorStop(0.45, '#ff7e5f');
        gradient.addColorStop(0.75, '#ff2975');
        gradient.addColorStop(1, '#b537f2');
        ctx.fillStyle = gradient;
      }
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, line.size / 16);
      ctx.strokeStyle = 'rgba(15,5,20,0.9)';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = line.size * 0.12;
      ctx.shadowOffsetY = line.size * 0.05;
      ctx.strokeText(line.text, w / 2, y);
      ctx.fillText(line.text, w / 2, y);
      ctx.shadowColor = 'transparent';
    } else if (line.kind === 'subtitle') {
      ctx.font = `${line.size}px Pacifico, cursive`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(255,41,117,0.95)';
      ctx.shadowBlur = line.size * 0.45;
      ctx.fillText(line.text, w / 2, y);
      ctx.fillText(line.text, w / 2, y);
      ctx.shadowColor = 'transparent';
    } else if (line.kind === 'quote') {
      ctx.font = `italic ${line.size}px Georgia, serif`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = line.size * 0.3;
      ctx.fillText(line.text, w / 2, y);
      ctx.shadowColor = 'transparent';
    } else if (line.kind === 'tagline') {
      ctx.font = `700 ${line.size}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = line.size * 0.3;
      try { ctx.letterSpacing = `${Math.round(line.size * 0.28)}px`; } catch (e) { /* Older browsers ignore it. */ }
      ctx.fillText(line.text, w / 2, y);
      try { ctx.letterSpacing = '0px'; } catch (e) { /* Older browsers ignore it. */ }
      ctx.shadowColor = 'transparent';
    } else {
      ctx.font = `${line.size}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffd319';
      ctx.lineWidth = Math.max(1, line.size / 12);
      ctx.strokeStyle = 'rgba(15,5,20,0.85)';
      ctx.strokeText(line.text, w / 2, y);
      ctx.fillText(line.text, w / 2, y);
    }
    y += line.height;
  }
  ctx.restore();
}

/**
 * The poster's finishing furniture: the footer strip (billing block centred,
 * barcode at the left, seal at the right) and the corner badges (VOL. 1 and
 * COMING SOON) at the top. The footer sits below the artwork, so the barcode
 * and seal never cover a panel or a role tag.
 */
function drawPosterExtras(ctx, state, w, h, footerY, footerH) {
  const base = Math.min(w, h);
  const margin = w * 0.025;
  const darkFooter = layoutHasDarkBackdrop(state.layout);

  if (footerH > 0 && state.billingOn && state.billing) {
    // The billing line fits between the barcode and the seal.
    const barcodeW = state.barcode ? Math.min(w * 0.11, footerH * 2.6) : 0;
    const sealD = state.seal ? footerH * 0.84 : 0;
    const room = w - margin * 2 - barcodeW - sealD - base * 0.04;
    const text = state.billing.trim().toUpperCase();
    const requested = Math.min(Math.max(9, base * 0.016), footerH * 0.3);
    let size = requested;
    ctx.save();
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    while (size > 8 && ctx.measureText(text).width > room) {
      size *= 0.92;
      ctx.font = `600 ${size}px system-ui, sans-serif`;
    }
    ctx.fillStyle = darkFooter ? 'rgba(255,255,255,0.85)' : 'rgba(20,15,30,0.72)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, footerY + footerH / 2);
    ctx.restore();
  }

  if (footerH > 0 && state.barcode) {
    // A barcode: a white patch, fixed-seed bars, and a number underneath.
    const bw = Math.min(w * 0.11, footerH * 2.6);
    const bh = footerH * 0.72;
    const x = margin;
    const y = footerY + (footerH - bh) / 2;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, bw, bh);
    let seed = 1234567;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
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
    ctx.fillText('0 12345 67890 1', x + bw / 2, y + bh * 0.86);
    ctx.restore();
  }

  if (footerH > 0 && state.seal) {
    // A round stamp: double gold ring, a star, and two lines of text.
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

  if (state.badges) {
    // Top corners: the issue badge on the right, COMING SOON on the left.
    const size = Math.max(10, base * 0.02);
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
}

/**
 * Renders the whole cover onto `canvas` at the canvas's own size. `state` is
 * the editor state (layout, grade, caption, panels) and `photos` is the list
 * of loaded images the panels point at by index.
 */
export function renderCover(canvas, state, photos) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // Backdrop: dark for tilted snaps, warm white gutters for the rest.
  ctx.fillStyle = layoutHasDarkBackdrop(state.layout) ? '#17121f' : '#fdfaf3';
  ctx.fillRect(0, 0, w, h);

  // With the poster extras on, the artwork ends 7% above the foot and the
  // barcode, billing block, and seal live in the footer strip below it.
  const footerOn = state.barcode || state.seal || (state.billingOn && state.billing);
  const artH = footerOn ? h * 0.93 : h;
  const panels = layoutPanels(state.layout, w, artH);
  const frame = layoutPanelFrame(state.layout);
  panels.forEach((panel, index) => {
    const slot = state.panels[index] || {};
    const photo = typeof slot.photo === 'number' ? photos[slot.photo] || null : null;
    const role = state.roleTags && state.roles ? state.roles[index] || null : null;
    drawPanel(ctx, panel, photo, slot, state.grade, index, role, frame);
  });
  if (state.layout === 'diagonal') drawDiagonalSeam(ctx, w, artH);

  drawCaptionBlock(ctx, state, w, h, artH);
  drawPosterExtras(ctx, state, w, h, artH, h - artH);
  if (state.grain) applyGrain(ctx, w, h);
  if (state.vignette) applyVignette(ctx, w, h);
  ctx.restore();
}
