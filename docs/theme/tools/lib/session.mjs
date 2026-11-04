// Browser session for the CPA capture tool. Credentials come only from the environment and are never logged.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tooling = path.resolve(here, '../.tooling/package.json');
const require = createRequire(tooling);
export const { chromium } = require('playwright-core');
export const axeSource = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

export function requireEnv() {
  const missing = ['CPA_BASE_URL', 'CPA_USER', 'CPA_PASSWORD'].filter(n => !process.env[n]);
  if (missing.length) {
    console.error(`Missing environment variables: ${missing.join(', ')}. Stopping.`);
    process.exit(2);
  }
  return { base: process.env.CPA_BASE_URL.replace(/\/$/, ''), user: process.env.CPA_USER, password: process.env.CPA_PASSWORD };
}

export async function login(page, env) {
  await page.goto(`${env.base}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-operator-id', { timeout: 30000 });
  await page.fill('#login-operator-id', env.user);
  await page.fill('#login-password', env.password);
  await page.press('#login-password', 'Enter');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), null, { timeout: 30000 });
  await page.waitForSelector('.shell__header, .app-topbar', { timeout: 30000 });
}

/** Client-side navigation. The access token lives in memory, so a full reload would drop the session. */
export async function goto(page, url) {
  await page.evaluate(u => {
    history.pushState({}, '', u);
    dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}

export async function setTheme(page, theme) {
  await page.evaluate(t => {
    if (document.documentElement.getAttribute('data-theme') === t) return;
    const b = document.querySelector('[data-theme-switch]');
    if (!b) throw new Error('theme switch not found');
    b.click();
  }, theme);
  await page.waitForFunction(t => document.documentElement.getAttribute('data-obc-theme') === t, theme);
  await page.waitForTimeout(400);
}

/** Tracks in-flight requests, ignoring long-lived streams, so "idle" stays meaningful on live pages. */
export function trackNetwork(page) {
  const open = new Set();
  const stream = u => /\/hubs\/|\/mqtt-ws|event-stream|\/@vite|hot-update|sockjs/.test(u);
  let last = Date.now();
  page.on('request', r => { if (!stream(r.url())) { open.add(r); last = Date.now(); } });
  const done = r => { open.delete(r); last = Date.now(); };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return { idleFor: () => (open.size ? 0 : Date.now() - last), open: () => open.size };
}

/** Waits for network idle, a quiet DOM and no skeleton above 24 px. Returns timing and whether it settled. */
export async function waitStable(page, net, { timeout = 25000, quietMs = 700 } = {}) {
  const t0 = Date.now();
  await page.evaluate(() => {
    if (window.__capObs) return;
    window.__capLast = Date.now();
    window.__capObs = new MutationObserver(ms => {
      if (ms.some(m => m.type === 'childList' || m.type === 'characterData')) window.__capLast = Date.now();
    });
    window.__capObs.observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  let settled = false;
  while (Date.now() - t0 < timeout) {
    const dom = await page.evaluate(() => ({
      quiet: Date.now() - window.__capLast,
      skeleton: [...document.querySelectorAll('[class*="skeleton" i],[class*="shimmer" i],[aria-busy="true"],.spinner')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.height > 24 && r.width > 0; }).length,
    }));
    if (net.idleFor() >= quietMs && dom.quiet >= quietMs && dom.skeleton === 0) { settled = true; break; }
    await page.waitForTimeout(200);
  }
  return { stable: settled, msToStable: Date.now() - t0 };
}
