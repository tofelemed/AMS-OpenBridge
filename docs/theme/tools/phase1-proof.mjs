#!/usr/bin/env node
// PRM-004 Phase 1 proofs: first paint, storage migration, shadow-root computed style, chart theme switch.
// Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD and a production build. Read-only: the guard stays on.
// Writes docs/theme/redesign/evidence/phase-1/proof.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, requireEnv, login, goto, setTheme, trackNetwork, waitStable } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../redesign/evidence/phase-1');
const env = requireEnv();
const log = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
const result = {};
const nightBg = [11, 18, 32]; // surface.page, Night. Read from tokens in the page below as a cross-check.

/** Mean brightness of one screencast frame, decoded by the browser. */
async function brightness(decoder, b64) {
  return decoder.evaluate(async src => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0; let n = 0;
    for (let i = 0; i < d.length; i += 4 * 97) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
    return Math.round(sum / n);
  }, b64);
}

/** Loads /login with a stored Night choice and records every painted frame. Optionally strips the head script. */
async function firstPaint(browser, decoder, stripScript) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await ctx.addInitScript(() => localStorage.setItem('ams-theme', 'night'));
  const page = await ctx.newPage();
  if (stripScript) {
    await page.route('**/login', async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<script>[\s\S]*?<\/script>/, '');
      await route.fulfill({ response: res, body });
    });
  }
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  // Frames before the navigation commits show the blank tab, which is white in every theme.
  let committedAt = null;
  await cdp.send('Page.enable');
  cdp.on('Page.frameNavigated', e => { if (committedAt === null && e.frame.url.includes('/login')) committedAt = frames.length; });
  cdp.on('Page.screencastFrame', f => {
    frames.push(f.data);
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.goto(`${env.base}/login`, { waitUntil: 'load' });
  await page.waitForSelector('#login-operator-id');
  await page.waitForTimeout(1200);
  await cdp.send('Page.stopScreencast');
  const attrs = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), obc: document.documentElement.getAttribute('data-obc-theme'), bg: getComputedStyle(document.documentElement).backgroundColor }));
  const levels = [];
  for (const f of frames) levels.push(await brightness(decoder, f));
  await ctx.close();
  // A flash is a bright frame in a Night load. The login page's visual is dimmed, so its mean stays low.
  const painted = levels.slice(committedAt ?? 0).filter(v => v > 0);
  return { frames: frames.length, committedAt, levels, brightFrames: painted.filter(v => v > 128).length, ...attrs };
}

async function storageMigration(browser) {
  const rows = [];
  for (const stored of ['day', 'night', 'bright', 'light', 'dark', 'garbage']) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(v => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ams-theme', v); sessionStorage.setItem('seeded', '1'); } }, stored);
    const page = await ctx.newPage();
    await page.goto(`${env.base}/login`, { waitUntil: 'domcontentloaded' });
    rows.push({ stored, ...(await page.evaluate(() => ({ dataTheme: document.documentElement.getAttribute('data-theme'), dataObcTheme: document.documentElement.getAttribute('data-obc-theme'), after: localStorage.getItem('ams-theme') }))) });
    await ctx.close();
  }
  const fresh = await browser.newContext();
  const p = await fresh.newPage();
  await p.goto(`${env.base}/login`, { waitUntil: 'domcontentloaded' });
  rows.push({ stored: null, ...(await p.evaluate(() => ({ dataTheme: document.documentElement.getAttribute('data-theme'), dataObcTheme: document.documentElement.getAttribute('data-obc-theme'), after: localStorage.getItem('ams-theme') }))) });
  await fresh.close();
  return rows;
}

// Runs in the page: compares what a button paints inside its shadow root with the Traverse value.
function shadowStyles() {
  const token = n => {
    const s = document.createElement('span');
    s.style.color = `var(--traverse-${n})`;
    document.body.appendChild(s);
    const v = getComputedStyle(s).color;
    s.remove();
    return v;
  };
  const expected = { raised: ['action-primary', 'action-on'], normal: [null, 'text-primary'], flat: [null, 'text-secondary'] };
  const rows = [];
  const seen = new Set();
  for (const host of document.querySelectorAll('obc-button')) {
    const variant = host.getAttribute('variant') ?? host.variant ?? 'normal';
    if (seen.has(variant) || host.hasAttribute('disabled') || host.disabled) continue;
    const box = host.shadowRoot?.querySelector('.visible-wrapper') ?? host.shadowRoot?.querySelector('[part="visible-wrapper"]');
    if (!box) continue;
    seen.add(variant);
    const cs = getComputedStyle(box);
    const rect = box.getBoundingClientRect();
    const want = expected[variant];
    rows.push({ variant, background: cs.backgroundColor, color: cs.color, wantBackground: want?.[0] ? token(want[0]) : 'rgba(0, 0, 0, 0)', wantColor: want ? token(want[1]) : null, paintedHeight: Math.round(rect.height), radius: cs.borderTopLeftRadius });
  }
  const root = getComputedStyle(document.documentElement);
  const samples = [['--container-background-color', 'surface-panel'], ['--element-active-color', 'text-primary'], ['--instrument-enhanced-primary-color', 'action-primary'], ['--border-focus-color', 'focus']];
  const variables = samples.map(([name, tok]) => ({ name, token: tok, value: root.getPropertyValue(name).trim(), traverse: root.getPropertyValue(`--traverse-${tok}`).trim() }));
  return { rows, variables, body: getComputedStyle(document.body).backgroundColor, page: token('surface-page') };
}

async function shadowEvidence(page, net) {
  const out2 = {};
  await goto(page, '/cpm/registry');
  await waitStable(page, net, { timeout: 15000 });
  for (const theme of ['day', 'night']) {
    await setTheme(page, theme);
    await page.waitForTimeout(250);
    out2[theme] = await page.evaluate(shadowStyles);
  }
  await setTheme(page, 'day');
  return out2;
}

async function chartSwitch(page, net) {
  await goto(page, '/cpm/historical?loop=FIC10302');
  await page.waitForTimeout(400);
  await waitStable(page, net, { timeout: 20000 });
  const nav = () => page.evaluate(() => performance.getEntriesByType('navigation').length + ':' + performance.timeOrigin);
  const canvas = () => page.evaluate(() => {
    const c = document.querySelector('main canvas');
    return c ? { hash: c.toDataURL().length + ':' + c.toDataURL().slice(-120), w: c.width } : null;
  });
  const before = { nav: await nav(), canvas: await canvas() };
  await setTheme(page, 'night');
  await page.waitForTimeout(900);
  const after = { nav: await nav(), canvas: await canvas() };
  await setTheme(page, 'day');
  return { reloaded: before.nav !== after.nav, canvasChanged: before.canvas?.hash !== after.canvas?.hash, hadCanvas: !!before.canvas };
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const decoderCtx = await browser.newContext();
  const decoder = await decoderCtx.newPage();
  result.nightPageExpected = nightBg;
  result.firstPaint = { withScript: await firstPaint(browser, decoder, false), scriptRemoved: await firstPaint(browser, decoder, true) };
  result.firstPaint.methodDetectsFlash = result.firstPaint.scriptRemoved.brightFrames > 0;
  result.firstPaint.pass = result.firstPaint.withScript.brightFrames === 0 && result.firstPaint.methodDetectsFlash;
  result.storage = await storageMigration(browser);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  const net = trackNetwork(page);
  await installGuard(page, log, { ratePerMin: 40 });
  await login(page, env);
  result.shadow = await shadowEvidence(page, net);
  result.chartSwitch = await chartSwitch(page, net);
  result.log = { blocked: log.blocked.length, http429: log.http429.length };
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(result, null, 1));
  await browser.close();
  console.log(JSON.stringify({ firstPaint: { on: result.firstPaint.withScript.brightFrames, off: result.firstPaint.scriptRemoved.brightFrames, framesOn: result.firstPaint.withScript.frames, framesOff: result.firstPaint.scriptRemoved.frames, pass: result.firstPaint.pass }, storage: result.storage.map(r => `${r.stored}->${r.dataTheme}/${r.after}`), chartSwitch: result.chartSwitch, log: result.log }));
  console.log(JSON.stringify(result.shadow.day.rows), JSON.stringify(result.shadow.night.rows));
}

main().catch(e => { console.error(e.message); process.exit(1); });
