import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { contextOfMatrix, metricAvailability } from '../metricAvailability';
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

export type NumericHeadline =
  | { kind: 'value'; value: string; label: string }
  | { kind: 'state'; short: string; reason: string }
  | { kind: 'none' };

/**
 * CHG-141: the one value Numeric evidence leads with. Good-error time is on the result card, so it is never repeated
 * here; when every measure has one answer that answer stands in, and a dialog holds all of them.
 */
export function numericHeadline(matrix: CpmGateMatrix, metrics: Record<string, number | undefined>): NumericHeadline {
  const context = contextOfMatrix(matrix);
  const facts = KEY_FACTS.map(f => ({ f, a: metricAvailability(context, f.field, metrics[f.field]) }));
  const lead = facts.find(x => x.a.state === 'measured' && x.f.field !== 'good_error_pct');
  if (lead) return { kind: 'value', value: fmtFact(lead.f, (metrics[lead.f.field] ?? 0) * (lead.f.scale ?? 1)), label: lead.f.label };
  const { state, short, reason } = facts[0].a;
  if (state === 'measured' || !facts.every(x => x.a.state === state && x.a.reason === reason)) return { kind: 'none' };
  return { kind: 'state', short, reason: reason ? `${reason[0].toUpperCase()}${reason.slice(1)}` : '' };
}
