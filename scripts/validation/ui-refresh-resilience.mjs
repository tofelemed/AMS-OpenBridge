// Browser proof of the SPA's refresh resilience (2026-09-17), run against the lab frontend:
//   A. with Redis PAUSED (a stall) a fresh page load of a logged-in session lands on the app, not
//      on the login form, and the page's data calls answer (the gateway's session class fails open)
//   B. independently of the gateway: /api/auth/refresh is intercepted to answer 429 (Retry-After 1)
//      twice, then passed through - the SPA's bootstrap retries and still lands on the app
//   C. /api/auth/refresh answers 401 - the SPA ends the session and shows the login form (the
//      terminal case still terminates)
// Run from scripts/validation:  MSYS_NO_PATHCONV=1 node ui-refresh-resilience.mjs [outDir]
//   env: UI_BASE, UI_USER, UI_PASS, REDIS_CONTAINER (default ams-redis), SKIP_REDIS=1 to skip A
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.UI_BASE ?? 'http://localhost:3000';
const REDIS = process.env.REDIS_CONTAINER ?? 'ams-redis';
const [outDir = '.'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
const docker = (...args) => { try { execFileSync('docker', args, { stdio: 'ignore' }); } catch { /* already in that state */ } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const calls = [];
page.on('response', r => { if (r.url().includes('/api/')) calls.push({ url: r.url().replace(BASE, ''), status: r.status() }); });

const onApp = async () => {
  try { await page.waitForSelector('.cpm-screen, nav, main .cpm-surface', { timeout: 20000 }); return !(await page.locator('input[type="password"]').count()); }
  catch { return false; }
};

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="text"], input[name="username"], input[autocomplete="username"]', process.env.UI_USER ?? 'admin');
await page.fill('input[type="password"]', process.env.UI_PASS ?? 'ChangeMe123!');
await page.press('input[type="password"]', 'Enter');
await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 });
check('login', true);

// ── A. a page load while Redis is paused ─────────────────────────────────────────────────────────
if (!process.env.SKIP_REDIS) {
  docker('pause', REDIS);
  try {
    calls.length = 0;
    const t0 = Date.now();
    await page.goto(`${BASE}/cpm/overview`, { waitUntil: 'domcontentloaded' });
    const app = await onApp();
    const ms = Date.now() - t0;
    const refresh = calls.find(c => c.url.includes('/api/auth/refresh'));
    try { await page.waitForResponse(r => r.url().includes('/api/v1/cpm/'), { timeout: 15000 }); } catch { /* no data call in 15 s */ }
    check('A. page load during the Redis stall lands on the app (session survives)', app, `${ms} ms`);
    check('A. the refresh during the stall answered 200', refresh?.status === 200, `refresh → ${refresh?.status}`);
    check('A. the page\'s data calls answered', calls.some(c => c.url.includes('/api/v1/cpm/') && c.status === 200), `${calls.filter(c => c.status >= 400).length} failed of ${calls.length}`);
    await page.screenshot({ path: join(outDir, 'a-during-stall.png') });
  } finally {
    docker('unpause', REDIS);
  }
}

// ── B. the SPA's own retry: 429 twice, then through ───────────────────────────────────────────────
let refreshHits = 0;
await page.route('**/api/auth/refresh', async route => {
  refreshHits++;
  if (refreshHits <= 2) return route.fulfill({ status: 429, headers: { 'retry-after': '1', 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Rate limit exceeded.' }) });
  return route.continue();
});
{
  const t0 = Date.now();
  await page.goto(`${BASE}/cpm/overview`, { waitUntil: 'domcontentloaded' });
  const app = await onApp();
  check('B. bootstrap rides out two 429s on /refresh and lands on the app', app && refreshHits >= 3, `${refreshHits} refresh attempts, ${Date.now() - t0} ms`);
  await page.screenshot({ path: join(outDir, 'b-after-429s.png') });
}
await page.unroute('**/api/auth/refresh');

// ── C. a terminal answer still ends the session ───────────────────────────────────────────────────
await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'invalid refresh token' }) }));
{
  await page.goto(`${BASE}/cpm/overview`, { waitUntil: 'domcontentloaded' });
  let login = false;
  try { await page.waitForSelector('input[type="password"]', { timeout: 15000 }); login = true; } catch { /* not on the login form */ }
  check('C. a 401 on /refresh ends the session (login form shown)', login);
  await page.screenshot({ path: join(outDir, 'c-after-401.png') });
}
await page.unroute('**/api/auth/refresh');

console.log(`\n=== UI refresh resilience: ${passed} passed, ${failed} failed ===`);
await browser.close();
process.exit(failed ? 1 : 0);
