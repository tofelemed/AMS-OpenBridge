// v2.5 rendered performance probe for the System Response and Gate Configuration pages (2026-09-17 audit
// follow-up): for each step it records the API requests issued (unique URL, count, bytes), the time from
// navigation to the first drawn chart / the property table, and then watches an idle minute for background
// polling. Run from scripts/validation:  MSYS_NO_PATHCONV=1 node ui-v25-pages-perf.mjs <outDir>
//   env: UI_BASE, UI_USER, UI_PASS, RESP_LOOP (default FIC10302), CFG_LOOP (default FIC10302), IDLE_S (default 60)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.UI_BASE ?? 'http://localhost:3000';
const RESP_LOOP = process.env.RESP_LOOP ?? 'FIC10302';
const CFG_LOOP = process.env.CFG_LOOP ?? 'FIC10302';
const IDLE_S = Number(process.env.IDLE_S ?? 60);
const [outDir = '.'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
let calls = [];
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('response', async r => {
  const u = r.url();
  if (!u.includes('/api/')) return;
  let bytes = 0;
  try { bytes = Number(r.headers()['content-length'] ?? 0) || (await r.body()).length; } catch { /* streamed / aborted */ }
  let ms = null;
  try { const t = r.request().timing(); ms = t && t.responseEnd >= 0 ? Math.round(t.responseEnd) : null; } catch { /* no timing */ }
  calls.push({ url: u.replace(BASE, ''), method: r.request().method(), status: r.status(), bytes, ms, t: Date.now() });
});

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="text"], input[name="username"], input[autocomplete="username"]', process.env.UI_USER ?? 'admin');
await page.fill('input[type="password"]', process.env.UI_PASS ?? 'ChangeMe123!');
await page.press('input[type="password"]', 'Enter');
await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 });

const summarise = (list) => {
  const byUrl = new Map();
  for (const c of list) { const k = `${c.method} ${c.url}`; const e = byUrl.get(k) ?? { n: 0, bytes: 0, status: c.status, ms: 0 }; e.n++; e.bytes += c.bytes; e.ms = Math.max(e.ms, c.ms ?? 0); byUrl.set(k, e); }
  return { requests: list.length, unique: byUrl.size, bytes: list.reduce((a, c) => a + c.bytes, 0), byUrl: [...byUrl.entries()].map(([k, v]) => ({ call: k, ...v })).sort((a, b) => b.bytes - a.bytes) };
};
const steps = [];
async function step(name, url, readySelector) {
  calls = [];
  const t0 = Date.now();
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  let readyMs = null;
  try { await page.waitForSelector(readySelector, { timeout: 20000 }); readyMs = Date.now() - t0; } catch { /* not ready in 20 s */ }
  await page.waitForTimeout(3000);
  const load = summarise(calls);
  const dom = await page.evaluate(() => ({
    charts: document.querySelectorAll('canvas').length,
    rows: document.querySelectorAll('table tbody tr').length,
    nodes: document.querySelectorAll('*').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    busy: document.querySelectorAll('[aria-busy="true"]').length,
  }));
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: false });
  // idle watch: what the page keeps asking for while nobody touches it
  calls = [];
  await page.waitForTimeout(IDLE_S * 1000);
  const idle = summarise(calls);
  steps.push({ name, url, readyMs, load, dom, idle });
  console.log(`${name.padEnd(22)} ready=${readyMs ?? '>20000'}ms load: ${load.requests} req / ${load.unique} unique / ${(load.bytes / 1024).toFixed(0)} KB   idle ${IDLE_S}s: ${idle.requests} req / ${(idle.bytes / 1024).toFixed(0)} KB   charts=${dom.charts} rows=${dom.rows} nodes=${dom.nodes}${dom.overflow ? ' H-OVERFLOW' : ''}`);
  for (const c of load.byUrl.filter(c => c.ms >= 500)) console.log(`    slow: ${c.ms} ms ${c.call} (${(c.bytes / 1024).toFixed(1)} KB)`);
  for (const c of idle.byUrl) console.log(`    idle: ${c.n}× ${c.call} (${(c.bytes / 1024).toFixed(1)} KB)`);
}

// System Response: landing, the loop (event list), one event (result card + charts + aside)
await step('response-landing', '/cpm/response', '.cpm-toolbar');
await step('response-loop', `/cpm/response?loop=${RESP_LOOP}`, '.cpm-response-event');
const eventId = await page.evaluate(() => { const b = document.querySelector('.cpm-response-event'); b?.click(); return new URL(location.href).searchParams.get('event'); });
await page.waitForTimeout(500);
const evt = eventId ?? new URL(page.url()).searchParams.get('event');
if (evt) await step('response-event', `/cpm/response?loop=${RESP_LOOP}&event=${evt}`, '.cpm-response-centre canvas');
else console.log('response-event        no event to open');

// Gate Configuration: landing, the loop scope (bundle list), the active bundle (property table + lifecycle + deployments)
await step('config-landing', '/cpm/config', '.cpm-config-nav');
await step('config-loop', `/cpm/config?site=hdpe&scope=LOOP&ref=${CFG_LOOP}`, '.cpm-config-bundle');
const bundleId = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button.cpm-config-bundle')].find(b => /ACTIVE_VERIFIED/.test(b.textContent)) ?? document.querySelector('button.cpm-config-bundle');
  btn?.click();
  return null;
});
await page.waitForTimeout(800);
const bundle = bundleId ?? new URL(page.url()).searchParams.get('bundle');
if (bundle) await step('config-bundle', `/cpm/config?site=hdpe&scope=LOOP&ref=${CFG_LOOP}&bundle=${bundle}&gate=G0`, '.cpm-config-table tbody tr');
else console.log('config-bundle         no bundle to open');
if (bundle) await step('config-bundle-G12', `/cpm/config?site=hdpe&scope=LOOP&ref=${CFG_LOOP}&bundle=${bundle}&gate=G12`, '.cpm-config-table tbody tr');

console.log('pageerrors', errors);
writeFileSync(join(outDir, 'pages-perf.json'), JSON.stringify({ steps, errors }, null, 2));
await browser.close();
