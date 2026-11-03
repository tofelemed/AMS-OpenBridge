/**
 * KPI Phase 5: one KPI's daily series from `GET /fleet/kpis/trend` — pure, tested. A day with no denominator (nothing to
 * judge then, e.g. before the loops were evaluated) is "no data", never 0 %.
 * CHG-102: points carry their plant day (UTC); up to 3 years of them.
 */
import type { FleetKpiKey, FleetKpiTrend } from '../../../api/cpm/fleetKpis';

export interface KpiTrendDay {
  asOf: string;
  /** The plant day (yyyy-MM-dd, UTC), or null for today's live point (and on an older cplm-api). */
  day: string | null;
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
    return {
      asOf: p.asOf, day: p.day ?? null, isNow: !!p.isNow, count, denominator,
      pct: denominator > 0 ? Math.round((count / denominator) * 1000) / 10 : null,
    };
  });
}

/** "10 Oct" in the viewer's locale — the point's plant day (UTC, so a day-end point never reads as the next day); the year
 *  on long ranges. Today's live point has no plant day: its own instant. The tooltip names the exact instant. */
export function pointLabel(d: Pick<KpiTrendDay, 'asOf' | 'day'>, withYear = false): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) };
  if (!d.day) return new Date(d.asOf).toLocaleDateString(undefined, opts);
  return new Date(`${d.day}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

/** Lowest / highest share over the days with data, for the caption ("between 12 % and 31 %"). */
/** CHG-102: what a plant day is, for labels: "UTC day", "Asia/Tehran day (UTC+03:30)". An older cplm-api = UTC. */
export function plantDayLabel(trend: Pick<FleetKpiTrend, 'plantDay'> | undefined): string {
  const p = trend?.plantDay;
  if (!p) return 'UTC day';
  return p.zone.startsWith('UTC') ? `${p.zone} day` : `${p.zone} day (UTC${p.utcOffset})`;
}

export function seriesRange(days: KpiTrendDay[]): { min: number; max: number } | null {
  const v = days.map(d => d.pct).filter((x): x is number => x != null);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}
