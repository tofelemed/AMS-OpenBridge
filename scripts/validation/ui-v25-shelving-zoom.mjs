// Rendered proof of CHG-032 (episode shelving lifecycle) and CHG-030 phase 5 (drag-rectangle zoom)
// against the RUNNING lab, with real clicks - the unit suites cover the pure parts, this is the
// assembled chrome. Mutates one lab episode (shelve -> acknowledge -> unshelve) and says which.
//
//   node scripts/validation/ui-v25-shelving-zoom.mjs     (env: UI_BASE, UI_USER, UI_PASS, OUT_DIR, AUDIT_LOOP)
//
// Prints one PASS / FAIL line per check and "N passed / M failed" at the end; exit 1 on any FAIL.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.UI_BASE ?? 'http://localhost:3000';
const USER = process.env.UI_USER ?? 'admin';
const PASS = process.env.UI_PASS ?? 'ChangeMe123!';
const OUT = process.env.OUT_DIR ?? join(process.cwd(), 'scripts', 'validation', 'ui-v25-shelving-zoom-out');
const LOOP = process.env.AUDIT_LOOP ?? 'FIC10405';
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`);
}
async function settle(page, ms = 1200) {
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch { /* keep going */ }
  await page.waitForTimeout(ms);
}
// obc-button slots its label as light-DOM text with surrounding whitespace, so an exact match
// is "optional whitespace, the label, optional whitespace" - never a bare ^label$.
const exact = label => new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
const obc = (page, label) => page.locator('obc-button', { hasText: label instanceof RegExp ? label : exact(label) });
const isDisabled = loc => loc.first().evaluate(el => el.disabled === true || el.hasAttribute('disabled'));
const bodyText = page => page.evaluate(() => (document.body.textContent || '').replace(/\s+/g, ' '));

let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failed = [];
  let phase = 'login';
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`[${phase}] ` + m.text().slice(0, 200)); });
  page.on('pageerror', e => consoleErrors.push(`[${phase}] pageerror: ` + String(e).slice(0, 200)));
  page.on('response', r => { if (r.status() >= 400) failed.push(`[${phase}] ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[name="username"], input[autocomplete="username"]', USER);
  await page.fill('input[type="password"]', PASS);
  await page.press('input[type="password"]', 'Enter');
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 });
  await settle(page);
  phase = 'events';

  // ── 1. CHG-032: shelve -> acknowledge (shelf kept) -> unshelve (ack kept) -> history ──
  await page.goto(`${BASE}/cpm/events?filter=open`);   // Shelve… is offered on OPEN episodes only
  await settle(page, 2000);
  const rows = page.locator('.cpm-event-row__select');
  const n = await rows.count();
  let picked = null;
  for (let i = 0; i < Math.min(n, 25) && !picked; i++) {
    await rows.nth(i).click();
    await page.waitForTimeout(500);
    const shelve = obc(page, 'Shelve…');
    if (await shelve.count() && !(await isDisabled(shelve))) {
      const text = await bodyText(page);
      picked = (text.match(/EVT-(\d+)/) || [])[1] ?? String(i);
    }
  }
  check('events: an open, unshelved episode with an enabled Shelve… button exists', !!picked, picked ? `EVT-${picked} of ${n} rows` : `${n} rows`);
  if (picked) {
    await obc(page, 'Shelve…').first().click();
    await page.waitForTimeout(400);
    const panel = page.locator('[role="group"][aria-label="Shelve this episode"]');
    check('shelve panel opens with presets and a required reason', await panel.count() === 1);
    await panel.locator('input.cpm-input').last().fill('pre-prod browser pass 2026-09-25');
    await page.waitForTimeout(200);
    const shelveNow = obc(page, 'Shelve');
    check('shelve button enables once a reason is typed', await shelveNow.count() === 1 && !(await isDisabled(shelveNow)));
    await shelveNow.first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, '01-shelved.png') });
    let text = await bodyText(page);
    check('after Shelve: detail shows the Shelved pill and the button reads Update shelf…', /Shelved/.test(text) && await obc(page, 'Update shelf…').count() === 1);

    const ack = obc(page, 'Acknowledge');
    check('acknowledge stays available on a shelved episode', await ack.count() === 1 && !(await isDisabled(ack)));
    await ack.first().click();
    await page.waitForTimeout(1500);
    text = await bodyText(page);
    check('after Acknowledge: Acknowledged pill AND the shelf kept (Update shelf… still offered)', /Acknowledged/.test(text) && await obc(page, 'Update shelf…').count() === 1);

    await obc(page, 'Unshelve…').first().click();
    await page.waitForTimeout(400);
    const upanel = page.locator('[role="group"][aria-label="Unshelve this episode"]');
    check('unshelve panel opens and says the episode stays acknowledged', await upanel.count() === 1 && /stays acknowledged/.test(await upanel.textContent()));
    await upanel.locator('input.cpm-input').fill('pre-prod browser pass - unshelve');
    await obc(page, 'Unshelve').first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, '02-unshelved.png') });
    text = await bodyText(page);
    check('after Unshelve: shelf ended (Shelve… offered again) and the acknowledgement kept', await obc(page, 'Shelve…').count() === 1 && /Acknowledged/.test(text));

    await obc(page, 'History ›').first().click();
    await page.waitForTimeout(1500);
    const hist = page.locator('[role="list"][aria-label="Operator history"]');
    const histText = (await hist.count()) ? (await hist.first().textContent()) : '';
    const histRows = (await hist.count()) ? await hist.first().locator('.cpm-kv, [class*="kv"], li, div[role="listitem"]').count() : 0;
    check('History › lists the shelve, acknowledge and unshelve actions', /SHELVED|Shelved/.test(histText) && /ACKNOWLEDGED|Acknowledged/.test(histText) && /UNSHELVED|Unshelved/.test(histText), `${histRows} rows`);
    await page.screenshot({ path: join(OUT, '03-history.png') });
  }

  // ── 2. CHG-030 phase 5: drag-rectangle zoom on the Historical trend ──
  phase = 'historical';
  await page.goto(`${BASE}/cpm/historical?loop=${LOOP}`);
  await settle(page, 3000);
  const zoomArea = obc(page, 'Zoom area');
  check('historical: a Zoom area button is rendered and enabled', await zoomArea.count() >= 1 && !(await isDisabled(zoomArea)));
  const resetBtn = obc(page, 'Reset');
  check('historical: Reset is disabled before any zoom', await resetBtn.count() >= 1 && await isDisabled(resetBtn));
  await zoomArea.first().click();
  await page.waitForTimeout(300);
  check('zoom mode announces itself (Zoom area · on)', await obc(page, 'Zoom area · on').count() >= 1);
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.30, box.y + box.height * 0.30);
    await page.mouse.down();
    for (let s = 1; s <= 10; s++) await page.mouse.move(box.x + box.width * (0.30 + 0.03 * s), box.y + box.height * (0.30 + 0.03 * s));
    await page.mouse.up();
    await page.waitForTimeout(800);
  }
  check('a dragged rectangle zooms the chart (Reset becomes enabled)', !!box && !(await isDisabled(resetBtn)), box ? `canvas ${Math.round(box.width)}x${Math.round(box.height)}` : 'no canvas');
  await page.screenshot({ path: join(OUT, '04-zoomed.png') });
  const undoBtn = obc(page, 'Undo');
  check('Undo is offered after a zoom', await undoBtn.count() >= 1 && !(await isDisabled(undoBtn)));
  await resetBtn.first().click();
  await page.waitForTimeout(500);
  check('Reset returns to the whole range (Reset disabled again)', await isDisabled(resetBtn));

  // ── 3. CHG-030 phase 7: System Response layout stays contained ──
  phase = 'response';
  await page.goto(`${BASE}/cpm/response?loop=FIC10302`);
  await settle(page, 3000);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('response: no horizontal overflow at 1600 px', overflow <= 2, `${overflow}px`);
  const contained = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const r = main.getBoundingClientRect();
    let worst = 0;
    for (const el of main.querySelectorAll('table, .cpm-kv, [class*="catalogue"], [class*="aside"]')) {
      const b = el.getBoundingClientRect();
      if (b.width > 0) worst = Math.max(worst, b.right - r.right);
    }
    return Math.round(worst);
  });
  check('response: tables, key/value rows and the aside stay inside the main column', contained <= 2, `${contained}px past the edge`);
  await page.screenshot({ path: join(OUT, '05-response.png') });

  // The SPA's bootstrap asks /api/auth/refresh before anyone is logged in; that 401 is expected on the login page.
  const afterLogin = x => !x.startsWith('[login]');
  check('no console or page errors after login', consoleErrors.filter(afterLogin).length === 0, consoleErrors.filter(afterLogin).slice(0, 3).join(' | '));
  check('no failed API responses after login', failed.filter(afterLogin).length === 0, failed.filter(afterLogin).slice(0, 3).join(' | ') || (failed.length ? `pre-login only: ${failed.join(' | ')}` : ''));
} catch (e) {
  check('probe completed without an exception', false, String(e).slice(0, 300));
} finally {
  if (browser) await browser.close();
}
const passed = results.filter(r => r.ok).length;
const failed = results.length - passed;
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
console.log(`${passed} passed / ${failed} failed`);
process.exit(failed ? 1 : 0);
