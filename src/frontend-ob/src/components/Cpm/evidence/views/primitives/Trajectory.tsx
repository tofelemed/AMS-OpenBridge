/**
 * v2.5 Task 2E.4 primitive: an ORDERED trajectory of (x, y) pairs (PV versus applied input) drawn in
 * sample order with start / end markers and optional highlighted points (corners, out-of-domain).
 * Units on both axes; the points are the ones the gate scored, never a resampled scatter.
 * Phase 5 (cpa-ui-fix-plan): rectangle zoom on both axes.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { cpmChartColors } from '../../../shared';
import { FULL_ZOOM, boxZoomOption, type ZoomState } from '../../../../charts/boxZoom';
import { useBoxZoom, useKeepSelecting } from '../../../../charts/useBoxZoom';
import ChartZoomBar from '../../../../charts/ChartZoomBar';

export interface TrajectoryInput {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  xLabel: string;
  xUnit: string;
  yLabel: string;
  yUnit: string;
  highlight?: boolean[];
  highlightLabel?: string;
  bounds?: { xMin?: number; xMax?: number; yMin?: number; yMax?: number };
  pens: { good: string; amber: string; grey: string; accent: string; pink: string; bad: string };
  zoom?: ZoomState;
}

export function buildTrajectoryOption(i: TrajectoryInput) {
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < i.x.length; k++) if (Number.isFinite(i.x[k]) && Number.isFinite(i.y[k])) pts.push([i.x[k], i.y[k]]);
  const hi: Array<[number, number]> = [];
  if (i.highlight) for (let k = 0; k < i.x.length; k++) if (i.highlight[k] && Number.isFinite(i.x[k]) && Number.isFinite(i.y[k])) hi.push([i.x[k], i.y[k]]);
  const b = i.bounds;
  const markArea = b && (b.xMin != null || b.xMax != null || b.yMin != null || b.yMax != null)
    ? { silent: true, itemStyle: { color: i.pens.good, opacity: 0.08 }, data: [[{ xAxis: b.xMin ?? 'min', yAxis: b.yMin ?? 'min' }, { xAxis: b.xMax ?? 'max', yAxis: b.yMax ?? 'max' }]] }
    : undefined;
  return {
    animation: false,
    grid: { left: 64, right: 24, top: 24, bottom: 48 },
    ...boxZoomOption({ xAxisIndex: 0, yAxisIndex: 0 }, i.zoom ?? FULL_ZOOM),
    tooltip: { trigger: 'item' as const, formatter: (p: { value: [number, number] }) => `${i.xLabel}: ${p.value[0]} ${i.xUnit}<br/>${i.yLabel}: ${p.value[1]} ${i.yUnit}` },
    xAxis: { type: 'value' as const, name: `${i.xLabel} (${i.xUnit})`, nameLocation: 'middle' as const, nameGap: 28, scale: true, axisLabel: { color: i.pens.grey } },
    yAxis: { type: 'value' as const, name: `${i.yLabel} (${i.yUnit})`, scale: true, axisLabel: { color: i.pens.grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
    series: [
      { name: 'trajectory (sample order)', type: 'line' as const, symbol: 'circle', symbolSize: 3, showSymbol: true, connectNulls: false,
        lineStyle: { color: i.pens.grey, width: 1, opacity: 0.7 }, itemStyle: { color: i.pens.grey }, data: pts, markArea },
      ...(pts.length > 0 ? [{ name: 'start / end', type: 'scatter' as const, symbolSize: 10, itemStyle: { color: i.pens.accent }, data: [pts[0], pts[pts.length - 1]] }] : []),
      ...(hi.length > 0 ? [{ name: i.highlightLabel ?? 'highlighted', type: 'scatter' as const, symbolSize: 7, itemStyle: { color: i.pens.bad }, data: hi }] : []),
    ],
  };
}

export const Trajectory: React.FC<Omit<TrajectoryInput, 'pens' | 'zoom'> & { title: string; height?: number }> = (props) => {
  const pens = cpmChartColors();
  const box = useBoxZoom({ hasY: true });
  const option = useMemo(() => buildTrajectoryOption({ ...props, pens, zoom: box.zoom }), [props, pens, box.zoom]);
  useKeepSelecting(box, option);
  return (
    <div className="cpm-chart" data-chart={props.title}>
      <div className="cpm-chart__bar">
        <span className="cpm-chart__title">{props.title}</span>
        <ChartZoomBar box={box} hasData={props.x.length > 0} />
      </div>
      <ReactECharts option={option} notMerge style={{ height: props.height ?? 320 }}
        onChartReady={box.onChartReady} onEvents={{ datazoom: box.onDataZoom }} />
    </div>
  );
};
