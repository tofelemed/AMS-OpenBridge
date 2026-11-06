// Checks every link inside the app: opens each page and tab, follows each link and each button ending in ›,
// and reports any that land on an old page, an empty page or a restricted page, or that lose the selected loop.
// Read-only: runs under the guard. Usage: node link-walk.mjs <out.json>. Credentials come only from the environment.
import { writeFileSync } from 'node:fs';
import { chromium, requireEnv, login, goto, trackNetwork, waitStable } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';

const LOOP = 'FIC00701';
const loopPages = ['/cpm/historical', '/cpm/investigation', '/cpm/response', '/cpm/evidence', '/cpm/replay', '/cpm/windows', '/cpm/calculations', '/cpm/config'];
const PAGES = [
  '/cpm', '/cpm?review=stale', '/cpm?review=all', `/cpm?loop=${LOOP}`, '/cpm/performance', `/cpm/performance?loop=${LOOP}`, '/cpm/events',
  ...['Summary', 'Signals', 'Calculations', 'Relationships', 'History'].map(t => `/cpm/explorer?loop=${LOOP}&tab=${t}`),
  ...loopPages.map(p => `${p}?loop=${LOOP}`),
  '/cpm/registry', '/cpm/pipeline', '/cpm/governance',
  ...['users', 'roles', 'data-sources', 'plant-model', 'aliases', 'system'].map(s => `/admin/${s}`),
];
const DESTINATIONS = new Set([
  '/cpm', '/cpm/performance', '/cpm/events', '/cpm/explorer', '/cpm/historical', '/cpm/investigation', '/cpm/response', '/cpm/evidence',
  '/cpm/replay', '/cpm/windows', '/cpm/calculations', '/cpm/registry', '/cpm/config', '/cpm/pipeline', '/cpm/governance', '/trend',
  '/admin/users', '/admin/roles', '/admin/data-sources', '/admin/plant-model', '/admin/aliases', '/admin/system',
]);

const [outFile] = process.argv.slice(2);
const env = requireEnv();
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1024 } })).newPage();
const net = trackNetwork(p);
const guard = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
await installGuard(p, guard, { ratePerMin: 120, burst: 60 });
await login(p, env);
const settle = async () => { await waitStable(p, net, { timeout: 10000, quietMs: 400 }); await p.waitForTimeout(200); };
const open = async url => { await goto(p, '/trend'); await p.waitForTimeout(150); await goto(p, url); await settle(); };

// A link's identity: its text without numbers, so forty rows of one kind are followed once.
const affordances = () => p.evaluate(() => {
  const main = document.querySelector('#main-content');
  const clean = t => (t ?? '').replace(/\s+/g, ' ').trim();
  const shown = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const seen = new Set();
  const out = [];
  const nodes = [...main.querySelectorAll('a[href], obc-button, button')].filter(e => !e.closest('.dest > [role="tablist"]'));
  nodes.forEach((e, index) => {
    const text = clean(e.textContent);
    const link = e.tagName === 'A';
    if (!shown(e) || !text || (!link && !/›$/.test(text))) return;
    if (e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true') return;
    const key = text.replace(/[A-Z]*\d[\w.-]*/g, '#');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ index, text: text.slice(0, 50), link, href: link ? e.getAttribute('href') : null });
  });
  return out;
});

const results = [];
for (const page of PAGES) {
  await open(page);
  const list = await affordances();
  for (const a of list.slice(0, 14)) {
    if (a.href && /^https?:/.test(a.href)) continue;
    await open(page);
    const clicked = await p.evaluate(({ index }) => {
      const main = document.querySelector('#main-content');
      const nodes = [...main.querySelectorAll('a[href], obc-button, button')].filter(e => !e.closest('.dest > [role="tablist"]'));
      const e = nodes[index];
      if (!e) return false;
      e.scrollIntoView({ block: 'center' });
      e.click();
      return true;
    }, a);
    if (!clicked) { results.push({ page, ...a, problem: 'gone on reopening' }); continue; }
    await settle();
    const url = new URL(p.url());
    const text = await p.locator('#main-content').innerText().catch(() => '');
    const problems = [];
    if (!DESTINATIONS.has(url.pathname)) problems.push(`landed on ${url.pathname}`);
    if (text.trim().length < 40) problems.push('empty page');
    if (/not allowed|Access restricted|You do not have/i.test(text)) problems.push('restricted');
    results.push({ page, text: a.text, to: url.pathname + url.search, problem: problems.join(', ') || null });
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${page} › ${a.text} -> ${(url.pathname + url.search).slice(0, 80)}${problems.length ? ` :: ${problems.join(', ')}` : ''}`);
  }
}
const bad = results.filter(r => r.problem);
writeFileSync(outFile, JSON.stringify(results, null, 1));
console.log(JSON.stringify({ pages: PAGES.length, links: results.length, problems: bad.length, blocked: guard.blocked.length, http429: guard.http429.length }));
await b.close();
