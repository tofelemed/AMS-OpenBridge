#!/usr/bin/env node
// CPA reflow capture (PRM-003 Part C.2, Part I): guide breakpoints and 200 % zoom, Day and Night.
// Read-only: navigates and resizes only. Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD.
// Writes deep/screenshots/<theme>/<viewport>/ and deep/data/reflow.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, requireEnv, login, goto, setTheme, trackNetwork, waitStable } from './lib/session.mjs';
import { overflowFacts } from './lib/dom-surfaces.mjs';
import { installGuard } from './lib/guard.mjs';
import { ENTRIES } from './lib/entries.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const deep = path.resolve(here, '../deep');
const env = requireEnv();
const SIZES = [[1366, 768], [1920, 1080], [1280, 800], [1024, 768]];
const THEMES = ['day', 'night'];
const entries = ENTRIES.filter(e => e.level === 'route' || e.key);
const log = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
const result = {};
const save = () => fs.writeFileSync(path.join(deep, 'data/reflow.json'), JSON.stringify({ log: { ...log }, result }, null, 1));

async function snap(page, rel) {
  const f = path.join(deep, 'screenshots', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  await page.screenshot({ path: f, animations: 'disabled' });
  return rel;
}

async function run(browser, opts, sizes, label) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const net = trackNetwork(page);
  await installGuard(page, log, { ratePerMin: Number(process.env.CPA_RATE ?? 40) });
  await login(page, env);
  for (const e of entries) {
    await page.setViewportSize(opts.viewport);
    await goto(page, e.url);
    await page.waitForTimeout(250);
    await waitStable(page, net, { timeout: 14000, quietMs: 400 });
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(350);
      const name = label ?? `${w}x${h}`;
      const rec = { ...(await page.evaluate(overflowFacts)), shots: {} };
      for (const t of THEMES) {
        await setTheme(page, t);
        rec.shots[t] = await snap(page, `${t}/${name}/${e.slug}.png`);
      }
      await setTheme(page, 'day');
      (result[e.slug] ??= {})[name] = rec;
    }
    console.log(e.slug, label ?? 'sizes');
    save();
  }
  await ctx.close();
}

async function main() {
  fs.mkdirSync(path.join(deep, 'data'), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  await run(browser, { viewport: { width: 1440, height: 1024 } }, SIZES);
  // 200 % browser zoom at a 1440 px window equals a 720 × 512 CSS viewport at device scale 2 (WCAG 1.4.4, 1.4.10).
  await run(browser, { viewport: { width: 720, height: 512 }, deviceScaleFactor: 2 }, [[720, 512]], 'zoom200');
  save();
  await browser.close();
  console.log(`done blocked=${log.blocked.length} 429=${log.http429.length}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
