#!/usr/bin/env node
// PRM-003 Part E.6: annotated images by content class, Internal included. Boxes are a temporary browser overlay.
// Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD. Usage: node docs/theme/tools/annotate-v2.mjs slug slug ...
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, requireEnv, login, goto, setTheme, trackNetwork, waitStable } from './lib/session.mjs';
import { textMetrics } from './lib/dom-metrics.mjs';
import { installGuard } from './lib/guard.mjs';
import { ENTRIES } from './lib/entries.mjs';
import { classifyV2 } from './lib/text-rules-v2.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../deep/annotated');
const env = requireEnv();
const COLOUR = { Keep: '#7a8794', Shorten: '#c98a00', 'Move to help': '#1764c0', Remove: '#b42332', Internal: '#6c45c0' };
const log = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };

function draw({ boxes, legend, colours }) {
  const root = document.createElement('div');
  root.id = 'cap-overlay';
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:12px sans-serif';
  for (const b of boxes) {
    const d = document.createElement('div');
    const c = colours[b.cls];
    d.style.cssText = `position:fixed;left:${b.x - 2}px;top:${b.y - 1}px;width:${b.w + 4}px;height:${b.h + 2}px;border:${b.cls === 'Keep' ? 1 : 2}px ${b.cls === 'Keep' ? 'dotted' : 'solid'} ${c};background:${b.cls === 'Keep' ? 'transparent' : `${c}22`}`;
    root.appendChild(d);
  }
  const l = document.createElement('div');
  l.style.cssText = 'position:fixed;right:12px;top:72px;background:#fff;color:#152238;border:1px solid #75879c;padding:8px 10px;line-height:1.6';
  for (const [k, n] of legend) {
    const row = document.createElement('div');
    const swatch = document.createElement('span');
    swatch.style.cssText = `display:inline-block;width:12px;height:12px;margin-right:6px;vertical-align:-1px;background:${colours[k]}`;
    row.append(swatch, `${k}: ${n} blocks`);
    l.appendChild(row);
  }
  root.appendChild(l);
  document.body.appendChild(root);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  const net = trackNetwork(page);
  await installGuard(page, log, { ratePerMin: 45 });
  await login(page, env);
  await setTheme(page, 'day');
  fs.mkdirSync(outDir, { recursive: true });
  for (const slug of process.argv.slice(2)) {
    const e = ENTRIES.find(x => x.slug === slug);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await goto(page, e.url);
    await page.waitForTimeout(300);
    await waitStable(page, net, { timeout: 30000 });
    await page.waitForTimeout(2500);
    const h = await page.evaluate(() => Math.ceil(Math.max(...[...document.querySelectorAll('.page-content,.app-main')].map(x => x.scrollHeight), 0) + (document.querySelector('main')?.getBoundingClientRect().top ?? 0)));
    await page.setViewportSize({ width: 1440, height: Math.min(Math.max(h + 16, 1024), 6000) });
    await page.waitForTimeout(500);
    const t = await page.evaluate(textMetrics, { rootSelector: 'main', withRects: true });
    const boxes = t.raw.map(b => ({ ...b.rect, cls: classifyV2({ ...b, n: 1 }, slug).cls })).filter(b => b.w > 2 && b.h > 2);
    const legend = Object.keys(COLOUR).map(k => [k, boxes.filter(b => b.cls === k).length]);
    await page.evaluate(draw, { boxes, legend, colours: COLOUR });
    await page.screenshot({ path: path.join(outDir, `${slug}.png`), animations: 'disabled' });
    await page.evaluate(() => document.getElementById('cap-overlay')?.remove());
    console.log(slug, JSON.stringify(legend));
  }
  await browser.close();
  console.log(`done blocked=${log.blocked.length}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
