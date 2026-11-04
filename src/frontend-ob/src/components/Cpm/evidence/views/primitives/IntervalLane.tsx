/**
 * v2.5 Task 2E.3/2E.4 primitive: a categorical interval lane (mode, health, availability, dwell and
 * freeze episodes) drawn from REAL start / end instants on a time axis in the site zone. Gaps stay
 * empty - a lane never paints a state it was not given. Pure option builder + echarts wrapper.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { axisChrome, chartPalette, plainOption, toneColors, useChartTheme, type ChartPalette } from '../../../../../charts/chartTheme';
import type { CpmTone } from '../../../shared';
import { formatInZone, formatTimeInZone, zoneLabel } from '../../timezone';

export interface LaneInterval {
  startMs: number;
  endMs: number;
  label: string;
  tone: CpmTone;
}

export interface IntervalLaneInput {
  title: string;
  intervals: LaneInterval[];
  fromMs: number;
  toMs: number;
  timeZone: string;
  palette: ChartPalette;
}

export function buildIntervalLaneOption(i: IntervalLaneInput) {
  const { intervals, fromMs, toMs, timeZone, palette } = i;
  const tones = toneColors(palette);
  const base = plainOption(palette);
  const axis = axisChrome(palette);
  return {
    ...base,
    animation: false,
    grid: { left: 64, right: 24, top: 6, bottom: 24 },
    xAxis: { ...axis, type: 'time' as const, min: fromMs, max: toMs, axisLabel: { ...axis.axisLabel, formatter: (v: number) => formatTimeInZone(v, timeZone) }, splitLine: { show: false } },
    yAxis: { type: 'value' as const, min: 0, max: 1, show: false },
    tooltip: {
      ...base.tooltip,
      trigger: 'item' as const,
      formatter: (p: { dataIndex: number }) => {
        const s = intervals[p.dataIndex];
        return s ? `${s.label}<br/>${formatInZone(s.startMs, timeZone)} → ${formatInZone(s.endMs, timeZone)} (${zoneLabel(timeZone, s.startMs)})` : '';
      },
    },
    series: [{
      type: 'custom' as const,
      renderItem: (_params: unknown, api: { coord: (v: [number, number]) => [number, number]; value: (i: number) => number; size: (v: [number, number]) => [number, number] }) => {
        const idx = api.value(2);
        const seg = intervals[idx];
        if (!seg) return null;
        const start = api.coord([seg.startMs, 0.5]);
        const end = api.coord([seg.endMs, 0.5]);
        const height = api.size([0, 1])[1] * 0.7;
        return { type: 'rect', shape: { x: start[0], y: start[1] - height / 2, width: Math.max(1, end[0] - start[0]), height }, style: { fill: tones[seg.tone], opacity: 0.85 } };
      },
      encode: { x: 0, y: 1 },
      data: intervals.map((s, k) => [s.startMs, 0.5, k]),
    }],
  };
}

export const IntervalLane: React.FC<Omit<IntervalLaneInput, 'palette'> & { height?: number; empty?: string }> = (props) => {
  const theme = useChartTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is a recompute trigger: the palette is read from CSS variables that change with it.
  const option = useMemo(() => buildIntervalLaneOption({ ...props, palette: chartPalette() }), [props, theme]);
  return (
    <div className="cpm-lane" data-lane={props.title}>
      <span className="cpm-eyebrow">{props.title}</span>
      {props.intervals.length === 0
        ? <p className="cpm-copy">{props.empty ?? 'No intervals in this run.'}</p>
        : <ReactECharts option={option} notMerge style={{ height: props.height ?? 48 }} />}
    </div>
  );
};
