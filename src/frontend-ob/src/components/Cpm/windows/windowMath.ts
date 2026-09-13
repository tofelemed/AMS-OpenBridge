/**
 * Window arithmetic shared by the inspector's list (completeness pill) and a window's
 * sub-page (metadata, density). Extracted from CpmWindows.tsx (CHG-025) unchanged.
 */
import type { CpmKpiRow } from '../../../api/cpmApi';

/** The engine normalizes samples onto a 5 s grid; expectations derive from it. */
export const SAMPLE_PERIOD_S = 5; // fallback only - rows carry sample_period_sec since P2-11

export const PROFILE_SECONDS: Record<string, number> = {
  '1m': 60, '5m': 300, '10m': 600, '15m': 900, '30m': 1800, '60m': 3600,
  '4h': 4 * 3600, '12h': 12 * 3600, '24h': 24 * 3600,
};

export const fmtBytesless = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());

export function completenessOf(row: CpmKpiRow, profileS: number): number | null {
  const direct = row.completeness;
  if (typeof direct === 'number') return direct;
  if (typeof row.sample_count === 'number') {
    // P2-11: prefer the engine's own per-window contract; a 1s loop was
    // previously billed against the hardcoded 5s and read 20% complete.
    const period = typeof row.sample_period_sec === 'number' && row.sample_period_sec > 0
      ? row.sample_period_sec : SAMPLE_PERIOD_S;
    const expected = typeof row.expected_sample_count === 'number' && row.expected_sample_count > 0
      ? row.expected_sample_count : profileS / period;
    return row.sample_count / expected;
  }
  return null;
}
