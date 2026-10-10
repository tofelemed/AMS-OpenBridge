/**
 * KPI Phase 5: the last 14 days of one KPI, one bar per day (the share at the same time of day, same rules). Clicking a bar
 * shows that day's loops in the list below — so every point on the trend is provable like the card. Bars, not a line, so a
 * day is a large click target; a day with nothing to judge is an empty slot labelled "no data", never 0 %.
 * Colours from OpenBridge tokens via cpmChartColors (re-derived on a theme switch).
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { FleetKpiKey, FleetKpiTrend } from '../../../api/cpm/fleetKpis';
import { cpmChartColors, fmtDateTime } from '../shared';
import { useObcTheme } from '../../../hooks/useObcTheme';
import { dayLabel, kpiSeries } from './kpiTrend';

export const KpiTrendChart: React.FC<{
  trend: FleetKpiTrend;
  kpi: FleetKpiKey;
  /** The picked day's asOf (ISO), or null for "now". */
  selected: string | null;
  /** null = today (the live list). */
  onPick: (asOf: string | null) => void;
}> = ({ trend, kpi, selected, onPick }) => {
  const theme = useObcTheme();
  const days = useMemo(() => kpiSeries(trend, kpi), [trend, kpi]);
  const option = useMemo(() => {
    const c = cpmChartColors();
    const lastIdx = days.length - 1;
    return {
      animation: false,
      grid: { left: 52, right: 12, top: 12, bottom: 28 },   // room for "100 %" at phone width
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const d = days[ps[0]?.dataIndex ?? 0];
          if (!d) return '';
          return `${fmtDateTime(d.asOf)}<br/>${d.pct == null ? 'no data (nothing to judge)' : `${d.pct} % — ${d.count} of ${d.denominator}`}<br/>Click to list these loops`;
        },
      },
      xAxis: {
        type: 'category', data: days.map(d => dayLabel(d.asOf)),
        axisLabel: { color: c.grey, hideOverlap: true }, axisLine: { lineStyle: { color: c.grey } },
      },
      yAxis: {
        type: 'value', min: 0, max: 100, axisLabel: { color: c.grey, formatter: '{value} %' },
        splitLine: { lineStyle: { color: c.grey, opacity: 0.2 } },
      },
      series: [{
        type: 'bar', barMaxWidth: 28,
        data: days.map((d, i) => ({
          value: d.pct,
          itemStyle: {
            color: (selected ? d.asOf === selected : i === lastIdx) ? c.accent : c.grey,
            opacity: (selected ? d.asOf === selected : i === lastIdx) ? 1 : 0.55,
            borderRadius: [3, 3, 0, 0],
          },
        })),
      }],
    };
    // theme: the token colours change with it
  }, [days, selected, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ReactECharts option={option} notMerge style={{ height: 180, width: '100%' }}
      onEvents={{ click: (e: { dataIndex: number }) => { const d = days[e.dataIndex]; if (d) onPick(d.isNow ? null : d.asOf); } }}
      opts={{ renderer: 'svg' }} />
  );
};

export default KpiTrendChart;
