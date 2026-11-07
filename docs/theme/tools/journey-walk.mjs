// Clicks every row of the CPA Navigation map on lab data and asserts where it lands (path and context parameters),
// or, for a dialog, that a role=dialog with its title opens and Esc closes it. Steps live in lib/journey-steps.mjs.
// Read-only: runs under the guard, so no non-GET call can pass; a control that would write is opened only as far as its dialog.
// Outcomes: PASS, FAIL (with the actual URL or what was found), UNTESTED (with the reason; a missing control is never a pass).
// Usage: node journey-walk.mjs <out.json>. CPA_BASE_URL, CPA_USER and CPA_PASSWORD (and CPA_LOOP) come only from the environment.
import { writeFileSync } from 'node:fs';
import { chromium, requireEnv, login, goto, trackNetwork, waitStable } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';
import { STEPS } from './lib/journey-steps.mjs';

const LOOP = process.env.CPA_LOOP ?? 'FIC10401';
const STEP_TIMEOUT_MS = 90000;
const [outFile] = process.argv.slice(2);
if (!outFile) { console.error('Usage: node journey-walk.mjs <out.json>'); process.exit(2); }
const env = requireEnv();

let browser; let p; let net; let guard; let crashed = false;
async function boot() {
  if (browser) await browser.close().catch(() => {});
  browser = await chromium.launch({ headless: true });
  p = await (await browser.newContext({ viewport: { width: 1440, height: 1024 }, acceptDownloads: true })).newPage();
  crashed = false;
  p.on('crash', () => { crashed = true; });
  net = trackNetwork(p);
  const old = guard;
  guard = { blocked: old?.blocked ?? [], http429: old?.http429 ?? [], apiCalls: old?.apiCalls ?? 0, pacedMs: old?.pacedMs ?? 0, trigger: null };
  await installGuard(p, guard, { ratePerMin: 120, burst: 60 });
  await login(p, env);
}
const settle = async () => { await waitStable(p, net, { timeout: 10000, quietMs: 400 }); await p.waitForTimeout(200); };
async function open(url) { await goto(p, '/trend'); await p.waitForTimeout(150); await goto(p, url); await settle(); }

const src = a => (a instanceof RegExp ? { re: a.source, flags: a.flags } : { str: String(a) });

/** Tags the control to click with data-jw-hit. Returns 'found', 'disabled' (only disabled matches) or 'none'. */
async function find(action) {
  const a = typeof action === 'object' && !(action instanceof RegExp) ? action : { text: action };
  const spec = { sel: a.sel ?? null, text: a.text == null ? null : src(a.text), dialog: !!a.dialog, role: a.role ?? null, skip: a.skip ?? 0 };
  return p.evaluate(s => {
    document.querySelectorAll('[data-jw-hit]').forEach(e => e.removeAttribute('data-jw-hit'));
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog[open]')];
    const root = s.dialog ? dialogs[dialogs.length - 1] : (document.querySelector('#main-content') ?? document);
    if (!root) return 'none';
    const clean = t => (t ?? '').replace(/\s+/g, ' ').trim();
    const shown = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const matches = t => {
      if (!s.text) return true;
      if (s.text.re) return new RegExp(s.text.re, s.text.flags).test(t);
      return t.toLowerCase().startsWith(s.text.str.toLowerCase());
    };
    const base = s.sel ?? (s.role ? `[role="${s.role}"]` : 'a[href], button, obc-button, [role="button"], [role="tab"], [role="link"]');
    const nodes = [...root.querySelectorAll(base)].filter(e => shown(e) && matches(clean(e.textContent)));
    const live = nodes.filter(e => !e.hasAttribute('disabled') && e.getAttribute('aria-disabled') !== 'true');
    const hit = live[s.skip];
    if (!hit) return nodes.length ? 'disabled' : 'none';
    hit.scrollIntoView({ block: 'center' });
    hit.setAttribute('data-jw-hit', '1');
    return 'found';
  }, spec);
}

const dialogs = () => p.getByRole('dialog');
const dialogText = async () => clean(await dialogs().last().innerText({ timeout: 2000 }).catch(() => ''));
const clean = t => (t ?? '').replace(/\s+/g, ' ').trim();

/** Checks every wanted parameter on the URL. Returns a list of what is wrong. */
function checkParams(url, want) {
  const bad = [];
  for (const [key, value] of Object.entries(want)) {
    const names = key.split('|');
    const got = names.map(n => url.searchParams.get(n)).find(v => v != null && v !== '');
    if (got == null) { bad.push(`missing ${key}`); continue; }
    const wanted = value === '$loop' ? LOOP : value;
    if (wanted !== true && got !== wanted) bad.push(`${key}=${got} (wanted ${wanted})`);
  }
  return bad;
}

async function expectNav(expect) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < 8000) {
    if (crashed) return 'page crashed';
    const url = new URL(p.url());
    last = url.pathname + url.search;
    if (url.pathname === expect.path && !checkParams(url, expect.params ?? {}).length) return null;
    await p.waitForTimeout(250);
  }
  const url = new URL(p.url());
  const bad = url.pathname === expect.path ? `at ${expect.path} but ${checkParams(url, expect.params ?? {}).join(', ')}` : `landed on ${last}`;
  return `${bad}; wanted ${expect.path}${Object.keys(expect.params ?? {}).length ? ` with ${Object.keys(expect.params).join(', ')}` : ''}`;
}

async function expectDialog(want) {
  const dlg = dialogs().last();
  try { await dlg.waitFor({ state: 'visible', timeout: 6000 }); } catch {
    const url = new URL(p.url());
    return `no role=dialog opened; page is ${url.pathname + url.search}`;
  }
  const text = await dialogText();
  const ok = want === true || (want instanceof RegExp ? want.test(text) : text.toLowerCase().includes(String(want).toLowerCase()));
  if (!ok) return `dialog opened without the title ${want}: "${text.slice(0, 80)}"`;
  await p.keyboard.press('Escape');
  try { await dialogs().last().waitFor({ state: 'hidden', timeout: 3000 }); } catch { return 'Esc did not close the dialog'; }
  return null;
}

/** One attempt from one address. Returns {outcome, detail}. */
async function attempt(step, from) {
  await open(from);
  const text = await p.locator('#main-content').innerText().catch(() => '');
  if (/Access restricted|not allowed|You do not have/i.test(text.slice(0, 600))) return { outcome: 'UNTESTED', detail: `${from} is restricted for this account` };
  const last = step.do.length - 1;
  for (let i = 0; i <= last; i += 1) {
    const state = await find(step.do[i]);
    if (state !== 'found') {
      const what = typeof step.do[i] === 'object' && !(step.do[i] instanceof RegExp) ? (step.do[i].text ?? step.do[i].sel) : step.do[i];
      return { outcome: 'UNTESTED', detail: `${state === 'disabled' ? 'control disabled' : 'no such control'} "${what}" on ${from}${i ? ' (after the earlier click)' : ''}` };
    }
    const wantsDownload = i === last && step.expect.download;
    const download = wantsDownload ? p.waitForEvent('download', { timeout: 15000 }).catch(() => null) : null;
    await p.locator('[data-jw-hit]').first().click({ timeout: 8000 });
    if (i < last) {
      await p.locator('[role="dialog"], dialog[open]').last().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(250);
    } else if (wantsDownload) {
      const d = await download;
      if (!d) return { outcome: 'FAIL', detail: `no download started; page is ${new URL(p.url()).pathname}` };
      await d.cancel().catch(() => {});
      return { outcome: 'PASS' };
    }
  }
  const fail = step.expect.dialog !== undefined ? await expectDialog(step.expect.dialog) : await expectNav(step.expect);
  return fail ? { outcome: 'FAIL', detail: fail } : { outcome: 'PASS' };
}

async function runStep(step) {
  guard.trigger = step.id;
  let result = { outcome: 'UNTESTED', detail: 'no address tried' };
  for (const from of step.from) {
    result = await attempt(step, from);
    if (result.outcome !== 'UNTESTED') break;
  }
  guard.trigger = null;
  return result;
}

const results = [];
await boot();
for (const step of STEPS) {
  let result;
  const t0 = Date.now();
  try {
    let timer;
    const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`step timeout after ${STEP_TIMEOUT_MS / 1000} s`)), STEP_TIMEOUT_MS); });
    result = await Promise.race([runStep(step), limit]).finally(() => clearTimeout(timer));
    if (crashed) result = { outcome: 'FAIL', detail: 'page crashed' };
  } catch (e) {
    result = { outcome: 'FAIL', detail: `${crashed ? 'page crashed: ' : ''}${String(e.message).split('\n')[0].slice(0, 200)}` };
  }
  if (result.outcome === 'FAIL' && (crashed || /timeout|closed|crash/i.test(result.detail ?? ''))) {
    try { await boot(); } catch (e) { console.error(`restart failed: ${String(e.message).split('\n')[0]}`); }
  }
  results.push({ id: step.id, row: step.row, ...result, ms: Date.now() - t0 });
  await p.waitForTimeout(300);
}

const count = o => results.filter(r => r.outcome === o).length;
const summary = { steps: results.length, pass: count('PASS'), fail: count('FAIL'), untested: count('UNTESTED'), blocked: guard.blocked.length };
writeFileSync(outFile, JSON.stringify({ loop: LOOP, summary, blocked: guard.blocked, http429: guard.http429, results }, null, 1));
console.log(JSON.stringify(summary));
for (const r of results.filter(x => x.outcome !== 'PASS')) console.log(`${r.outcome} ${r.id} [${r.row}] :: ${r.detail}`);
await browser.close();
