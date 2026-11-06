// Proves no function is lost: every control the old build showed must still exist, or be named in text-changes.md.
// `--capture` stores the controls of the running build. Without it, a control found on no page is reported, unless
// text-changes.md names it (a control moved into a dialog is listed there, with where it went).
// Read-only under the guard. Credentials come only from the environment.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, requireEnv, login, goto, trackNetwork, waitStable } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';
import { PAGES, openPage } from './lib/baseline-pages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '../redesign/baseline/controls.json');
const TEXT = path.resolve(here, '../redesign/text-changes.md');
const CAPTURE = process.argv.includes('--capture');

/** Counts, arrows and case differ between builds, so a control's identity drops them. */
const normal = s => s.toLowerCase().replace(/[›→↗↑↓‹←]/g, '').replace(/[\d.,%]+/g, '').replace(/\s+/g, ' ').trim();

const controls = () => {
  const main = document.querySelector('#main-content') ?? document.body;
  const clean = t => (t ?? '').replace(/\s+/g, ' ').trim();
  const shown = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const named = e => clean(e.getAttribute('aria-label')) || clean(e.textContent);
  const fields = [...main.querySelectorAll('select, input:not([type=hidden]), textarea')].filter(shown)
    .map(e => clean(e.getAttribute('aria-label')) || clean(e.getAttribute('placeholder')) || clean(e.name));
  const actions = [...main.querySelectorAll('a[href], button, obc-button, [role=tab], th')].filter(shown).map(named);
  return [...fields, ...actions].filter(t => t && t.length < 60);
};

const env = requireEnv();
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1024 } })).newPage();
const net = trackNetwork(p);
const guard = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
await installGuard(p, guard, { ratePerMin: 120, burst: 60 });
await login(p, env);

const byPage = {};
for (const { key, before, after } of PAGES) {
  await openPage(p, net, goto, waitStable, CAPTURE ? before : after);
  byPage[key] = [...new Set((await p.evaluate(controls)).map(normal))].filter(Boolean).sort();
}
await b.close();

if (CAPTURE) {
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(byPage, null, 1)}\n`);
  console.log(`baseline written: ${FILE}`);
  process.exit(0);
}

if (!existsSync(FILE)) { console.error('No baseline. Run with --capture on the old build first.'); process.exit(2); }
const base = JSON.parse(readFileSync(FILE, 'utf8'));
const listed = normal(readFileSync(TEXT, 'utf8'));
const now = new Set(Object.values(byPage).flat());
const missing = [];
for (const [key, names] of Object.entries(base)) {
  for (const name of names) {
    if (!now.has(name) && !listed.includes(name)) missing.push(`${key}: ${name}`);
  }
}
console.log(missing.length ? missing.join('\n') : 'every baseline control has a place');
process.exit(missing.length ? 1 : 0);
