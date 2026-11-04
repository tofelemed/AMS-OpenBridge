#!/usr/bin/env node
// PRM-004 §5.2 evidence. Captures routes in Day and Night from a production build, with the read-only guard on.
// Images go to redesign/evidence/phase-N/screenshots/ (git-ignored, archived outside the repository).
// Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD. Usage: node docs/theme/tools/redesign-evidence.mjs --phase 1 [--routes a,b] [--sizes 1440x1024,1280x800]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, requireEnv, login, goto, trackNetwork, waitStable } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';
import { ENTRIES } from './lib/entries.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const phase = arg('--phase', '1');
const out = path.resolve(here, `../redesign/evidence/phase-${phase}`);
const only = arg('--routes')?.split(',');
const sizes = arg('--sizes', '1440x1024').split(',').map(s => s.split('x').map(Number));
const env = requireEnv();
const log = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
const entries = ENTRIES.filter(e => (only ? only.includes(e.slug) : e.level === 'route'));

async function selectTheme(page, theme) {
  await page.evaluate(t => {
    const buttons = [...document.querySelectorAll('button')];
    const b = buttons.find(x => (x.getAttribute('aria-label') ?? x.textContent ?? '').trim().toLowerCase().includes(t) && x.closest('.app-topbar, header'));
    b?.click();
  }, theme);
  await page.waitForFunction(t => document.documentElement.getAttribute('data-theme') === t, theme, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(450);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  const net = trackNetwork(page);
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().replace(/Bearer\s+\S+/g, 'Bearer <redacted>').slice(0, 160)); });
  await installGuard(page, log, { ratePerMin: Number(process.env.CPA_RATE ?? 50) });
  await login(page, env);
  const manifest = { phase, capturedAt: new Date().toISOString(), base: env.base, sizes: sizes.map(s => s.join('x')), routes: {} };
  for (const e of entries) {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await goto(page, e.url);
    await page.waitForTimeout(300);
    const s = await waitStable(page, net, { timeout: 15000, quietMs: 450 });
    const finalUrl = await page.evaluate(() => location.pathname + location.search);
    const rec = (manifest.routes[e.slug] = { url: e.url, finalUrl, stable: s.stable, ms: s.msToStable, shots: [] });
    for (const theme of ['day', 'night']) {
      await selectTheme(page, theme);
      for (const [w, h] of sizes) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(250);
        const rel = `screenshots/${theme}/${w}x${h}/${e.slug}.png`;
        fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
        await page.screenshot({ path: path.join(out, rel), animations: 'disabled' });
        rec.shots.push(rel);
      }
    }
    await selectTheme(page, 'day');
    console.log(e.slug, s.msToStable);
  }
  manifest.log = { blocked: log.blocked, http429: log.http429.length, apiCalls: log.apiCalls };
  manifest.consoleErrors = [...new Set(consoleErrors)].slice(0, 30);
  fs.writeFileSync(path.join(out, 'evidence-manifest.json'), JSON.stringify(manifest, null, 1));
  await browser.close();
  console.log(`done routes=${entries.length} blocked=${log.blocked.length} 429=${log.http429.length} consoleErrors=${manifest.consoleErrors.length}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
