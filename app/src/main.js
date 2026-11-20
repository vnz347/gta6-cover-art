// Wires the editor: photos in, panels assigned, caption typed, cover out.
// A `?shot=` query sets up a fixed scene for a screenshot instead (./shots.js).
import { renderCover, SIZES, clampCrop, sourceSize } from './cover.js';
import { LAYOUTS, layoutPanels } from './layouts.js';
import { GRADES } from './grades.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const status = document.getElementById('status');
const photoStrip = document.getElementById('photo-strip');
const zoomSlider = document.getElementById('zoom');
const captionInput = document.getElementById('caption');
const subtitleInput = document.getElementById('subtitle');

/** The sample photos shipped with the app. */
const SAMPLES = [
  { name: 'pier', label: 'Pier at dusk' },
  { name: 'boulevard', label: 'Boulevard' },
  { name: 'skater', label: 'Skater sunset' },
  { name: 'coastal', label: 'Coastal drive' },
];

/** The role tags the panels wear by default, in panel order. */
const DEFAULT_ROLES = [
  'The Wheelman', 'The Lookout', 'The Hustler', 'The Ghost', 'The Star',
  'The Fixer', 'The Runner', 'The Queen', 'The Rookie',
];

/** A fresh editor state: no photos yet, slanted poster, sunset grade. */
function defaultState() {
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
    quote: '“The coast never looked this good.” — Heatwave Mag',
    tagline: 'One city · One summer · Every light on',
    billing: 'A Heatwave production · Starring your photos · Shot on location · Graded in the golden hour',
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

let state = defaultState();
let photos = [];
let undoStack = [];
let redoStack = [];
let fontsReady = false;
/** Detected face centres by photo index, as fractions of the photo. */
const faceCentres = new Map();

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
      const downscaled = document.createElement('canvas');
      downscaled.width = Math.round(img.naturalWidth * scale);
      downscaled.height = Math.round(img.naturalHeight * scale);
      downscaled.getContext('2d').drawImage(img, 0, 0, downscaled.width, downscaled.height);
      resolve(downscaled);
    };
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

/** A small JPEG data URL of a photo source, for its thumbnail. */
function makeThumb(source) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const scale = Math.min(1, 128 / Math.max(w, h));
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(1, Math.round(w * scale));
  thumb.height = Math.max(1, Math.round(h * scale));
  thumb.getContext('2d').drawImage(source, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL('image/jpeg', 0.7);
}

/** Loads the display fonts so canvas lettering uses them, then repaints. */
async function ensureFonts() {
  if (fontsReady) return;
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('40px Pacifico'),
      document.fonts.ready,
    ]);
  } catch (e) {
    /* The canvas falls back to system fonts if a webfont fails. */
  }
  fontsReady = true;
}

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
function redraw() {
  const { w, h } = previewSize();
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  renderCover(canvas, state, photos);
  updatePanelControls();
}

/** A snapshot of the state for undo/redo (photos live outside it, by index). */
function snapshot() {
  return JSON.stringify(state);
}

function restore(text) {
  state = JSON.parse(text);
  syncControls();
  redraw();
}

/** Pushes the state before a change, clearing the redo stack. */
function commit() {
  undoStack.push(snapshot());
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  updateUndoButtons();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  updateUndoButtons();
}

function updateUndoButtons() {
  document.getElementById('undo').disabled = !undoStack.length;
  document.getElementById('redo').disabled = !redoStack.length;
}

/** How many panels the current layout has. */
function panelCount() {
  return LAYOUTS[state.layout].panels;
}

/** Grows or shrinks the panel slots to match the current layout. */
function fitPanelsToLayout() {
  const count = panelCount();
  while (state.panels.length < count) state.panels.push({ photo: null, zoom: 1, dx: 0, dy: 0 });
  state.panels.length = count;
  state.selectedPanel = Math.min(state.selectedPanel, count - 1);
}

/** The photo index assigned to a panel, or null when the panel is empty. */
function panelPhoto(index) {
  const slot = state.panels[index];
  return slot && typeof slot.photo === 'number' ? slot.photo : null;
}

/** Where a panel's crop should centre: a detected face, or just above centre where faces usually sit. */
function smartTarget(photoIndex) {
  return faceCentres.get(photoIndex) || { x: 0.5, y: 0.42 };
}

/**
 * Centres a panel's crop on its photo's face (or the heuristic target) at the
 * panel's current zoom, so a portrait never lands with its head cut off.
 */
function applySmartCrop(panelIndex) {
  const slot = state.panels[panelIndex];
  if (!slot || slot.photo === null || slot.photo === undefined) return;
  const img = photos[slot.photo];
  if (!img) return;
  const panel = layoutPanels(state.layout, canvas.width, canvas.height)[panelIndex];
  const { w: iw, h: ih } = sourceSize(img);
  const zoom = slot.zoom || 1;
  const base = Math.max(panel.w / iw, panel.h / ih);
  const scale = base * zoom;
  const visibleW = panel.w / (iw * scale);
  const visibleH = panel.h / (ih * scale);
  const target = smartTarget(slot.photo);
  slot.dx = (0.5 - target.x) / visibleW;
  slot.dy = (0.5 - target.y) / visibleH;
  Object.assign(slot, clampCrop(slot, img, panel));
}

/**
 * Finds the face in a photo with the browser's FaceDetector when it has one
 * (Chrome on some platforms), then re-centres every untouched panel showing
 * that photo on it. Without the API the heuristic crop stands.
 */
async function detectFace(photoIndex) {
  const source = photos[photoIndex];
  if (!source || !('FaceDetector' in window)) return;
  try {
    const detector = new FaceDetector({ fastMode: true });
    const faces = await detector.detect(source);
    if (!faces.length) return;
    const box = faces[0].boundingBox;
    const { w, h } = sourceSize(source);
    faceCentres.set(photoIndex, {
      x: (box.x + box.width / 2) / w,
      y: (box.y + box.height / 2) / h,
    });
    state.panels.forEach((slot, i) => {
      if (slot.photo === photoIndex && !slot.touched) applySmartCrop(i);
    });
    redraw();
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
  applySmartCrop(panelIndex);
}

/** Adds loaded images to the library and shows their thumbnails. */
function addPhotos(images, names) {
  images.forEach((img, i) => {
    photos.push(img);
    const index = photos.length - 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb';
    button.title = names[i] || `Photo ${photos.length}`;
    button.setAttribute('aria-label', `Use ${names[i] || 'photo'} in the selected panel`);
    const thumb = document.createElement('img');
    thumb.src = makeThumb(img);
    thumb.alt = '';
    button.appendChild(thumb);
    button.addEventListener('click', () => {
      commit();
      assignPhoto(state.selectedPanel, index);
      redraw();
      markSelectedThumb();
    });
    photoStrip.appendChild(button);
    detectFace(index);
  });
  markSelectedThumb();
}

function markSelectedThumb() {
  const selected = panelPhoto(state.selectedPanel);
  [...photoStrip.children].forEach((button, i) => {
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
    status.textContent = 'Could not load the sample photos.';
    return;
  }
  commit();
  const firstIndex = photos.length;
  addPhotos(loaded, SAMPLES.map((s) => s.label));
  fitPanelsToLayout();
  state.panels.forEach((slot, i) => {
    slot.photo = firstIndex + (i % loaded.length);
  });
  status.textContent = 'Sample photos loaded — click a panel, then a photo, to swap it.';
  redraw();
}

/** Puts the same photo in every panel. */
function useOnePhotoEverywhere() {
  const selected = panelPhoto(state.selectedPanel);
  if (selected === null) {
    status.textContent = 'Pick a photo for the selected panel first.';
    return;
  }
  commit();
  state.panels.forEach((slot) => { slot.photo = selected; });
  redraw();
}

/** Resets the selected panel's crop to the smart face-centred fit. */
function resetCrop() {
  commit();
  const slot = state.panels[state.selectedPanel];
  slot.zoom = 1;
  slot.dx = 0;
  slot.dy = 0;
  slot.touched = false;
  applySmartCrop(state.selectedPanel);
  redraw();
}

function updatePanelControls() {
  const slot = state.panels[state.selectedPanel];
  const label = document.getElementById('panel-label');
  label.textContent = `Panel ${state.selectedPanel + 1} of ${panelCount()}`;
  if (slot) zoomSlider.value = String(Math.round((slot.zoom || 1) * 100));
  markSelectedThumb();
}

/** Which panel (if any) a point on the preview canvas falls inside. */
function panelAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;
  const panels = layoutPanels(state.layout, canvas.width, canvas.height);
  for (let i = panels.length - 1; i >= 0; i--) {
    const p = panels[i];
    if (p.poly) {
      if (pointInPolygon(x, y, p.poly)) return i;
    } else if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
      return i;
    }
  }
  return -1;
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** Drag on the canvas pans the selected panel's photo; the wheel zooms it. */
function bindCanvasGestures() {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let committed = false;

  canvas.addEventListener('pointerdown', (e) => {
    const index = panelAt(e.clientX, e.clientY);
    if (index < 0) return;
    state.selectedPanel = index;
    updatePanelControls();
    dragging = true;
    committed = false;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const slot = state.panels[state.selectedPanel];
    if (!slot || panelPhoto(state.selectedPanel) === null) return;
    if (!committed) {
      commit();
      committed = true;
      slot.touched = true;
    }
    const rect = canvas.getBoundingClientRect();
    const panel = layoutPanels(state.layout, canvas.width, canvas.height)[state.selectedPanel];
    slot.dx += ((e.clientX - lastX) / rect.width) * (canvas.width / panel.w);
    slot.dy += ((e.clientY - lastY) / rect.height) * (canvas.height / panel.h);
    const img = photos[slot.photo];
    Object.assign(slot, clampCrop(slot, img, panel));
    lastX = e.clientX;
    lastY = e.clientY;
    redraw();
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    const slot = state.panels[state.selectedPanel];
    if (!slot || panelPhoto(state.selectedPanel) === null) return;
    e.preventDefault();
    if (!committed) {
      commit();
      committed = true;
      slot.touched = true;
    }
    slot.zoom = Math.min(4, Math.max(1, (slot.zoom || 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    const img = photos[slot.photo];
    const panel = layoutPanels(state.layout, canvas.width, canvas.height)[state.selectedPanel];
    Object.assign(slot, clampCrop(slot, img, panel));
    redraw();
    clearTimeout(canvas._wheelTimer);
    canvas._wheelTimer = setTimeout(() => { committed = false; }, 400);
  }, { passive: false });
}

/** Renders the cover at an export size and downloads it as a PNG. */
async function exportCover(sizeId) {
  await ensureFonts();
  const { w, h } = SIZES[sizeId];
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  renderCover(offscreen, state, photos);
  const blob = await new Promise((resolve) => offscreen.toBlob(resolve, 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `heatwave-cover-${sizeId}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return a.download;
}

/** Exports the cover at every size, one download after another. */
async function exportAllSizes() {
  status.textContent = 'Exporting all sizes…';
  for (const sizeId of Object.keys(SIZES)) {
    await exportCover(sizeId);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  status.textContent = 'Saved all four sizes.';
}

/** Builds the layout, grade, and size pickers from the module tables. */
function buildPickers() {
  const layoutPicker = document.getElementById('layout-picker');
  for (const [id, info] of Object.entries(LAYOUTS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pick';
    button.dataset.layout = id;
    button.textContent = info.label;
    button.addEventListener('click', () => {
      if (state.layout === id) return;
      commit();
      state.layout = id;
      fitPanelsToLayout();
      syncControls();
      redraw();
    });
    layoutPicker.appendChild(button);
  }

  const gradePicker = document.getElementById('grade-picker');
  for (const [id, info] of Object.entries(GRADES)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pick swatch';
    button.dataset.grade = id;
    button.textContent = info.label;
    button.style.setProperty('--swatch-a', info.swatch[0]);
    button.style.setProperty('--swatch-b', info.swatch[1]);
    button.addEventListener('click', () => {
      if (state.grade === id) return;
      commit();
      state.grade = id;
      syncControls();
      redraw();
    });
    gradePicker.appendChild(button);
  }

  const sizePicker = document.getElementById('size-picker');
  for (const [id, info] of Object.entries(SIZES)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pick';
    button.dataset.size = id;
    button.textContent = id;
    button.title = info.label;
    button.addEventListener('click', () => {
      if (state.size === id) return;
      commit();
      state.size = id;
      syncControls();
      redraw();
    });
    sizePicker.appendChild(button);
  }
}

/** Reflects the state in every control (used after undo, redo, and shots). */
function syncControls() {
  document.querySelectorAll('[data-layout]').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('[data-grade]').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  document.querySelectorAll('[data-size]').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === state.size);
  });
  captionInput.value = state.caption;
  subtitleInput.value = state.subtitle;
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
  updatePanelControls();
}

/** The shot API: what ./shots.js uses to set a scene up before painting. */
const shotApi = {
  async loadSample(name) {
    const img = await loadImage(`samples/${name}.jpg`);
    const index = photos.length;
    addPhotos([img], [name]);
    return index;
  },
  setState(patch) {
    Object.assign(state, patch);
    fitPanelsToLayout();
    syncControls();
  },
  assignPhoto,
  async render() {
    await ensureFonts();
    redraw();
  },
};

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
      status.textContent = 'That file could not be read as an image.';
      return;
    }
    commit();
    const firstIndex = photos.length;
    addPhotos(loaded, files.map((f) => f.name));
    fitPanelsToLayout();
    if (panelPhoto(state.selectedPanel) === null) {
      assignPhoto(state.selectedPanel, firstIndex);
    }
    status.textContent = `${loaded.length} photo${loaded.length > 1 ? 's' : ''} added — click a panel, then a photo, to place it.`;
    redraw();
  });
  document.getElementById('samples').addEventListener('click', loadSamples);
  document.getElementById('one-photo').addEventListener('click', useOnePhotoEverywhere);
  document.getElementById('reset-crop').addEventListener('click', resetCrop);
  zoomSlider.addEventListener('input', () => {
    const slot = state.panels[state.selectedPanel];
    if (!slot) return;
    slot.zoom = Number(zoomSlider.value) / 100;
    slot.touched = true;
    redraw();
  });
  zoomSlider.addEventListener('change', () => commit());
  captionInput.addEventListener('input', () => {
    state.caption = captionInput.value;
    redraw();
  });
  captionInput.addEventListener('change', () => commit());
  subtitleInput.addEventListener('input', () => {
    state.subtitle = subtitleInput.value;
    redraw();
  });
  subtitleInput.addEventListener('change', () => commit());
  document.getElementById('caption-style').addEventListener('change', (e) => {
    commit();
    state.captionStyle = e.target.value;
    redraw();
  });
  document.getElementById('caption-pos').addEventListener('change', (e) => {
    commit();
    state.captionPos = e.target.value;
    redraw();
  });
  document.getElementById('caption-size').addEventListener('input', (e) => {
    state.captionSize = Number(e.target.value) / 100;
    redraw();
  });
  document.getElementById('caption-size').addEventListener('change', () => commit());
  document.getElementById('stars').addEventListener('change', (e) => {
    commit();
    state.stars = Number(e.target.value);
    redraw();
  });
  const bindText = (id, key) => {
    const input = document.getElementById(id);
    input.addEventListener('input', () => {
      state[key] = input.value;
      redraw();
    });
    input.addEventListener('change', () => commit());
  };
  bindText('quote', 'quote');
  bindText('tagline', 'tagline');
  bindText('billing', 'billing');
  const rolesInput = document.getElementById('roles');
  rolesInput.addEventListener('input', () => {
    state.roles = rolesInput.value.split(',').map((s) => s.trim()).filter(Boolean);
    redraw();
  });
  rolesInput.addEventListener('change', () => commit());
  const bindCheck = (id, key) => {
    document.getElementById(id).addEventListener('change', (e) => {
      commit();
      state[key] = e.target.checked;
      redraw();
    });
  };
  bindCheck('role-tags', 'roleTags');
  bindCheck('seal', 'seal');
  bindCheck('barcode', 'barcode');
  bindCheck('billing-on', 'billingOn');
  bindCheck('badges', 'badges');
  document.getElementById('grain').addEventListener('change', (e) => {
    commit();
    state.grain = e.target.checked;
    redraw();
  });
  document.getElementById('vignette').addEventListener('change', (e) => {
    commit();
    state.vignette = e.target.checked;
    redraw();
  });
  document.getElementById('undo').addEventListener('click', undo);
  document.getElementById('redo').addEventListener('click', redo);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  });
  document.getElementById('export').addEventListener('click', async () => {
    const name = await exportCover(state.size);
    status.textContent = `Saved ${name}`;
  });
  document.getElementById('export-all').addEventListener('click', exportAllSizes);
}

buildPickers();
bindControls();
bindCanvasGestures();
fitPanelsToLayout();
syncControls();
updateUndoButtons();

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  runShot(shot, query, shotApi);
} else {
  ensureFonts().then(redraw);
  redraw();
}
