/**
 * The trend chart's ECharts option (split out of TrendCore, cpa-ui-fix-plan
 * Phase 5). Pure: pens + data + window + zoom in, option out. The zoom state
 * (rectangle, slider or wheel) rides in the option because <ReactECharts
 * notMerge> re-applies the whole option on every render and would otherwise
 * throw the operator's zoom away on the next live tick.
 */
import { boxZoomOption, type ZoomState } from '../../charts/boxZoom';
import { regressionLine, type Pen, type TrendPoint } from './trendSupport';

export interface TrendOptionInput {
  pens: Pen[];
  penData: TrendPoint[][];
  hiddenPens: Set<string>;
  penColor: (i: number) => string;
  colors: { cText: string; cBorder: string; cGrid: string };
  /** One Y-axis per pen (PI Vision style). */
  perAxis: boolean;
  /** Manual Y scale (E1.8/E1.10); only meaningful on the single shared axis. */
  manualScale: { min?: number; max?: number } | null;
  stepped?: boolean;
  regression?: boolean;
  windowStart: number;
  windowEnd: number;
  fmtAxis: (ms: number) => string;
  zoom: ZoomState;
}

export function buildTrendOption(i: TrendOptionInput) {
  const { pens, penData, hiddenPens, penColor, colors, perAxis, manualScale, stepped, regression, zoom } = i;
  const { cText, cBorder, cGrid } = colors;
  const yBounds = manualScale ? { min: manualScale.min, max: manualScale.max, scale: false } : { scale: true };

  const yAxis = perAxis
    // Per-pen axes carry different units, so a single manual min/max can't apply to all of them — keep
    // autoscale for the multi-axis case; manual scale only makes sense on the single shared axis.
    ? pens.map((_pen, k) => ({
        type: 'value' as const, scale: true, position: 'left' as const, offset: k * 44,
        axisLabel: { color: penColor(k), fontSize: 10 },
        axisLine: { show: true, lineStyle: { color: penColor(k) } },
        splitLine: { show: k === 0, lineStyle: { color: cGrid } },
      }))
    : [{
        type: 'value' as const, ...yBounds,
        axisLabel: { color: cText, fontSize: 10 },
        splitLine: { lineStyle: { color: cGrid } },
      }];

  const dashFor = (s?: string) => (s === 'dashed' ? 'dashed' : s === 'dotted' ? 'dotted' : 'solid');
  const series = pens.map((pen, k) => ({
    name: pen.label,
    type: 'line' as const,
    // Markers per-trace (E1.3); default off — same as before.
    showSymbol: pen.showMarkers ?? false,
    symbolSize: 4,
    smooth: false,
    // Stepped plotting (E1.22) applies chart-wide.
    step: stepped ? ('end' as const) : (false as const),
    lineStyle: { width: pen.lineWidth ?? 1.5, type: dashFor(pen.lineStyle) },
    color: penColor(k),
    yAxisIndex: perAxis ? k : 0,
    // Clickable-legend hide (E1.17): a hidden pen draws nothing but keeps its legend row.
    data: hiddenPens.has(pen.path) ? [] : penData[k].map(p => [p.ts, p.value]),
  }));

  // Phase 8 (E1.12) — one dashed least-squares regression line per visible pen.
  const regressionSeries = regression ? pens.flatMap((pen, k) => {
    if (hiddenPens.has(pen.path)) return [];
    const line = regressionLine(penData[k]);
    if (!line) return [];
    return [{
      name: `${pen.label} (fit)`,
      type: 'line' as const,
      showSymbol: false,
      lineStyle: { width: 1, type: 'dashed' as const, opacity: 0.75 },
      color: penColor(k),
      yAxisIndex: perAxis ? k : 0,
      data: line,
      silent: true,
      z: 1,
    }];
  }) : [];

  // Rectangle zoom on x and on every y axis; drag still pans when not selecting.
  const box = boxZoomOption({ xAxisIndex: 0, yAxisIndex: yAxis.map((_a, k) => k), panOnDrag: true }, zoom);

  return {
    animation: false,
    grid: { left: perAxis ? 30 + pens.length * 44 : 52, right: 14, top: 12, bottom: 48 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', label: { backgroundColor: cBorder } },
      valueFormatter: (v: number) => (typeof v === 'number' ? v.toFixed(2) : v),
    },
    xAxis: {
      type: 'time', min: i.windowStart, max: i.windowEnd,
      axisLabel: {
        color: cText, fontSize: 10,
        // Render ticks in the display timezone (echarts defaults to the client's local zone).
        formatter: (value: number) => i.fmtAxis(value),
      },
      axisLine: { lineStyle: { color: cBorder } },
    },
    yAxis,
    toolbox: box.toolbox,
    // The box components carry the current zoom (see file header); the slider is the coarse x control.
    dataZoom: [
      ...box.dataZoom,
      {
        type: 'slider', height: 16, bottom: 6, filterMode: 'none',
        start: zoom.x.start, end: zoom.x.end,
        textStyle: { color: cText, fontSize: 9 },
      },
    ],
    series: [...series, ...regressionSeries],
  };
}
