// Proves the app keeps its sizes (owner rule, keep-current-app-sizes): font sizes, padding, control and chart heights.
// `--capture` stores what the running build uses. Without it, any value the baseline never had is a difference.
// Read-only under the guard. Credentials come only from the environment.
// Exception: the PV, SP, OP, Mode row uses its own classes, so it is not measured here.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, requireEnv, login, goto, trackNetwork, waitStable } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';
import { PAGES, openPage } from './lib/baseline-pages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '../redesign/baseline/sizes.json');
const CAPTURE = process.argv.includes('--capture');

/** What is measured on each kind of element. Heights only where wrapped text cannot change them. */
const RULES = [
  { name: 'panel', selector: '.cpm-surface', props: ['paddingTop', 'paddingLeft', 'borderRadius'] },
  { name: 'kpi', selector: '.cpm-kpi, .cpm-kpicard', props: ['paddingTop', 'paddingLeft', 'fontSize'] },
  { name: 'table cell', selector: '.cpm-table td, .cpm-table th', props: ['fontSize', 'paddingTop', 'paddingLeft'] },
  { name: 'button', selector: 'obc-button', props: ['height'] },
  { name: 'select', selector: '#main-content select', props: ['fontSize', 'height'] },
  { name: 'page heading', selector: '#main-content h1', props: ['fontSize'] },
  { name: 'section heading', selector: '#main-content h2, #main-content h3', props: ['fontSize'] },
  { name: 'body text', selector: '#main-content p', props: ['fontSize'] },
  { name: 'chart', selector: '#main-content canvas', props: ['height'] },
];

const measure = rules => {
  const shown = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const out = {};
  for (const rule of rules) {
    out[rule.name] = {};
    for (const prop of rule.props) {
      const seen = new Set();
      for (const e of document.querySelectorAll(rule.selector)) {
        if (shown(e)) seen.add(getComputedStyle(e)[prop]);
      }
      out[rule.name][prop] = [...seen];
    }
  }
  return out;
};

const env = requireEnv();
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1024 } })).newPage();
const net = trackNetwork(p);
const guard = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
await installGuard(p, guard, { ratePerMin: 120, burst: 60 });
await login(p, env);

const seen = {};
for (const { key, before, after } of PAGES) {
  await openPage(p, net, goto, waitStable, CAPTURE ? before : after);
  const got = await p.evaluate(measure, RULES);
  for (const [name, props] of Object.entries(got)) {
    for (const [prop, values] of Object.entries(props)) {
      const slot = ((seen[name] ??= {})[prop] ??= {});
      for (const v of values) (slot[v] ??= []).push(key);
    }
  }
}
await b.close();

if (CAPTURE) {
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(seen, null, 1)}\n`);
  console.log(`baseline written: ${FILE}`);
  process.exit(0);
}

if (!existsSync(FILE)) { console.error('No baseline. Run with --capture on the old build first.'); process.exit(2); }
const base = JSON.parse(readFileSync(FILE, 'utf8'));
const diffs = [];
for (const [name, props] of Object.entries(seen)) {
  for (const [prop, values] of Object.entries(props)) {
    for (const [value, pages] of Object.entries(values)) {
      if (!(value in (base[name]?.[prop] ?? {}))) diffs.push(`${name}.${prop} = ${value} on ${pages.join(', ')}`);
    }
  }
}
// A size kept on purpose is listed, with its reason, in size-exceptions.json.
const kept = new Set(JSON.parse(readFileSync(path.resolve(here, '../redesign/baseline/size-exceptions.json'), 'utf8')).exceptions.map(e => e.entry));
const open = diffs.filter(d => !kept.has(d));
console.log(open.length ? open.join('\n') : '0 differences from the baseline');
process.exit(open.length ? 1 : 0);
