// Fixed scenes for screenshots: ?shot=editor shows the page with sample
// photos loaded; ?shot=cover shows the cover alone at its export size.
// Query knobs: layout, grade, size, caption, subtitle, tagline, quote,
// photos (comma list of sample names, one per panel), stars, extras (0/1).
// window.__shotReady is set once the scene has painted with its fonts loaded.

/** Waits until the browser has painted twice, then flags the shot ready. */
function flagReady() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}

/** Loads the named samples and assigns them to the panels in order. */
async function loadPhotos(api, names) {
  const indexes = [];
  for (const name of names) {
    try {
      indexes.push(await api.loadSample(name));
    } catch (e) {
      /* A missing sample leaves its panel empty rather than failing the shot. */
    }
  }
  return indexes;
}

export async function runShot(shot, query, api) {
  const names = (query.get('photos') || 'pier,boulevard,skater,coastal').split(',').map((s) => s.trim()).filter(Boolean);
  const patch = {
    layout: query.get('layout') || 'slant5',
    grade: query.get('grade') || 'sunset',
    size: query.get('size') || '1080x1080',
    caption: query.get('caption') ?? 'Neon Nights',
    subtitle: query.get('subtitle') ?? 'a vice city story',
    tagline: query.get('tagline') ?? undefined,
    quote: query.get('quote') ?? undefined,
    stars: query.has('stars') ? Number(query.get('stars')) : 5,
  };
  // Remove keys the query did not set, so the defaults stand.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }
  if (query.get('extras') === '0') {
    Object.assign(patch, {
      roleTags: false, seal: false, barcode: false, billingOn: false, badges: false,
    });
  }
  api.setState(patch);
  const indexes = await loadPhotos(api, names);
  indexes.forEach((photoIndex, panelIndex) => api.assignPhoto(panelIndex, photoIndex));

  if (shot === 'cover') {
    // Hides the controls and keeps the canvas at its true export size, so
    // the screenshot shows the real export rather than a preview.
    document.body.classList.add('shot-cover');
  } else {
    const status = document.getElementById('status');
    if (status) status.textContent = 'Sample photos loaded — click a panel, then a photo, to swap it.';
  }
  await api.render();
  flagReady();
}
