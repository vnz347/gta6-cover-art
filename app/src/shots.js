// Fixed scenes for screenshots: ?shot=editor shows the page with sample
// photos loaded; ?shot=cover shows the cover alone at its export size.
// Query knobs: layout, grade, size, caption, subtitle, tagline, quote,
// photos (a comma list of sample names, one per panel), stars, extras (0/1).
// window.__shotReady is set once the scene has painted with its fonts loaded.

/** Flags the shot ready after the browser has painted twice. */
function markReady() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}

/** Loads the named samples in order, skipping any that fail. */
async function fetchSamples(api, names) {
  const loaded = [];
  for (const name of names) {
    try {
      loaded.push(await api.loadSample(name));
    } catch (e) {
      /* A missing sample leaves its panel empty rather than failing the shot. */
    }
  }
  return loaded;
}

export async function runShot(shot, query, api) {
  const names = (query.get('photos') || 'pier,boulevard,skater,coastal')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const patch = {
    layout: query.get('layout') || 'slant5',
    grade: query.get('grade') || 'sunset',
    size: query.get('size') || '1080x1080',
    caption: query.get('caption') ?? 'Neon Nights',
    subtitle: query.get('subtitle') ?? 'a vice city story',
    stars: query.has('stars') ? Number(query.get('stars')) : 5,
  };
  const tagline = query.get('tagline');
  if (tagline !== null) patch.tagline = tagline;
  const quote = query.get('quote');
  if (quote !== null) patch.quote = quote;
  if (query.get('extras') === '0') {
    patch.roleTags = false;
    patch.seal = false;
    patch.barcode = false;
    patch.billingOn = false;
    patch.badges = false;
  }
  api.setState(patch);
  const indexes = await fetchSamples(api, names);
  indexes.forEach((photoIndex, panelIndex) => api.assignPhoto(panelIndex, photoIndex));

  if (shot === 'cover') {
    // Hides the editor chrome and keeps the canvas at its true export size,
    // so the screenshot shows the real export rather than a preview.
    document.body.classList.add('shot-cover');
  } else {
    const status = document.getElementById('status');
    if (status) status.textContent = 'Sample photos loaded — click a panel, then a photo, to swap it.';
  }
  await api.render();
  markReady();
}
