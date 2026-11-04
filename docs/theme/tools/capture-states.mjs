#!/usr/bin/env node
// CPA data-state and surface capture. Writes docs/theme/screenshots/current/<theme>/states/ and states.json.
// Loading, error, partial, restricted and stale are simulated inside the browser; nothing reaches the backend.
// A write guard aborts every non-GET API call that is not on the read-only allowlist below.
// Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD. Usage: node docs/theme/tools/capture-states.mjs [--themes day,night]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, requireEnv, login, goto, trackNetwork, waitStable } from './lib/session.mjs';
import { URL_STATES, SURFACES, FIRST_VISIT, SUPER_VISIT } from './lib/states.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.CPA_OUT_DIR ?? path.resolve(here, '../screenshots/current');
const stateFile = path.join(outDir, 'states.json');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const themes = (arg('--themes') ?? 'day,night').split(',');
const superOnly = process.argv.includes('--super');
const VISIT = superOnly ? SUPER_VISIT : FIRST_VISIT;
const env = requireEnv();

// Read-only POSTs seen during plain navigation (manifest.nonGetApiCalls), plus authentication housekeeping.
const READ_POST = (process.env.CPA_READ_POSTS ?? '').split(',').filter(Boolean);
const allowed = (method, p) => ['GET', 'HEAD', 'OPTIONS'].includes(method) || p.startsWith('/api/auth/') || READ_POST.some(a => p.startsWith(a));

const results = [];
const blocked = [];

async function newSession(browser, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  await ctx.addInitScript(t => localStorage.setItem('ams-theme', t), theme);
  const page = await ctx.newPage();
  const net = trackNetwork(page);
  const rule = { delayMs: 0, fail: null };
  await page.route('**/api/**', async route => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (!allowed(req.method(), p)) {
      blocked.push(`${req.method()} ${p}`);
      return route.abort();
    }
    if (rule.fail && rule.fail.test.test(p)) {
      return route.fulfill({ status: rule.fail.status, contentType: 'application/json', body: JSON.stringify({ title: rule.fail.title ?? 'Simulated by the capture tool' }) });
    }
    if (rule.delayMs && !p.startsWith('/api/auth')) await new Promise(r => setTimeout(r, rule.delayMs));
    return route.continue().catch(() => {});
  });
  await login(page, env);
  return { ctx, page, net, rule };
}

async function snap(page, theme, slug, state, meta = {}) {
  const rel = `${theme}/states/${slug}--${state}.png`;
  const file = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, animations: 'disabled' });
  const visible = await page.evaluate(() => (document.querySelector('main')?.innerText ?? document.body.innerText).replace(/\s+/g, ' ').slice(0, 280));
  results.push({ theme, slug, state, path: rel, url: await page.evaluate(() => location.pathname + location.search), excerpt: visible, ...meta });
  console.log(`${theme} ${slug}--${state}`);
}

async function openSurface(page, s) {
  if (s.key) { await page.keyboard.press(s.key); return true; }
  if (s.hover) {
    const box = await page.locator(`main ${s.hover}`).first().boundingBox().catch(() => null);
    if (!box) return false;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.45);
    await page.waitForTimeout(500);
    return true;
  }
  const loc = s.css ? page.locator(`main ${s.css}`).first() : page.locator('main button, main obc-button, main a').filter({ hasText: s.text }).first();
  if (!(await loc.count())) return false;
  await loc.click({ timeout: 4000 }).catch(() => {});
  return true;
}

async function closeSurface(page) {
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
}

async function pass(browser, theme, fn) {
  const s = await newSession(browser, theme);
  try { await fn(s); } catch (e) { console.error(`pass failed: ${e.message}`); results.push({ theme, failed: e.message.slice(0, 200) }); }
  await s.ctx.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const theme of themes) {
    await pass(browser, theme, async ({ page, net, rule }) => {
      rule.delayMs = 7000;
      for (const [slug, url] of VISIT) {
        await goto(page, url);
        await page.waitForTimeout(1800);
        await snap(page, theme, slug, 'loading', { how: 'GET responses held 7 s in the browser, first visit' });
        await waitStable(page, net, { timeout: 15000 });
      }
    });
    await pass(browser, theme, async ({ page, net, rule }) => {
      rule.fail = { test: superOnly ? /\/api\/(v1\/cpm|audit|users|roles|auth\/users|auth\/roles)/ : /\/api\/v1\/cpm\//, status: 503 };
      for (const [slug, url] of VISIT) {
        await goto(page, url);
        await waitStable(page, net, { timeout: 14000 });
        await snap(page, theme, slug, 'error', { how: 'CPM API answered 503 in the browser, first visit' });
      }
    });
    if (superOnly) continue;
    await pass(browser, theme, async ({ page, net, rule }) => {
      rule.fail = { test: /\/api\/v1\/cpm\//, status: 403, title: 'Forbidden' };
      for (const [slug, url] of FIRST_VISIT.filter(([s]) => ['overview', 'registry'].includes(s))) {
        await goto(page, url);
        await waitStable(page, net, { timeout: 14000 });
        await snap(page, theme, slug, 'restricted', { how: 'CPM API answered 403 in the browser' });
      }
    });
    await pass(browser, theme, async ({ page, net, rule }) => {
      rule.fail = { test: /\/fleet\/kpis/, status: 503 };
      await goto(page, '/cpm');
      await waitStable(page, net, { timeout: 14000 });
      await snap(page, theme, 'overview', 'partial', { how: 'Only /fleet/kpis answered 503' });
      rule.fail = { test: /\/api\/hist/, status: 503 };
      for (const [slug, url] of FIRST_VISIT.filter(([s]) => ['explorer', 'historical'].includes(s))) {
        await goto(page, url);
        await waitStable(page, net, { timeout: 14000 });
        await snap(page, theme, slug, 'partial', { how: 'Only the historian API answered 503' });
      }
    });
    await pass(browser, theme, async ({ page, net }) => {
      for (const [slug, state, url] of URL_STATES) {
        await goto(page, url);
        await page.waitForTimeout(250);
        const s = await waitStable(page, net, { timeout: 15000 });
        await snap(page, theme, slug, state, { how: 'URL only', stable: s.stable });
      }
      for (const s of SURFACES) {
        await goto(page, s.url);
        await page.waitForTimeout(250);
        await waitStable(page, net, { timeout: 15000 });
        const opened = await openSurface(page, s);
        if (!opened) { results.push({ theme, slug: s.slug, state: s.state, skipped: 'control not present in the lab data' }); continue; }
        await page.waitForTimeout(700);
        const found = s.expect ? await page.locator(s.expect).count() : null;
        await snap(page, theme, s.slug, s.state, { how: 'opened, not submitted', expected: s.expect ?? null, found });
        await closeSurface(page);
      }
      // Stale is computed from Date.now(), so a shifted browser clock reaches it without touching any record.
      await page.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 5 * 3600e3; });
      for (const [slug, url] of [['performance', '/cpm/performance'], ['overview', '/cpm']]) {
        await goto(page, `${url}?site=hdpe`);
        await waitStable(page, net, { timeout: 15000 });
        await snap(page, theme, slug, 'stale', { how: 'browser clock shifted +5 h' });
      }
    });
  }
  const prior = superOnly && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { results: [], blockedWrites: [] };
  const merged = { generatedBy: 'docs/theme/tools/capture-states.mjs', themes, blockedWrites: [...new Set([...prior.blockedWrites, ...blocked])], results: [...prior.results, ...results] };
  fs.writeFileSync(stateFile, JSON.stringify(merged, null, 1));
  console.log(`done: ${results.length} states, ${blocked.length} blocked writes`);
  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
