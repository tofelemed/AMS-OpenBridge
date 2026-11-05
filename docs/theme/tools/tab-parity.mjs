// Proves a page move lost nothing: opens each new tab and the old page it came from in the same build,
// and compares every heading, filter, option, input, button, link, table column and chart.
// Read-only: runs under the guard and clicks only tabs. Usage: node tab-parity.mjs <map.json> <out.json>
// Credentials come only from the environment.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, requireEnv, login, goto, trackNetwork, waitStable } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';

const [mapFile, outFile] = process.argv.slice(2);
const pairs = JSON.parse(readFileSync(mapFile, 'utf8'));
const env = requireEnv();
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1024 } })).newPage();
const net = trackNetwork(p);
const guard = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
await installGuard(p, guard, { ratePerMin: 60 });
await login(p, env);

const read = () => p.evaluate(() => {
  const main = document.querySelector('#main-content') ?? document.body;
  // Numbers are live data, not structure. Option lists of windows and loops change by the minute.
  const clean = t => (t ?? '').replace(/\s+/g, ' ').trim().replace(/\d+/g, '#').slice(0, 90);
  const inNav = e => e.closest('.dest > [role="tablist"], .cpm-tabs');
  const all = s => [...main.querySelectorAll(s)].filter(e => !inNav(e));
  const uniq = l => [...new Set(l.filter(Boolean))].sort();
  const selects = all('select').map(s => {
    const label = clean(s.closest('label')?.querySelector('.cpm-field__label')?.textContent ?? s.getAttribute('aria-label'));
    const opts = [...s.options].map(o => clean(o.textContent));
    return `${label}: ${opts.length > 12 ? `${opts.length > 0 ? 'long list' : ''}` : opts.join(' | ')}`;
  });
  return {
    headings: uniq(all('h1,h2,h3,h4').map(e => clean(e.textContent))),
    labels: uniq(all('.cpm-field__label,legend').map(e => clean(e.textContent))),
    selects: uniq(selects),
    inputs: uniq(all('input,textarea').map(e => `${e.type}:${clean(e.placeholder || e.getAttribute('aria-label') || e.closest('label')?.textContent)}`)),
    buttons: uniq(all('button,obc-button,[role="button"]').map(e => clean(e.getAttribute('aria-label') || e.textContent))),
    links: uniq(all('a').map(e => clean(e.textContent))),
    columns: uniq(all('th,.cpm-event-head > *').map(e => clean(e.textContent))),
    tabs: uniq(all('[role="tab"]').map(e => clean(e.textContent))),
    charts: all('canvas').length,
    panels: all('.cpm-surface').length,
  };
});

const merge = rows => rows.reduce((a, r) => {
  for (const k of Object.keys(r)) {
    if (k === 'panels') a[k] = Math.max(a[k] ?? 0, r[k]); // two old views of one panel are still one panel
    else a[k] = typeof r[k] === 'number' ? (a[k] ?? 0) + r[k] : [...new Set([...(a[k] ?? []), ...r[k]])].sort();
  }
  return a;
}, {});

const open = async (url, expand) => {
  await goto(p, url);
  await waitStable(p, net, { timeout: 30000, quietMs: 1500 }); // a trend still loading reads as a difference
  await p.waitForTimeout(1500);
  if (expand) { await p.locator('#main-content obc-button', { hasText: expand }).first().click(); await p.waitForTimeout(600); }
  return read();
};

const results = [];
// The app carries the loop between pages, so a "no loop" pair must first leave for a page that does not.
const clearContext = async () => { await goto(p, '/trend'); await p.waitForTimeout(400); };
for (const pair of pairs) {
  if (pair.clear) await clearContext();
  const oldRows = [];
  for (const u of pair.old) oldRows.push(await open(u, pair.expand));
  const before = merge(oldRows);
  if (pair.clear) await clearContext();
  const after = await open(pair.new, pair.expand);
  const lost = {}, added = {};
  for (const k of Object.keys(before)) {
    if (Array.isArray(before[k])) {
      const l = before[k].filter(x => !after[k].includes(x));
      const a = after[k].filter(x => !before[k].includes(x));
      if (l.length) lost[k] = l;
      if (a.length) added[k] = a;
    } else if (before[k] !== after[k]) { lost[k] = before[k]; added[k] = after[k]; }
  }
  const count = Object.values(before).reduce((n, v) => n + (Array.isArray(v) ? v.length : v), 0);
  results.push({ tab: pair.name, compared: count, lost, added, seen: before });
  console.log(`${pair.name}: ${count} compared, lost ${JSON.stringify(lost)}, added ${JSON.stringify(added)}`);
}
writeFileSync(outFile, JSON.stringify(results, null, 1));
console.log(JSON.stringify({ tabs: results.length, compared: results.reduce((n, r) => n + r.compared, 0), blocked: guard.blocked.length, http429: guard.http429.length, apiCalls: guard.apiCalls }));
await b.close();
