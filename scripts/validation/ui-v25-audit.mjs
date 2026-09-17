// v2.5 frontend audit: logs in against the lab frontend (:3000 nginx → gateway), records what the
// sidebar actually shows, walks every Loop Performance page plus the three new v2.5 pages, and
// writes one screenshot per page + a JSON report (console errors, failed responses, headings,
// empty states, the workbench launch flow). Read-only; nothing is created or changed.
//
//   node scripts/validation/ui-v25-audit.mjs            (env: UI_BASE, UI_USER, UI_PASS, OUT_DIR,
//                                                        AUDIT_LOOP, AUDIT_RUN, AUDIT_GATE, AUDIT_RESP_LOOP)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.UI_BASE ?? 'http://localhost:3000';
const USER = process.env.UI_USER ?? 'admin';
const PASS = process.env.UI_PASS ?? 'ChangeMe123!';
const OUT = process.env.OUT_DIR ?? join(process.cwd(), 'scripts', 'validation', 'ui-v25-audit-out');
const LOOP = process.env.AUDIT_LOOP ?? 'FIC10405';
const RUN = process.env.AUDIT_RUN ?? '';
const GATE = process.env.AUDIT_GATE ?? 'G5';
const RESP_LOOP = process.env.AUDIT_RESP_LOOP ?? 'FIC10302';
mkdirSync(OUT, { recursive: true });

const report = { base: BASE, startedAt: new Date().toISOString(), sidebar: {}, pages: [], flows: [] };
let browser;

const PAGES = [
  ['overview', '/cpm'],
  ['performance', '/cpm/performance'],
  ['explorer', `/cpm/explorer?loop=${LOOP}`],
  ['historical', `/cpm/historical?loop=${LOOP}`],
  ['windows', `/cpm/windows?loop=${LOOP}`],
  ['replay', `/cpm/replay?loop=${LOOP}`],
  ['evidence-empty', '/cpm/evidence'],
  ['evidence', RUN ? `/cpm/evidence?loop=${LOOP}&methodRun=${RUN}&gate=${GATE}&mode=FIXED` : '/cpm/evidence'],
  ['response', `/cpm/response?loop=${RESP_LOOP}`],
  ['config', '/cpm/config'],
  ['config-loop', `/cpm/config?site=hdpe&scope=LOOP&ref=${RESP_LOOP}`],
  ['investigation', `/cpm/investigation?loop=${LOOP}`],
  ['calculations', `/cpm/calculations?loop=${LOOP}`],
  ['registry', '/cpm/registry'],
  ['events', '/cpm/events'],
  ['pipeline', '/cpm/pipeline'],
  ['governance', '/cpm/governance'],
  ['admin-data-sources', '/admin/data-sources'],
];

async function settle(page, ms = 2500) {
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch { /* keep going */ }
  await page.waitForTimeout(ms);
}

async function facts(page) {
  return page.evaluate(() => {
    const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const headings = [...document.querySelectorAll('h1, h2, h3')].map(txt).filter(Boolean).slice(0, 40);
    const empties = [...document.querySelectorAll('.cpm-empty, .cpm-empty__title, [class*="empty-state"], [class*="EmptyState"]')].map(txt).filter(Boolean).slice(0, 20);
    const body = txt(document.body);
    const flags = ['Error', 'error', 'unavailable', 'Unavailable', '403', '404', '500', 'failed', 'Failed', 'undefined', 'NaN', '[object Object]']
      .map(w => [w, (body.match(new RegExp(w.replace(/[[\]]/g, '\\$&'), 'g')) || []).length]).filter(([, n]) => n > 0);
    const buttons = [...document.querySelectorAll('button, obc-button')].map(txt).filter(t => t && t.length < 60).slice(0, 60);
    const charts = document.querySelectorAll('canvas, .echarts, [_echarts_instance_]').length;
    const tables = document.querySelectorAll('table').length;
    const scrollW = document.documentElement.scrollWidth, clientW = document.documentElement.clientWidth;
    return { title: document.title, headings, empties, flags, buttons, charts, tables, bodyChars: body.length, horizontalOverflow: scrollW > clientW + 2 ? `${scrollW}>${clientW}` : null };
  });
}

try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.VIEWPORT_W ?? 1600), height: Number(process.env.VIEWPORT_H ?? 1000) }, deviceScaleFactor: 1 });   // the app scrolls inside main, so a tall viewport is how a whole page is captured
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failed = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });

  // login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[name="username"], input[autocomplete="username"]', USER);
  await page.fill('input[type="password"]', PASS);
  await page.press('input[type="password"]', 'Enter');   // the visible submit is an obc-button; Enter submits the form
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 });
  await settle(page);

  // sidebar as rendered
  report.sidebar = await page.evaluate(() => {
    const out = {};
    for (const sec of document.querySelectorAll('.nav-section')) {
      const title = (sec.querySelector('.nav-section__title')?.textContent || '').trim();
      out[title] = [...sec.querySelectorAll('.nav-item')].map(b => (b.textContent || '').replace(/\s+/g, ' ').trim());
    }
    return out;
  });
  await page.screenshot({ path: join(OUT, '00-sidebar.png'), fullPage: false });

  for (const [name, path] of PAGES) {
    consoleErrors.length = 0; failed.length = 0;
    const t0 = Date.now();
    let navError = null;
    try { await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) { navError = String(e).slice(0, 200); }
    await settle(page);
    const f = await facts(page);
    const shot = join(OUT, `${name}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    report.pages.push({ name, path, url: page.url().replace(BASE, ''), ms: Date.now() - t0, navError, consoleErrors: [...new Set(consoleErrors)], failed: [...new Set(failed)], ...f, screenshot: shot });
    console.log(`${name.padEnd(20)} ${String(f.headings.length).padStart(2)} headings  ${f.charts} charts  ${f.tables} tables  ${consoleErrors.length} console errors  ${failed.length} failed responses${f.horizontalOverflow ? '  H-OVERFLOW ' + f.horizontalOverflow : ''}`);
  }

  // flow: Performance → gate cell → inspector → Open in workbench
  consoleErrors.length = 0; failed.length = 0;
  const flow = { name: 'performance→cell→workbench', steps: [] };
  await page.goto(`${BASE}/cpm/performance`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3000);
  const cell = page.locator(`button.cpm-matrix__cell[aria-label^="${LOOP}, gate ${GATE}:"]`).first();
  const cellCount = await cell.count();
  flow.steps.push({ step: `matrix cell ${LOOP}/${GATE} present`, ok: cellCount > 0, detail: `${cellCount}` });
  if (cellCount > 0) {
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await settle(page, 2000);
    const inspector = page.locator('.cpm-inspector__actions');
    const insp = await inspector.count();
    flow.steps.push({ step: 'inspector opened', ok: insp > 0, detail: `${insp}` });
    await page.screenshot({ path: join(OUT, 'flow-inspector.png'), fullPage: true });
    const open = page.getByRole('button', { name: /Open in workbench/i }).first();
    const openCount = await open.count();
    let disabled = null;
    if (openCount) disabled = await open.evaluate(el => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true');
    flow.steps.push({ step: 'Open in workbench button', ok: openCount > 0 && !disabled, detail: openCount ? (disabled ? 'present but DISABLED (cell has no run id)' : 'enabled') : 'absent' });
    if (openCount && !disabled) {
      await open.click();
      try { await page.waitForURL(u => u.pathname === '/cpm/evidence', { timeout: 15000 }); } catch { /* recorded below */ }
      await settle(page, 3000);
      flow.steps.push({ step: 'landed on /cpm/evidence with a selection', ok: page.url().includes('/cpm/evidence?') && page.url().includes('methodRun='), detail: page.url().replace(BASE, '') });
      await page.screenshot({ path: join(OUT, 'flow-workbench.png'), fullPage: true });
      flow.workbench = await facts(page);
    }
  }
  flow.consoleErrors = [...new Set(consoleErrors)]; flow.failed = [...new Set(failed)];
  report.flows.push(flow);
  for (const s of flow.steps) console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.step} — ${s.detail}`);

  // flow: response page → first event
  consoleErrors.length = 0; failed.length = 0;
  const rflow = { name: 'response→event', steps: [] };
  await page.goto(`${BASE}/cpm/response?loop=${RESP_LOOP}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3000);
  const evBtn = page.locator('button').filter({ hasText: /INPUT_TEST|SERVO_STEP|COMPLETE|CENSORED/ }).first();
  const evCount = await evBtn.count();
  rflow.steps.push({ step: 'an event row is listed', ok: evCount > 0, detail: `${evCount}` });
  if (evCount) {
    await evBtn.click();
    await settle(page, 4000);
    rflow.steps.push({ step: 'event selected in URL', ok: page.url().includes('event='), detail: page.url().replace(BASE, '') });
    await page.screenshot({ path: join(OUT, 'flow-response-event.png'), fullPage: true });
    rflow.event = await facts(page);
  }
  rflow.consoleErrors = [...new Set(consoleErrors)]; rflow.failed = [...new Set(failed)];
  report.flows.push(rflow);
  for (const s of rflow.steps) console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.step} — ${s.detail}`);

  // flow: config → select the active bundle
  consoleErrors.length = 0; failed.length = 0;
  const cflow = { name: 'config→bundle', steps: [] };
  await page.goto(`${BASE}/cpm/config?site=hdpe&scope=LOOP&ref=${RESP_LOOP}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3000);
  const bundleBtn = page.locator('button.cpm-config-bundle').filter({ hasText: /ACTIVE_VERIFIED/ }).first();
  const bc = await bundleBtn.count();
  cflow.steps.push({ step: 'an ACTIVE_VERIFIED bundle is listed', ok: bc > 0, detail: `${bc}` });
  if (bc) {
    await bundleBtn.click();
    await settle(page, 3000);
    await page.screenshot({ path: join(OUT, 'flow-config-bundle.png'), fullPage: true });
    cflow.bundle = await facts(page);
    cflow.steps.push({ step: 'bundle panels rendered', ok: cflow.bundle.headings.some(h => /Properties/.test(h)), detail: cflow.bundle.headings.filter(h => /Properties|Lifecycle|Deployment|Diff|Shadow|Approval|Activation/.test(h)).join(' | ') });
  }
  cflow.consoleErrors = [...new Set(consoleErrors)]; cflow.failed = [...new Set(failed)];
  report.flows.push(cflow);
  for (const s of cflow.steps) console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.step} — ${s.detail}`);
} catch (e) {
  report.fatal = String(e);
  console.error('FATAL', e);
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('report:', join(OUT, 'report.json'));
  await browser?.close();
}
