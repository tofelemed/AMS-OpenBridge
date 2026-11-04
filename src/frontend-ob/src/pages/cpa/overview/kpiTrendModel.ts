/**
 * A KPI's daily trend as TrendPanel panes. A day with nothing to judge stays null, so it draws as a
 * gap and never as 0 %. Each day with data is a selectable lane segment: that is the old drill-down's
 * day pick (`day=`), and it gives the pick a keyboard path, which the old chart's bars did not have.
 */
import type { FleetKpiKey, FleetKpiTrend } from '../../../api/cpm/fleetKpis';
import { kpiSeries, seriesRange, type KpiTrendDay } from '../../../components/Cpm/kpi/kpiTrend';
import type { Interval, TrendLane, TrendPane } from '../../../ui/trend';

const DAY_MS = 86_400_000;
const PANE_HEIGHT = 120;

export interface DailyTrendModel {
  days: KpiTrendDay[];
  panes: TrendPane[];
  lanes: TrendLane[];
  plotWindow: Interval | undefined;
  range: { min: number; max: number } | null;
}

export function dailyTrendModel(trend: FleetKpiTrend, key: FleetKpiKey, label: string): DailyTrendModel {
  const days = kpiSeries(trend, key);
  const x = days.map(d => Date.parse(d.asOf));
  const panes: TrendPane[] = [{
    id: 'daily',
    height: PANE_HEIGHT,
    axes: [{ id: 'share', label: 'Share of loops', unit: '%', bounds: { min: 0, max: 100 } }],
    series: [{
      id: 'share', label, role: 'overlay', axis: 'share', x, y: days.map(d => d.pct),
      meta: i => (days[i]?.pct == null ? ['No data'] : [`${days[i].count} of ${days[i].denominator}`]),
    }],
  }];
  const startOf = (i: number) => (i > 0 ? x[i - 1] : x[i] - DAY_MS);
  const lanes: TrendLane[] = [{
    id: 'days',
    label: 'Day',
    kind: 'verdict',
    segments: days.flatMap((d, i) => (d.pct == null ? [] : [{
      id: d.asOf, startMs: startOf(i), endMs: x[i], label: `${d.pct} %`, tone: 'neutral' as const,
    }])),
  }];
  const plotWindow = x.length ? { from: startOf(0), to: x[x.length - 1] } : undefined;
  return { days, panes, lanes, plotWindow, range: seriesRange(days) };
}
