#!/usr/bin/env node
// CPA screenshot, text-density, geometry and axe-core capture. Read-only: it only navigates and tabs;
// the only intercepts are local to the browser (see capture-states.mjs). It never clicks a write control.
//
// Needs CPA_BASE_URL, CPA_USER and CPA_PASSWORD in the environment. Nothing from them is written anywhere.
// Usage: node docs/theme/tools/capture-screens.mjs [--only slug,slug] [--themes day,night] [--no-axe] [--no-shots]
// Output: docs/theme/screenshots/current/manifest.json and <theme>/<viewport>/<slug>[--full].png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, axeSource, requireEnv, login, goto, setTheme, trackNetwork, waitStable } from './lib/session.mjs';
import { textMetrics, geometry, keyboardFacts, deepFocusReport, customProperties } from './lib/dom-metrics.mjs';
import { ROUTES, THEMES, VIEWPORTS, vpName, LOOP } from './lib/routes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const outDir = path.join(repo, 'docs/theme/screenshots/current');
const manifestFile = path.join(outDir, 'manifest.json');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const flag = n => process.argv.includes(n);

const env = requireEnv();
const themes = (arg('--themes') ?? THEMES.join(',')).split(',');
const only = arg('--only')?.split(',');
const routes = only ? ROUTES.filter(r => only.includes(r.slug)) : ROUTES;

const manifest = fs.existsSync(manifestFile) && only ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { routes: {} };
Object.assign(manifest, { generatedBy: 'docs/theme/tools/capture-screens.mjs', capturedAt: new Date().toISOString(), loop: LOOP, baseUrlKind: new URL(env.base).port === '5174' ? 'vite-dev-working-tree' : 'other', themes: only ? (manifest.themes ?? themes) : themes, viewports: VIEWPORTS });

const shot = async (page, file, opts = {}) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, animations: 'disabled', ...opts });
  return path.relative(outDir, file).replaceAll('\\', '/');
};

/** The app scrolls inside .page-content, so a browser full-page shot would clip. Grow the viewport to fit instead. */
async function fullShot(page, file, vp) {
  const h = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.page-content, main, .app-main')].map(e => e.scrollHeight);
    const top = document.querySelector('main')?.getBoundingClientRect().top ?? 0;
    return Math.ceil(Math.max(...s, 0) + top);
  });
  if (h <= vp[1] + 8) return null;
  await page.setViewportSize({ width: vp[0], height: Math.min(h + 16, 9000) });
  await page.waitForTimeout(500);
  const p = await shot(page, file);
  await page.setViewportSize({ width: vp[0], height: vp[1] });
  await page.waitForTimeout(250);
  return { path: p, height: h, clipped: h + 16 > 9000 };
}

async function keyboardWalk(page, tabs = 45) {
  await page.evaluate(() => { document.activeElement?.blur?.(); });
  const seen = [];
  for (let i = 0; i < tabs; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(deepFocusReport);
    if (f) seen.push(f);
  }
  const inMain = seen.filter(s => s.inMain);
  return { stops: seen.length, stopsInMain: inMain.length, ringVisible: seen.filter(s => s.ring).length,
    noRing: seen.filter(s => !s.ring).slice(0, 6).map(s => `${s.tag}.${s.cls} "${s.text}"`), sample: inMain[0] ?? seen[0] ?? null };
}

async function runAxe(page) {
  await page.evaluate(() => { window.__axeDone = null; });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    const by = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const rules = {};
    for (const v of r.violations) {
      by[v.impact ?? 'minor'] += v.nodes.length;
      rules[v.id] = { impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(' ').slice(0, 120) };
    }
    return { nodesByImpact: by, rules };
  });
}

async function captureLogin(browser) {
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
    await ctx.addInitScript(t => localStorage.setItem('ams-theme', t), theme);
    const page = await ctx.newPage();
    const net = trackNetwork(page);
    await page.goto(`${env.base}/login`);
    await page.waitForSelector('#login-operator-id');
    const s = await waitStable(page, net, { timeout: 8000 });
    await page.addScriptTag({ content: axeSource });
    const e = (manifest.routes.login ??= { url: '/login', page: 'Login', nav: false, themes: {} });
    e.themes[theme] = { ...s, shots: { [vpName(VIEWPORTS.reference)]: flag('--no-shots') ? null : await shot(page, path.join(outDir, theme, '1440x1024', 'login.png')) } };
    if (!flag('--no-axe')) e.themes[theme].axe = await runAxe(page);
    if (theme === themes[0]) e.text = await page.evaluate(textMetrics, { rootSelector: 'body' });
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  if (!only || only.includes('login')) await captureLogin(browser);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  const net = trackNetwork(page);
  let bucket = null;
  page.on('console', m => { if (bucket && ['error', 'warning'].includes(m.type())) bucket.console[m.type()].push(m.text().replace(/Bearer\s+\S+/g, 'Bearer <redacted>').slice(0, 200)); });
  page.on('pageerror', e => { if (bucket) bucket.console.error.push(`pageerror: ${e.message.slice(0, 200)}`); });
  page.on('response', r => {
    const u = new URL(r.url());
    if (bucket && u.pathname.startsWith('/api') && r.status() >= 400) bucket.api.push({ path: u.pathname, status: r.status() });
  });
  // Navigation and Tab must never mutate anything. Every non-GET API call is recorded so that claim can be checked.
  const nonGet = manifest.nonGetApiCalls ?? {};
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api') && !['GET', 'HEAD', 'OPTIONS'].includes(r.method())) {
      const k = `${r.method()} ${u.pathname}`;
      nonGet[k] = (nonGet[k] ?? 0) + 1;
    }
  });
  await login(page, env);
  await page.addScriptTag({ content: axeSource });

  // Pick a real trend tag set from the app's own link, so /trend is not captured as an empty shell.
  const tags = process.env.CPA_TREND_TAGS ?? '';
  const urlOf = r => (r.tagsFor === 'trend' && tags ? `${r.url}?tags=${encodeURIComponent(tags)}&range=8h` : r.url);
  const props = {};

  for (const theme of themes) {
    await setTheme(page, theme);
    props[theme] = await page.evaluate(customProperties);
    for (const r of routes) {
      const e = (manifest.routes[r.slug] ??= { url: urlOf(r), page: r.page, nav: !!r.nav, hidden: !!r.hidden, key: !!r.key, themes: {} });
      const size = VIEWPORTS.reference;
      await page.setViewportSize({ width: size[0], height: size[1] });
      bucket = { console: { error: [], warning: [] }, api: [] };
      await goto(page, urlOf(r));
      await page.waitForTimeout(250);
      const s = await waitStable(page, net);
      const finalUrl = await page.evaluate(() => location.pathname + location.search);
      const redirected = new URL(env.base + urlOf(r)).pathname !== new URL(env.base + finalUrl).pathname;
      const rec = { ...s, finalUrl, redirected, status: redirected ? 'redirected' : 'ok', capturedAs: env.user, shots: {} };
      console.log(`${theme} ${r.slug} ${redirected ? 'REDIRECT ' + finalUrl : ''} ${s.msToStable}ms stable=${s.stable}`);
      if (flag('--text-only')) {
        e.text = await page.evaluate(textMetrics, { rootSelector: 'main' });
        fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
        continue;
      }
      if (redirected) { rec.console = bucket.console; rec.api = bucket.api; e.themes[theme] = rec; continue; }
      if (!flag('--no-shots')) {
        rec.shots[vpName(size)] = await shot(page, path.join(outDir, theme, vpName(size), `${r.slug}.png`));
        rec.full = await fullShot(page, path.join(outDir, theme, vpName(size), `${r.slug}--full.png`), size);
      }
      if (theme === themes[0]) {
        e.text = await page.evaluate(textMetrics, { rootSelector: 'main' });
        e.shellText = await page.evaluate(textMetrics, { rootSelector: '.app-topbar, .app-sidebar' });
        e.shellText = { visibleWords: e.shellText.visibleWords, distinctFontSizes: e.shellText.distinctFontSizes };
        e.geometry = await page.evaluate(geometry);
        e.keyboard = await page.evaluate(keyboardFacts);
        e.tabWalk = await keyboardWalk(page);
      }
      if (!flag('--no-axe')) rec.axe = await runAxe(page);
      if (r.key && !flag('--no-shots')) {
        for (const size2 of [VIEWPORTS.laptop, VIEWPORTS.wide]) {
          await page.setViewportSize({ width: size2[0], height: size2[1] });
          await page.waitForTimeout(600);
          await waitStable(page, net, { timeout: 8000 });
          rec.shots[vpName(size2)] = await shot(page, path.join(outDir, theme, vpName(size2), `${r.slug}.png`));
          const f = await fullShot(page, path.join(outDir, theme, vpName(size2), `${r.slug}--full.png`), size2);
          if (f) (rec.fullOther ??= {})[vpName(size2)] = f;
        }
      }
      rec.console = { errors: [...new Set(bucket.console.error)].slice(0, 12), warnings: [...new Set(bucket.console.warning)].slice(0, 12), errorCount: bucket.console.error.length, warningCount: bucket.console.warning.length };
      rec.api = bucket.api;
      e.themes[theme] = rec;
      fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
    }
  }
  fs.mkdirSync(path.join(repo, 'docs/theme/data'), { recursive: true });
  if (!only) fs.writeFileSync(path.join(repo, 'docs/theme/data/css-custom-properties.json'), JSON.stringify(props, null, 1));
  manifest.nonGetApiCalls = nonGet;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
