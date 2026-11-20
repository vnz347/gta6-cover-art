// Wires the editor: photos in, panels assigned, caption typed, cover out.
// A `?shot=` query sets up a fixed scene for a screenshot instead (./shots.js).
import { paintCover, SIZES, fitCrop, imageSize } from './cover.js';
import { LAYOUTS, panelsFor } from './layouts.js';
import { GRADES } from './grades.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusLine = document.getElementById('status');
const strip = document.getElementById('photo-strip');
const zoomInput = document.getElementById('zoom');
const captionField = document.getElementById('caption');
const subtitleField = document.getElementById('subtitle');

/** The sample photos shipped with the app. */
const SAMPLES = [
  { name: 'pier', label: 'Pier at dusk' },
  { name: 'boulevard', label: 'Boulevard' },
  { name: 'skater', label: 'Skater sunset' },
  { name: 'coastal', label: 'Coastal drive' },
];

/** The role tags the panels wear by default, in panel order. */
const DEFAULT_ROLES = [
  'The Driver', 'The Insider', 'The Rider', 'The Boss', 'The Courier',
  'The Star', 'The Lookout', 'The Queen', 'The Rookie',
];

/** A fresh editor state: no photos yet, slanted poster, sunset grade. */
function freshState() {
  return {
    size: '1080x1080',
    layout: 'slant5',
    grade: 'sunset',
    caption: 'Neon Nights',
    subtitle: 'a vice city story',
    captionStyle: 'chrome',
    captionPos: 'auto',
    captionSize: 1,
    stars: 5,
    quote: '“The whole coast in one frame.” — Sunset Weekly',
    tagline: 'One summer · Every light on · No looking back',
    billing: 'Heatwave Pictures presents · Your photos in the starring roles · Shot on location · Finished in the golden hour',
    roleTags: true,
    roles: [...DEFAULT_ROLES],
    seal: true,
    barcode: true,
    billingOn: true,
    badges: true,
    grain: true,
    vignette: true,
    panels: [],
    selectedPanel: 0,
  };
}

let state = freshState();
/** The loaded photos, by index; panels point at them. */
let library = [];
/** Undo/redo history: snapshots of the state (photos live outside it). */
let past = [];
let future = [];
let fontsLoaded = false;
/** Detected face centres by photo index, as fractions of the photo. */
const faceSpots = new Map();

/* ---------------- history ---------------- */

function freeze() {
  return JSON.stringify(state);
}

function thaw(text) {
  state = JSON.parse(text);
  refreshControls();
  repaint();
}

/** Records the state before a change, clearing the redo stack. */
function checkpoint() {
  past.push(freeze());
  if (past.length > 50) past.shift();
  future = [];
  refreshUndoButtons();
}

function undo() {
  if (!past.length) return;
  future.push(freeze());
  thaw(past.pop());
  refreshUndoButtons();
}

function redo() {
  if (!future.length) return;
  past.push(freeze());
  thaw(future.pop());
  refreshUndoButtons();
}

function refreshUndoButtons() {
  document.getElementById('undo').disabled = !past.length;
  document.getElementById('redo').disabled = !future.length;
}

/* ---------------- images ---------------- */

/**
 * Loads an image from a URL, resolving once it can be drawn. A photo larger
 * than 2400 px on its long side is downscaled to a canvas first, so a phone
 * photo of 50 megapixels never slows the editor or the export down.
 */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const longSide = Math.max(img.naturalWidth, img.naturalHeight);
      if (longSide <= 2400) {
        resolve(img);
        return;
      }
      const scale = 2400 / longSide;
      const small = document.createElement('canvas');
      small.width = Math.round(img.naturalWidth * scale);
      small.height = Math.round(img.naturalHeight * scale);
      small.getContext('2d').drawImage(img, 0, 0, small.width, small.height);
      resolve(small);
    };
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

/** A small JPEG data URL of a photo source, for its thumbnail. */
function thumbnail(source) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const scale = Math.min(1, 128 / Math.max(w, h));
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(1, Math.round(w * scale));
  thumb.height = Math.max(1, Math.round(h * scale));
  thumb.getContext('2d').drawImage(source, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL('image/jpeg', 0.7);
}

/** Loads the display fonts so the canvas lettering uses them, then repaints. */
async function loadFonts() {
  if (fontsLoaded) return;
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('40px Pacifico'),
      document.fonts.ready,
    ]);
  } catch (e) {
    /* The canvas falls back to system fonts if a webfont fails. */
  }
  fontsLoaded = true;
}

/* ---------------- panels ---------------- */

/** How many panels the current layout has. */
function panelCount() {
  return LAYOUTS[state.layout].count;
}

/** Grows or shrinks the panel slots to match the current layout. */
function fitSlotsToLayout() {
  const count = panelCount();
  while (state.panels.length < count) {
    state.panels.push({ photo: null, zoom: 1, dx: 0, dy: 0 });
  }
  state.panels.length = count;
  state.selectedPanel = Math.min(state.selectedPanel, count - 1);
}

/** The photo index assigned to a panel, or null when the panel is empty. */
function slotPhoto(index) {
  const slot = state.panels[index];
  return slot && typeof slot.photo === 'number' ? slot.photo : null;
}

/** Where a panel's crop should centre: a detected face, or just above centre where faces usually sit. */
function focusPoint(photoIndex) {
  return faceSpots.get(photoIndex) || { x: 0.5, y: 0.42 };
}

/**
 * Centres a panel's crop on its photo's face (or the heuristic target) at
 * the panel's current zoom, so a portrait never lands with its head cut off.
 */
function centreOnFace(panelIndex) {
  const slot = state.panels[panelIndex];
  if (!slot || slot.photo === null || slot.photo === undefined) return;
  const img = library[slot.photo];
  if (!img) return;
  const panel = panelsFor(state.layout, canvas.width, canvas.height)[panelIndex];
  const { w: iw, h: ih } = imageSize(img);
  const zoom = slot.zoom || 1;
  const cover = Math.max(panel.w / iw, panel.h / ih);
  const scale = cover * zoom;
  const visibleW = panel.w / (iw * scale);
  const visibleH = panel.h / (ih * scale);
  const target = focusPoint(slot.photo);
  slot.dx = (0.5 - target.x) / visibleW;
  slot.dy = (0.5 - target.y) / visibleH;
  Object.assign(slot, fitCrop(slot, img, panel));
}

/**
 * Finds the face in a photo with the browser's FaceDetector when it has one
 * (Chrome on some platforms), then re-centres every untouched panel showing
 * that photo on it. Without the API the heuristic crop stands.
 */
async function findFace(photoIndex) {
  const source = library[photoIndex];
  if (!source || !('FaceDetector' in window)) return;
  try {
    const detector = new FaceDetector({ fastMode: true });
    const faces = await detector.detect(source);
    if (!faces.length) return;
    const box = faces[0].boundingBox;
    const { w, h } = imageSize(source);
    faceSpots.set(photoIndex, {
      x: (box.x + box.width / 2) / w,
      y: (box.y + box.height / 2) / h,
    });
    state.panels.forEach((slot, i) => {
      if (slot.photo === photoIndex && !slot.touched) centreOnFace(i);
    });
    repaint();
  } catch (e) {
    /* Face detection is a best effort; the heuristic crop stands. */
  }
}

/** Assigns a photo to a panel and centres its crop on the face. */
function assignPhoto(panelIndex, photoIndex) {
  const slot = state.panels[panelIndex];
  if (!slot) return;
  slot.photo = photoIndex;
  slot.touched = false;
  centreOnFace(panelIndex);
}

/** Adds loaded images to the library and shows their thumbnails. */
function addPhotos(images, names) {
  images.forEach((img, i) => {
    library.push(img);
    const index = library.length - 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb';
    button.title = names[i] || `Photo ${library.length}`;
    button.setAttribute('aria-label', `Use ${names[i] || 'photo'} in the selected panel`);
    const thumb = document.createElement('img');
    thumb.src = thumbnail(img);
    thumb.alt = '';
    button.appendChild(thumb);
    button.addEventListener('click', () => {
      checkpoint();
      assignPhoto(state.selectedPanel, index);
      repaint();
      highlightThumb();
    });
    strip.appendChild(button);
    findFace(index);
  });
  highlightThumb();
}

function highlightThumb() {
  const selected = slotPhoto(state.selectedPanel);
  [...strip.children].forEach((button, i) => {
    button.classList.toggle('active', i === selected);
  });
}

/** Loads the four shipped samples and spreads them across the panels. */
async function loadSamples() {
  const loaded = [];
  for (const sample of SAMPLES) {
    try {
      loaded.push(await loadImage(`samples/${sample.name}.jpg`));
    } catch (e) {
      /* A missing sample is skipped; the editor still works. */
    }
  }
  if (!loaded.length) {
    statusLine.textContent = 'Could not load the sample photos.';
    return;
  }
  checkpoint();
  const firstIndex = library.length;
  addPhotos(loaded, SAMPLES.map((s) => s.label));
  fitSlotsToLayout();
  state.panels.forEach((slot, i) => {
    slot.photo = firstIndex + (i % loaded.length);
  });
  statusLine.textContent = 'Sample photos loaded — click a panel, then a photo, to swap it.';
  repaint();
}

/** Puts the same photo in every panel. */
function fillWithOnePhoto() {
  const selected = slotPhoto(state.selectedPanel);
  if (selected === null) {
    statusLine.textContent = 'Pick a photo for the selected panel first.';
    return;
  }
  checkpoint();
  state.panels.forEach((slot) => { slot.photo = selected; });
  repaint();
}

/** Resets the selected panel's crop to the smart face-centred fit. */
function resetCrop() {
  checkpoint();
  const slot = state.panels[state.selectedPanel];
  slot.zoom = 1;
  slot.dx = 0;
  slot.dy = 0;
  slot.touched = false;
  centreOnFace(state.selectedPanel);
  repaint();
}

/* ---------------- rendering ---------------- */

/**
 * The preview canvas's backing size: the export aspect at a smaller scale —
 * except in a cover shot, where the canvas keeps the true export size so the
 * screenshot shows the real export.
 */
function previewSize() {
  const { w, h } = SIZES[state.size];
  if (document.body.classList.contains('shot-cover')) return { w, h };
  const scale = Math.min(1, 960 / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** Repaints the preview canvas from the current state. */
function repaint() {
  const { w, h } = previewSize();
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  paintCover(canvas, state, library);
  refreshPanelControls();
}

function refreshPanelControls() {
  const slot = state.panels[state.selectedPanel];
  document.getElementById('panel-label').textContent =
    `Panel ${state.selectedPanel + 1} of ${panelCount()}`;
  if (slot) zoomInput.value = String(Math.round((slot.zoom || 1) * 100));
  highlightThumb();
}

/* ---------------- picking panels on the canvas ---------------- */

/** Which panel (if any) a point on the preview canvas falls inside. */
function panelAtPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;
  const panels = panelsFor(state.layout, canvas.width, canvas.height);
  for (let i = panels.length - 1; i >= 0; i--) {
    const p = panels[i];
    if (p.shape) {
      if (insidePolygon(x, y, p.shape)) return i;
    } else if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
      return i;
    }
  }
  return -1;
}

function insidePolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Drag on the canvas pans the selected panel's photo; the wheel zooms it. */
function bindGestures() {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let recorded = false;

  canvas.addEventListener('pointerdown', (e) => {
    const index = panelAtPoint(e.clientX, e.clientY);
    if (index < 0) return;
    state.selectedPanel = index;
    refreshPanelControls();
    dragging = true;
    recorded = false;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const slot = state.panels[state.selectedPanel];
    if (!slot || slotPhoto(state.selectedPanel) === null) return;
    if (!recorded) {
      checkpoint();
      recorded = true;
      slot.touched = true;
    }
    const rect = canvas.getBoundingClientRect();
    const panel = panelsFor(state.layout, canvas.width, canvas.height)[state.selectedPanel];
    slot.dx += ((e.clientX - lastX) / rect.width) * (canvas.width / panel.w);
    slot.dy += ((e.clientY - lastY) / rect.height) * (canvas.height / panel.h);
    Object.assign(slot, fitCrop(slot, library[slot.photo], panel));
    lastX = e.clientX;
    lastY = e.clientY;
    repaint();
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    const slot = state.panels[state.selectedPanel];
    if (!slot || slotPhoto(state.selectedPanel) === null) return;
    e.preventDefault();
    if (!recorded) {
      checkpoint();
      recorded = true;
      slot.touched = true;
    }
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    slot.zoom = Math.min(4, Math.max(1, (slot.zoom || 1) * factor));
    const panel = panelsFor(state.layout, canvas.width, canvas.height)[state.selectedPanel];
    Object.assign(slot, fitCrop(slot, library[slot.photo], panel));
    repaint();
    clearTimeout(canvas._wheelTimer);
    canvas._wheelTimer = setTimeout(() => { recorded = false; }, 400);
  }, { passive: false });
}

/* ---------------- export ---------------- */

/** Renders the cover at an export size and downloads it as a PNG. */
async function exportCover(sizeId) {
  await loadFonts();
  const { w, h } = SIZES[sizeId];
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  paintCover(offscreen, state, library);
  const blob = await new Promise((resolve) => offscreen.toBlob(resolve, 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `heatwave-cover-${sizeId}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return a.download;
}

/** Exports the cover at every size, one download after another. */
async function exportEverySize() {
  statusLine.textContent = 'Exporting all sizes…';
  for (const sizeId of Object.keys(SIZES)) {
    await exportCover(sizeId);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  statusLine.textContent = 'Saved all four sizes.';
}

/* ---------------- pickers ---------------- */

/** Builds one picker row from a table of options. */
function buildPicker(elementId, options, current, onPick, dataAttr, swatch = false) {
  const picker = document.getElementById(elementId);
  for (const [id, info] of Object.entries(options)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = swatch ? 'pick swatch' : 'pick';
    button.dataset[dataAttr] = id;
    button.textContent = info.label || id;
    if (swatch) {
      button.style.setProperty('--swatch-a', info.swatch[0]);
      button.style.setProperty('--swatch-b', info.swatch[1]);
    }
    button.addEventListener('click', () => {
      if (current() === id) return;
      checkpoint();
      onPick(id);
      refreshControls();
      repaint();
    });
    picker.appendChild(button);
  }
}

function buildPickers() {
  buildPicker('layout-picker', LAYOUTS, () => state.layout, (id) => {
    state.layout = id;
    fitSlotsToLayout();
  }, 'layout');
  buildPicker('grade-picker', GRADES, () => state.grade, (id) => {
    state.grade = id;
  }, 'grade', true);
  const sizeOptions = {};
  for (const [id, info] of Object.entries(SIZES)) {
    sizeOptions[id] = { label: id, title: info.label };
  }
  buildPicker('size-picker', sizeOptions, () => state.size, (id) => {
    state.size = id;
  }, 'size');
  document.querySelectorAll('[data-size]').forEach((b) => {
    b.title = SIZES[b.dataset.size].label;
  });
}

/** Reflects the state in every control (used after undo, redo, and shots). */
function refreshControls() {
  document.querySelectorAll('[data-layout]').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('[data-grade]').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  document.querySelectorAll('[data-size]').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === state.size);
  });
  captionField.value = state.caption;
  subtitleField.value = state.subtitle;
  document.getElementById('caption-style').value = state.captionStyle;
  document.getElementById('caption-pos').value = state.captionPos;
  document.getElementById('caption-size').value = String(Math.round(state.captionSize * 100));
  document.getElementById('stars').value = String(state.stars);
  document.getElementById('quote').value = state.quote;
  document.getElementById('tagline').value = state.tagline;
  document.getElementById('billing').value = state.billing;
  document.getElementById('roles').value = (state.roles || []).join(', ');
  document.getElementById('role-tags').checked = state.roleTags;
  document.getElementById('seal').checked = state.seal;
  document.getElementById('barcode').checked = state.barcode;
  document.getElementById('billing-on').checked = state.billingOn;
  document.getElementById('badges').checked = state.badges;
  document.getElementById('grain').checked = state.grain;
  document.getElementById('vignette').checked = state.vignette;
  refreshPanelControls();
}

/** The shot API: what ./shots.js uses to set a scene up before painting. */
const shotApi = {
  async loadSample(name) {
    const img = await loadImage(`samples/${name}.jpg`);
    const index = library.length;
    addPhotos([img], [name]);
    return index;
  },
  setState(patch) {
    Object.assign(state, patch);
    fitSlotsToLayout();
    refreshControls();
  },
  assignPhoto,
  async render() {
    await loadFonts();
    repaint();
  },
};

/* ---------------- control bindings ---------------- */

function bindControls() {
  document.getElementById('photo').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const loaded = [];
    for (const file of files) {
      try {
        loaded.push(await loadImage(URL.createObjectURL(file)));
      } catch (err) {
        /* A file that is not an image is skipped. */
      }
    }
    if (!loaded.length) {
      statusLine.textContent = 'That file could not be read as an image.';
      return;
    }
    checkpoint();
    const firstIndex = library.length;
    addPhotos(loaded, files.map((f) => f.name));
    fitSlotsToLayout();
    if (slotPhoto(state.selectedPanel) === null) {
      assignPhoto(state.selectedPanel, firstIndex);
    }
    statusLine.textContent = `${loaded.length} photo${loaded.length > 1 ? 's' : ''} added — click a panel, then a photo, to place it.`;
    repaint();
  });
  document.getElementById('samples').addEventListener('click', loadSamples);
  document.getElementById('one-photo').addEventListener('click', fillWithOnePhoto);
  document.getElementById('reset-crop').addEventListener('click', resetCrop);

  zoomInput.addEventListener('input', () => {
    const slot = state.panels[state.selectedPanel];
    if (!slot) return;
    slot.zoom = Number(zoomInput.value) / 100;
    slot.touched = true;
    repaint();
  });
  zoomInput.addEventListener('change', () => checkpoint());

  // Text fields: repaint live while typing, record history on blur.
  const liveText = (field, apply) => {
    field.addEventListener('input', () => {
      apply(field.value);
      repaint();
    });
    field.addEventListener('change', () => checkpoint());
  };
  liveText(captionField, (v) => { state.caption = v; });
  liveText(subtitleField, (v) => { state.subtitle = v; });
  liveText(document.getElementById('quote'), (v) => { state.quote = v; });
  liveText(document.getElementById('tagline'), (v) => { state.tagline = v; });
  liveText(document.getElementById('billing'), (v) => { state.billing = v; });
  const rolesField = document.getElementById('roles');
  liveText(rolesField, (v) => {
    state.roles = v.split(',').map((s) => s.trim()).filter(Boolean);
  });

  const pick = (id, apply) => {
    document.getElementById(id).addEventListener('change', (e) => {
      checkpoint();
      apply(e.target.value);
      repaint();
    });
  };
  pick('caption-style', (v) => { state.captionStyle = v; });
  pick('caption-pos', (v) => { state.captionPos = v; });
  pick('stars', (v) => { state.stars = Number(v); });

  const sizeField = document.getElementById('caption-size');
  sizeField.addEventListener('input', () => {
    state.captionSize = Number(sizeField.value) / 100;
    repaint();
  });
  sizeField.addEventListener('change', () => checkpoint());

  const toggle = (id, key) => {
    document.getElementById(id).addEventListener('change', (e) => {
      checkpoint();
      state[key] = e.target.checked;
      repaint();
    });
  };
  toggle('role-tags', 'roleTags');
  toggle('seal', 'seal');
  toggle('barcode', 'barcode');
  toggle('billing-on', 'billingOn');
  toggle('badges', 'badges');
  toggle('grain', 'grain');
  toggle('vignette', 'vignette');

  document.getElementById('undo').addEventListener('click', undo);
  document.getElementById('redo').addEventListener('click', redo);
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });
  document.getElementById('export').addEventListener('click', async () => {
    const name = await exportCover(state.size);
    statusLine.textContent = `Saved ${name}`;
  });
  document.getElementById('export-all').addEventListener('click', exportEverySize);
}

/* ---------------- boot ---------------- */

buildPickers();
bindControls();
bindGestures();
fitSlotsToLayout();
refreshControls();
refreshUndoButtons();

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  runShot(shot, query, shotApi);
} else {
  loadFonts().then(repaint);
  repaint();
}
