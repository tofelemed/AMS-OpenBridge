/**
 * Window arithmetic shared by the inspector's list and the selected window's panel: what a window should
 * hold (nominal), how the received count compares, and which run wrote it.
 */
import type { CpmKpiRow } from '../../../api/cpmApi';

export const PROFILE_SECONDS: Record<string, number> = {
  '1m': 60, '5m': 300, '10m': 600, '15m': 900, '30m': 1800, '60m': 3600,
  '4h': 4 * 3600, '12h': 12 * 3600, '24h': 24 * 3600,
};

export const fmtCount = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());

/**
 * What the window should hold: the engine's `expected_sample_count`. Historian rows do not carry it, so it is
 * `round(sample_count / completeness)` and marked derived. Never the sample period: it is not what the engine billed.
 */
export function nominalOf(row: CpmKpiRow): { value: number; derived: boolean } | null {
  const served = row.expected_sample_count;
  if (typeof served === 'number' && served > 0) return { value: served, derived: false };
  const { sample_count: n, completeness: c } = row;
  if (typeof n === 'number' && typeof c === 'number' && n > 0 && c > 0) return { value: Math.round(n / c), derived: true };
  return null;
}

export type CountTone = 'good' | 'warn' | 'bad';

/** "Matches", "+1 sample", "−1 sample": the difference in words. A ratio above 100 % is never "full". */
export function countCheck(received: number, nominal: number): { ratio: number; diff: number; label: string; tone: CountTone } {
  const diff = received - nominal;
  const ratio = nominal > 0 ? received / nominal : 0;
  const n = Math.abs(diff);
  const label = diff === 0 ? 'Matches' : `${diff > 0 ? '+' : '−'}${n.toLocaleString()} sample${n === 1 ? '' : 's'}`;
  const tone: CountTone = diff === 0 ? 'good' : ratio >= 0.9 ? 'warn' : 'bad';
  return { ratio, diff, label, tone };
}

/** The run that wrote a row: its decision run (G15) when it has one, else the first it names. Null before v2.5. */
export function runIdOf(row: CpmKpiRow): { gate: string; runId: string } | null {
  const raw = row.method_run_ids;
  if (typeof raw !== 'string') return null;
  let ids: unknown;
  try { ids = JSON.parse(raw); } catch { return null; }
  if (!ids || typeof ids !== 'object') return null;
  const map = ids as Record<string, unknown>;
  const gate = typeof map.G15 === 'string' ? 'G15' : Object.keys(map).find(k => typeof map[k] === 'string');
  return gate ? { gate, runId: map[gate] as string } : null;
}
