#!/usr/bin/env node
// Node port of the skill's scripts/contrast.py: same pairings, same thresholds, same totals, reading
// src/styles/traverse-tokens.css. Adds the CPA chart pairings of CD12. Exit 1 on an undocumented failure.
// --json prints the rows, used to prove parity with the Python original.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(app, 'src/styles/traverse-tokens.css'), 'utf8');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function block(sel) {
  const m = new RegExp(`${esc(sel)}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
  if (!m) { console.error(`selector block not found: ${sel}`); process.exit(2); }
  return Object.fromEntries([...m[1].matchAll(/--traverse-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(x => [x[1], x[2]]));
}
const fixed = block(':root'); const day = block('[data-theme="day"]'); const night = block('[data-theme="night"]');
const lin = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const S = ['surface-page', 'surface-panel', 'surface-raised', 'surface-hover', 'surface-selected'];
const PAIRS = [];
for (const t of ['text-primary', 'text-secondary', 'text-muted', 'action-primary']) for (const s of S) PAIRS.push([t, s, 4.5]);
for (const a of ['action-primary', 'action-hover', 'action-active']) PAIRS.push(['action-on', a, 4.5]);
for (const st of ['danger', 'warning', 'success', 'info', 'unknown']) PAIRS.push([`status-${st}-fg`, `status-${st}-bg`, 4.5], [`status-${st}-fg`, 'surface-panel', 4.5], [`status-${st}-fg`, 'surface-page', 4.5]);
PAIRS.push(['ai-fg', 'ai-bg', 4.5], ['ai-fg', 'surface-panel', 4.5], ['action-on', 'status-danger-fg', 4.5]);
for (const s of ['surface-page', 'surface-panel', 'surface-raised']) PAIRS.push(['border-strong', s, 3.0], ['focus', s, 3.0], ['action-primary', s, 3.0]);
PAIRS.push(['border-subtle', 'surface-panel', 3.0]);
for (let i = 1; i <= 6; i++) PAIRS.push([`chart-series-${i}`, 'surface-panel', 3.0]);
for (const c of ['f', 'c', 's', 'm']) PAIRS.push([`diag-${c}-fill`, 'surface-panel', 3.0]);
const BOTH = [['f', 4.5], ['c', 4.5], ['s', 4.5], ['m', 4.5]].map(([c, t]) => [`diag-${c}-text`, `diag-${c}-fill`, t]);
const EXCEPT = new Set(['border-subtle|surface-panel', 'diag-c-fill|surface-panel', 'diag-s-fill|surface-panel', 'diag-m-fill|surface-panel']);

const rows = [];
for (const [th, t] of [['day', day], ['night', night]]) {
  const tt = { ...t, ...fixed };
  for (const [fg, bg, min] of PAIRS) {
    if (!(fg in tt) || !(bg in tt)) continue;
    const r = cr(tt[fg], tt[bg]);
    rows.push({ th, fg, bg, min, r, pass: r >= min, exception: EXCEPT.has(`${fg}|${bg}`) });
  }
}
for (const [fg, bg, min] of BOTH) { const r = cr(fixed[fg], fixed[bg]); rows.push({ th: 'both', fg, bg, min, r, pass: r >= min, exception: false }); }

// CPA chart pairings (CD12): series 1, 3, 4, 5 and 6 against page, panel and raised, both themes.
const chartRows = [];
for (const [th, t] of [['day', day], ['night', night]]) {
  for (const n of [1, 3, 4, 5, 6]) for (const s of ['surface-page', 'surface-panel', 'surface-raised']) {
    const r = cr(t[`chart-series-${n}`], t[s]);
    chartRows.push({ th, fg: `chart-series-${n}`, bg: s, min: 3, r, pass: r >= 3 });
  }
}

if (process.argv.includes('--json')) { console.log(JSON.stringify(rows.map(x => [x.th, x.fg, x.bg, x.min, Number(x.r.toFixed(2)), x.pass]))); process.exit(0); }
const failures = rows.filter(r => !r.pass);
const undocumented = failures.filter(r => !r.exception);
const passing = rows.filter(r => r.pass);
const text = passing.filter(r => r.min === 4.5).map(r => r.r);
const non = passing.filter(r => r.min === 3).map(r => r.r);
const chartFail = chartRows.filter(r => !r.pass);
console.log(`${rows.length} pairings, ${passing.length} pass, ${failures.length} documented exceptions/failures`);
console.log(`min passing text: ${Math.min(...text).toFixed(3)}  min passing non-text: ${Math.min(...non).toFixed(3)}`);
console.log(`CPA chart pairings: ${chartRows.length}, pass ${chartRows.length - chartFail.length}, lowest ${Math.min(...chartRows.map(r => r.r)).toFixed(2)}`);
const expected = rows.length === 126 && passing.length === 121;
if (!expected) console.log('expected 121 of 126 against skill R1.2');
if (undocumented.length || chartFail.length || !expected) {
  console.log([...undocumented, ...chartFail].map(r => `${r.th} ${r.fg} on ${r.bg} ${r.r.toFixed(2)} < ${r.min}`).join('\n'));
  process.exit(1);
}
