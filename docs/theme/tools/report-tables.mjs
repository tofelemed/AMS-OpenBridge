#!/usr/bin/env node
// Turns the capture manifest and source inventory into markdown tables, so the document quotes script output.
// Usage: node docs/theme/tools/report-tables.mjs <output-dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = process.argv[2] ?? path.join(repo, 'docs/theme/data/tables');
const shotsRel = 'screenshots/current';
const read = p => JSON.parse(fs.readFileSync(path.join(repo, p), 'utf8'));
const m = read('docs/theme/screenshots/current/manifest.json');
const inv = read('docs/theme/data/source-inventory.json');
const statesFile = path.join(repo, 'docs/theme/screenshots/current/states.json');
const states = fs.existsSync(statesFile) ? JSON.parse(fs.readFileSync(statesFile, 'utf8')) : null;
const routes = Object.entries(m.routes);
const first = v => v.themes[m.themes[0]] ?? Object.values(v.themes)[0] ?? {};
const rows = (head, body) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map(r => `| ${r.join(' | ')} |`)].join('\n');
const out = {};

// Routes and screenshots
out.routes = rows(['Route', 'URL', 'Nav', 'Stable', 'ms to stable', 'Console err / warn', 'API ≥ 400', 'Images'], routes.map(([slug, v]) => {
  const t = first(v);
  const links = m.themes.map(th => {
    const s = v.themes[th]?.shots?.['1440x1024'];
    return s ? `[${th}](${shotsRel}/${s})` : `${th}: none`;
  }).join(' · ');
  const status = t.status === 'redirected' ? `redirected to ${t.finalUrl}` : (t.stable === false ? '**no**' : 'yes');
  return [slug, `\`${v.url.slice(0, 60)}\``, v.nav ? 'yes' : (v.hidden ? 'hidden' : 'no'), status, t.msToStable ?? '', `${t.console?.errorCount ?? 0} / ${t.console?.warningCount ?? 0}`, t.api?.length ?? 0, links];
}));

// Text density, worst first
const textual = routes.filter(([, v]) => v.text);
const byWords = [...textual].sort((a, b) => b[1].text.visibleWords - a[1].text.visibleWords);
out.density = rows(['Route', 'Visible words', 'In first viewport', 'Text blocks', 'Font sizes', 'KPI cards', 'Words per KPI avg / max', 'Tooltip words (`title`)', 'Repeated strings'], byWords.map(([slug, v]) => {
  const t = v.text;
  return [slug, t.visibleWords, t.wordsInViewport, t.textBlocks, t.distinctFontSizes, t.kpiCards?.n ?? 0, t.kpiCards ? `${t.kpiCards.avg} / ${t.kpiCards.max}` : '-', t.titleTooltips.words, t.repeatedStrings.length];
}));
const allWords = textual.map(([, v]) => v.text.visibleWords);
out.densityStats = { routes: allWords.length, total: allWords.reduce((a, b) => a + b, 0), max: Math.max(...allWords), min: Math.min(...allWords), median: [...allWords].sort((a, b) => a - b)[allWords.length >> 1] };

const rep = {};
for (const [slug, v] of textual) for (const r of v.text.repeatedStrings) (rep[r.text] ??= { n: 0, routes: [], words: r.words }).n += r.n, rep[r.text].routes.push(slug);
out.repeated = rows(['String', 'Occurrences', 'Words each', 'Routes'], Object.entries(rep).sort((a, b) => b[1].n * b[1].words - a[1].n * a[1].words).slice(0, 25)
  .map(([k, v]) => [k.replaceAll('|', '/').slice(0, 90), v.n, v.words, v.routes.slice(0, 5).join(', ')]));

// Accessibility
const impacts = ['critical', 'serious', 'moderate', 'minor'];
out.axe = rows(['Route', ...m.themes.map(t => `${t} crit/ser/mod/min`), 'Top rules (first theme)'], routes.filter(([, v]) => first(v).axe).map(([slug, v]) => [
  slug,
  ...m.themes.map(t => { const a = v.themes[t]?.axe?.nodesByImpact; return a ? impacts.map(i => a[i]).join(' / ') : '-'; }),
  Object.entries(first(v).axe.rules).sort((a, b) => b[1].nodes - a[1].nodes).slice(0, 3).map(([id, r]) => `${id} (${r.nodes})`).join(', '),
]));
const axeTotals = {};
for (const t of m.themes) {
  axeTotals[t] = { critical: 0, serious: 0, moderate: 0, minor: 0, rules: {} };
  for (const [, v] of routes) {
    const a = v.themes[t]?.axe;
    if (!a) continue;
    for (const i of impacts) axeTotals[t][i] += a.nodesByImpact[i];
    for (const [id, r] of Object.entries(a.rules)) axeTotals[t].rules[id] = (axeTotals[t].rules[id] ?? 0) + r.nodes;
  }
  axeTotals[t].rules = Object.fromEntries(Object.entries(axeTotals[t].rules).sort((a, b) => b[1] - a[1]));
}
out.axeTotals = axeTotals;

// Keyboard
out.keyboard = rows(['Route', 'Click targets', 'Pointer only', 'Table rows', 'Rows focusable', 'Canvases', 'Charts focusable', 'Charts labelled', 'Tab stops with a detected ring'], textual.filter(([, v]) => v.keyboard).map(([slug, v]) => {
  const k = v.keyboard; const w = v.tabWalk;
  return [slug, k.clickTargets, k.pointerWithoutKeyboard, k.tableRows, k.tableRowsFocusable, k.charts.canvases, k.charts.focusableCharts, k.charts.labelledCharts, w ? `${w.ringVisible}/${w.stops}` : '-'];
}));
out.keyboardSamples = [...new Set(textual.flatMap(([, v]) => v.keyboard?.sample ?? []))];
out.noRing = [...new Set(textual.flatMap(([, v]) => v.tabWalk?.noRing ?? []))].slice(0, 20);

// Geometry: one value per measure across routes
const G = routes.map(([, v]) => v.geometry).filter(Boolean);
const uniq = f => { const c = {}; for (const g of G) { const x = f(g); if (x != null) c[JSON.stringify(x)] = (c[JSON.stringify(x)] ?? 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.replaceAll('"', '')} (${n})`).join('; '); };
const stat = k => { const all = G.map(g => g[k]).filter(Boolean); return all.length ? { routes: all.length, min: Math.min(...all.map(a => a.min)), median: all.map(a => a.median).sort((a, b) => a - b)[all.length >> 1], max: Math.max(...all.map(a => a.max)) } : null; };
out.geometry = {
  sidebar: uniq(g => g.sidebarWidth), header: uniq(g => g.headerHeight), pagePadding: uniq(g => g.pageContent?.padding), screenGap: uniq(g => g.screen?.gap),
  tableRows: stat('tableRows'), tableHeader: stat('tableHeader'), divRows: stat('divRows'), nativeButtons: stat('nativeButtons'), obcHost: stat('obcButtonsHost'), obcInner: stat('obcButtonsInner'), inputs: stat('inputs'),
  fonts: uniq(g => g.fonts), title: uniq(g => g.title), sectionTitle: uniq(g => g.sectionTitle), eyebrow: uniq(g => g.eyebrow), panel: uniq(g => g.panel), kpiCard: uniq(g => g.kpiCard), kpiGrid: uniq(g => g.kpiGrid?.gap), grid2: uniq(g => g.grid2?.gap),
  buttonRadius: uniq(g => g.buttonRadius?.borderRadius), selectRadius: uniq(g => g.selectRadius), selectedNav: uniq(g => g.selectedNav), mono: uniq(g => g.mono), kpiValue: uniq(g => g.kpiValue), td: uniq(g => g.td),
};

// Font sizes actually rendered, across all routes, counted per text node
const sizes = {};
for (const [, v] of textual) for (const [k, n] of Object.entries(v.text.fontSizes)) sizes[k] = (sizes[k] ?? 0) + n;
out.renderedSizes = Object.entries(sizes).sort((a, b) => b[1] - a[1]);

// Colour inventory
const live = Object.entries(inv.perFile).filter(([, r]) => r.group !== 'legacy');
const score = r => r.hex + r.rgb + r.declLiteral;
out.colourWorst = rows(['File', 'Group', 'hex', 'rgb()', 'var fallback', 'Literal decl', 'color-mix', 'Inline colour', 'T refs', 'Most frequent literal'], live.filter(([, r]) => score(r) + r.varFallbackLiteral + r.inlineColourProps > 0).sort((a, b) => score(b[1]) - score(a[1]) || b[1].inlineColourProps - a[1].inlineColourProps).slice(0, 30).map(([f, r]) => [
  `\`${f}\``, r.group, r.hex, r.rgb, r.varFallbackLiteral, r.declLiteral, r.colorMix, r.inlineColourProps, r.tRefs,
  Object.entries(r.literals).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `\`${k}\`×${n}`).join(' '),
]));
out.colourGroups = rows(['Group', 'Files', 'Colour decl', 'Tokenised', 'Literal', 'Indirect', 'hex', 'rgb()', 'var fallback', 'color-mix', 'Inline colour', 'Token defs', 'Tokenised %'], ['core', 'shared', 'page', 'live', 'legacy'].map(k => {
  const t = inv.totals[k];
  return [k, t.files, t.colourDecl, t.declToken, t.declLiteral + t.declMixed, t.declIndirect, t.hex, t.rgb, t.varFallbackLiteral, t.colorMix, t.inlineColourProps, t.tokenDefLiteral, t.readinessPct];
}));
const tok = {};
for (const [, r] of live) for (const [k, v] of Object.entries(r.tokens)) tok[k] = (tok[k] ?? 0) + v;
out.tokenFamilies = Object.entries(tok).reduce((a, [k, v]) => { const f = /^--(cpm|ams|designer|hmi|login)-/.exec(k)?.[1] ?? 'openbridge'; (a[f] ??= { tokens: 0, refs: 0 }).tokens++; a[f].refs += v; return a; }, {});
out.topTokens = Object.entries(tok).sort((a, b) => b[1] - a[1]).slice(0, 25);
out.lineCounts = live.map(([f, r]) => [f, r.lines]).filter(([, n]) => n > 500).sort((a, b) => b[1] - a[1]);

if (states) {
  const by = {};
  for (const r of states.results.filter(x => x.path)) (by[`${r.slug}--${r.state}`] ??= { ...r, themes: [] }).themes.push(r.theme);
  out.states = rows(['State image', 'Themes', 'How reached', 'What the page showed'], Object.entries(by).map(([k, r]) => [k, r.themes.map(t => `[${t}](${shotsRel}/${t}/states/${k}.png)`).join(' · '), r.how ?? '', (r.excerpt ?? '').replaceAll('|', '/').slice(0, 110)]));
  out.statesSkipped = states.results.filter(x => x.skipped || x.failed);
  out.statesBlocked = states.blockedWrites;
}

fs.mkdirSync(outDir, { recursive: true });
for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(outDir, `${k}.${typeof v === 'string' ? 'md' : 'json'}`), typeof v === 'string' ? `${v}\n` : JSON.stringify(v, null, 1));
console.log(Object.keys(out).join(' '));
