// Page overflow can read 0 while a control is clipped at the edge, so this measures every control against the screen.
// Read-only: runs under the guard and only opens pages. Add a destination to `routes` in the step that ships it.
// Credentials come only from the environment.
import { chromium, requireEnv, login, goto, trackNetwork, waitStable } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';
const env = requireEnv();
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const net = trackNetwork(p);
const guard = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
await installGuard(p, guard, { ratePerMin: 60 });
await login(p, env);
const LOOP = 'B2_027PIC';
const routes = ['/cpm', '/cpm?review=stale', '/cpm?review=all', '/cpm/performance', '/cpm/events', ...['summary', 'historical', 'diagnosis', 'model', 'signals', 'history', 'calculations'].map(t => `/cpm/loop?tab=${t}&loop=${LOOP}`),
  ...['gates', 'replay', 'windows', 'calculations'].map(t => `/cpm/evidence?tab=${t}&loop=FIC00701`),
  ...['loops', 'configuration', 'plant-model', 'data-sources', 'tag-aliases'].map(t => `/cpm/setup?tab=${t}`),
  ...['pipeline', 'governance', 'users', 'roles', 'audit', 'settings'].map(t => `/cpm/system?tab=${t}`)];
const bad = [];
let n = 0;
for (const w of [390, 768]) {
  await p.setViewportSize({ width: w, height: w > 800 ? 1024 : 844 });
  for (const r of routes) {
    await goto(p, r); await waitStable(p, net, { timeout: 12000, quietMs: 400 }); await p.waitForTimeout(250); n++;
    const off = await p.evaluate(() => {
      const scrolls = e => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if ((o === 'auto' || o === 'scroll') && a.scrollWidth > a.clientWidth) return true; } return false; };
      return [...document.querySelectorAll('#main-content select, #main-content input, #main-content button, #main-content obc-button, #main-content a, #main-content h1, #main-content h2')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > innerWidth + 1 && !scrolls(e); })
        .slice(0, 4).map(e => `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]} "${(e.textContent || '').trim().slice(0, 24)}" right=${Math.round(e.getBoundingClientRect().right)}`);
    });
    if (off.length) bad.push(`${w} ${r}: ${off.join(' | ')}`);
  }
}
console.log(`${n} views, ${bad.length} with a control off the screen`);
console.log(bad.join('\n'));
console.log(JSON.stringify({ blocked: guard.blocked.length }));
await b.close();
