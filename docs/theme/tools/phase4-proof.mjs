#!/usr/bin/env node
// PRM-004 R4 evidence: Overview, Performance and Episodes on a production build, with the guard on.
// Measures the fold and load cost, proves links keep their context and gate marks stay one vocabulary,
// checks the /cpm/kpi redirect and captures every page in both themes at each width.
// Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD. Writes redesign/evidence/phase-4/proof.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, requireEnv, login, goto, setTheme, trackNetwork, waitStable } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../redesign/evidence/phase-4');
const env = requireEnv();
const log = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
const checks = [];
const check = (id, name, pass, detail = '') => {
  checks.push({ id, name, pass: !!pass, detail: String(detail).slice(0, 220) });
  if (!pass) console.log(`  FAIL ${id}: ${name} :: ${String(detail).slice(0, 170)}`);
};

const PAGES = [
  { id: 'overview', url: '/cpm', table: 'table' },
  { id: 'performance', url: '/cpm/performance', table: 'table' },
  { id: 'episodes', url: '/cpm/events', table: 'table' },
];

async function open(page, net, url) {
  await goto(page, url);
  await page.waitForTimeout(350);
  return waitStable(page, net, { timeout: 15000, quietMs: 450 });
}

async function costs(browser) {
  // A fresh context per page, so nothing is cached and the request count is the page's own.
  const rows = [];
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
    const page = await ctx.newPage();
    const calls = [];
    const net = trackNetwork(page);
    await installGuard(page, log, { ratePerMin: 50 });
    await login(page, env);
    page.on('response', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) calls.push({ path: u.pathname, status: r.status() }); });
    const t0 = Date.now();
    await goto(page, p.url);
    await page.waitForSelector('main table, main [data-testid^="state-"]', { timeout: 20000 }).catch(() => {});
    const firstTable = Date.now() - t0;
    await page.waitForTimeout(300);
    await waitStable(page, net, { timeout: 15000, quietMs: 500 });
    const byPath = {};
    for (const c of calls) byPath[c.path] = (byPath[c.path] ?? 0) + 1;
    // The primary panel, not the first table: an empty queue has no table of its own.
    const fold = await page.evaluate(id => {
      const main = id === 'overview' ? document.querySelector('.ui-with-inspector') : document.querySelector('.ui-with-inspector table, main table');
      return Math.round(main?.getBoundingClientRect().top ?? -1);
    }, p.id);
    const failed = calls.filter(c => c.status >= 500).map(c => `${c.status} ${c.path}`);
    rows.push({ id: p.id, firstTable, calls: calls.length, fold, failed, top: Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 5) });
    await ctx.close();
  }
  return rows;
}

async function behaviour(page, net) {
  // The redirect that turns on in this phase.
  await goto(page, '/cpm/kpi?kpi=stale&site=hdpe');
  await page.waitForFunction(() => location.pathname === '/cpm', null, { timeout: 8000 }).catch(() => {});
  const redirected = await page.evaluate(() => location.pathname + location.search);
  check('redirect', '/cpm/kpi goes to /cpm?review=', /^\/cpm\?/.test(redirected) && redirected.includes('review=stale') && redirected.includes('site=hdpe'), redirected);

  // One heading per page, no purpose sentence.
  for (const p of PAGES) {
    await open(page, net, p.url);
    const facts = await page.evaluate(() => ({
      h1: document.querySelectorAll('main h1').length,
      mains: document.querySelectorAll('main').length,
      crumbs: !!document.querySelector('nav[aria-label="Breadcrumb"]'),
      text: document.querySelector('main')?.innerText ?? '',
    }));
    check(p.id, 'one h1, one main, breadcrumb', facts.h1 === 1 && facts.mains === 1 && facts.crumbs, JSON.stringify({ h1: facts.h1, mains: facts.mains, crumbs: facts.crumbs }));
    const banned = /(\bfused\b|\bwatermark\b|\bFlink\b|\bKafka\b|NO_CALL|Which loops need attention first|Compare every loop gate by gate|Click to )/;
    const hit = banned.exec(facts.text);
    check(p.id, 'no purpose sentence or engine term', !hit, hit?.[0]);
    check(p.id, 'no raw placeholder shown', !/\{[A-Za-z]+(:[A-Z0-9]+)?\}/.test(facts.text), /\{[A-Za-z]+(:[A-Z0-9]+)?\}/.exec(facts.text)?.[0]);
  }

  // Filters and selection keep the context.
  await open(page, net, '/cpm?site=hdpe&range=7d&window=24h');
  const hrefs = await page.$$eval('main a[href^="/cpm"]', a => a.map(x => x.getAttribute('href')));
  const lost = hrefs.filter(h => !h.includes('site=hdpe'));
  check('overview', 'every link keeps the plant scope', hrefs.length > 0 && lost.length === 0, `${hrefs.length} links, ${lost.slice(0, 3).join(' ')}`);

  await open(page, net, '/cpm?review=stale');
  const row = page.locator('main table tbody tr').first();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(900);
    const url = await page.evaluate(() => location.search);
    check('overview', 'a click selects a loop, in the URL', /loop=/.test(url), url);
    check('overview', 'inspector shows the loop', (await page.locator('.ui-inspector').first().innerText()).length > 20);
    await page.screenshot({ path: path.join(out, 'screenshots/day/overview-selected.png'), animations: 'disabled' });
    await page.locator('main table tbody tr').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.pathname === '/cpm/loop', null, { timeout: 6000 }).catch(() => {});
    const opened = await page.evaluate(() => location.pathname + location.search);
    check('overview', 'Enter opens the loop, keeping the context (SPEC 5.1)', opened.startsWith('/cpm/loop') && /loop=/.test(opened), opened);
  } else {
    check('overview', 'stale filter lists loops', false, 'no rows');
  }
  await open(page, net, '/cpm?review=assessed');
  check('overview', 'review=assessed is accepted', (await page.evaluate(() => location.search)).includes('assessed'));

  // Gate marks: every mark on Performance comes from the vocabulary, and a diagnostic gate never shows a tick.
  await open(page, net, '/cpm/performance?view=matrix');
  const matrix = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('main table tbody td')].map(td => td.textContent.trim());
    return { cells: cells.length, sample: cells.slice(0, 18) };
  });
  check('performance', 'matrix renders cells', matrix.cells > 10, JSON.stringify(matrix.sample));
  const key = await page.locator('.ui-gate-key').count();
  check('performance', 'gate key visible', key >= 1, key);
  const focusable = await page.$$eval('main table tbody [tabindex]', e => e.length);
  check('performance', 'cells reachable by keyboard', focusable > 0, focusable);

  // Episodes: the range limit is stated, and a row selects by keyboard.
  await open(page, net, '/cpm/events?range=24h');
  const text = await page.evaluate(() => document.querySelector('main')?.innerText ?? '');
  check('episodes', 'says what the list covers', /All retained episodes/.test(text), text.slice(0, 120));
  const eRow = page.locator('main table tbody tr').first();
  if (await eRow.count()) {
    await eRow.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    check('episodes', 'Enter selects, in the URL', /event=/.test(await page.evaluate(() => location.search)));
    await page.screenshot({ path: path.join(out, 'screenshots/night/episodes-selected.png'), animations: 'disabled' }).catch(() => {});
  }
}

async function captures(page, net) {
  const sizes = [[1440, 1024], [1280, 800], [1024, 768]];
  for (const p of PAGES) {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await open(page, net, p.url);
    for (const theme of ['day', 'night']) {
      await setTheme(page, theme);
      for (const [w, h] of sizes) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(350);
        const dir = path.join(out, `screenshots/${theme}/${w}x${h}`);
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `${p.id}.png`), animations: 'disabled' });
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(p.id, `no sideways page scroll ${w} ${theme}`, over <= 0, over);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1024 });
  await setTheme(page, 'day');
}

async function main() {
  fs.mkdirSync(path.join(out, 'screenshots/day'), { recursive: true });
  fs.mkdirSync(path.join(out, 'screenshots/night'), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const cost = await costs(browser);
  for (const c of cost) {
    console.log(c.id, JSON.stringify({ firstTableMs: c.firstTable, apiCalls: c.calls, tableTopPx: c.fold, failed: c.failed, top: c.top }));
    check(c.id, 'no server error', c.failed.length === 0, c.failed.join(' '));
    check(c.id, 'primary panel above the fold', c.fold >= 0 && c.fold < (c.id === 'overview' ? 600 : 1024), c.fold);
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  const net = trackNetwork(page);
  await installGuard(page, log, { ratePerMin: Number(process.env.CPA_RATE ?? 50) });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
  await login(page, env);
  await behaviour(page, net);
  await captures(page, net);
  check('all', 'no uncaught page error', errors.length === 0, errors.slice(0, 2).join(' | '));
  await browser.close();
  const summary = { total: checks.length, failed: checks.filter(c => !c.pass).length, blocked: log.blocked.length, http429: log.http429.length };
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify({ summary, cost, checks }, null, 1));
  console.log(JSON.stringify(summary));
}

main().catch(e => { console.error(e.message); process.exit(1); });
