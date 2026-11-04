#!/usr/bin/env node
// Which interaction states each CSS class family implements, and its declared geometry, over the live stylesheets.
// Read-only over src/frontend-ob/src; writes docs/theme/deep/data/component-states.json.
// Usage: node docs/theme/tools/component-states.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const src = path.join(repo, 'src/frontend-ob/src');
const perFile = JSON.parse(fs.readFileSync(path.join(repo, 'docs/theme/data/source-inventory.json'), 'utf8')).perFile;
const out = path.join(repo, 'docs/theme/deep/data/component-states.json');
const liveCss = Object.keys(perFile).filter(f => f.endsWith('.css') && perFile[f].group !== 'legacy');

const FAMILIES = ['cpm-pill', 'cpm-facet', 'cpm-kpicard', 'cpm-kpi', 'cpm-surface', 'cpm-panel-head', 'cpm-kv', 'cpm-empty', 'cpm-skeleton',
  'cpm-table', 'cpm-matrix', 'cpm-config-table', 'cpm-signal-table', 'cpm-kpi-table', 'cpm-rbac', 'cpm-checks',
  'cpm-event-row', 'cpm-queue-row', 'cpm-attention', 'cpm-row-click', 'cpm-trail-row', 'cpm-ranked',
  'cpm-select', 'cpm-input', 'cpm-textarea', 'ob-input', 'cpm-field', 'cpm-check', 'cpm-sort-head',
  'cpm-inspector', 'cpm-modal', 'cpm-modal-backdrop', 'dialog-overlay', 'dialog-content', 'dialog-header', 'dialog-footer', 'form-field',
  'cmdk', 'nav-item', 'nav-section', 'cpm-gate-chip', 'cpm-gate-strip', 'cpm-wizard-step', 'cpm-combo', 'cpm-tabs', 'cpm-link',
  'cpm-help-toggle', 'cpm-reasoned', 'chart-zoombar', 'cpm-range-bar', 'cpm-hist-stepper', 'trend-core__rbtn', 'cpm-pen-chip',
  'app-topbar', 'cpm-crumbs', 'cpm-rail', 'cpm-config-gate', 'cpm-config-bundle', 'cpm-gate-outcome', 'cpm-receipt', 'cpm-explain',
  'cpm-context', 'cpm-loop-context', 'cpm-tree', 'cpm-matrix-toolbar', 'cpm-matrix-pager', 'cpm-copyable', 'cpm-id'];

const STATE = {
  hover: /:hover/,
  focus: /:focus(?!-visible|-within)/,
  focusVisible: /:focus-visible/,
  focusWithin: /:focus-within/,
  active: /:active/,
  disabled: /:disabled|\[disabled\]|\[aria-disabled|--disabled/,
  selected: /\[aria-selected|\[aria-pressed|\[aria-current|--selected|--active\b|--on\b|\[data-selected/,
  invalid: /:invalid|\[aria-invalid|--error|--invalid/,
  loading: /--loading|\[aria-busy/,
};
const GEOMETRY = /^(height|min-height|max-height|width|min-width|max-width|padding|border-radius|font-size|font-variant-numeric|gap)$/;

const rules = [];
for (const f of liveCss) {
  const raw = fs.readFileSync(path.join(src, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of raw.matchAll(re)) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (selector.startsWith('@')) continue;
    const decls = m[2].split(';').map(d => d.trim()).filter(Boolean).map(d => {
      const i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    });
    rules.push({ file: f, selector, decls });
  }
}

const families = {};
for (const fam of FAMILIES) {
  const needle = new RegExp(`\\.${fam}(?![\\w-])|\\.${fam}(?:__|--)[\\w-]+`);
  const hits = rules.filter(r => r.selector.split(',').some(s => needle.test(s)));
  const states = {};
  for (const [name, re] of Object.entries(STATE)) {
    const sel = hits.flatMap(r => r.selector.split(',').map(s => s.trim()).filter(s => needle.test(s) && re.test(s)));
    if (sel.length) states[name] = sel.length;
  }
  const base = hits.filter(r => r.selector.split(',').some(s => new RegExp(`^(?:[\\w.\\s>#-]*\\s)?\\.${fam}$`).test(s.trim())));
  const geometry = {};
  for (const r of base) for (const [p, v] of r.decls) if (GEOMETRY.test(p)) (geometry[p] ??= []).includes(v) || geometry[p].push(v);
  families[fam] = { rules: hits.length, files: [...new Set(hits.map(h => h.file))], states, geometry };
}

// Global defaults: a family with no focus rule of its own may still inherit one of these.
const globalRules = rules.filter(r => r.selector.split(',').some(s => /^(?:[\w.\s>#*-]*\s)?(?:\*|button|input|select|textarea|a|:focus|:focus-visible|\[tabindex[^\]]*\])(?::[\w-]+)*$/.test(s.trim()) && /:focus|:hover|:disabled/.test(s)))
  .map(r => ({ file: r.file, selector: r.selector, decls: r.decls.map(d => d.join(': ')) }));

const partRules = rules.filter(r => /::part\(/.test(r.selector)).map(r => ({ file: r.file, selector: r.selector }));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedBy: 'docs/theme/tools/component-states.mjs', stylesheets: liveCss, ruleCount: rules.length, families, globalRules, partRules }, null, 1));
console.log(`rules ${rules.length}, stylesheets ${liveCss.length}`);
for (const [k, v] of Object.entries(families)) console.log(k.padEnd(20), String(v.rules).padStart(3), JSON.stringify(v.states), JSON.stringify(v.geometry));
console.log('\nGLOBAL'); for (const g of globalRules) console.log(g.file, g.selector, g.decls.join('; ').slice(0, 120));
console.log('\nPARTS', partRules.length);
