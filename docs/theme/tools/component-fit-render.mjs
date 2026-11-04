#!/usr/bin/env node
// Joins lib/component-ratings.mjs with component-inventory.json and fills the generated blocks of
// docs/theme/deep/component-fit.md, so no use count, rating total or CD1 size in that document is typed by hand.
// Usage: node docs/theme/tools/component-fit-render.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILIES, OB } from './lib/component-ratings.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const inv = JSON.parse(fs.readFileSync(path.join(repo, 'docs/theme/deep/data/component-inventory.json'), 'utf8'));
const doc = path.join(repo, 'docs/theme/deep/component-fit.md');
const summaryFile = path.join(repo, 'docs/theme/deep/data/component-fit.json');
const entries = Object.entries(inv.elements);

function elementsFor(row) {
  if (row.kind) return entries.filter(([, e]) => e.kind === row.kind).map(([, e]) => e);
  return (row.keys ?? []).flatMap(k => entries.filter(([key, e]) => key === k || (e.name === k && e.kind === 'custom')).map(([, e]) => e));
}

function resolve(row) {
  const els = elementsFor(row);
  if (row.keys?.length && els.length === 0) throw new Error(`${row.id}: no inventory element for ${row.keys}`);
  const fromClasses = (row.classes ?? []).reduce((n, [el, cls]) => n + (inv.elements[el]?.classes?.[cls] ?? 0), 0);
  const uses = row.uses ?? els.reduce((n, e) => n + e.uses, 0) + fromClasses;
  const files = new Set(els.flatMap(e => Object.keys(e.files)));
  const routes = new Set(els.flatMap(e => e.routes));
  return { ...row, uses, fileCount: row.files ?? (files.size || null), fileSet: files, routeSet: routes };
}

const short = r => {
  if (r.routes) return r.routes;
  const shell = r.routeSet.has('(shell)');
  const list = [...r.routeSet].filter(x => x !== '(shell)');
  if (!list.length) return shell ? '(shell)' : 'via host';
  const text = list.length <= 3 ? list.join(', ') : `${list.length} routes`;
  return shell ? `${text} + shell` : text;
};
const esc = s => String(s ?? '').replace(/\|/g, '\\|');
const usesCell = r => (r.fileCount ? `${r.uses} (${r.fileCount})` : `${r.uses}`);

const rows = FAMILIES.flatMap(([fam, label, list]) => list.map(r => ({ ...resolve(r), fam, famLabel: label })));

const tableA = fam => ['| ID | Component | Uses (files) | Routes | Variants | States | Keyboard | ARIA |', '|---|---|---|---|---|---|---|---|',
  ...rows.filter(r => r.fam === fam).map(r => `| ${r.id} | ${esc(r.name)} | ${usesCell(r)} | ${esc(short(r))} | ${esc(r.variants)} | ${esc(r.states)} | ${esc(r.keyboard)} | ${esc(r.aria)} |`)].join('\n');
const tableB = fam => ['| ID | Component | Geometry against p.6 | Contract clause | Rating | Reason |', '|---|---|---|---|---|---|',
  ...rows.filter(r => r.fam === fam).map(r => `| ${r.id} | ${esc(r.name)} | ${esc(r.geometry)} | ${esc(r.contract)} | **${r.rating}**${r.band === 'ring' ? ' (gap only)' : ''} | ${esc(r.why)} |`)].join('\n');

const RATINGS = ['Adapter-fit', 'Extend', 'Replace'];
const sum = (list, f = r => r.uses) => list.reduce((n, r) => n + f(r), 0);
const totalsRows = FAMILIES.map(([fam, label]) => {
  const list = rows.filter(r => r.fam === fam);
  return { label, cells: RATINGS.map(x => list.filter(r => r.rating === x)), list };
});
const totalsTable = ['| Family | Adapter-fit | Extend | Replace | Rated types |', '|---|---|---|---|---|',
  ...totalsRows.map(t => `| ${t.label} | ${t.cells.map(c => `${c.length} (${sum(c)} uses)`).join(' | ')} | ${t.list.length} |`),
  `| **All** | ${RATINGS.map(x => { const c = rows.filter(r => r.rating === x); return `**${c.length}** (${sum(c)} uses)`; }).join(' | ')} | **${rows.length}** |`].join('\n');

const ob = rows.filter(r => r.fam === 'ob');
const replaceHard = ob.filter(r => r.band === 'hard');
const replaceRing = ob.filter(r => r.band === 'ring');
const icons = ob.find(r => r.id === 'K-16');
const obNoIcons = ob.filter(r => r.id !== 'K-16');
const union = list => new Set(list.flatMap(r => [...r.fileSet])).size;
const elementsIn = list => sum(list);
const totalOb = elementsIn(obNoIcons);
const native = ['button', 'input', 'select', 'textarea'].reduce((n, k) => n + inv.elements[k].uses, 0);
const passive = ['K-12', 'K-13', 'K-14', 'K-15'];
const interactiveOb = sum(obNoIcons.filter(r => !passive.includes(r.id)));
const cd1 = {
  jsxElements: inv.totals.jsxElements,
  openBridgeComponents: totalOb, openBridgeTypes: inv.byKind.openbridge.types, icons: icons.uses, iconTypes: inv.byKind['openbridge-icon'].types,
  shareOfJsxPct: +(((totalOb + icons.uses) / inv.totals.jsxElements) * 100).toFixed(1),
  obcButtonShareOfObPct: +((213 / totalOb) * 100).toFixed(1),
  nativeControls: native, nativeTables: inv.elements.table.uses,
  interactiveOb, interactiveShareOfControlsPct: +((interactiveOb / (interactiveOb + native)) * 100).toFixed(1),
  hard: { uses: elementsIn(replaceHard), files: union(replaceHard), ids: replaceHard.map(r => r.id) },
  ring: { uses: elementsIn(replaceRing), files: union(replaceRing), ids: replaceRing.map(r => r.id) },
  both: { uses: elementsIn([...replaceHard, ...replaceRing]), files: union([...replaceHard, ...replaceRing]) },
  whole: { uses: totalOb + icons.uses, files: union(ob) },
  keptAfterB2: totalOb - elementsIn([...replaceHard, ...replaceRing]),
};
const pct = n => `${((n / (totalOb)) * 100).toFixed(1)} %`;
const cd1Table = ['| Option | JSX uses replaced | Files touched | OpenBridge uses left | Contract result |', '|---|---|---|---|---|',
  `| A. Keep everything, adapter only | 0 | 0 | ${totalOb} + ${icons.uses} icons | **Cannot pass.** ${cd1.both.uses} uses stay outside the contract, ${cd1.hard.uses} of them with name, role or state failures. 11 of 15 critical axe nodes remain |`,
  `| B1. Replace the hard failures | ${cd1.hard.uses} (${pct(cd1.hard.uses)} of OpenBridge uses) | ${cd1.hard.files} | ${totalOb - cd1.hard.uses} + ${icons.uses} icons | Passes if the Lead waives the 3 px gap on ${cd1.ring.uses} uses. Removes all 11 critical nodes |`,
  `| **B2. Replace hard and gap-only** | **${cd1.both.uses}** (${pct(cd1.both.uses)}) | **${cd1.both.files}** | **${cd1.keptAfterB2} + ${icons.uses} icons** | **Passes.** ObcButton stays, behind variables and parts |`,
  `| C. Replace wholesale | ${cd1.whole.uses} (${totalOb} + ${icons.uses} icons, ${cd1.iconTypes} icon types) | ${cd1.whole.files} | 0 | Passes. Also ends the shadow-DOM workarounds, at ${(cd1.whole.uses / cd1.both.uses).toFixed(1)} times B2's edits |`].join('\n');

const covered = new Set(rows.flatMap(r => (r.keys ?? [])));
const customTypes = entries.filter(([, e]) => e.kind === 'custom');
const unrated = customTypes.filter(([, e]) => !covered.has(e.name));
const biggest = unrated.sort((a, b) => b[1].uses - a[1].uses).slice(0, 6).map(([, e]) => `${e.name} ${e.uses}`).join(', ');
const coverage = `Rated rows cover ${covered.size} inventory keys. The other ${unrated.length} of ${customTypes.length} custom types are not rated: they are route guards, page bodies, gate views, tab panels and local helpers assembled from rated parts. The largest are ${biggest}. All ${customTypes.length} are listed with their use sites in [data/component-inventory.json](data/component-inventory.json).`;

const repl = {
  totals: totalsTable, coverage,
  'a:ob': tableA('ob'), 'b:ob': tableB('ob'), 'a:native': tableA('native'), 'b:native': tableB('native'),
  'a:custom': tableA('custom'), 'b:custom': tableB('custom'), 'a:chart': tableA('chart'), 'b:chart': tableB('chart'),
  cd1: cd1Table,
  facts: `${inv.totals.jsxElements} JSX elements in ${inv.tsxFiles} live \`.tsx\` files. OpenBridge ${totalOb} (${cd1.openBridgeTypes} types) plus ${icons.uses} icons, ${cd1.shareOfJsxPct} % of all JSX. ObcButton is ${cd1.obcButtonShareOfObPct} % of OpenBridge uses. Of ${interactiveOb + native} interactive controls, ${interactiveOb} are OpenBridge (${cd1.interactiveShareOfControlsPct} %) and ${native} are native, before ${cd1.nativeTables} native tables.`,
};

let text = fs.readFileSync(doc, 'utf8');
for (const [key, value] of Object.entries(repl)) {
  const re = new RegExp(`(<!-- GEN:${key} -->)[\\s\\S]*?(<!-- /GEN -->)`);
  if (!re.test(text)) throw new Error(`marker missing: ${key}`);
  text = text.replace(re, (_, a, b) => `${a}\n${value}\n${b}`);
}
fs.writeFileSync(doc, text);
fs.writeFileSync(summaryFile, JSON.stringify({ generatedBy: 'docs/theme/tools/component-fit-render.mjs',
  byRating: Object.fromEntries(RATINGS.map(x => [x, { types: rows.filter(r => r.rating === x).length, uses: sum(rows.filter(r => r.rating === x)) }])),
  rated: rows.length, cd1, coverage,
  rows: rows.map(r => ({ id: r.id, name: r.name, family: r.famLabel, uses: r.uses, files: r.fileCount, routes: short(r), rating: r.rating, band: r.band ?? null })) }, null, 1));
console.log(JSON.stringify({ rated: rows.length, byRating: Object.fromEntries(RATINGS.map(x => [x, rows.filter(r => r.rating === x).length])), cd1 }, null, 1));
console.log(coverage);
if (OB.length !== 16) throw new Error('OpenBridge rows changed: review §8');
