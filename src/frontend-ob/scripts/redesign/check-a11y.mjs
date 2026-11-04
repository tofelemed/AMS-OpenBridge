#!/usr/bin/env node
// PRM-004 gate: axe on the destinations built so far, in both themes: 0 critical, 0 serious.
// Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD and a production build. Read-only: the guard stays on.
// Add a destination to ROUTES in the phase that ships it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const lib = f => pathToFileURL(path.join(repo, 'docs/theme/tools/lib', f)).href;
const { axeSource, chromium, requireEnv, login, goto, setTheme, trackNetwork, waitStable } = await import(lib('session.mjs'));
const { installGuard } = await import(lib('guard.mjs'));

const phase = process.env.THEME_PHASE ?? '4';
const out = path.join(repo, `docs/theme/redesign/evidence/phase-${phase}`);

const ROUTES = [
  { name: 'Overview', url: '/cpm' },
  { name: 'Overview, filtered', url: '/cpm?review=stale' },
  { name: 'Overview, loop selected', url: '/cpm?review=stale&loop=FIC10302' },
  { name: 'Performance', url: '/cpm/performance' },
  { name: 'Performance, matrix', url: '/cpm/performance?view=matrix' },
  { name: 'Episodes', url: '/cpm/events' },
];

const env = requireEnv();
const log = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1024 } })).newPage();
const net = trackNetwork(page);
await installGuard(page, log, { ratePerMin: 50 });
await login(page, env);

const results = [];
for (const route of ROUTES) {
  for (const theme of ['day', 'night']) {
    await goto(page, route.url);
    await page.waitForTimeout(300);
    await waitStable(page, net, { timeout: 12000, quietMs: 400 });
    await setTheme(page, theme);
    await page.evaluate(src => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s); } }, axeSource);
    const violations = await page.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, count: v.nodes.length, target: v.nodes[0]?.target?.join(' ')?.slice(0, 100), help: v.help }));
    });
    results.push({ ...route, theme, violations });
  }
}
await setTheme(page, 'day');
await browser.close();

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'axe.json'), JSON.stringify(results, null, 1));

let failed = 0;
for (const r of results) {
  const bad = r.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
  failed += bad.length;
  for (const v of bad) console.error(`${r.name} (${r.theme}): ${v.impact} ${v.id} × ${v.count}: ${v.target}`);
}
const minor = results.reduce((n, r) => n + r.violations.filter(v => v.impact !== 'critical' && v.impact !== 'serious').length, 0);
console.log(`check-a11y: ${results.length} scans, critical or serious ${failed}, moderate or minor ${minor}, blocked ${log.blocked.length}`);
process.exit(failed ? 1 : 0);
