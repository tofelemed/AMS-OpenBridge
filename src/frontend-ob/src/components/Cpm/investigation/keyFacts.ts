import { fmtDuration } from '../shared';

/** Key facts — real stored metric fields with honest units (shared by the tiles and the delta table). */
export const KEY_FACTS: { field: string; label: string; unit: string; scale?: number }[] = [
  { field: 'stiction_score', label: 'Stiction score', unit: '' },
  { field: 'effort_ratio', label: 'Effort ratio', unit: '' },
  { field: 'triangularity', label: 'OP triangularity', unit: '' },
  { field: 'acf_period_s', label: 'Oscillation period', unit: 's' },
  { field: 'freeze_index_s', label: 'Freeze index', unit: 's' },
  // 0..1 fraction from the engine - scaled to percent by KEY_FACTS rendering.
  { field: 'good_error_pct', label: 'Good-error time', unit: '%', scale: 100 },
];

export const fmt = (v: number | undefined, digits = 2) => (v != null ? v.toFixed(digits) : '—');

/** SME #15 (CHG-051): a key fact in readable precision — seconds as a duration ("45 min", not "2700.00s"),
 *  percentages to one decimal, scores and ratios to two. `value` is already scaled. */
export function fmtFact(f: { unit: string }, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (f.unit === 's') {
    const a = Math.abs(value);
    const t = a < 60 ? `${Number(a.toFixed(1))} s` : fmtDuration(a * 1000);
    return value < 0 ? `−${t}` : t;
  }
  if (f.unit === '%') return `${value.toFixed(1)} %`;
  return value.toFixed(2);
}
