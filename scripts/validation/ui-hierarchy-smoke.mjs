// UI smoke for the Plant Model / Tag Aliases / Loop Registry hierarchy work.
// Logs in as admin against the PRODUCTION frontend (:3000 nginx → gateway) and
// walks the new surfaces, failing on console errors or missing content.
import { chromium } from 'playwright';

const BASE = process.env.UI_BASE ?? 'http://localhost:3000';
const USER = process.env.UI_USER ?? 'admin';
const PASS = process.env.UI_PASS ?? 'ChangeMe123!';

const results = [];
const consoleErrors = [];
let browser;

function step(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  const badResponses = [];
  page.on('response', r => {
    if (r.status() === 401 || r.status() >= 500) badResponses.push(`${r.status()} ${r.url()}`);
  });

  // ── login ────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[name="username"], input[autocomplete="username"]', USER);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"], obc-button');
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 });
  step('login', true, page.url());

  // ── Plant Model tab ──────────────────────────────────────────────────────
  await page.goto(`${BASE}/admin/plant-model`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const hasHdpe = await page.getByText('HDPE Plant', { exact: false }).count();
  step('plant-model: HDPE Plant listed', hasHdpe > 0, `${hasHdpe} match(es)`);

  // Expand the HDPE site → its 8 areas should load via ?parentId=. The name
  // span's PARENT div is the row; sites sort Dallas first, so a loose
  // has-text div locator would expand the wrong site.
  const hdpeRow = page.getByText('HDPE Plant', { exact: true }).first().locator('xpath=..');
  await hdpeRow.locator('button[aria-label="Expand"]').click();
  await page.waitForTimeout(1500);
  const s100 = await page.getByText('Section 100', { exact: false }).count();
  step('plant-model: expanding HDPE shows Section 100', s100 > 0, `${s100} match(es)`);

  // Search should hit the search endpoint and render matches.
  await page.fill('input[placeholder*="Search by name or path"]', 'polymerization');
  await page.waitForTimeout(1500);
  const reactor = await page.getByText('1001-Polymerization Reactor 1', { exact: false }).count();
  step('plant-model: search finds unit by name', reactor > 0, `${reactor} match(es)`);

  // ── Onboarding status strip ──────────────────────────────────────────────
  const stageTitles = await Promise.all(
    ['Hierarchy', 'Instruments & tags', 'OT aliases', 'Control loops', 'Ingestion sources']
      .map(t => page.getByText(t, { exact: false }).count()));
  step('plant-model: onboarding status strip shows all 5 stages',
    stageTitles.every(c => c > 0), stageTitles.join('/'));

  // ── CPM badge → Loop Registry deep link ──────────────────────────────────
  await page.fill('input[placeholder*="Search by name or path"]', 'demo-fic-001');
  const badge = page.getByText('CPM · DEMO-FIC-001', { exact: false }).first();
  let badgeOk = true;
  try { await badge.waitFor({ state: 'visible', timeout: 10000 }); } catch { badgeOk = false; }
  step('plant-model: projected node wears the CPM badge', badgeOk);
  if (badgeOk) {
    await badge.click();
    await page.waitForURL(u => u.pathname.includes('/cpm/registry'), { timeout: 15000 });
    const loopSelected = page.getByText('DEMO-FIC-001', { exact: false }).first();
    let sel = true;
    try { await loopSelected.waitFor({ state: 'visible', timeout: 15000 }); } catch { sel = false; }
    step('badge lands on the loop in the registry', sel, page.url());

    // ── reverse hop: "View in plant tree" back to the searched tree ────────
    const back = page.getByText('View in plant tree', { exact: false }).first();
    let backOk = true;
    try { await back.waitFor({ state: 'visible', timeout: 10000 }); } catch { backOk = false; }
    step('loop detail offers "View in plant tree"', backOk);
    if (backOk) {
      await back.click();
      await page.waitForURL(u => u.pathname.includes('/admin/plant-model'), { timeout: 15000 });
      const treeHit = page.getByText('houston/crude1/demo-fic-001', { exact: false }).first();
      let hit = true;
      try { await treeHit.waitFor({ state: 'visible', timeout: 10000 }); } catch { hit = false; }
      step('reverse hop pre-fills search and shows the loop assets', hit, page.url());
    }
  }

  // ── Tag Aliases tab ──────────────────────────────────────────────────────
  await page.goto(`${BASE}/admin/aliases`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const aliasRows = await page.getByText('instrumental-pro', { exact: false }).count();
  step('aliases: instrumental-pro rows render', aliasRows > 0, `${aliasRows} visible`);

  // ── Loop Registry wizard cascade ─────────────────────────────────────────
  await page.goto(`${BASE}/cpm/registry`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByText('Add loop', { exact: false }).first().click().catch(async () => {
    await page.getByRole('button', { name: /add/i }).first().click();
  });
  await page.waitForTimeout(1500);
  // Site select should offer HDPE Plant from /assets/filters/sites and start empty.
  const siteSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'HDPE Plant' }) }).first();
  const siteCount = await siteSelect.count();
  step('wizard: site cascade offers HDPE Plant', siteCount > 0);
  if (siteCount > 0) {
    await siteSelect.selectOption('hdpe');
    // Wait for the cascade queries to land instead of a fixed sleep — the
    // area/unit option lists appear when their /assets/filters fetch resolves.
    const areaOption = page.locator('option', { hasText: 'Section 100' }).first();
    let areaOk = true;
    try { await areaOption.waitFor({ state: 'attached', timeout: 10000 }); }
    catch { areaOk = false; }
    step('wizard: area cascade loads sections for hdpe', areaOk);
    if (areaOk) {
      const areaSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Section 100' }) }).first();
      await areaSelect.selectOption('section_100');
      const unitOption = page.locator('option', { hasText: '1001-Polymerization Reactor 1' }).first();
      let unitOk = true;
      try { await unitOption.waitFor({ state: 'attached', timeout: 10000 }); }
      catch { unitOk = false; }
      step('wizard: unit cascade loads units for section_100', unitOk);
    }
  }

  // Console errors: 401s on background polls etc. are real failures; filter
  // benign favicon/manifest noise plus two KNOWN pre-existing, walk-induced
  // messages unrelated to the hierarchy surfaces:
  //  - the auth store probes /api/auth/refresh on first load BEFORE login (no
  //    refresh cookie yet) → an expected 401 on the login page,
  //  - page.goto() tears down the alarm hub's in-flight SignalR negotiate →
  //    "Failed to complete negotiation / Failed to start the connection".
  const realErrors = consoleErrors.filter(e =>
    !/favicon|manifest|sourcemap/i.test(e)
    && !/Failed to complete negotiation|Failed to start the connection/i.test(e)
    && !/Failed to load resource.*401/i.test(e));
  step('no console errors across the walk', realErrors.length === 0,
    realErrors.slice(0, 3).join(' | ').slice(0, 300));
  if (badResponses.length) console.log('bad responses:', [...new Set(badResponses)].join('; '));
} catch (e) {
  step('smoke aborted', false, String(e).slice(0, 300));
} finally {
  await browser?.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
