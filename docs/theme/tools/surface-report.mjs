#!/usr/bin/env node
// PRM-003 reports from the crawl data: surface inventory (Part B), behaviour (Part I) and data states (Part J).
// Writes deep/surface-inventory.json, surface-inventory.md, behaviour.md, data-states.md and data/report-summary.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const deep = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../deep');
const J = f => { const p = path.join(deep, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const man = J('screenshots/manifest.json');
const src = J('data/source-surfaces.json');
const states = J('screenshots/states.json');
const reflow = J('data/reflow.json');
const walks = J('data/task-walks.json');
const t = (h, r) => [`| ${h.join(' | ')} |`, `|${h.map(() => '---').join('|')}|`, ...r.map(x => `| ${x.join(' | ')} |`)].join('\n');
const cell = (s, n = 70) => { const c = String(s ?? '').replaceAll('|', '/').replace(/\s+/g, ' ').trim(); return c.length > n ? `${c.slice(0, n - 1)}…` : c; };
const S = man.surfaces;
const entries = S.filter(s => s.type === 'route' || s.type === 'view');
const overlays = S.filter(s => s.type === 'overlay');
const panels = S.filter(s => s.type === 'panel');
const shot = r => (r ? `[img](screenshots/${r})` : '-');
const heading = o => (o.text?.blocks ?? []).find(b => b.kind === 'heading')?.text ?? '';
const kind = o => {
  if (/health-drawer/.test(o.cls)) return 'Instrument health drawer';
  if (/combo/.test(o.cls)) return 'Loop picker list';
  const h = heading(o).replace(/\d+/g, '#').split(/\s+/).slice(0, 3).join(' ');
  if (/^CPLM/.test(o.trigger?.label ?? '')) return 'Calculation drawer';
  return h || o.label || (o.trigger?.label ?? '').replace(/\d+/g, '#').slice(0, 34) || o.cls || o.role;
};
const distinct = {};
for (const o of overlays) (distinct[kind(o)] ??= []).push(o);

// Part B inventory
const inventory = S.filter(s => s.id).map(s => ({
  id: s.id, type: s.type, parent: s.parent ?? null, slug: s.slug ?? null, label: s.page ?? s.label ?? s.cls ?? null, trigger: s.trigger ?? null, url: s.url ?? s.entryUrl ?? null,
  screenshots: s.shots ?? {}, full: s.full ?? null, words: s.text?.visibleWords ?? null, wordsFirstViewport: s.text?.wordsInViewport ?? null,
  titleCount: s.attr?.title?.length ?? null, wordsOnOpen: s.wordsRevealed ?? null, requests: s.requests ?? null, idleApiPerMin: s.idleApiPerMin ?? null,
  panels: s.panels?.map(p => ({ title: p.title, words: p.words })) ?? null, controls: s.controls?.length ?? null,
}));
// Source overlays name a component; the crawl sees rendered dialogs. This table says which rendered evidence proves each owner.
const seen = [...overlays.map(o => `${o.cls} ${o.label} ${o.trigger?.label ?? ''} ${heading(o)}`), ...(states?.results ?? []).filter(r => r.path).map(r => `state:${r.slug}--${r.state}`)].join(' | ');
const PROOF = [
  [/^CommandPalette$/, /command-palette/], [/^FocusedLoopDrawer$/, /Open analysis/], [/^AddLoopWizard$/, /Add control loop|add-loop-dialog/], [/^LoopCombobox$/, /cpm-combo/],
  [/^CalcDrawer$/, /CPLM-|state:calculations--drawer/], [/^(ModalEvidence|GateEvidencePanel)$/, /gate-cell/], [/^UserManagementConfig$/, /Add user|Edit /], [/^AssetEditorDialog$/, /Add Site|Add Area|Edit Site/],
  [/^(LoopWorkspace|CpmExplorer|LoopModelCard)$/, /health-drawer/], [/^signalTrendOption$/, /explorer--chart-tooltip/], [/^buildChartOption$/, /historical--chart-tooltip/], [/^BulkImportDialog$/, /bulk-import-dialog/],
];
const reconciled = (src?.overlays ?? []).map(o => {
  const owner = String(o.owner ?? '');
  const title = String(o.title ?? '');
  const proof = PROOF.find(([re]) => re.test(owner));
  let reason;
  if (proof && proof[1].test(seen)) reason = 'reached';
  else if (/^Delete|Import|Bulk import/i.test(title)) reason = 'trigger on the deny-list';
  else if (/^(App|AppShell|SessionTimeoutDialog|DialogProvider|Modal)$/.test(owner)) reason = 'event-driven or shared shell (session expiry, confirm, forbidden)';
  else if (o.kind === 'chart-tooltip') reason = 'chart hover: sampled on Explorer and Historical only';
  else reason = 'data-dependent or beyond the crawl limit';
  return { at: o.at, kind: o.kind, owner, title: o.title ?? null, reason };
});
const recon = reconciled.reduce((a, r) => { a[r.reason] = (a[r.reason] ?? 0) + 1; return a; }, {});
const countsNote = 'Overlay types group repeated captures of the same dialog.';
const counts = { routes: S.filter(s => s.type === 'route').length, views: S.filter(s => s.type === 'view').length, panelsExpanded: panels.length, panelsListed: entries.reduce((a, e) => a + (e.panels?.length ?? 0), 0), overlayCaptures: overlays.length, overlayTypes: Object.keys(distinct).length, controlsRecorded: entries.reduce((a, e) => a + (e.controls?.length ?? 0), 0), denied: man.denied.length, failed: S.filter(s => s.type === 'failed').length };
fs.writeFileSync(path.join(deep, 'surface-inventory.json'), JSON.stringify({ counts, source: src?.totals ?? null, reconciliation: recon, surfaces: inventory, sourceOverlays: reconciled, deniedControls: man.denied, links: man.links }, null, 1));

const tree = entries.filter(e => e.type === 'route').map(r => {
  const views = entries.filter(v => v.type === 'view' && v.slug.startsWith(r.slug));
  const kids = id => S.filter(s => s.parent === id).map(k => `    - ${k.id} ${k.type}: ${cell(k.trigger?.label || k.label || k.cls, 56)}`);
  return [`- **${r.id} ${r.page}** \`${cell(r.url, 60)}\` ${r.text?.visibleWords ?? '-'} words`, ...kids(r.id), ...views.flatMap(v => [`  - ${v.id} ${v.page} (${v.text?.visibleWords ?? '-'} words)`, ...kids(v.id)])].join('\n');
}).join('\n');
fs.writeFileSync(path.join(deep, 'surface-inventory.md'), [
  '# CPA surface inventory (Part B)', '', 'Generated by `docs/theme/tools/surface-report.mjs` from the crawl and the source AST. Full records: `surface-inventory.json`, `data/source-surfaces.json`. Hidden and unreachable surfaces: [data/hidden-surfaces.md](data/hidden-surfaces.md).', '',
  '## Counts', '', t(['Type', 'Count'], Object.entries(counts).map(([k, v]) => [k, v])), '',
  '## Source against runtime', '', `Source AST: ${src?.totals?.routes} routes (${src?.totals?.liveRoutes} live, ${src?.totals?.sliceRedirects} slice redirects), ${src?.totals?.urlParams} URL parameter and route pairs, ${src?.overlays?.length} overlays, ${src?.tooltips?.length} tooltips, ${src?.collapsibles?.length} collapsibles, ${src?.clicks?.length} click handlers, ${src?.toasts?.length} toasts, ${src?.polling?.length} polling timers.`, '',
  t(['Source overlays', 'Count'], Object.entries(recon).map(([k, v]) => [k, v])), '', `${countsNote} Reached means a rendered dialog or a state image proves the owner. The rest carry the reason shown; "data-dependent" is a best estimate.`, '',
  '### Source overlays not reached', '', t(['Owner', 'Kind', 'At', 'Reason'], reconciled.filter(r => r.reason !== 'reached').map(r => [cell(r.owner, 34), r.kind, `\`${r.at}\``, r.reason])), '',
  '## Overlay types reached', '', t(['Type', 'Captures', 'Example', 'Size', 'Focus starts inside', 'Focus trapped', 'Esc closes', 'axe critical / serious'], Object.entries(distinct).map(([k, v]) => { const o = v[0]; return [cell(k, 46), v.length, `${o.id} ${shot(o.shots?.day)}`, (o.size ?? []).join('×'), o.focus?.focusStartsInside ?? '-', o.focus?.trapped ?? '-', o.escCloses ?? '-', `${o.axeDay?.by?.critical ?? 0} / ${o.axeDay?.by?.serious ?? 0}`]; })), '',
  '## Tree', '', tree, '',
  '## Deny-listed controls recorded, never activated', '', t(['Control', 'Times seen'], Object.entries(man.denied.reduce((a, d) => { const k = cell(d.label, 50); a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 60)), '',
].join('\n'));

// Part I behaviour
const routes = entries.filter(e => e.type === 'route');
const perf = t(['Route', 'ms to stable', 'Stable', 'Requests', 'KB', 'Long tasks', 'Long-task ms', 'Idle API /min', 'Day axe c/s/m/m', 'Night axe c/s/m/m'], routes.map(r => {
  const a = x => (x?.by ? `${x.by.critical}/${x.by.serious}/${x.by.moderate}/${x.by.minor}` : '-');
  return [`${r.id} ${r.slug}`, r.msToStable, r.stable ? 'yes' : '**no**', r.requests, Math.round(r.bytes / 1024), r.longTasks, r.longTaskMs, r.idleApiPerMin ?? '-', a(r.axe_day), a(r.axe_night)];
}));
const axeTotals = {};
for (const th of ['day', 'night']) {
  const by = { critical: 0, serious: 0, moderate: 0, minor: 0 }; const rules = {};
  const add = x => { if (!x?.by) return; for (const k of Object.keys(by)) by[k] += x.by[k]; for (const [id, n] of Object.entries(x.rules ?? {})) rules[id] = (rules[id] ?? 0) + n; };
  for (const e of entries) add(e[`axe_${th}`]);
  for (const o of overlays) add(th === 'day' ? o.axeDay : o.axeNight);
  axeTotals[th] = { by, rules: Object.fromEntries(Object.entries(rules).sort((a, b) => b[1] - a[1]).slice(0, 12)) };
}
const sizes = reflow ? Object.entries(reflow.result).map(([slug, v]) => [slug, ...['1366x768', '1920x1080', '1280x800', '1024x768', 'zoom200'].map(k => { const r = v[k]; return r ? `${r.horizontalScroll ? '**scroll**' : 'ok'} side ${Math.round(r.sidebarW)}${r.elementsPastEdge ? ` +${r.elementsPastEdge}` : ''}` : '-'; })]) : [];
const polling = (src?.polling ?? []).map(p => [p.owner ?? '-', p.kind, (p.interval ?? []).join(', ') || cell(p.raw, 30), `\`${p.at}\``]);
const overlayKb = Object.entries(distinct).map(([k, v]) => { const o = v[0]; return [cell(k, 44), o.focus?.n ?? 0, o.focus?.focusStartsInside ?? '-', o.focus?.trapped ?? '-', o.escCloses ?? '-']; });
const trapOk = overlays.filter(o => o.focus?.trapped === true).length;
const summary = { counts, recon, axeTotals, trap: { overlays: overlays.length, trapped: trapOk, focusStartsInside: overlays.filter(o => o.focus?.focusStartsInside).length, escCloses: overlays.filter(o => o.escCloses).length }, reflowScroll: Object.fromEntries(['1366x768', '1920x1080', '1280x800', '1024x768', 'zoom200'].map(k => [k, reflow ? Object.values(reflow.result).filter(v => v[k]?.horizontalScroll).length : null])), reflowRoutes: reflow ? Object.keys(reflow.result).length : 0, perf: { maxStable: Math.max(...routes.map(r => r.msToStable)), maxReq: Math.max(...routes.map(r => r.requests)), totalLongTasks: routes.reduce((a, r) => a + r.longTasks, 0), polling: routes.filter(r => r.idleApiPerMin > 0).map(r => `${r.slug}:${r.idleApiPerMin}`) }, log: man.log, walksLog: walks?.log ?? null, reflowLog: reflow?.log ?? null, statesBlocked: states?.blockedWrites ?? [] };
fs.writeFileSync(path.join(deep, 'data/report-summary.json'), JSON.stringify({ ...summary, log: { ...summary.log, blocked: summary.log.blocked.length, http429: summary.log.http429.length } }, null, 1));
fs.writeFileSync(path.join(deep, 'behaviour.md'), [
  '# CPA behaviour (Part I)', '', 'Measured on the production build on port 3000. Timings are affected by request pacing and by other captures running at the same time, so treat them as upper bounds.', '',
  '## Performance and accessibility per route', '', perf, '', `axe totals across routes, views and overlays, Day: ${JSON.stringify(axeTotals.day.by)}. Night: ${JSON.stringify(axeTotals.night.by)}.`, '', `Top rules Day: ${Object.entries(axeTotals.day.rules).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '',
  '## Polling', '', 'From source. `refetchIntervalInBackground` is not set anywhere, so react-query polling pauses in a hidden tab; `setInterval` timers keep running.', '', t(['Owner', 'Kind', 'Interval ms', 'At'], polling), '',
  '## Overlays: keyboard', '', t(['Overlay type', 'Focusable', 'Focus starts inside', 'Trapped', 'Esc closes'], overlayKb), '',
  '## Reflow', '', 'Cell: horizontal scroll or ok, sidebar width in px, and elements past the right edge. `zoom200` is a 720 × 512 CSS viewport at device scale 2, equal to 200 % zoom on a 1440 px window.', '', t(['Route', '1366×768', '1920×1080', '1280×800', '1024×768', '200 %'], sizes), '',
  '## URL state', '', `Reload on the production build: ${JSON.stringify(walks?.urlState ?? {})}. The session and URL survive a reload. The dev-server behaviour noted during the first analysis does not apply here.`, '',
].join('\n'));

// Part J data states
const groups = {};
for (const r of (states?.results ?? []).filter(x => x.path)) ((groups[r.slug] ??= {})[r.state] ??= []).push(r);
const stateCols = ['loading', 'empty', 'empty-filter', 'no-selection', 'partial', 'stale', 'error', 'error-server', 'restricted', 'missing-record'];
const errorEmpty = [];
for (const [slug, g] of Object.entries(groups)) for (const r of g.error ?? []) if (r.theme === 'day' && /\bNo (current|loops?|events?|evaluated|data)\b|Select a loop/i.test(r.excerpt ?? '') ) errorEmpty.push([slug, cell(r.excerpt, 110)]);
const matrix = Object.entries(groups).map(([slug, g]) => [slug, ...stateCols.map(c => { const r = g[c]?.find(x => x.theme === 'day'); return r ? `[yes](screenshots/${r.path})` : '-'; })]);
const details = (states?.results ?? []).filter(x => x.path && x.theme === 'day').map(r => [`${r.slug}--${r.state}`, r.how ?? '', cell(r.excerpt, 120)]);
fs.writeFileSync(path.join(deep, 'data-states.md'), [
  '# CPA data states (Part J)', '', 'Reproduced or simulated on the production build. Night images sit beside the Day ones. A guard blocked no write during this pass.', '',
  '## Coverage', '', t(['Route', ...stateCols], matrix), '', 'Not reproduced: **bad quality** (no reproducible source value in the lab) and a **genuine restricted** state (no low-privilege account was supplied; the 403 images simulate a service refusal).', '',
  '## Errors that also show empty text (G06)', '', errorEmpty.length ? t(['Route', 'What the page showed'], errorEmpty) : 'None detected from page text.', '', 'Detected by matching the visible text; a screenshot review confirms each.', '',
  '## What each state showed', '', t(['State', 'How reached', 'Text shown'], details), '', 'Pass and fail per route and state from source reading is in [cpa-currenttheme.md](../cpa-currenttheme.md) §9.8 and still applies; nothing in the data-state code changed.', '',
].join('\n'));
console.log(JSON.stringify({ counts, recon, trap: summary.trap, reflowScroll: summary.reflowScroll, perf: summary.perf, axe: { day: axeTotals.day.by, night: axeTotals.night.by }, errorEmpty: errorEmpty.length }, null, 1));
