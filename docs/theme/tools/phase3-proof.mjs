#!/usr/bin/env node
// PRM-004 R3 evidence, from a production build with VITE_CPA_COMPONENT_GALLERY=1: each component in
// both themes, axe, real keyboard results, computed-style contract checks, and the TrendPanel
// behaviours that need a real canvas. Sample data only; the guard stays on.
// Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD. Writes redesign/evidence/phase-3/proof.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { axeSource, chromium, requireEnv, login, goto, setTheme } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../redesign/evidence/phase-3');
const env = requireEnv();
const log = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
const checks = [];
const check = (id, name, pass, detail = '') => {
  checks.push({ id, name, pass: !!pass, detail: String(detail).slice(0, 200) });
  if (!pass) console.log(`  FAIL ${id} ${name} ${String(detail).slice(0, 160)}`);
};
const active = page => page.evaluate(() => {
  let a = document.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  return { tag: a?.tagName, label: a?.getAttribute('aria-label') ?? a?.textContent?.trim().slice(0, 40), role: a?.getAttribute('role') };
});

async function axe(page) {
  await page.evaluate(src => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s); } }, axeSource);
  return page.evaluate(async () => {
    const r = await window.axe.run(document.querySelector('.gallery'), { resultTypes: ['violations'] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, count: v.nodes.length, target: v.nodes[0]?.target?.join(' ')?.slice(0, 90), help: v.help }));
  });
}

async function computed(page, theme) {
  const m = await page.evaluate(() => {
    const cs = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : null; };
    const h = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : null; };
    const painted = document.querySelector('.ui-button obc-button')?.shadowRoot?.querySelector('.visible-wrapper');
    return {
      select: h('.gallery [data-component="6.10"] select'), input: h('.gallery [data-component="6.10"] input[type="text"], .gallery [data-component="6.10"] input:not([type])'),
      radius: cs('.gallery [data-component="6.10"] select', 'borderTopLeftRadius'),
      th: cs('.ui-table th', 'fontSize'), thCase: cs('.ui-table th', 'textTransform'), row: h('.ui-table--default tbody tr'), rowCompact: h('.ui-table--compact tbody tr'),
      badgeRadius: cs('.ui-badge', 'borderTopLeftRadius'), badgeSize: cs('.ui-badge', 'fontSize'),
      panelRadius: cs('.gallery__section', 'borderTopLeftRadius'), inspector: Math.round(document.querySelector('.ui-inspector')?.getBoundingClientRect().width ?? 0),
      buttonPainted: painted ? Math.round(painted.getBoundingClientRect().height) : null,
      buttonHostGap: Math.max(...[...document.querySelectorAll('.ui-button obc-button')].map(h => Math.round(h.getBoundingClientRect().width - h.shadowRoot.querySelector('button').getBoundingClientRect().width))),
      ne107: ['f', 'c', 's', 'm'].map(c => cs(`.ui-ne107__chip--${c}`, 'backgroundColor')),
    };
  });
  const t = `(${theme})`;
  check('6.10', `select 40 px ${t}`, m.select === 40, m.select);
  check('6.10', `input 40 px ${t}`, m.input === 40, m.input);
  check('6.10', `control radius 6 px ${t}`, m.radius === '6px', m.radius);
  check('6.5', `heading 12 px uppercase ${t}`, m.th === '12px' && m.thCase === 'uppercase', `${m.th} ${m.thCase}`);
  check('6.5', `row 44 px ${t}`, m.row === 44, m.row);
  check('6.5', `compact row 40 px ${t}`, m.rowCompact === 40, m.rowCompact);
  check('6.8', `badge 12 px, radius 6 ${t}`, m.badgeSize === '12px' && m.badgeRadius === '6px', `${m.badgeSize} ${m.badgeRadius}`);
  check('6.6', `inspector 320 to 400 px ${t}`, m.inspector >= 320 && m.inspector <= 400, m.inspector);
  check('6.15', `button paints 40 px ${t}`, m.buttonPainted === 40, m.buttonPainted);
  check('6.15', `button host no wider than the button ${t}`, m.buttonHostGap === 0, m.buttonHostGap);
  return m;
}

async function keyboard(page) {
  const seg = page.locator('[data-component="6.9"] .ui-segmented__option').first();
  await seg.focus();
  await page.keyboard.press('ArrowRight');
  check('6.9', 'segmented: arrow moves and selects', await page.locator('[data-component="6.9"] .ui-segmented__option').nth(1).getAttribute('aria-pressed') === 'true');

  const tab = page.locator('[data-component="6.9"] [role="tab"]').first();
  await tab.focus();
  await page.keyboard.press('ArrowRight');
  check('6.9', 'tabs: arrow moves and selects', await page.locator('[data-component="6.9"] [role="tab"]').nth(1).getAttribute('aria-selected') === 'true');
  await page.keyboard.press('Home');

  const head = page.locator('.ui-table').first().locator('th button').first();
  await head.focus();
  await page.keyboard.press('Enter');
  const th = page.locator('.ui-table').first().locator('th').first();
  check('6.5', 'sort by keyboard updates aria-sort', ['ascending', 'descending'].includes(await th.getAttribute('aria-sort')));
  const row = page.locator('.ui-table').first().locator('tbody tr').first();
  await row.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check('6.5', 'row: arrow moves, Enter selects', await page.locator('.ui-table').first().locator('tbody tr').nth(1).getAttribute('aria-current') === 'true');

  const open = page.locator('[data-component="6.11"] obc-button').first();
  await open.click();
  await page.waitForSelector('.ui-dialog');
  let a = await active(page);
  check('6.11', 'dialog: focus starts inside', await page.evaluate(() => {
    let e = document.activeElement;
    return !!e?.closest?.('.ui-dialog');
  }), JSON.stringify(a));
  const seen = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); seen.push(await page.evaluate(() => !!document.activeElement?.closest?.('.ui-dialog'))); }
  check('6.11', 'dialog: Tab stays inside, shadow buttons included', seen.every(Boolean), seen.join());
  await page.keyboard.press('Escape');
  check('6.11', 'dialog: Esc closes', await page.locator('.ui-dialog').count() === 0);
  check('6.11', 'dialog: focus returns to the trigger', await page.evaluate(() => !!document.activeElement?.closest?.('[data-component="6.11"]')));

  const tip = page.locator('[data-component="6.7"] button').first();
  await tip.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check('6.7', 'toggletip: Enter opens, aria-expanded', await tip.getAttribute('aria-expanded') === 'true');
  const panel = await tip.getAttribute('aria-controls');
  check('6.7', 'toggletip: content from the registry', (await page.locator(`[id="${panel}"]`).innerText()).length > 60);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  check('6.7', 'toggletip: Esc closes and focus returns', await tip.getAttribute('aria-expanded') === 'false' && await page.evaluate(() => document.activeElement?.closest?.('[data-component="6.7"]') != null));

  const combo = page.locator('[data-component="6.14"] [role="combobox"]');
  await combo.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check('6.14', 'picker: keyboard selects', (await combo.inputValue()).length > 0, await combo.inputValue());

  const sum = page.locator('[data-component="6.13"] summary');
  await sum.focus();
  await page.keyboard.press('Enter');
  check('6.13', 'details: Enter expands', await page.locator('[data-component="6.13"] details').evaluate(e => e.open));
  check('6.13', 'details: a copy button for each value', await page.locator('[data-component="6.13"] button').count() >= 2);
}


/** Does the canvas draw anything inside this x fraction of the plot? Uses the real rendered pixels. */
async function trendPanel(page, theme) {
  await page.locator('[data-component="6.4"]').scrollIntoViewIfNeeded();
  const first = page.locator('.trend').first();
  await page.waitForTimeout(700);
  const plotted = await first.locator('[data-testid="trend-plotted"]').innerText();
  check('6.4', `plotted label names the window and zone (${theme})`, /GST|GMT\+4/.test(plotted) && /to/.test(plotted), plotted);

  const zoneOnAxis = await page.evaluate(() => [...document.querySelectorAll('.trend__source, .trend__plotted')].map(e => e.textContent).join(' '));
  check('6.4', 'source and aggregation line present', /Sample data/.test(zoneOnAxis) && /1 min samples/.test(zoneOnAxis));

  const slider = first.locator('.trend__focus[role="slider"]').first();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(350);
  const live = await first.locator('[data-testid="trend-live"]').innerText();
  check('6.4', 'keyboard cursor states the reading', /PV/.test(live) && /kg\/h/.test(live), live);

  // Tooltip themed, on a real canvas.
  const tooltip = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.trend__canvas div')].find(d => getComputedStyle(d).position === 'absolute' && /PV/.test(d.textContent ?? '') && d.offsetHeight > 0);
    return t ? { bg: getComputedStyle(t).backgroundColor, color: getComputedStyle(t).color, text: t.textContent.slice(0, 120) } : null;
  });
  const want = await page.evaluate(() => {
    const s = document.createElement('span');
    s.style.color = 'var(--traverse-chart-tooltip-bg)';
    document.body.appendChild(s);
    const c = getComputedStyle(s).color;
    s.remove();
    return c;
  });
  check('6.4', `tooltip draws on keyboard, themed (${theme})`, tooltip && tooltip.bg === want, JSON.stringify({ tooltip, want }));
  check('6.4', `tooltip names the zone (${theme})`, tooltip && /GST|GMT\+4/.test(tooltip.text), tooltip?.text);
  await page.screenshot({ path: path.join(out, `screenshots/${theme}/trend-cursor.png`), animations: 'disabled' });

  // Value table.
  await first.getByText('Show value table').click();
  await page.waitForTimeout(250);
  const table = first.locator('table');
  check('6.4', 'value table is a native table with units', await table.count() === 1 && /kg\/h/.test(await table.innerText()), (await table.innerText().catch(() => '')).slice(0, 100));
  await first.getByText('Hide value table').click();

  // Zoom in, label follows, Undo, Reset.
  await slider.focus();
  await first.getByText('Zoom in').click();
  await page.waitForTimeout(400);
  const zoomed = await first.locator('[data-testid="trend-plotted"]').innerText();
  check('6.4', 'zoom changes the plotted label', zoomed !== plotted, zoomed);
  await first.getByText('Undo zoom').click();
  await page.waitForTimeout(300);
  check('6.4', 'undo restores the label', await first.locator('[data-testid="trend-plotted"]').innerText() === plotted);
  await first.getByText('Zoom in').click();
  await page.waitForTimeout(300);
  await first.getByText('Reset').click();
  await page.waitForTimeout(300);
  check('6.4', 'reset restores the label', await first.locator('[data-testid="trend-plotted"]').innerText() === plotted);
  await page.keyboard.press('Escape');
}

/** Real echarts.connect: hovering one panel moves the other panel's cursor, read from pixels. */
async function cursorSync(page) {
  const box = await page.locator('.trend__canvas').first().boundingBox();
  const snap = i => page.evaluate(idx => document.querySelectorAll('.trend__canvas')[idx]?.querySelector('canvas')?.toDataURL(), i);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(350);
  const before = await snap(1);
  await page.mouse.move(box.x + box.width * 0.3, box.y + 90);
  await page.waitForTimeout(450);
  const after = await snap(1);
  check('6.4', 'cursor sync across connected panels (real canvas)', !!before && before !== after);
  await page.mouse.move(5, 5);
}

/** The hatch and the broken line, measured on the real canvas. */
async function gapPixels(page, theme) {
  const res = await page.evaluate(() => {
    const c = document.querySelector('.trend__canvas canvas');
    const g = c.getContext('2d');
    const { width, height } = c;
    const col = x => {
      const d = g.getImageData(Math.round(width * x), 0, 1, Math.round(height * 0.5)).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3]}`);
      return seen.size;
    };
    // Sample evenly across the plot, so the outage is found by its pixels and not by assumption.
    return { width, height, colours: Array.from({ length: 40 }, (_, i) => col(0.08 + i * 0.022)) };
  });
  check('6.4', `no-sample stretch differs from the plotted line (${theme})`, Math.max(...res.colours) !== Math.min(...res.colours), res.colours.join());
  await page.locator('.trend').first().screenshot({ path: path.join(out, `screenshots/${theme}/trend-gap.png`), animations: 'disabled' });
}

async function main() {
  fs.mkdirSync(path.join(out, 'screenshots/day'), { recursive: true });
  fs.mkdirSync(path.join(out, 'screenshots/night'), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  await installGuard(page, log, { ratePerMin: 50 });
  await login(page, env);
  const result = { axe: {}, computed: {} };
  for (const theme of ['day', 'night']) {
    await goto(page, '/cpm/gallery');
    await page.waitForSelector('.gallery', { timeout: 15000 });
    await setTheme(page, theme);
    await page.waitForTimeout(700);
    result.computed[theme] = await computed(page, theme);
    result.axe[theme] = await axe(page);
    const bad = result.axe[theme].filter(v => v.impact === 'critical' || v.impact === 'serious');
    check('axe', `0 critical, 0 serious (${theme})`, bad.length === 0, bad.map(b => `${b.id}: ${b.target}`).join(' | '));
    for (const section of await page.locator('[data-component]').all()) {
      const id = await section.getAttribute('data-component');
      await section.screenshot({ path: path.join(out, `screenshots/${theme}/${id}.png`), animations: 'disabled' });
    }
    await gapPixels(page, theme);
    await trendPanel(page, theme);
  }
  await setTheme(page, 'day');
  await goto(page, '/cpm/gallery');
  await page.waitForSelector('.gallery');
  await page.waitForTimeout(700);
  await page.locator('[data-component="6.4"]').scrollIntoViewIfNeeded();
  await cursorSync(page);
  await keyboard(page);

  // The drawer below 1280 px.
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForTimeout(300);
  await page.locator('[data-component="6.6"] obc-button').first().click();
  await page.waitForSelector('.ui-inspector--drawer');
  check('6.6', 'drawer below 1280 px, modal', await page.locator('.ui-inspector--drawer').getAttribute('aria-modal') === 'true');
  await page.keyboard.press('Escape');
  check('6.6', 'drawer: Esc closes', await page.locator('.ui-inspector--drawer').count() === 0);
  await browser.close();

  result.checks = checks;
  result.summary = { total: checks.length, failed: checks.filter(c => !c.pass).length, blocked: log.blocked.length, http429: log.http429.length };
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result.summary));
  for (const t of ['day', 'night']) console.log(t, 'axe', JSON.stringify(result.axe[t].map(v => `${v.impact}:${v.id}:${v.count}`)));
}

main().catch(e => { console.error(e.message); process.exit(1); });
