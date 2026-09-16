/**
 * v2.5 Task 1H.6 — the health lane: eligibility intervals of one signal role drawn as a step
 * band (gaps stay gaps). `healthSegments` is the pure mapping the Historical chart and the G11
 * view feed into their own lane; `HealthLane` is a standalone lane for the Investigation
 * timeline, sharing the rect renderer with the mode/verdict lanes.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { HealthHistoryRow } from '../../../api/cpm/health';
import { cpmToneColors, resolveCssColor, type CpmTone } from '../shared';
import { laneRenderer, type Segment } from '../historical/chartOption';
import { eligibilityTone } from './TransmitterHealthPanel';

export function healthSegments(rows: HealthHistoryRow[], from: Date, to: Date, role = 'PV'): Segment[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  return rows
    .filter(r => r.role === role)
    .map(r => {
      const startMs = Math.max(new Date(r.from).getTime(), fromMs);
      const endMs = Math.min(r.to ? new Date(r.to).getTime() : toMs, toMs);
      const flags = r.activeFlags.length ? r.activeFlags.join('') : 'no flags';
      return {
        startMs, endMs,
        tone: eligibilityTone(r.eligibility) as CpmTone,
        label: `${role} ${r.eligibility.replace(/_/g, ' ')} · ${flags} · ${r.deviceId || 'no device'}${r.revision > 1 ? ` · rev ${r.revision}` : ''}`,
      };
    })
    .filter(s => s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

export const HealthLane: React.FC<{
  rows: HealthHistoryRow[];
  from: Date;
  to: Date;
  role?: string;
  height?: number;
}> = ({ rows, from, to, role = 'PV', height = 28 }) => {
  const segments = useMemo(() => healthSegments(rows, from, to, role), [rows, from, to, role]);
  const option = useMemo(() => {
    const tones = cpmToneColors();
    const grey = resolveCssColor('--on-surface-passive-color', '#888');
    return {
      animation: false,
      grid: [{ left: 60, right: 24, top: 2, height: height - 4 }],
      tooltip: {
        trigger: 'item' as const,
        formatter: (p: { dataIndex: number }) => segments[p.dataIndex]?.label ?? '',
      },
      xAxis: [{
        type: 'time' as const, gridIndex: 0, min: from.getTime(), max: to.getTime(),
        axisLabel: { show: false }, axisLine: { show: false, lineStyle: { color: grey } }, axisTick: { show: false }, splitLine: { show: false },
      }],
      yAxis: [{ type: 'value' as const, gridIndex: 0, min: 0, max: 1, show: false }],
      series: [{
        name: 'health-track', type: 'custom' as const, xAxisIndex: 0, yAxisIndex: 0,
        renderItem: laneRenderer(segments, tones),
        data: segments.map(s => [s.startMs, 0.5]),
      }],
    };
  }, [segments, from, to, height]);
  return (
    <div className="cpm-health-lane" role="img" aria-label={`${role} instrument eligibility timeline`}>
      {segments.length === 0
        ? <span className="cpm-event-row__sub">no health intervals in range — not configured or not yet observed</span>
        : <ReactECharts option={option} style={{ height }} notMerge />}
    </div>
  );
};

export default HealthLane;
