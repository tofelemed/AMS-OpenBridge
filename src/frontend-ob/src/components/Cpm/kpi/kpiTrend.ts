/**
 * KPI Phase 5: one KPI's daily series from `GET /fleet/kpis/trend` — pure, tested. A day with no denominator (nothing to
 * judge then, e.g. before the loops were evaluated) is "no data", never 0 %.
 */
import type { FleetKpiKey, FleetKpiTrend } from '../../../api/cpm/fleetKpis';

export interface KpiTrendDay {
  asOf: string;
  isNow: boolean;
  /** Share in % (rounded to 0.1), or null when the day had nothing to judge. */
  pct: number | null;
  count: number;
  denominator: number;
}

export function kpiSeries(trend: FleetKpiTrend | undefined, key: FleetKpiKey): KpiTrendDay[] {
  return (trend?.points ?? []).map(p => {
    const f = p.kpis.find(k => k.key === key);
    const count = f?.count ?? 0;
    const denominator = f?.denominator ?? 0;
    return { asOf: p.asOf, isNow: !!p.isNow, count, denominator, pct: denominator > 0 ? Math.round((count / denominator) * 1000) / 10 : null };
  });
}

/** "10 Oct" in the viewer's locale; the tooltip names the exact instant. */
export const dayLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Lowest / highest share over the days with data, for the caption ("between 12 % and 31 %"). */
export function seriesRange(days: KpiTrendDay[]): { min: number; max: number } | null {
  const v = days.map(d => d.pct).filter((x): x is number => x != null);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}
