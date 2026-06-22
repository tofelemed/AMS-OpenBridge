/**
 * Autonomous UI smoke — no user interaction. Requires frontend on :3000 and API on :8000.
 */
import { chromium } from 'playwright';

const BASE = process.env.AMS_UI_URL || 'http://127.0.0.1:3000';
const API = process.env.AMS_API_URL || 'http://127.0.0.1:8000';
const TIMEOUT = 60000;

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

async function waitForAlarms(page, minRows = 1) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const rows = await page.locator('.ag-center-cols-container .ag-row').count();
    if (rows >= minRows) return rows;
    await page.waitForTimeout(2000);
  }
  return await page.locator('.ag-center-cols-container .ag-row').count();
}

async function scrollGridToLoadRows(page) {
  await page.evaluate(() => {
    const vp = document.querySelector('.ag-body-viewport');
    if (vp) vp.scrollTop = vp.scrollHeight / 2;
  });
  await page.waitForTimeout(800);
}

async function selectFirstAlarmRow(page) {
  const checkbox = page.locator('.ag-center-cols-container .ag-row .ag-checkbox-input').first();
  if (await checkbox.count()) {
    await checkbox.check({ force: true });
  } else {
    await page.locator('.ag-center-cols-container .ag-row').first().click();
  }
  await page.waitForTimeout(400);
  const selected = await page.locator('.alarm-toolbar__selection-count').textContent().catch(() => null);
  return selected?.trim() || '1';
}

async function attemptAckFlow(page) {
  const ackBtn = page.locator('#btn-acknowledge');
  await ackBtn.waitFor({ state: 'visible', timeout: TIMEOUT });
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('#btn-acknowledge');
      return btn && !btn.disabled;
    },
    { timeout: TIMEOUT },
  );
  await ackBtn.click();

  const dialog = page.locator('.modal-content');
  await dialog.waitFor({ state: 'visible', timeout: 15000 });
  const confirm = dialog.locator('button.btn--primary:has-text("Acknowledge")').first();
  await confirm.click();

  await dialog.waitFor({ state: 'hidden', timeout: TIMEOUT }).catch(() => null);
  await page.waitForTimeout(2000);
}

async function main() {
  let browser;
  try {
    const health = await fetch(`${API}/api/v1/health/pipeline`, {
      headers: { Authorization: 'Bearer dev' },
    }).catch(() => null);
    record('API pipeline reachable', !!health, health ? `HTTP ${health.status}` : 'down');

    const alarmsRes = await fetch(`${API}/api/v1/alarms/active?limit=100`, {
      headers: { Authorization: 'Bearer dev' },
    }).catch(() => null);
    let unackedApi = 0;
    if (alarmsRes?.ok) {
      const body = await alarmsRes.json();
      const items = body.items ?? body;
      unackedApi = items.filter((a) => !a.acknowledged).length;
    }
    record('API unacked alarms available', unackedApi > 0, `unacked=${unackedApi}`);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);

    const t0 = Date.now();
    await page.goto(`${BASE}/alarms`, { waitUntil: 'domcontentloaded' });
    record('UI /alarms load', true, `${Date.now() - t0}ms`);

    await page.waitForSelector('.status-ribbon', { timeout: 30000 });
    const ribbon = await page.locator('.status-ribbon').textContent();
    record('Infrastructure ribbon visible', ribbon?.includes('Kafka'), ribbon?.slice(0, 120) ?? '');

    const rowCount = await waitForAlarms(page, 1);
    record('AG Grid rows visible', rowCount >= 1, `rows=${rowCount}`);

    await scrollGridToLoadRows(page);
    const afterScroll = await page.locator('.ag-center-cols-container .ag-row').count();
    record('AG Grid scroll stable', afterScroll >= 1, `rows after scroll=${afterScroll}`);

    const routes = ['/dashboard', '/historical', '/soe', '/analytics', '/admin'];
    for (const r of routes) {
      const t1 = Date.now();
      await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded' });
      record(`Navigate ${r}`, true, `${Date.now() - t1}ms`);
    }

    await page.goto(`${BASE}/alarms`);
    await waitForAlarms(page, 1);
    await scrollGridToLoadRows(page);

    if (unackedApi === 0) {
      record('ACK E2E flow', false, 'no unacked alarms in API — cannot test operator ACK');
    } else {
      try {
        const selected = await selectFirstAlarmRow(page);
        record('Alarm row selected', true, `selectionCount=${selected}`);
        await attemptAckFlow(page);
        record('ACK E2E flow', true, 'row selected, dialog confirmed');
      } catch (ackErr) {
        record('ACK E2E flow', false, String(ackErr));
      }
    }

    const failed = results.filter((r) => !r.pass).length;
    const outPath = process.env.AMS_UI_RESULTS || 'e:/AMS/scripts/validation/ui-results.json';
    const fs = await import('fs');
    await fs.promises.writeFile(outPath, JSON.stringify({ results, at: new Date().toISOString() }, null, 2));
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    record('UI automation', false, String(e));
    try {
      const outPath = process.env.AMS_UI_RESULTS || 'e:/AMS/scripts/validation/ui-results.json';
      const fs = await import('fs');
      await fs.promises.writeFile(outPath, JSON.stringify({ results, at: new Date().toISOString(), error: String(e) }, null, 2));
    } catch {}
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
