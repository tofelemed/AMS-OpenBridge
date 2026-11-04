#!/usr/bin/env node
// CPA deep surface crawl (CPA-UI-PRM-003 Parts B, C, E, I). Read-only: the guard aborts non-GET API calls, and
// deny-listed controls are recorded but never activated. Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD.
// Usage: node docs/theme/tools/crawl-surfaces.mjs [--only slug,slug] [--max-controls 24]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, axeSource, requireEnv, login, goto, setTheme, trackNetwork, waitStable } from './lib/session.mjs';
import { textMetrics } from './lib/dom-metrics.mjs';
import { enumerateControls, listLinks, markOverlays, signature, attributeText, panels, focusables, focusInside } from './lib/dom-surfaces.mjs';
import { installGuard, proveGuard, denyPattern } from './lib/guard.mjs';
import { ENTRIES, REP } from './lib/entries.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const deep = path.resolve(here, '../deep');
const shots = path.join(deep, 'screenshots');
const file = path.join(shots, 'manifest.json');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('--only')?.split(',');
const maxControls = Number(arg('--max-controls', 24));
const env = requireEnv();
const entries = only ? ENTRIES.filter(e => only.includes(e.slug)) : ENTRIES;
const THEMES = ['day', 'night'];
const MAX_ENTRY_MS = 170000;

const log = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
const out = fs.existsSync(file) && only ? JSON.parse(fs.readFileSync(file, 'utf8')) : { surfaces: [], denied: [], links: [] };
out.generatedBy = 'docs/theme/tools/crawl-surfaces.mjs';
out.representative = REP;
const counter = { R: 0, V: 0, O: 0, P: 0 };
for (const s of out.surfaces) { const c = s.id[0]; counter[c] = Math.max(counter[c], Number(s.id.split('-')[1])); }
const nextId = c => `${c}-${String(++counter[c]).padStart(c === 'R' || c === 'V' ? 2 : 3, '0')}`;
const save = () => { Object.assign(out, { log: { ...log } }); fs.writeFileSync(file, JSON.stringify(out, null, 1)); };

async function shot(page, theme, id, slug, extra = {}) {
  const rel = `${theme}/1440x1024/${id}--${slug}.png`;
  const f = path.join(shots, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  await page.screenshot({ path: f, animations: 'disabled', ...extra });
  return rel;
}

async function fullShot(page, theme, id, slug) {
  const h = await page.evaluate(() => Math.ceil(Math.max(...[...document.querySelectorAll('.page-content,main,.app-main')].map(e => e.scrollHeight), 0) + (document.querySelector('main')?.getBoundingClientRect().top ?? 0)));
  if (h <= 1032) return null;
  await page.setViewportSize({ width: 1440, height: Math.min(h + 16, 9000) });
  await page.waitForTimeout(350);
  const rel = await shot(page, theme, id, `${slug}--full`);
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.waitForTimeout(200);
  return rel;
}

async function axe(page, scope) {
  return page.evaluate(async s => {
    const r = await window.axe.run(s ? { include: [s] } : document, { resultTypes: ['violations'] });
    const by = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const rules = {};
    for (const v of r.violations) { by[v.impact ?? 'minor'] += v.nodes.length; rules[v.id] = v.nodes.length; }
    return { by, rules };
  }, scope ?? null).catch(e => ({ error: e.message.slice(0, 120) }));
}

async function overlayChecks(page, scope, id, slug) {
  const f = await page.evaluate(focusables, { scope });
  const res = { ...f };
  if (!f.n) return res;
  const focusShot = async which => {
    await page.evaluate(w => document.querySelector(`[data-cap-f="${w}"]`)?.focus(), which);
    await page.waitForTimeout(120);
    return shot(page, 'day', id, `${slug}--focus-${which}`);
  };
  res.focusFirst = await focusShot('first');
  res.focusLast = await focusShot('last');
  for (let i = 0; i < Math.min(f.n + 3, 25); i++) await page.keyboard.press('Tab');
  res.trapped = await page.evaluate(focusInside, { scope });
  return res;
}

async function recordOverlay(page, ov, parent, control) {
  const id = nextId('O');
  const scope = `[data-cap-ov="${ov.ov}"]`;
  const slug = `${parent.slug}-${(ov.label || ov.cls || ov.role || 'overlay').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 34)}`;
  const s = { id, parent: parent.id, type: 'overlay', role: ov.role, cls: ov.cls, label: ov.label, size: [ov.w, ov.h], trigger: { label: control.label, kind: control.kind }, url: (await page.evaluate(signature)).url, shots: {} };
  s.shots.day = await shot(page, 'day', id, slug);
  await setTheme(page, 'night');
  s.shots.night = await shot(page, 'night', id, slug);
  s.axeNight = await axe(page, scope);
  await setTheme(page, 'day');
  s.axeDay = await axe(page, scope);
  s.text = await page.evaluate(textMetrics, { rootSelector: scope });
  s.attr = await page.evaluate(attributeText, { scope });
  s.controls = (await page.evaluate(enumerateControls, { scope, deny: denyPattern(path.join(deep, 'data/deny-list.json')) })).map(c => ({ label: c.label, kind: c.kind, denied: c.denied, disabled: c.disabled }));
  s.focus = await overlayChecks(page, scope, id, slug);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  s.escCloses = !(await page.locator(scope).count());
  out.surfaces.push(s);
  return s;
}

async function closeAny(page, entryUrl, net) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const close = page.locator('[role=dialog] button, [aria-modal="true"] button').filter({ hasText: /^(Cancel|Close|×|✕)$/ }).first();
  if (await close.count()) await close.click({ timeout: 1500 }).catch(() => {});
  await goto(page, entryUrl);
  await page.waitForTimeout(250);
  await waitStable(page, net, { timeout: 9000, quietMs: 400 });
}

async function crawlControls(page, net, entry, parent, deny, deadline) {
  const controls = await page.evaluate(enumerateControls, { scope: 'main', deny });
  const perSig = {};
  const results = [];
  const keyOf = c => `${c.sig}|${c.label}`;
  let rerendered = false;
  for (const c of controls) {
    if (c.denied) { out.denied.push({ surface: parent.id, label: c.label, kind: c.kind }); continue; }
    if (c.disabled) { results.push({ ...c, outcome: 'disabled' }); continue; }
    perSig[c.sig] = (perSig[c.sig] ?? 0) + 1;
    if (perSig[c.sig] > 3 || results.length >= maxControls || Date.now() > deadline) { results.push({ ...c, outcome: 'not activated: limit' }); continue; }
    // Returning to the entry re-renders the page, so find the control again by its label and type.
    let target = c;
    if (rerendered) {
      const fresh = await page.evaluate(enumerateControls, { scope: 'main', deny });
      target = fresh.find(f => keyOf(f) === keyOf(c));
      rerendered = false;
      if (!target) { results.push({ ...c, outcome: 'gone after re-render' }); continue; }
    }
    const before = await page.evaluate(signature);
    const known = (await page.evaluate(markOverlays, { known: [] })).map(o => o.key);
    const loc = page.locator(`[data-cap="${target.id}"]`).first();
    if (!(await loc.count())) { results.push({ ...c, outcome: 'gone after re-render' }); continue; }
    log.trigger = `${parent.id}: ${c.label}`;
    const clicked = await loc.click({ timeout: 2500 }).then(() => true).catch(() => false);
    log.trigger = null;
    if (!clicked) { results.push({ ...c, outcome: 'not clickable' }); continue; }
    await page.waitForTimeout(450);
    await waitStable(page, net, { timeout: 7000, quietMs: 350 });
    const after = await page.evaluate(signature);
    const opened = await page.evaluate(markOverlays, { known });
    if (opened.length) {
      const o = await recordOverlay(page, opened[0], parent, c);
      results.push({ ...c, outcome: 'overlay', overlay: o.id });
      await closeAny(page, entry.url, net);
      rerendered = true;
    } else if (after.url !== before.url) {
      results.push({ ...c, outcome: 'navigated', to: after.url });
      out.links.push({ from: parent.id, label: c.label, to: after.url, via: 'control' });
      await closeAny(page, entry.url, net);
      rerendered = true;
    } else if (after.hash !== before.hash) {
      const id = nextId('P');
      const slug = `${entry.slug}-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || c.kind}`;
      const s = { id, parent: parent.id, type: 'panel', trigger: { label: c.label, kind: c.kind }, url: after.url, wordsRevealed: Math.max(0, after.len - before.len), shots: {} };
      s.shots.day = await shot(page, 'day', id, slug);
      s.text = await page.evaluate(textMetrics, { rootSelector: 'main' });
      s.text = { visibleWords: s.text.visibleWords, blocks: s.text.blocks };
      out.surfaces.push(s);
      results.push({ ...c, outcome: 'panel', panel: id });
      await closeAny(page, entry.url, net);
      rerendered = true;
    } else results.push({ ...c, outcome: 'no visible change' });
  }
  return results;
}

async function measureEntry(page, net, entry) {
  const id = nextId(entry.level === 'route' ? 'R' : 'V');
  const start = { reqs: 0, bytes: 0 };
  const onReq = () => { start.reqs += 1; };
  const onRes = r => { start.bytes += Number(r.headers()['content-length'] ?? 0); };
  page.on('request', onReq);
  page.on('response', onRes);
  await page.evaluate(() => { window.__lt = []; });
  log.trigger = `${id}: load`;
  await goto(page, entry.url);
  await page.waitForTimeout(250);
  const st = await waitStable(page, net);
  log.trigger = null;
  page.off('request', onReq);
  page.off('response', onRes);
  const lng = await page.evaluate(() => window.__lt ?? []);
  const final = await page.evaluate(signature);
  const s = { id, type: entry.level, slug: entry.slug, page: entry.page, entryUrl: entry.url, url: final.url, hidden: !!entry.hidden, key: !!entry.key, ...st, requests: start.reqs, bytes: start.bytes, longTasks: lng.length, longTaskMs: lng.reduce((a, b) => a + b, 0), shots: {}, full: {} };
  s.redirected = new URL(env.base + entry.url).pathname !== new URL(env.base + final.url).pathname;
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await page.waitForTimeout(theme === 'night' ? 500 : 150);
    s.shots[theme] = await shot(page, theme, id, entry.slug);
    if (entry.level === 'route') s.full[theme] = await fullShot(page, theme, id, entry.slug);
    s[`axe_${theme}`] = await axe(page);
  }
  await setTheme(page, 'day');
  s.text = await page.evaluate(textMetrics, { rootSelector: 'main' });
  s.attr = await page.evaluate(attributeText, { scope: 'main' });
  s.panels = await page.evaluate(panels);
  s.links = await page.evaluate(listLinks, { scope: 'main' });
  if (entry.level === 'route') {
    const n0 = log.apiCalls;
    await page.waitForTimeout(12000);
    s.idleApiPerMin = Math.round(((log.apiCalls - n0) / 12) * 60);
  }
  out.surfaces.push(s);
  return s;
}

async function main() {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  await ctx.addInitScript(() => {
    window.__lt = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
  });
  const page = await ctx.newPage();
  const net = trackNetwork(page);
  await installGuard(page, log, { ratePerMin: Number(arg('--rate', 35)) });
  await login(page, env);
  await page.addScriptTag({ content: axeSource });
  out.guardProof = await proveGuard(page, log);
  console.log('guard proof', JSON.stringify(out.guardProof));
  out.session = { base: env.base, account: 'superadmin session; name not recorded here', startedAt: new Date().toISOString() };
  const deny = denyPattern(path.join(deep, 'data/deny-list.json'));
  for (const entry of entries) {
    try {
      const s = await measureEntry(page, net, entry);
      console.log(`${s.id} ${entry.slug} ${s.msToStable}ms req=${s.requests} words=${s.text.visibleWords} ${s.redirected ? 'REDIRECTED' : ''}`);
      if (entry.deep && !s.redirected) {
        s.controls = await crawlControls(page, net, entry, s, deny, Date.now() + MAX_ENTRY_MS);
        const seen = {};
        for (const c of s.controls) seen[c.outcome.split(':')[0]] = (seen[c.outcome.split(':')[0]] ?? 0) + 1;
        console.log(`   controls ${JSON.stringify(seen)}`);
      }
    } catch (e) {
      console.error(`entry failed ${entry.slug}: ${e.message.slice(0, 160)}`);
      out.surfaces.push({ id: nextId('V'), type: 'failed', slug: entry.slug, error: e.message.slice(0, 200) });
    }
    save();
  }
  save();
  await browser.close();
  console.log(`done surfaces=${out.surfaces.length} blocked=${log.blocked.length} 429=${log.http429.length} api=${log.apiCalls}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
