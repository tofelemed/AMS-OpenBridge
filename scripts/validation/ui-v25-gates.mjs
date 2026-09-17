// Per-gate workbench probe: one login, then every gate of one fused window (its method_run_ids JSON)
// opened in the Evidence Workbench; records the state panel / chart count / centre text per gate.
//   node scripts/validation/ui-v25-gates.mjs <loopId> <runIdsJsonPath> [outDir]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.UI_BASE ?? 'http://localhost:3000';
const [loopId, runIdsPath, outDir = '.'] = process.argv.slice(2);
const runIds = JSON.parse(readFileSync(runIdsPath, 'utf8'));
mkdirSync(outDir, { recursive: true });
const order = ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="text"], input[name="username"], input[autocomplete="username"]', process.env.UI_USER ?? 'admin');
await page.fill('input[type="password"]', process.env.UI_PASS ?? 'ChangeMe123!');
await page.press('input[type="password"]', 'Enter');
await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 });

for (const gate of order) {
  const id = runIds[gate];
  if (!id) { console.log(`${gate.padEnd(4)} no run id`); continue; }
  await page.goto(`${BASE}/cpm/evidence?loop=${loopId}&methodRun=${id}&gate=${gate}&mode=FIXED`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const f = await page.evaluate(() => {
    const centre = document.querySelector('.cpm-evidence-centre');
    const txt = el => (el?.innerText || '').replace(/\s+/g, ' ').trim();
    const state = document.querySelector('.cpm-gate-state');
    const charts = centre ? centre.querySelectorAll('canvas').length : 0;
    const heads = centre ? [...centre.querySelectorAll('h3, h2')].map(txt).slice(0, 8) : [];
    const lanes = centre ? [...centre.querySelectorAll('p, .cpm-copy')].map(txt).filter(t => /lane|intervals/.test(t)).slice(0, 4) : [];
    return { charts, state: state ? txt(state).slice(0, 160) : null, heads, lanes, centreChars: txt(centre).length };
  });
  await page.screenshot({ path: join(outDir, `gate-${gate}.png`), fullPage: true });
  console.log(`${gate.padEnd(4)} charts=${f.charts} centreChars=${f.centreChars} state=${f.state ?? '-'} heads=${JSON.stringify(f.heads)}`);
}
console.log('pageerrors', errors);
await browser.close();
