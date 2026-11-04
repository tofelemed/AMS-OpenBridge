// Runs INSIDE the page through page.evaluate, so it must stay self-contained (no imports, no closures).
// Word rules (recorded in the document's method appendix):
//   excluded as data: table body cells, grid cells, chart text (svg/canvas), input values, select options;
//   a token counts as a word only if it has a letter and is not an identifier (FIC10401, G15, EVT-833) or a value with unit (12h, 96%).

export function textMetrics({ rootSelector, withRects = false }) {
  const BLOCK = new Set(['block', 'flex', 'grid', 'list-item', 'table', 'table-row', 'table-cell', 'table-caption', 'flow-root']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION', 'TITLE']);
  const isWord = t => /\p{L}/u.test(t)
    && !/^[A-Z0-9][A-Z0-9_./-]*\d[A-Z0-9_./-]*$/.test(t)
    && !/^[\d.,:±+\-−%/]+\p{L}{0,3}$/u.test(t)
    && !/^\p{L}{1,3}\d+$/u.test(t);
  const words = s => s.split(/\s+/).filter(Boolean).filter(isWord).length;
  const composedParent = n => n.assignedSlot ?? n.parentNode ?? n.host ?? null;
  const within = (n, test) => {
    for (let p = n; p; p = composedParent(p)) {
      if (p.nodeType === 1 && test(p)) return p;
      if (p.nodeType === 11 && p.host && test(p.host)) return p.host;
    }
    return null;
  };
  const range = document.createRange();
  const nodes = [];
  const titles = [];
  const walk = n => {
    if (n.nodeType === 3) {
      if (!n.nodeValue.trim()) return;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      nodes.push({ n, r });
      return;
    }
    if (n.nodeType === 1) {
      if (SKIP.has(n.tagName)) return;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
      if (n.tagName === 'CANVAS') return;
      const t = n.getAttribute('title');
      if (t) titles.push(t);
      if (n.tagName === 'SLOT') { const a = n.assignedNodes(); if (a.length) { a.forEach(walk); return; } }
      if (n.shadowRoot) { [...n.shadowRoot.childNodes].forEach(walk); return; }
    }
    [...n.childNodes].forEach(walk);
  };
  // Some pages nest a <main> inside the shell's <main>: walk outermost matches only, or that subtree counts twice.
  const matched = [...document.querySelectorAll(rootSelector)];
  const roots = matched.filter(r => !matched.some(o => o !== r && o.contains(r)));
  roots.forEach(walk);

  const blockOf = n => {
    let p = n.parentElement ?? n.parentNode?.host;
    while (p && p.nodeType === 1) {
      if (BLOCK.has(getComputedStyle(p).display)) return p;
      const up = composedParent(p);
      p = up?.nodeType === 11 ? up.host : up;
    }
    return n.parentElement;
  };
  const kindOf = el => {
    if (within(el, e => /^(TD)$/.test(e.tagName) || /^(gridcell|cell)$/.test(e.getAttribute('role') ?? ''))) return 'data';
    if (within(el, e => e.tagName === 'svg' || e.tagName === 'SVG')) return 'chart';
    if (within(el, e => /^(TH)$/.test(e.tagName) || e.getAttribute('role') === 'columnheader')) return 'column';
    if (within(el, e => /^(H[1-6])$/.test(e.tagName) || e.getAttribute('role') === 'heading' || /title/i.test(e.getAttribute('class') ?? ''))) return 'heading';
    if (within(el, e => /^(BUTTON|A|SELECT|LABEL)$/.test(e.tagName) || /^(button|tab|menuitem|link|option)$/.test(e.getAttribute('role') ?? '') || e.tagName === 'OBC-BUTTON' || /__label|field-label|field__label/.test(e.getAttribute('class') ?? ''))) return 'control';
    return 'text';
  };

  const byBlock = new Map();
  const sizes = {};
  for (const { n, r } of nodes) {
    const parent = n.parentElement ?? n.parentNode?.host;
    const px = parent ? getComputedStyle(parent).fontSize : '?';
    sizes[px] = (sizes[px] ?? 0) + 1;
    const b = blockOf(n);
    if (!b) continue;
    const e = byBlock.get(b) ?? { parts: [], top: r.top, kind: kindOf(n.parentElement ?? b), px };
    e.parts.push(n.nodeValue.trim());
    e.top = Math.min(e.top, r.top);
    byBlock.set(b, e);
  }

  const blocks = [];
  for (const [el, e] of byBlock) {
    const text = e.parts.join(' ').replace(/\s+/g, ' ').trim();
    const box = withRects ? el.getBoundingClientRect() : null;
    blocks.push({ text, words: words(text), kind: e.kind, tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 2).join(' '), px: e.px, top: Math.round(e.top), n: 1, ...(box ? { rect: { x: box.x, y: box.y, w: box.width, h: box.height } } : {}) });
  }

  const data = new Set(['data', 'chart']);
  const vh = innerHeight;
  const nonData = blocks.filter(b => !data.has(b.kind));
  const norm = s => s.toLowerCase().replace(/\d+([.,:]\d+)*/g, '#').replace(/\s+/g, ' ').trim();
  const freq = {};
  for (const b of nonData) if (b.words >= 2) (freq[norm(b.text)] ??= { text: b.text.slice(0, 120), n: 0, words: b.words }).n++;
  const repeated = Object.values(freq).filter(x => x.n >= 3).sort((a, b) => b.n * b.words - a.n * a.words);

  const kpis = [...new Set(matched.flatMap(r => [...r.querySelectorAll('.cpm-kpicard')]))].map(c => {
    const value = c.querySelector('.cpm-kpicard__value')?.innerText ?? '';
    return words((c.innerText ?? '').replace(value, ''));
  });

  const seen = new Map();
  for (const b of nonData) {
    const k = `${b.kind}|${norm(b.text)}`;
    const s = seen.get(k);
    if (s) s.n++; else seen.set(k, { ...b, text: b.text.slice(0, 260) });
  }

  return {
    ...(withRects ? { raw: nonData } : {}),
    visibleWords: nonData.reduce((a, b) => a + b.words, 0),
    wordsInViewport: nonData.filter(b => b.top < vh).reduce((a, b) => a + b.words, 0),
    dataWordsExcluded: blocks.filter(b => data.has(b.kind)).reduce((a, b) => a + b.words, 0),
    byKind: nonData.reduce((a, b) => { a[b.kind] = (a[b.kind] ?? 0) + b.words; return a; }, {}),
    textBlocks: nonData.filter(b => b.kind === 'text' && b.words >= 4).length,
    fontSizes: sizes,
    distinctFontSizes: Object.keys(sizes).length,
    repeatedStrings: repeated.slice(0, 15),
    kpiCards: kpis.length ? { n: kpis.length, avg: +(kpis.reduce((a, b) => a + b, 0) / kpis.length).toFixed(1), max: Math.max(...kpis) } : null,
    titleTooltips: { n: titles.length, words: titles.reduce((a, t) => a + words(t), 0) },
    blocks: [...seen.values()].filter(b => b.words >= 1).sort((a, b) => a.top - b.top),
  };
}

export function geometry() {
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)].filter(e => e.getBoundingClientRect().height > 0);
  const stats = els => {
    const v = els.map(e => +e.getBoundingClientRect().height.toFixed(1)).sort((a, b) => a - b);
    return v.length ? { n: v.length, min: v[0], median: v[v.length >> 1], max: v[v.length - 1] } : null;
  };
  const style = (s, props) => {
    const e = typeof s === 'string' ? q(s) : s;
    if (!e) return null;
    const cs = getComputedStyle(e);
    return Object.fromEntries(props.map(p => [p, cs[p]]));
  };
  const inner = host => host.shadowRoot?.querySelector('button') ?? host;
  const selected = q('.app-sidebar [aria-current="page"]') ?? q('.app-sidebar .nav-item--active') ?? q('.app-sidebar .active');
  return {
    viewport: { w: innerWidth, h: innerHeight },
    sidebarWidth: q('.app-sidebar')?.getBoundingClientRect().width ?? null,
    headerHeight: q('.app-topbar')?.getBoundingClientRect().height ?? null,
    pageContent: style('.page-content', ['padding', 'gap']),
    screen: style('.cpm-screen', ['gap', 'rowGap']),
    tableRows: stats(qa('main tbody tr')),
    tableHeader: stats(qa('main thead tr')),
    divRows: stats(qa('main .cpm-attention__row, main .cpm-trail-row, main .cpm-event-row')),
    nativeButtons: stats(qa('main button')),
    obcButtonsHost: stats(qa('main obc-button')),
    obcButtonsInner: stats(qa('main obc-button').map(inner)),
    inputs: stats(qa('main input, main select, main textarea, main .cpm-select')),
    fonts: { html: getComputedStyle(document.documentElement).fontSize, body: getComputedStyle(document.body).fontSize, family: getComputedStyle(document.body).fontFamily },
    title: style('.cpm-title', ['fontSize', 'fontWeight', 'lineHeight']),
    sectionTitle: style('.cpm-panel-title', ['fontSize', 'fontWeight', 'textTransform']),
    eyebrow: style('.cpm-eyebrow', ['fontSize', 'fontWeight', 'letterSpacing', 'textTransform']),
    panel: style('.cpm-surface', ['padding', 'borderRadius', 'borderTopWidth', 'gap']),
    kpiCard: style('.cpm-kpicard', ['padding', 'borderRadius', 'borderLeftWidth', 'gap']),
    kpiGrid: style('.cpm-kpicards', ['gap']),
    grid2: style('.cpm-grid-2', ['gap']),
    buttonRadius: style('main button', ['borderRadius']),
    selectRadius: style('main .cpm-select', ['borderRadius', 'height']),
    selectedNav: selected ? { text: selected.textContent.trim(), ...style(selected, ['backgroundColor', 'color', 'fontWeight', 'borderLeftWidth', 'borderLeftColor', 'boxShadow']) } : null,
    mono: style('.cpm-mono', ['fontFamily', 'fontVariantNumeric']),
    kpiValue: style('.cpm-kpicard__value', ['fontSize', 'fontWeight', 'fontVariantNumeric', 'fontFamily']),
    td: style('main td', ['fontSize', 'fontVariantNumeric', 'fontFamily', 'paddingTop']),
  };
}

export function keyboardFacts() {
  const main = document.querySelector('main') ?? document.body;
  const focusable = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"]),[role="button"][tabindex],obc-button,[contenteditable]';
  const all = [...main.querySelectorAll('*')];
  const pointer = all.filter(e => getComputedStyle(e).cursor === 'pointer' && e.getBoundingClientRect().height > 0);
  const tops = pointer.filter(e => !(e.parentElement && getComputedStyle(e.parentElement).cursor === 'pointer'));
  const unreachable = tops.filter(e => !e.matches(focusable) && !e.closest(focusable) && !e.querySelector(focusable));
  const sample = unreachable.slice(0, 8).map(e => `${e.tagName.toLowerCase()}.${(e.getAttribute('class') ?? '').split(/\s+/)[0]}`);
  return {
    clickTargets: tops.length,
    pointerWithoutKeyboard: unreachable.length,
    sample,
    charts: {
      canvases: main.querySelectorAll('canvas').length,
      focusableCharts: [...main.querySelectorAll('canvas,svg')].filter(c => c.closest('[tabindex]:not([tabindex="-1"])')).length,
      labelledCharts: [...main.querySelectorAll('canvas,svg[role="img"]')].filter(c => (c.closest('[aria-label]') || c.closest('[role="img"]'))).length,
    },
    tableRowsFocusable: main.querySelectorAll('tbody tr[tabindex]').length,
    tableRows: main.querySelectorAll('tbody tr').length,
  };
}

export function deepFocusReport() {
  let a = document.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  if (!a || a === document.body) return null;
  const chain = [];
  for (let p = a; p; p = p.parentNode || p.host) if (p.nodeType === 1) chain.push(p);
  const ringOn = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const shadow = cs.boxShadow !== 'none';
    return outline || shadow ? { outline, shadow, width: cs.outlineWidth, offset: cs.outlineOffset, colour: cs.outlineColor } : null;
  };
  let ring = null;
  for (const el of chain.slice(0, 3)) {
    for (const pseudo of [null, '::before', '::after']) ring ??= ringOn(el, pseudo);
  }
  const r = a.getBoundingClientRect();
  return { tag: a.tagName.toLowerCase(), cls: (a.getAttribute('class') ?? '').split(/\s+/)[0], text: (a.textContent ?? '').trim().slice(0, 40), inMain: chain.some(e => e.tagName === 'MAIN'), ring, w: Math.round(r.width), h: Math.round(r.height) };
}

/** Every custom property declared by a readable stylesheet, resolved for the current theme. */
export function customProperties() {
  const names = new Set();
  const collect = rules => {
    for (const r of rules) {
      if (r.style) for (const p of r.style) if (p.startsWith('--')) names.add(p);
      if (r.cssRules) collect(r.cssRules);
    }
  };
  for (const s of document.styleSheets) { try { collect(s.cssRules); } catch { /* cross-origin sheet */ } }
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries([...names].sort().map(n => [n, cs.getPropertyValue(n).trim()]));
}
