#!/usr/bin/env node
// Part C output: classifies every non-data block in the manifest and writes the per-route and ranked tables.
// Usage: node docs/theme/tools/text-audit.mjs [output-dir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, wordsSaved, NEVER_REMOVE } from './lib/text-rules.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = process.argv[2] ?? path.join(repo, 'docs/theme/data/tables');
const m = JSON.parse(fs.readFileSync(path.join(repo, 'docs/theme/screenshots/current/manifest.json'), 'utf8'));
const isWord = t => /\p{L}/u.test(t) && !/^[A-Z0-9][A-Z0-9_./-]*\d[A-Z0-9_./-]*$/.test(t) && !/^[\d.,:±+\-−%/]+\p{L}{0,3}$/u.test(t) && !/^\p{L}{1,3}\d+$/u.test(t);
const countWords = s => s.split(/\s+/).filter(Boolean).filter(isWord).length;
const cell = s => (s ?? '').replaceAll('|', '/').replace(/\s+/g, ' ').trim();
const short = (s, n = 90) => { const c = cell(s); return c.length > n ? `${c.slice(0, n - 1)}…` : c; };
const where = b => `${b.tag}${b.cls ? `.${b.cls.split(' ')[0]}` : ''} @${b.top}px`;
const norm = s => s.toLowerCase().replace(/\d+([.,:]\d+)*/g, '#').replace(/\s+/g, ' ').trim();
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');

const routes = Object.entries(m.routes).filter(([, v]) => v.text);
const global = {};
const perRoute = [];
const counts = { Keep: 0, Shorten: 0, 'Move to help': 0, Remove: 0 };

for (const [slug, v] of routes) {
  let saved = 0;
  const changes = [];
  const mine = { Keep: 0, Shorten: 0, 'Move to help': 0, Remove: 0 };
  const all = [];
  for (const b of v.text.blocks) {
    const c = classify(b, slug);
    const s = wordsSaved(b, c, countWords);
    saved += s;
    counts[c.cls] += 1;
    mine[c.cls] += 1;
    const row = [`\`${where(b)}\``, b.n > 1 ? `${short(b.text)} (×${b.n})` : short(b.text), c.cls, short(c.to ?? '-', 70), short(c.why, 80)];
    all.push(row);
    if (c.cls !== 'Keep') {
      changes.push(row);
      const k = norm(b.text);
      const g = (global[k] ??= { text: b.text, cls: c.cls, to: c.to, why: c.why, wordsEach: b.words, saved: 0, n: 0, routes: new Set() });
      g.saved += s; g.n += b.n; g.routes.add(slug);
    }
  }
  const words = v.text.visibleWords;
  perRoute.push({ slug, page: v.page, words, projected: Math.max(0, words - saved), saved, mine, changes, all });
}

perRoute.sort((a, b) => b.words - a.words);
const ranked = Object.values(global).sort((a, b) => b.saved - a.saved);
const sum = (f) => perRoute.reduce((a, r) => a + f(r), 0);

const out = {};
out.projection = table(['Route', 'Current visible words', 'Projected', 'Change', 'Keep', 'Shorten', 'Move', 'Remove'], perRoute.map(r => [
  r.slug, r.words, r.projected, `−${r.words ? Math.round((r.saved / r.words) * 100) : 0} %`, r.mine.Keep, r.mine.Shorten, r.mine['Move to help'], r.mine.Remove,
]));
out.top20 = table(['#', 'Text', 'Class', 'Proposal', 'Words saved', 'Occurrences', 'Routes'], ranked.slice(0, 20).map((g, i) => [
  i + 1, short(g.text, 80), g.cls, short(g.to ?? 'Deleted', 60), g.saved, g.n, g.routes.size,
]));
out.changes = perRoute.filter(r => r.changes.length).map(r => `#### ${r.slug}: ${r.words} → ${r.projected} words\n\n${table(['Location', 'Current wording', 'Class', 'Proposal or destination', 'Reason'], r.changes)}\n`).join('\n');
out.byRoute = perRoute.map(r => `## ${r.slug} (${r.page})\n\n${r.words} visible words, projected ${r.projected}.\n\n${table(['Location', 'Current wording', 'Class', 'Proposal or destination', 'Reason'], r.all)}\n`).join('\n');

fs.mkdirSync(outDir, { recursive: true });
for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(outDir, `text-${k}.md`), `${v}\n`);
const summary = { blocks: counts, routes: perRoute.length, totalWords: sum(r => r.words), projectedWords: sum(r => r.projected), savedWords: sum(r => r.saved), top: ranked.slice(0, 10).map(g => ({ text: short(g.text, 70), cls: g.cls, saved: g.saved, n: g.n })) };
fs.writeFileSync(path.join(outDir, 'text-summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
const unmatched = [];
for (const [, v] of routes) for (const b of v.text.blocks) if (b.kind === 'text' && b.words >= 8 && classify(b, '').why === 'State or row content') unmatched.push(`${b.words}|${b.n}|${short(b.text, 120)}`);
const violations = routes.flatMap(([slug, v]) => v.text.blocks.filter(b => classify(b, slug).cls === 'Remove' && NEVER_REMOVE.test(b.text)).map(b => `${slug}: ${short(b.text, 100)}`));
console.log(`--- constraint check: ${violations.length} Remove-class blocks touching protected content`);
console.log(violations.join('\n'));
fs.writeFileSync(path.join(outDir, 'text-constraint-check.json'), JSON.stringify({ violations }, null, 1));
console.log('--- default-classed text of 8+ words, review these');
console.log([...new Set(unmatched)].sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 60).join('\n'));
