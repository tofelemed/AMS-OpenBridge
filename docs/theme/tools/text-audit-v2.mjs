#!/usr/bin/env node
// PRM-003 Part E: five-class content audit over the crawl manifest.
// Writes deep/content-audit-v2.md and deep/data/content-audit-v2.json. Reads no application source.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyV2, savedV2, audienceFor, NEVER_REMOVE } from './lib/text-rules-v2.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const deep = path.resolve(here, '../deep');
const json = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const man = json(path.join(deep, 'screenshots/manifest.json'));
const lineage = json(path.join(deep, 'metric-lineage.json')) ?? [];
const walks = json(path.join(deep, 'data/task-walks.json'))?.walks ?? [];
const isWord = t => /\p{L}/u.test(t) && !/^[A-Z0-9][A-Z0-9_./-]*\d[A-Z0-9_./-]*$/.test(t) && !/^[\d.,:±+\-−%/]+\p{L}{0,3}$/u.test(t) && !/^\p{L}{1,3}\d+$/u.test(t);
const countWords = s => s.split(/\s+/).filter(Boolean).filter(isWord).length;
const cell = (s, n = 88) => { const c = (s ?? '').replaceAll('|', '/').replace(/\s+/g, ' ').trim(); return c.length > n ? `${c.slice(0, n - 1)}…` : c; };
const table = (h, r) => [`| ${h.join(' | ')} |`, `|${h.map(() => '---').join('|')}|`, ...r.map(x => `| ${x.join(' | ')} |`)].join('\n');
const norm = s => s.toLowerCase().replace(/\d+([.,:]\d+)*/g, '#').replace(/\s+/g, ' ').trim();

const concepts = (Array.isArray(lineage) ? lineage : lineage.concepts ?? []).map(c => ({ id: c.conceptId ?? c.id ?? c['Concept ID'], labels: (c.labels ?? c.labelsUsed ?? []).map(l => (typeof l === 'string' ? l : l.label ?? '')).filter(l => l.length > 4) }));
const conceptFor = t => { const s = t.toLowerCase(); return concepts.find(c => c.labels.some(l => s.includes(l.toLowerCase())))?.id ?? null; };

const pageOf = u => (u ?? '').split('?')[0];
const reachRole = {};
for (const w of walks) for (const h of w.hops ?? []) { const p = pageOf(h.url); (reachRole[p] ??= new Set()).add(w.id); }
const reach = u => (walks.length ? Math.max(1, reachRole[pageOf(u)]?.size ?? 0) / walks.length : 0.04);

const entries = man.surfaces.filter(s => s.text?.blocks && ['route', 'view'].includes(s.type));
const children = id => man.surfaces.filter(s => s.parent === id);
const rows = [];
const global = {};
const totals = { Keep: 0, Shorten: 0, 'Move to help': 0, Remove: 0, Internal: 0 };
const dispositions = {};
const adminOnOperator = {};
const perSurface = [];

for (const s of entries) {
  const counts = { Keep: 0, Shorten: 0, 'Move to help': 0, Remove: 0, Internal: 0 };
  let saved = 0;
  const changes = [];
  const words = { Operator: 0, Engineer: 0, Reliability: 0, Admin: 0 };
  for (const b of s.text.blocks) {
    const c = classifyV2(b, s.slug);
    const aud = audienceFor(s.slug, b.text, c.cls);
    counts[c.cls] += 1; totals[c.cls] += 1;
    for (const a of aud) words[a] += b.words * b.n;
    const w = savedV2(b, c, countWords);
    saved += w;
    if (c.cls === 'Internal') dispositions[c.disposition] = (dispositions[c.disposition] ?? 0) + 1;
    if (c.cls === 'Internal' && /^(overview|performance|events|explorer|kpi|trend)/.test(s.slug)) (adminOnOperator[s.id] ??= []).push(b.text.slice(0, 80));
    if (c.cls === 'Keep') continue;
    const metric = c.cls === 'Move to help' ? conceptFor(b.text) : null;
    changes.push([cell(b.text), c.cls, cell(c.to ?? 'Deleted', 44), metric ?? '-', aud.join(', '), cell(c.why, 60)]);
    // Representative-loop variants are the same page again, so they stay out of the ranking.
    if (s.slug.includes('--')) continue;
    const k = norm(b.text);
    const g = (global[k] ??= { text: b.text, cls: c.cls, to: c.to, n: 0, saved: 0, surfaces: new Set(), rank: 0 });
    g.n += b.n; g.saved += w; g.surfaces.add(s.id); g.rank += w * reach(s.url);
  }
  const kids = children(s.id);
  const revealed = kids.reduce((a, k) => a + (k.text?.visibleWords ?? 0), 0);
  const title = s.attr?.title?.reduce((a, t) => a + countWords(t), 0) ?? 0;
  const aria = s.attr?.ariaLabel?.reduce((a, t) => a + countWords(t), 0) ?? 0;
  perSurface.push({ id: s.id, slug: s.slug, words: s.text.visibleWords, viewport: s.text.wordsInViewport, title, aria, revealed, blocks: s.text.textBlocks, fonts: s.text.distinctFontSizes, repeated: s.text.repeatedStrings.length, kpi: s.text.kpiCards ? `${s.text.kpiCards.avg} / ${s.text.kpiCards.max}` : '-', projected: Math.max(0, s.text.visibleWords - saved), counts, audience: words, changes });
}

for (const o of man.surfaces.filter(s => s.type === 'overlay' && s.text?.blocks)) {
  for (const b of o.text.blocks) {
    const c = classifyV2(b, 'overlay');
    totals[c.cls] += 1;
    if (c.cls !== 'Keep') rows.push([o.id, cell(b.text), c.cls, cell(c.to ?? 'Deleted', 44), cell(c.why, 60)]);
  }
}

perSurface.sort((a, b) => b.words - a.words);
const ranked = Object.values(global).sort((a, b) => b.rank - a.rank || b.saved - a.saved);
const violations = entries.flatMap(s => s.text.blocks.filter(b => classifyV2(b, s.slug).cls === 'Remove' && NEVER_REMOVE.test(b.text)).map(b => `${s.id}: ${cell(b.text)}`));
const sum = f => perSurface.reduce((a, p) => a + f(p), 0);
const routesOnly = perSurface.filter(p => man.surfaces.find(s => s.id === p.id)?.type === 'route');
const summary = { surfaces: perSurface.length, overlays: man.surfaces.filter(s => s.type === 'overlay').length, totals, dispositions, words: sum(p => p.words), projected: sum(p => p.projected), routeWords: routesOnly.reduce((a, p) => a + p.words, 0), routeProjected: routesOnly.reduce((a, p) => a + p.projected, 0), titleWords: sum(p => p.title), violations, internalOnOperatorSurfaces: Object.fromEntries(Object.entries(adminOnOperator).map(([k, v]) => [k, v.length])), top: ranked.slice(0, 30).map(g => ({ text: cell(g.text, 70), cls: g.cls, saved: g.saved, n: g.n, surfaces: g.surfaces.size })) };

const doc = [
  '# CPA content audit v2 (PRM-003 Part E)',
  '',
  'Generated by `docs/theme/tools/text-audit-v2.mjs` from the crawl of the production build. Proposals only; no application text changed.',
  '',
  `Blocks: Keep ${totals.Keep}, Shorten ${totals.Shorten}, Move to help ${totals['Move to help']}, Remove ${totals.Remove}, Internal ${totals.Internal}. Constraint check, Remove touching protected content: **${violations.length}**.`,
  '',
  '## Per surface, worst first',
  '',
  table(['Surface', 'Slug', 'Visible', 'First viewport', '`title`', 'aria-label', 'On open', 'Blocks', 'Sizes', 'Repeated', 'KPI words avg / max', 'Projected', 'Keep', 'Shorten', 'Move', 'Remove', 'Internal'], perSurface.map(p => [p.id, p.slug, p.words, p.viewport, p.title, p.aria, p.revealed, p.blocks, p.fonts, p.repeated, p.kpi, p.projected, p.counts.Keep, p.counts.Shorten, p.counts['Move to help'], p.counts.Remove, p.counts.Internal])),
  '',
  '## Words by audience per surface',
  '',
  table(['Surface', 'Slug', 'Operator', 'Engineer', 'Reliability', 'Admin'], perSurface.map(p => [p.id, p.slug, p.audience.Operator, p.audience.Engineer, p.audience.Reliability, p.audience.Admin])),
  '',
  '## Top 30 reductions',
  '',
  'Ranked by words saved × occurrences × reach, where reach is the share of the 24 walked tasks that visit the surface.',
  '',
  table(['#', 'Text', 'Class', 'Proposal', 'Words saved', 'Occurrences', 'Surfaces'], ranked.slice(0, 30).map((g, i) => [i + 1, cell(g.text, 76), g.cls, cell(g.to ?? 'Deleted', 50), g.saved, g.n, g.surfaces.size])),
  '',
  '## Internal text on operator surfaces',
  '',
  ...Object.entries(adminOnOperator).map(([k, v]) => `- **${k}** (${v.length}): ${[...new Set(v)].slice(0, 5).map(t => `"${cell(t, 60)}"`).join('; ')}`),
  '',
  '## Changes per surface',
  '',
  ...perSurface.filter(p => p.changes.length).flatMap(p => [`### ${p.id} ${p.slug}: ${p.words} → ${p.projected} words`, '', table(['Current wording', 'Class', 'Proposal', 'Metric', 'Audience', 'Reason'], p.changes), '']),
  '## Overlay text',
  '',
  table(['Overlay', 'Current wording', 'Class', 'Proposal', 'Reason'], rows),
  '',
].join('\n');

fs.writeFileSync(path.join(deep, 'content-audit-v2.md'), doc);
fs.mkdirSync(path.join(deep, 'data'), { recursive: true });
fs.writeFileSync(path.join(deep, 'data/content-audit-v2.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ ...summary, top: summary.top.slice(0, 10) }, null, 1));
