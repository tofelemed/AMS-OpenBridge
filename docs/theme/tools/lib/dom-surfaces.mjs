// In-page helpers for the surface crawler. Each runs through page.evaluate, so each stays self-contained.
// The data-cap attributes exist only in the capture browser's DOM.

export function enumerateControls({ scope, deny }) {
  const denyRe = new RegExp(deny, 'i');
  const root = document.querySelector(scope);
  if (!root) return [];
  const sel = 'button,[role=button],[role=tab],[role=menuitem],[role=switch],summary,[aria-expanded],[aria-haspopup],obc-button,obc-icon-button,obc-toggle-button-option,obc-filter-chip,obc-dropdown-button';
  const text = e => (e.getAttribute('aria-label') || e.getAttribute('label') || e.innerText || e.textContent || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const out = [];
  let i = 0;
  for (const e of root.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect();
    if (r.height < 4 || r.width < 4 || getComputedStyle(e).visibility === 'hidden') continue;
    const outer = e.parentElement?.closest(sel);
    if (outer && root.contains(outer)) continue;
    const label = text(e);
    const role = e.getAttribute('role') ?? '';
    const kind = role === 'tab' ? 'tab' : e.tagName === 'SUMMARY' || e.hasAttribute('aria-expanded') ? 'expander' : e.hasAttribute('aria-haspopup') ? 'menu' : e.tagName.startsWith('OBC-TOGGLE') ? 'toggle' : 'button';
    const cls = (e.getAttribute('class') ?? '').split(/\s+/)[0];
    const disabled = !!(e.disabled || e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('disabled'));
    const reason = e.getAttribute('title') || e.getAttribute('aria-describedby') || '';
    const id = `c${i++}`;
    e.setAttribute('data-cap', id);
    out.push({ id, label, kind, tag: e.tagName.toLowerCase(), cls, sig: `${e.tagName}.${cls}.${kind}`, disabled, hasDisabledReason: !!reason, denied: denyRe.test(label), top: Math.round(r.top) });
  }
  return out;
}

export function listLinks({ scope }) {
  const root = document.querySelector(scope);
  if (!root) return [];
  return [...root.querySelectorAll('a[href]')].filter(a => a.getBoundingClientRect().height > 0)
    .map(a => ({ label: a.textContent.replace(/\s+/g, ' ').trim().slice(0, 70), href: a.getAttribute('href') })).slice(0, 200);
}

export function markOverlays({ known }) {
  const OVERLAY = '[role=dialog],[role=alertdialog],[aria-modal="true"],[role=menu],[role=listbox],[role=tooltip],[class*="drawer" i],[class*="popover" i],[class*="toggletip" i],[class*="modal" i],.Toastify__toast';
  const seen = new Set(known ?? []);
  const all = [...document.querySelectorAll(OVERLAY)].filter(e => { const r = e.getBoundingClientRect(); return r.height > 20 && r.width > 40 && getComputedStyle(e).visibility !== 'hidden'; });
  const top = all.filter(e => !all.some(o => o !== e && o.contains(e)));
  const out = [];
  top.forEach((e, i) => {
    const key = `${e.getAttribute('role') ?? ''}.${(e.getAttribute('class') ?? '').split(/\s+/)[0]}.${e.getAttribute('aria-label') ?? ''}`;
    if (seen.has(key)) return;
    e.setAttribute('data-cap-ov', String(i));
    const r = e.getBoundingClientRect();
    out.push({ key, ov: i, role: e.getAttribute('role') ?? '', cls: (e.getAttribute('class') ?? '').split(/\s+/)[0], label: e.getAttribute('aria-label') ?? '', w: Math.round(r.width), h: Math.round(r.height), inMain: !!e.closest('main') });
  });
  return out;
}

export function signature() {
  const m = document.querySelector('main');
  const t = m?.innerText ?? '';
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return { url: location.pathname + location.search, len: t.length, hash: h };
}

/** title, aria-label, aria-description, placeholder and option text under a root, walking shadow DOM. */
export function attributeText({ scope }) {
  const out = { title: [], ariaLabel: [], ariaDescription: [], placeholder: [], options: [] };
  const push = (k, v) => { const s = (v ?? '').replace(/\s+/g, ' ').trim(); if (s) out[k].push(s.slice(0, 300)); };
  const walk = n => {
    if (n.nodeType !== 1 && n.nodeType !== 11) return;
    if (n.nodeType === 1) {
      push('title', n.getAttribute('title'));
      push('ariaLabel', n.getAttribute('aria-label'));
      push('ariaDescription', n.getAttribute('aria-description'));
      push('placeholder', n.getAttribute('placeholder'));
      if (n.tagName === 'OPTION') push('options', n.textContent);
    }
    if (n.shadowRoot) walk(n.shadowRoot);
    for (const c of n.children ?? []) walk(c);
  };
  const root = document.querySelector(scope);
  if (root) walk(root);
  return out;
}

export function panels() {
  const main = document.querySelector('main');
  if (!main) return [];
  const list = [...main.querySelectorAll('.cpm-surface,section,[class*="-panel"],details')].filter(e => e.getBoundingClientRect().height > 30);
  const top = list.filter(e => !list.some(o => o !== e && o.contains(e)));
  return top.slice(0, 40).map(e => {
    const h = e.querySelector('h1,h2,h3,h4,.cpm-panel-title,summary,.cpm-eyebrow');
    const r = e.getBoundingClientRect();
    return { title: (h?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80), cls: (e.getAttribute('class') ?? e.tagName).split(/\s+/)[0], w: Math.round(r.width), h: Math.round(r.height), words: (e.innerText ?? '').split(/\s+/).filter(Boolean).length };
  });
}

/** Focus behaviour of an opened overlay, without activating anything inside it. */
export function focusables({ scope }) {
  const root = document.querySelector(scope);
  if (!root) return { n: 0 };
  const f = [...root.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),obc-button')].filter(e => e.getBoundingClientRect().height > 0 && !e.disabled);
  f.forEach((e, i) => e.setAttribute('data-cap-f', i === 0 ? 'first' : i === f.length - 1 ? 'last' : 'mid'));
  let a = document.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  let inside = false;
  for (let p = a; p; p = p.parentNode || p.host) if (p === root) inside = true;
  return { n: f.length, focusStartsInside: inside };
}

export function focusInside({ scope }) {
  const root = document.querySelector(scope);
  let a = document.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  for (let p = a; p; p = p.parentNode || p.host) if (p === root) return true;
  return false;
}

export function overflowFacts() {
  const d = document.documentElement;
  const m = document.querySelector('.page-content') ?? document.querySelector('main');
  const wide = [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 2).length;
  return { vw: innerWidth, docScrollW: d.scrollWidth, mainScrollW: m?.scrollWidth ?? 0, mainClientW: m?.clientWidth ?? 0, horizontalScroll: d.scrollWidth > innerWidth + 2 || (m ? m.scrollWidth > m.clientWidth + 2 : false), elementsPastEdge: wide, sidebarW: document.querySelector('.app-sidebar')?.getBoundingClientRect().width ?? 0 };
}
