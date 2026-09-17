// Ad-hoc probe: open one URL after login, wait, screenshot, and dump the layout facts of a
// selector (text, box sizes of charts). node scripts/validation/ui-v25-probe.mjs "<path>" "<selector>" [waitMs] [outPng]
import { chromium } from 'playwright';

const BASE = process.env.UI_BASE ?? 'http://localhost:3000';
const [path, selector = 'main', waitMs = '8000', out = 'probe.png'] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: Number(process.env.VIEWPORT_H ?? 1400) } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 200)));
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="text"], input[name="username"], input[autocomplete="username"]', process.env.UI_USER ?? 'admin');
await page.fill('input[type="password"]', process.env.UI_PASS ?? 'ChangeMe123!');
await page.press('input[type="password"]', 'Enter');
await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 });
await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(Number(waitMs));
const facts = await page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return { missing: sel };
  const r = el.getBoundingClientRect();
  const charts = [...el.querySelectorAll('.cpm-chart, canvas, [_echarts_instance_]')].map(c => { const b = c.getBoundingClientRect(); return `${c.tagName.toLowerCase()}.${c.className && typeof c.className === 'string' ? c.className.split(' ')[0] : ''} ${Math.round(b.width)}x${Math.round(b.height)}`; });
  return { box: `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`, text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 1200), charts: charts.slice(0, 20), children: [...el.children].map(c => `${c.tagName.toLowerCase()}.${(c.className || '').toString().split(' ')[0]} ${Math.round(c.getBoundingClientRect().height)}px`) };
}, selector);
await page.screenshot({ path: out, fullPage: true });
console.log(JSON.stringify({ url: page.url().replace(BASE, ''), errors, facts }, null, 1));
await browser.close();
