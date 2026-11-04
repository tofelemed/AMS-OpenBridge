#!/usr/bin/env node
// PRM-004 R2 evidence: the restricted state, context across the 24 task walks (G07), and shell
// screenshots at each width in both themes. Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD and a
// production build. Read-only: the guard stays on. Writes redesign/evidence/phase-2/*.json.
//
// Restricted state: uses CPA_VIEWER_USER and CPA_VIEWER_PASSWORD when set. Without them it narrows
// the permissions in this test browser's copy of the login response, so the role is simulated and
// the report says so. Nothing changes on the server and no account is created.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, requireEnv, login, goto, setTheme, trackNetwork, waitStable } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';
import { TASKS } from './lib/tasks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../redesign/evidence/phase-2');
const env = requireEnv();
const log = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
const newLog = () => ({ blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null });

const CONTEXT = { site: 'hdpe', range: '7d', window: '24h' };
const END_PAGES = ['/cpm/historical', '/cpm/investigation', '/cpm/replay', '/cpm/windows'];
const WINDOW_PAGES = ['/cpm', '/cpm/performance', '/cpm/events', '/cpm/loop', '/cpm/evidence', '/cpm/explorer', '/cpm/response', '/cpm/calculations'];

const withContext = url => {
  const [p, q = ''] = url.split('?');
  const s = new URLSearchParams(q);
  if (!s.has('site')) s.set('site', CONTEXT.site);
  if (!s.has('range') && !s.has('from')) s.set('range', CONTEXT.range);
  if (!s.has('window') && !END_PAGES.includes(p)) s.set('window', CONTEXT.window);
  return `${p}?${s}`;
};

/** What the URL must still carry after a hop. */
function lostContext(url) {
  const u = new URL(`http://x${url}`);
  const q = u.searchParams;
  const lost = [];
  if (u.pathname.startsWith('/trend')) return lost; // a tool, with its own range format
  if (q.get('site') !== CONTEXT.site) lost.push('site');
  if (q.get('range') !== CONTEXT.range && !q.get('from')) lost.push('range');
  if (WINDOW_PAGES.includes(u.pathname) && q.get('window') !== CONTEXT.window && !q.get('methodRun')) lost.push('window');
  return lost;
}

async function clickText(page, re) {
  return page.evaluate(({ src, flags }) => {
    const rx = new RegExp(src, flags);
    const all = [...document.querySelectorAll('main a,main button,main obc-button,main [role=button],main [role=tab],.shell__sidebar a')];
    const label = e => (e.getAttribute('aria-label') || e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
    const hit = all.find(e => e.getBoundingClientRect().height > 0 && rx.test(label(e)));
    if (!hit) return null;
    hit.scrollIntoView({ block: 'center' });
    hit.setAttribute('data-cap-walk', '1');
    return label(hit).slice(0, 60);
  }, { src: re.source, flags: re.flags });
}

async function walk(page, net, task) {
  const hops = [];
  for (const step of task.steps) {
    const hop = {};
    if (step.open) {
      await goto(page, withContext(step.open));
      hop.how = 'opened';
    } else {
      const control = await clickText(page, step.click);
      if (control) {
        hop.how = 'clicked';
        hop.control = control;
        log.trigger = `${task.id}: ${control}`;
        await page.locator('[data-cap-walk]').first().click({ timeout: 3000 }).catch(() => { hop.how = 'click failed'; });
        await page.evaluate(() => document.querySelectorAll('[data-cap-walk]').forEach(e => e.removeAttribute('data-cap-walk')));
        log.trigger = null;
      } else {
        hop.how = 'no such control';
        hop.wanted = String(step.click);
        await goto(page, withContext(step.then));
      }
    }
    await page.waitForTimeout(350);
    await waitStable(page, net, { timeout: 9000, quietMs: 300 });
    hop.url = await page.evaluate(() => location.pathname + location.search);
    hop.lost = hop.how === 'clicked' ? lostContext(hop.url) : [];
    hops.push(hop);
  }
  return { id: task.id, task: task.task, hops };
}

async function contextWalks(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  const net = trackNetwork(page);
  await installGuard(page, log, { ratePerMin: Number(process.env.CPA_RATE ?? 50) });
  await login(page, env);
  const walks = [];
  for (const t of TASKS) {
    const r = await walk(page, net, t).catch(e => ({ id: t.id, failed: e.message.slice(0, 160), hops: [] }));
    walks.push(r);
  }
  // Every sidebar destination, from a page with context, in the order an operator would move.
  const sidebar = [];
  await goto(page, withContext('/cpm?loop=FIC10302'));
  await page.waitForSelector('.shell__sidebar a');
  const labels = await page.$$eval('.shell__sidebar a', a => a.map(x => x.getAttribute('aria-label')));
  for (const label of labels) {
    await page.locator(`.shell__sidebar a[aria-label="${label}"]`).click();
    await page.waitForTimeout(600);
    const url = await page.evaluate(() => location.pathname + location.search);
    const current = await page.$eval('.shell__sidebar [aria-current="page"]', e => e.getAttribute('aria-label')).catch(() => null);
    sidebar.push({ label, url, current, lost: lostContext(url) });
  }
  await ctx.close();
  const hops = walks.flatMap(w => w.hops.map(h => ({ id: w.id, ...h })));
  const clicked = hops.filter(h => h.how === 'clicked');
  return {
    context: CONTEXT,
    walks,
    sidebar,
    summary: {
      tasks: walks.length, failed: walks.filter(w => w.failed).length, hops: hops.length, clicked: clicked.length,
      lost: clicked.filter(h => h.lost.length).length, noControl: hops.filter(h => h.how === 'no such control').length,
      sidebarHops: sidebar.length, sidebarLost: sidebar.filter(s => s.lost.length).length, sidebarWrongSelection: sidebar.filter(s => s.current !== s.label).length,
    },
  };
}

async function restricted(browser) {
  const real = !!(process.env.CPA_VIEWER_USER && process.env.CPA_VIEWER_PASSWORD);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  await installGuard(page, newLog(), { ratePerMin: 50 });
  if (!real) {
    const narrow = async route => {
      const res = await route.fetch();
      const body = await res.json().catch(() => null);
      const user = body?.user ?? body?.data?.user;
      if (user) user.permissions = ['analytics.view', 'historian.view'];
      await route.fulfill({ response: res, json: body });
    };
    await page.route('**/api/auth/login', narrow);
    await page.route('**/api/auth/refresh', narrow);
  }
  await login(page, real ? { ...env, user: process.env.CPA_VIEWER_USER, password: process.env.CPA_VIEWER_PASSWORD } : env);
  const sidebar = await page.$$eval('.shell__sidebar a', a => a.map(x => x.getAttribute('aria-label')));
  const routes = [];
  for (const url of ['/cpm/system', '/cpm/pipeline', '/cpm/governance', '/cpm/setup?tab=configuration', '/cpm/config', '/admin/users']) {
    await goto(page, url);
    await page.waitForTimeout(700);
    routes.push({
      url,
      finalUrl: await page.evaluate(() => location.pathname + location.search),
      state: await page.locator('[data-testid="state-restricted"]').first().innerText().catch(() => null),
      goHome: await page.locator('[data-testid="state-restricted"] a').count(),
    });
    if (url === '/cpm/system') {
      for (const theme of ['day', 'night']) {
        await setTheme(page, theme);
        await page.screenshot({ path: path.join(out, `screenshots/${theme}/restricted-system.png`), animations: 'disabled' });
      }
      await setTheme(page, 'day');
    }
  }
  await ctx.close();
  return { simulated: !real, sidebar, routes };
}

async function shell(browser) {
  const sizes = [[1440, 1024, 1], [1280, 800, 1], [1024, 768, 1], [720, 512, 2]];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  await installGuard(page, newLog(), { ratePerMin: 50 });
  await login(page, env);
  await goto(page, withContext('/cpm/performance'));
  await page.waitForTimeout(1500);
  const shots = [];
  for (const theme of ['day', 'night']) {
    await setTheme(page, theme);
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(300);
      const name = `shell-${w === 720 ? '200pct' : w}.png`;
      await page.screenshot({ path: path.join(out, `screenshots/${theme}/${name}`), animations: 'disabled' });
      shots.push(`${theme}/${name}`);
    }
  }
  // The open controls, in Night at the reference size.
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.getByRole('button', { name: /^Plant scope/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, 'screenshots/night/shell-plant-open.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Time range/ }).click();
  await page.getByRole('button', { name: 'Custom' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, 'screenshots/night/shell-range-open.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  // The drawer, at 200 % zoom.
  await page.setViewportSize({ width: 720, height: 512 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, 'screenshots/night/shell-drawer.png'), animations: 'disabled' });
  await setTheme(page, 'day').catch(() => {});
  await ctx.close();
  return shots;
}

async function main() {
  fs.mkdirSync(path.join(out, 'screenshots/day'), { recursive: true });
  fs.mkdirSync(path.join(out, 'screenshots/night'), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const only = process.argv[2];
  if (!only || only === 'restricted') {
    const r = await restricted(browser);
    fs.writeFileSync(path.join(out, 'restricted.json'), JSON.stringify(r, null, 1));
    console.log('restricted', JSON.stringify({ simulated: r.simulated, sidebar: r.sidebar, routes: r.routes.map(x => [x.url, x.finalUrl, (x.state ?? '').slice(0, 28)]) }));
  }
  if (!only || only === 'shell') console.log('shell', (await shell(browser)).length);
  if (!only || only === 'walks') {
    const w = await contextWalks(browser);
    fs.writeFileSync(path.join(out, 'context-walks.json'), JSON.stringify({ ...w, log: { blocked: log.blocked.length, http429: log.http429.length } }, null, 1));
    console.log('walks', JSON.stringify(w.summary), 'blocked', log.blocked.length, '429', log.http429.length);
    for (const s of w.sidebar) if (s.lost.length || s.current !== s.label) console.log(' sidebar', s.label, s.url, s.current, s.lost.join());
    for (const t of w.walks) for (const h of t.hops) if (h.lost?.length) console.log(' lost', t.id, h.control, h.url, h.lost.join());
    for (const t of w.walks) for (const h of t.hops) if (h.how === 'no such control') console.log(' none', t.id, h.wanted);
  }
  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
