#!/usr/bin/env node
// CPA task walks (PRM-003 Part F.3) plus URL-state checks (Part I). Read-only with the guard on.
// Needs CPA_BASE_URL, CPA_USER, CPA_PASSWORD. Writes deep/data/task-walks.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, requireEnv, login, goto, trackNetwork, waitStable } from './lib/session.mjs';
import { installGuard } from './lib/guard.mjs';
import { TASKS } from './lib/tasks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const deep = path.resolve(here, '../deep');
const env = requireEnv();
const log = { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null };
const INTERNAL = /\b(fused|fusion|G\d{1,2}r?\b|bundle|method run|watermark|checkpoint|NO_CALL|INSUFFICIENT_[A-Z]+|CONFIRMED_[A-Z]+|EXCLUDED_[A-Z]+|argmax|class pack|factory layer)\b/g;

const facts = () => {
  const m = document.querySelector('main');
  const t = m?.innerText ?? '';
  return { url: location.pathname + location.search, words: t.split(/\s+/).filter(Boolean).length, text: t, scroller: (document.querySelector('.page-content')?.scrollHeight ?? 0) };
};
const ctxOf = u => {
  const p = new URL(`http://x${u}`).searchParams;
  return { plant: p.get('site') ?? p.get('area') ?? p.get('unit'), loop: p.get('loop'), interval: p.get('window') ?? p.get('profile') ?? p.get('from') };
};

async function clickText(page, re) {
  return page.evaluate(({ src, flags }) => {
    const re2 = new RegExp(src, flags);
    const all = [...document.querySelectorAll('main a,main button,main obc-button,main [role=button],main [role=tab],.app-sidebar a,.app-sidebar button,.cpm-kpicard--link')];
    const label = e => (e.getAttribute('aria-label') || e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
    const hit = all.find(e => e.getBoundingClientRect().height > 0 && re2.test(label(e)));
    if (!hit) return null;
    hit.scrollIntoView({ block: 'center' });
    const box = document.querySelector('.page-content');
    const scroll = box?.scrollTop ?? 0;
    hit.setAttribute('data-cap-walk', '1');
    return { label: label(hit).slice(0, 60), scroll: Math.round(scroll) };
  }, { src: re.source, flags: re.flags });
}

async function walk(page, net, t) {
  const hops = [];
  const t0 = Date.now();
  let prev = null;
  for (const s of t.steps) {
    const hop = {};
    if (s.open) { await goto(page, s.open); hop.how = 'opened'; hop.target = s.open; } else {
      const hit = await clickText(page, s.click);
      if (hit) {
        hop.how = 'clicked'; hop.control = hit.label; hop.scroll = hit.scroll;
        log.trigger = `${t.id}: ${hit.label}`;
        await page.locator('[data-cap-walk]').first().click({ timeout: 3000 }).catch(() => { hop.how = 'click failed'; });
        await page.evaluate(() => document.querySelectorAll('[data-cap-walk]').forEach(e => e.removeAttribute('data-cap-walk')));
        log.trigger = null;
      } else { hop.how = 'no such control'; hop.deadEnd = String(s.click); await goto(page, s.then); hop.target = s.then; }
      if (s.note) hop.note = s.note;
    }
    await page.waitForTimeout(350);
    await waitStable(page, net, { timeout: 14000, quietMs: 400 });
    const f = await page.evaluate(facts);
    const ctx = ctxOf(f.url);
    hop.url = f.url; hop.words = f.words; hop.pageHeight = f.scroller;
    hop.internalTerms = [...new Set((f.text.match(INTERNAL) ?? []))].slice(0, 12);
    if (prev) hop.lost = Object.keys(ctx).filter(k => prev[k] && !ctx[k]);
    prev = ctx;
    hops.push(hop);
  }
  const clicks = hops.filter(h => h.how === 'clicked').length;
  return { ...t, steps: undefined, hops, clicks, pageHops: hops.length, ms: Date.now() - t0, scrollPx: hops.reduce((a, h) => a + (h.scroll ?? 0), 0), deadEnds: hops.filter(h => h.deadEnd).length, contextLost: [...new Set(hops.flatMap(h => h.lost ?? []))] };
}

async function urlState(page, net) {
  const res = {};
  const url = '/cpm/explorer?loop=FIC10302&tab=Signals';
  await goto(page, url);
  await waitStable(page, net, { timeout: 12000, quietMs: 400 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  res.reload = { after: await page.evaluate(() => location.pathname + location.search), loggedOut: await page.evaluate(() => location.pathname.startsWith('/login')) };
  return res;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  const net = trackNetwork(page);
  await installGuard(page, log, { ratePerMin: Number(process.env.CPA_RATE ?? 45) });
  await login(page, env);
  const walks = [];
  for (const t of TASKS) {
    const r = await walk(page, net, t).catch(e => ({ id: t.id, role: t.role, task: t.task, failed: e.message.slice(0, 160) }));
    walks.push(r);
    console.log(r.id, r.failed ?? `${r.pageHops} hops, ${r.clicks} clicks, dead ${r.deadEnds}, lost ${r.contextLost}`);
    fs.writeFileSync(path.join(deep, 'data/task-walks.json'), JSON.stringify({ log: { ...log }, walks }, null, 1));
  }
  const state = await urlState(page, net).catch(e => ({ failed: e.message.slice(0, 160) }));
  fs.writeFileSync(path.join(deep, 'data/task-walks.json'), JSON.stringify({ log: { ...log }, walks, urlState: state }, null, 1));
  await browser.close();
  console.log(`done blocked=${log.blocked.length} 429=${log.http429.length}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
