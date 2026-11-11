/**
 * CHG-168 (owner review, badge 13): the words of Bulk import, each count said once. Review: "3 rows: ✓ 2 ready (1 updates an
 * existing loop) · ✕ 1 needs correction" (it was four tiles, a skipped-rows sentence and a footer count); Activate: "2 loops to
 * activate: 1 new, 1 updates an existing loop · 1 row skipped" (four tiles again and a footer count). A row's paths read
 * under its location, "…/fic10499 .pv .sp .op .mode", whole on hover.
 */
import type { CsvRow } from '../../csvImport';
import { SIGNAL_ROLES } from '../../plantLocation';

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export interface ImportCounts { rows: number; ready: number; updates: number; fix: number }

export function importCounts(rows: CsvRow[]): ImportCounts {
  const ready = rows.filter(r => r.problems.length === 0);
  return { rows: rows.length, ready: ready.length, updates: ready.filter(r => r.existing).length, fix: rows.length - ready.length };
}

/** "(1 updates an existing loop)" beside the ready count, or nothing. */
/**
 * CHG-168 (owner, 11 Nov): the import format has no monitoring column, so importing a loop that is not monitored turns its
 * monitoring back on. Said once on Review, naming up to five loops; null when no such loop is in the file.
 */
export function resumesNote(tags: string[]): string | null {
  if (tags.length === 0) return null;
  const named = tags.slice(0, 5).join(', ') + (tags.length > 5 ? ` and ${tags.length - 5} more` : '');
  return `Monitoring turns back on for ${plural(tags.length, 'loop', 'loops')} that ${tags.length === 1 ? 'is' : 'are'} not monitored now: ${named}.`;
}

export const updatesNote = (n: number): string => (n === 0 ? '' : n === 1 ? ' (1 updates an existing loop)' : ` (${n} update existing loops)`);

/** "1 new, 1 updates an existing loop · 1 row skipped", each part only when it has rows. */
export function activateLine(c: ImportCounts): string {
  const created = c.ready - c.updates;
  const parts = [
    created > 0 ? `${created} new` : '',
    c.updates === 1 ? '1 updates an existing loop' : c.updates > 1 ? `${c.updates} update existing loops` : '',
  ].filter(Boolean).join(', ');
  return c.fix > 0 ? `${parts} · ${plural(c.fix, 'row skipped', 'rows skipped')}` : parts;
}

/** A row's paths: the common base once, under its location, then the roles; any other shape whole. */
export function pathsText(row: CsvRow): { short: string; full: string } {
  const mapped = SIGNAL_ROLES.filter(r => row.paths[r].path).map(r => [r, row.paths[r].path] as const);
  if (mapped.length === 0) return { short: '—', full: '' };
  const full = mapped.map(([, p]) => p).join('  ·  ');
  const bases = mapped.map(([r, p]) => (p.endsWith(`.${r}`) ? p.slice(0, -(r.length + 1)) : null));
  const base = bases[0];
  if (base == null || bases.some(b => b !== base)) return { short: full, full };
  const segs = base.split('/');
  const head = segs.length >= 3 ? `…/${segs[segs.length - 1]}` : base;
  return { short: `${head} ${mapped.map(([r]) => `.${r}`).join(' ')}`, full };
}
