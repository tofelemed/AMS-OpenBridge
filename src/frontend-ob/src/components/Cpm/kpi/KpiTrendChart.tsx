/**
 * KPI Phase 5: one KPI per day (14 days up to 3 years, CHG-102), one bar per plant day (its share at the day's end, same rules). Clicking a bar
 * shows that day's loops in the list below — so every point on the trend is provable like the card. Bars, not a line, so a
 * day is a large click target; a day with nothing to judge is an empty slot labelled "no data", never 0 %.
 * Colours from the chart palette (rebuilt on a theme switch).
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { FleetKpiKey, FleetKpiTrend } from '../../../api/cpm/fleetKpis';
import { axisChrome, chartPalette, plainOption, useChartTheme } from '../../../charts/chartTheme';
import { fmtDateTime } from '../shared';
import { kpiSeries, plantDayLabel, pointLabel } from './kpiTrend';

export const KpiTrendChart: React.FC<{
  trend: FleetKpiTrend;
  kpi: FleetKpiKey;
  /** The picked day's asOf (ISO), or null for "now". */
  selected: string | null;
  /** null = today (the live list). */
  onPick: (asOf: string | null) => void;
}> = ({ trend, kpi, selected, onPick }) => {
  const theme = useChartTheme();
  const days = useMemo(() => kpiSeries(trend, kpi), [trend, kpi]);
  const option = useMemo(() => {
    const palette = chartPalette();
    const base = plainOption(palette);
    const axis = axisChrome(palette);
    const lastIdx = days.length - 1;
    const long = days.length > 120;   // CHG-102: past ~4 months the axis names the year
    const when = (d: (typeof days)[number]) => d.day ? `${pointLabel(d, true)} (${plantDayLabel(trend)}, as of ${fmtDateTime(d.asOf)})` : fmtDateTime(d.asOf);
    return {
      ...base,
      animation: false,
      grid: { left: 52, right: 12, top: 12, bottom: 28 },   // room for "100 %" at phone width
      tooltip: {
        ...base.tooltip,
        trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: palette.cursor } },
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const d = days[ps[0]?.dataIndex ?? 0];
          if (!d) return '';
          return `${when(d)}<br/>${d.pct == null ? 'no data (nothing to judge)' : `${d.pct} % — ${d.count} of ${d.denominator}`}<br/>Click to list these loops`;
        },
      },
      xAxis: {
        ...axis, type: 'category', data: days.map(d => pointLabel(d, long)),
        axisLabel: { ...axis.axisLabel, hideOverlap: true },
      },
      yAxis: {
        ...axis, type: 'value', min: 0, max: 100, axisLabel: { ...axis.axisLabel, formatter: '{value} %' },
        splitLine: { lineStyle: { ...axis.splitLine.lineStyle, opacity: 0.2 } },
      },
      series: [{
        type: 'bar', barMaxWidth: 28,
        data: days.map((d, i) => ({
          value: d.pct,
          itemStyle: {
            color: (selected ? d.asOf === selected : i === lastIdx) ? palette.pens[4] : palette.tick,
            opacity: (selected ? d.asOf === selected : i === lastIdx) ? 1 : 0.55,
            borderRadius: [3, 3, 0, 0],
          },
        })),
      }],
    };
    // theme: the token colours change with it
  }, [days, selected, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ReactECharts option={option} notMerge style={{ height: 140, width: '100%' }}
      onEvents={{ click: (e: { dataIndex: number }) => { const d = days[e.dataIndex]; if (d) onPick(d.isNow ? null : d.asOf); } }}
      opts={{ renderer: 'svg' }} />
  );
};

export default KpiTrendChart;
