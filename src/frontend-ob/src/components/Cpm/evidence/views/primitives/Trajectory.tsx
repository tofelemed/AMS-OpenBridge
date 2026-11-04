/**
 * v2.5 Task 2E.4 primitive: an ORDERED trajectory of (x, y) pairs (PV versus applied input) drawn in
 * sample order with start / end markers and optional highlighted points (corners, out-of-domain).
 * Units on both axes; the points are the ones the gate scored, never a resampled scatter.
 * Phase 5 (cpa-ui-fix-plan): rectangle zoom on both axes.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { axisChrome, chartPalette, plainOption, useChartTheme, type ChartPalette } from '../../../../../charts/chartTheme';
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
  palette: ChartPalette;
  zoom?: ZoomState;
}

export function buildTrajectoryOption(i: TrajectoryInput) {
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < i.x.length; k++) if (Number.isFinite(i.x[k]) && Number.isFinite(i.y[k])) pts.push([i.x[k], i.y[k]]);
  const hi: Array<[number, number]> = [];
  if (i.highlight) for (let k = 0; k < i.x.length; k++) if (i.highlight[k] && Number.isFinite(i.x[k]) && Number.isFinite(i.y[k])) hi.push([i.x[k], i.y[k]]);
  const b = i.bounds;
  const { palette } = i;
  const overlayPen = palette.pens[4];
  const base = plainOption(palette);
  const axis = axisChrome(palette);
  const markArea = b && (b.xMin != null || b.xMax != null || b.yMin != null || b.yMax != null)
    ? { silent: true, itemStyle: { color: palette.pv, opacity: 0.08 }, data: [[{ xAxis: b.xMin ?? 'min', yAxis: b.yMin ?? 'min' }, { xAxis: b.xMax ?? 'max', yAxis: b.yMax ?? 'max' }]] }
    : undefined;
  return {
    ...base,
    animation: false,
    grid: { left: 64, right: 24, top: 24, bottom: 48 },
    ...boxZoomOption({ xAxisIndex: 0, yAxisIndex: 0 }, i.zoom ?? FULL_ZOOM),
    tooltip: { ...base.tooltip, trigger: 'item' as const, formatter: (p: { value: [number, number] }) => `${i.xLabel}: ${p.value[0]} ${i.xUnit}<br/>${i.yLabel}: ${p.value[1]} ${i.yUnit}` },
    xAxis: { ...axis, type: 'value' as const, name: `${i.xLabel} (${i.xUnit})`, nameLocation: 'middle' as const, nameGap: 28, scale: true },
    yAxis: { ...axis, type: 'value' as const, name: `${i.yLabel} (${i.yUnit})`, scale: true, splitLine: { lineStyle: { ...axis.splitLine.lineStyle, opacity: 0.2 } } },
    series: [
      { name: 'trajectory (sample order)', type: 'line' as const, symbol: 'circle', symbolSize: 3, showSymbol: true, connectNulls: false,
        lineStyle: { color: palette.tick, width: 1, opacity: 0.7 }, itemStyle: { color: palette.tick }, data: pts, markArea },
      ...(pts.length > 0 ? [{ name: 'start / end', type: 'scatter' as const, symbolSize: 10, itemStyle: { color: overlayPen }, data: [pts[0], pts[pts.length - 1]] }] : []),
      ...(hi.length > 0 ? [{ name: i.highlightLabel ?? 'highlighted', type: 'scatter' as const, symbolSize: 7, itemStyle: { color: palette.danger }, data: hi }] : []),
    ],
  };
}

export const Trajectory: React.FC<Omit<TrajectoryInput, 'palette' | 'zoom'> & { title: string; height?: number }> = (props) => {
  const theme = useChartTheme();
  const box = useBoxZoom({ hasY: true });
  const option = useMemo(() => buildTrajectoryOption({ ...props, palette: chartPalette(), zoom: box.zoom }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is a recompute trigger: the palette is read from CSS variables that change with it.
    [props, theme, box.zoom]);
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
