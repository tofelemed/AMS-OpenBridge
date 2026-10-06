/**
 * v2.5 Task 2E.2: the replay's evidence chart, split out of CpmReplay (file-size rule) and given
 * the R14 axes - PV / SP on the EU axis, OP / VP on a percentage-point axis - plus the replay
 * cursor. Shape gates (G7-G10) see the PV-OP phase plane instead. The option builder is pure.
 * Phase 5 (cpa-ui-fix-plan): rectangle zoom on both views (x + y), held across cursor moves.
 */
import React, { useMemo } from 'react';
import { pvAxisName } from '../trend/trendOption';
import { escapeHtml } from '../../../utils/escapeHtml';
import ReactECharts from 'echarts-for-react';
import type { CpmTrendPoint } from '../../../api/cpm/kpis';
import { cpmChartColors, fmtDateTime } from '../shared';
import { useObcTheme } from '../../../hooks/useObcTheme';
import { formatInZone, zoneLabel } from '../evidence/timezone';
import { FULL_ZOOM, boxZoomOption, type ZoomState } from '../../charts/boxZoom';
import { useBoxZoom, useKeepSelecting } from '../../charts/useBoxZoom';
import ChartZoomBar from '../../charts/ChartZoomBar';

export interface ReplayChartInput {
  points: CpmTrendPoint[];
  cursorTs: number | null;
  phasePlane: boolean;
  pens: { good: string; amber: string; grey: string; accent: string; pink: string };
  /** CHG-047: the registered PV unit; blank = not set (never a fake "EU"). */
  pvUnit: string;
  timeZone: string;
  zoom?: ZoomState;
}

const num = (v: unknown) => (typeof v === 'number' ? v : null);

export function buildReplayOption(i: ReplayChartInput) {
  const { points, cursorTs, pens, pvUnit, timeZone } = i;
  const { good, amber, grey, accent, pink } = pens;
  const zoom = i.zoom ?? FULL_ZOOM;
  if (i.phasePlane) {
    const pairs = points.map(p => ({ ts: p.ts, pv: num(p.pv), op: num(p.op) })).filter(p => p.pv != null && p.op != null);
    return {
      animation: false,
      grid: { left: 52, right: 16, top: 36, bottom: 34 },
      ...boxZoomOption({ xAxisIndex: 0, yAxisIndex: 0 }, zoom),
      tooltip: { trigger: 'item' as const },
      xAxis: { type: 'value' as const, name: 'OP (%)', scale: true, axisLabel: { color: grey } },
      yAxis: { type: 'value' as const, name: `PV (${pvUnit || 'unit not set'})`, scale: true, axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
      series: [
        { name: 'trajectory', type: 'scatter' as const, symbolSize: 3, itemStyle: { color: grey, opacity: 0.35 },
          data: pairs.filter(p => cursorTs == null || p.ts > cursorTs).map(p => [p.op, p.pv]) },
        { name: 'up to cursor', type: 'scatter' as const, symbolSize: 4, itemStyle: { color: accent, opacity: 0.8 },
          data: pairs.filter(p => cursorTs != null && p.ts <= cursorTs).map(p => [p.op, p.pv]) },
      ],
    };
  }
  const hasVp = points.some(p => num(p.vp) != null);
  return {
    animation: false,
    grid: { left: 56, right: 56, top: 40, bottom: 34 }, // room for the named axes (CHG-047)
    ...boxZoomOption({ xAxisIndex: 0, yAxisIndex: [0, 1] }, zoom),
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: Array<{ seriesName: string; marker: string; value: [number, number | null] }>) => {
        if (!params.length) return '';
        const ts = params[0].value[0];
        // Tooltip HTML: the registry unit is user input, escaped here (axis names are canvas text).
        const unit = (n: string) => (n === 'PV' || n === 'SP' ? escapeHtml(pvUnit) : '%');
        const rows = params.map(x => `${x.marker} ${x.seriesName}: ${x.value[1] == null ? '— (no sample)' : `${Number(x.value[1]).toFixed(2)} ${unit(x.seriesName)}`}`);
        return [`<strong>${formatInZone(ts, timeZone)} — ${zoneLabel(timeZone, ts)}</strong>`, ...rows].join('<br/>');
      },
    },
    xAxis: { type: 'time' as const, axisLabel: { color: grey } },
    yAxis: [
      { type: 'value' as const, name: pvAxisName(pvUnit), scale: true, axisLabel: { color: grey }, nameTextStyle: { color: grey, fontSize: 10 }, splitLine: { lineStyle: { opacity: 0.2 } } },
      { type: 'value' as const, name: 'OP / VP (%)', position: 'right' as const, scale: true, axisLabel: { color: grey }, nameTextStyle: { color: grey, fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      { name: 'PV', type: 'line' as const, symbol: 'none', connectNulls: false, yAxisIndex: 0, color: good, lineStyle: { color: good, width: 1.5 },
        data: points.map(p => [p.ts, num(p.pv)]),
        markLine: cursorTs != null ? { symbol: 'none', label: { show: false }, lineStyle: { color: accent, width: 2 }, data: [{ xAxis: cursorTs }] } : undefined },
      { name: 'SP', type: 'line' as const, symbol: 'none', connectNulls: false, yAxisIndex: 0, color: grey, lineStyle: { color: grey, width: 1, type: 'dashed' as const },
        data: points.map(p => [p.ts, num(p.sp)]) },
      { name: 'OP', type: 'line' as const, symbol: 'none', connectNulls: false, yAxisIndex: 1, color: amber, lineStyle: { color: amber, width: 1 },
        data: points.map(p => [p.ts, num(p.op)]) },
      ...(hasVp ? [{ name: 'VP', type: 'line' as const, symbol: 'none', connectNulls: false, yAxisIndex: 1, color: pink, lineStyle: { color: pink, width: 1 },
        data: points.map(p => [p.ts, num(p.vp)]) }] : []),
    ],
  };
}

export const ReplayChart: React.FC<{
  points: CpmTrendPoint[];
  phasePlane: boolean;
  cursorPct: number;
  onCursor: (pct: number) => void;
  truncated: boolean;
  timeZone: string;
  pvUnit?: string;
}> = ({ points, phasePlane, cursorPct, onCursor, truncated, timeZone, pvUnit = '' }) => {
  const cursorTs = points.length > 0 ? points[Math.min(points.length - 1, Math.floor((cursorPct / 100) * (points.length - 1)))].ts : null;
  const box = useBoxZoom({ hasY: true });
  const obcTheme = useObcTheme(); // re-derive chart colors on theme switch
  const option = useMemo(() => buildReplayOption({ points, cursorTs, phasePlane, pens: cpmChartColors(), pvUnit, timeZone, zoom: box.zoom }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- obcTheme is a recompute trigger: chart colors are read from CSS vars that change with the theme.
    [points, cursorTs, phasePlane, pvUnit, timeZone, obcTheme, box.zoom]);
  useKeepSelecting(box, option);
  return (
    <>
      <ReactECharts option={option} style={{ height: 300 }} notMerge
        onChartReady={box.onChartReady} onEvents={{ datazoom: box.onDataZoom }} />
      <ChartZoomBar box={box} hasData={points.length > 0} />
      <div className="cpm-slider-row">
        <span className="cpm-copy">Replay cursor</span>
        <input type="range" min={0} max={100} value={cursorPct} onChange={e => onCursor(Number(e.target.value))} aria-label="Replay cursor position" />
        <span className="cpm-mono">{cursorTs != null ? fmtDateTime(cursorTs) : '—'}</span>
      </div>
      {truncated && (
        <p className="cpm-copy" role="status">
          Showing the first {points.length.toLocaleString()} raw points of the window — the slice hit the replay budget; export includes only what is shown.
        </p>
      )}
    </>
  );
};
