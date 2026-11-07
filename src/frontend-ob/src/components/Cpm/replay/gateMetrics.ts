import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmKpiRow } from '../../../api/cpmApi';
import { readable } from '../evidence/format';

/** Long-tier metric fields relevant per gate (real stored fields only). CHG-065: fractions (0-1) are shown x 100 as %. */
export const GATE_METRICS: Record<string, { field: string; label: string; pct?: boolean }[]> = {
  G0: [{ field: 'completeness', label: 'Completeness (%)', pct: true }, { field: 'sample_count', label: 'Sample count' }],
  G1: [{ field: 'auto_pct', label: 'In AUTO (%)', pct: true }],
  G3: [{ field: 'mae', label: 'MAE' }, { field: 'iae', label: 'IAE' }, { field: 'good_error_pct', label: 'Good-error time (%)', pct: true }],
  G4: [{ field: 'effort_ratio', label: 'Effort ratio' }, { field: 'reversals_per_hour', label: 'Reversals/h' }, { field: 'travel_per_day', label: 'Travel/day' }],
  G5: [{ field: 'acf_period_s', label: 'ACF period (s)' }, { field: 'acf_regularity', label: 'ACF regularity' }],
  G6: [{ field: 'harmonic_amplitude_ratio', label: 'Harmonic amplitude ratio' }, { field: 'harmonic_energy_ratio', label: 'Harmonic energy ratio' }],
  G7: [{ field: 'triangularity', label: 'OP triangularity' }],
  G8: [{ field: 'horch_oddness', label: 'Horch oddness' }],
  G9: [{ field: 'corner_score', label: 'Corner score' }],
};

/** The verdict's own number first (the fused row carries G0-G4), then the long-tier KPI row. */
export const metricValue = (row: Pick<CpmGateMatrix, 'metrics'> | undefined, kpi: CpmKpiRow | undefined, field: string): number | null =>
  typeof row?.metrics?.[field] === 'number' ? row.metrics[field] : typeof kpi?.[field] === 'number' ? kpi[field] as number : null;

export function formatMetric(v: number | null, pct?: boolean): string {
  if (v == null) return 'Not reported';
  return pct ? `${(v * 100).toFixed(1)} %` : Number.isInteger(v) ? v.toLocaleString() : readable(v);
}
