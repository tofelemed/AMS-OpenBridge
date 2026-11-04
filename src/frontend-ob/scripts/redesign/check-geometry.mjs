#!/usr/bin/env node
// PRM-004 gate: RD9 measurements on the rendered shell, in both themes, at the reference widths.
// Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD and a production build. Read-only: the guard stays on.
// Writes the measurements to docs/theme/redesign/evidence/phase-<THEME_PHASE>/geometry.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const lib = f => pathToFileURL(path.join(repo, 'docs/theme/tools/lib', f)).href;
const { chromium, requireEnv, login, goto, setTheme, trackNetwork, waitStable } = await import(lib('session.mjs'));
const { installGuard } = await import(lib('guard.mjs'));

const phase = process.env.THEME_PHASE ?? '2';
const out = path.join(repo, `docs/theme/redesign/evidence/phase-${phase}`);
const env = requireEnv();
const log = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };

// width, height, expected band. 200 % zoom on a 1440 × 1024 screen is 720 × 512 CSS pixels.
const VIEWPORTS = [[1440, 1024, 'wide'], [1366, 768, 'wide'], [1280, 800, 'wide'], [1279, 800, 'rail'], [1024, 768, 'rail'], [1023, 768, 'drawer'], [720, 512, 'drawer']];

function measure() {
  const rect = s => document.querySelector(s)?.getBoundingClientRect();
  const header = rect('.shell__header');
  const sidebar = rect('.shell__sidebar');
  const content = document.querySelector('.shell__main > .page-content');
  const controls = [...document.querySelectorAll('.shell__header .ui-control')].filter(e => e.getBoundingClientRect().width > 0);
  const selected = document.querySelector('.shell-nav__item[aria-current="page"]');
  const css = selected ? getComputedStyle(selected) : null;
  const headerEl = document.querySelector('.shell__header');
  return {
    mains: document.querySelectorAll('main').length,
    skipLink: !!document.querySelector('.shell__skip'),
    headerHeight: Math.round(header?.height ?? 0),
    sidebarWidth: sidebar ? Math.round(sidebar.width) : null,
    contentPadding: content ? getComputedStyle(content).paddingLeft : null,
    controlHeights: [...new Set(controls.map(e => Math.round(e.getBoundingClientRect().height)))],
    controlRadius: [...new Set(controls.map(e => getComputedStyle(e).borderTopLeftRadius))],
    selectedEdge: css?.boxShadow ?? null,
    selectedWeight: css?.fontWeight ?? null,
    headerOverflow: headerEl ? headerEl.scrollWidth - headerEl.clientWidth : null,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}

const check = (m, band) => {
  const bad = [];
  if (m.mains !== 1) bad.push(`main elements ${m.mains}`);
  if (!m.skipLink) bad.push('no skip link');
  if (m.headerHeight !== 64) bad.push(`header ${m.headerHeight}`);
  if (band === 'wide' && m.sidebarWidth !== 220) bad.push(`sidebar ${m.sidebarWidth}`);
  if (band === 'rail' && m.sidebarWidth !== 64) bad.push(`rail ${m.sidebarWidth}`);
  if (band === 'drawer' && m.sidebarWidth !== null) bad.push('sidebar shown in the drawer band');
  if (m.contentPadding !== '24px') bad.push(`content padding ${m.contentPadding}`);
  if (m.controlHeights.join() !== '40') bad.push(`control heights ${m.controlHeights}`);
  if (m.controlRadius.join() !== '6px') bad.push(`control radius ${m.controlRadius}`);
  if (band !== 'drawer' && !/ 3px 0px 0px 0px inset|inset 3px 0px 0px 0px/.test(m.selectedEdge ?? '') && !/3px 0px 0px/.test(m.selectedEdge ?? '')) bad.push(`selected edge ${m.selectedEdge}`);
  if (band !== 'drawer' && Number(m.selectedWeight) < 600) bad.push(`selected weight ${m.selectedWeight}`);
  if (m.headerOverflow > 0) bad.push(`header overflows by ${m.headerOverflow}`);
  if (m.pageOverflow > 0) bad.push(`page overflows by ${m.pageOverflow}`);
  return bad;
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
const net = trackNetwork(page);
await installGuard(page, log, { ratePerMin: 50 });
await login(page, env);
await goto(page, '/cpm/performance');
await waitStable(page, net, { timeout: 12000, quietMs: 300 });

const rows = [];
for (const theme of ['day', 'night']) {
  await setTheme(page, theme);
  for (const [width, height, band] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const m = await page.evaluate(measure);
    rows.push({ theme, width, height, band, ...m, failures: check(m, band) });
  }
}
await setTheme(page, 'day');
await browser.close();

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'geometry.json'), JSON.stringify(rows, null, 1));
const failed = rows.filter(r => r.failures.length);
for (const r of failed) console.error(`${r.theme} ${r.width}x${r.height}: ${r.failures.join('; ')}`);
console.log(`check-geometry: ${rows.length} measurements, ${failed.length} failing, blocked ${log.blocked.length}`);
process.exit(failed.length ? 1 : 0);
