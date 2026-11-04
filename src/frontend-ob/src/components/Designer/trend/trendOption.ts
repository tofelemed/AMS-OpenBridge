/**
 * The trend chart's ECharts option (split out of TrendCore, cpa-ui-fix-plan
 * Phase 5). Pure: pens + data + window + zoom in, option out. The zoom state
 * (rectangle, slider or wheel) rides in the option because <ReactECharts
 * notMerge> re-applies the whole option on every render and would otherwise
 * throw the operator's zoom away on the next live tick.
 */
import { axisChrome, penStyle, plainOption, zoomChrome, type ChartPalette } from '../../../charts/chartTheme';
import { boxZoomOption, type ZoomState } from '../../charts/boxZoom';
import { regressionLine, type Pen, type TrendPoint } from './trendSupport';

export interface TrendOptionInput {
  pens: Pen[];
  penData: TrendPoint[][];
  hiddenPens: Set<string>;
  penColor: (i: number) => string;
  palette: ChartPalette;
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
  const { pens, penData, hiddenPens, penColor, palette, perAxis, manualScale, stepped, regression, zoom } = i;
  const base = plainOption(palette);
  const axis = axisChrome(palette);
  const slider = zoomChrome(palette);
  const yBounds = manualScale ? { min: manualScale.min, max: manualScale.max, scale: false } : { scale: true };

  const yAxis = perAxis
    // Per-pen axes carry different units, so a single manual min/max can't apply to all of them — keep
    // autoscale for the multi-axis case; manual scale only makes sense on the single shared axis.
    ? pens.map((_pen, k) => ({
        ...axis,
        type: 'value' as const, scale: true, position: 'left' as const, offset: k * 44,
        axisLabel: { color: penColor(k), fontSize: 10 },
        axisLine: { show: true, lineStyle: { color: penColor(k) } },
        splitLine: { ...axis.splitLine, show: k === 0 },
      }))
    : [{
        ...axis,
        type: 'value' as const, ...yBounds,
        axisLabel: { ...axis.axisLabel, fontSize: 10 },
      }];

  // An explicit per-trace style wins; otherwise the pen's place in the palette decides.
  const dashFor = (k: number, s?: string) => (s === 'dashed' ? 'dashed' : s === 'dotted' ? 'dotted' : s === 'solid' ? 'solid' : penStyle(palette, k).type);
  const series = pens.map((pen, k) => ({
    name: pen.label,
    type: 'line' as const,
    // Markers per-trace (E1.3); default off — same as before.
    showSymbol: pen.showMarkers ?? false,
    symbolSize: 4,
    smooth: false,
    // Stepped plotting (E1.22) applies chart-wide.
    step: stepped ? ('end' as const) : (false as const),
    lineStyle: { width: pen.lineWidth ?? 1.5, type: dashFor(k, pen.lineStyle) },
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
    ...base,
    animation: false,
    grid: { left: perAxis ? 30 + pens.length * 44 : 52, right: 14, top: 12, bottom: 48 },
    tooltip: {
      ...base.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      valueFormatter: (v: number) => (typeof v === 'number' ? v.toFixed(2) : v),
    },
    xAxis: {
      ...axis,
      type: 'time', min: i.windowStart, max: i.windowEnd,
      axisLabel: {
        ...axis.axisLabel, fontSize: 10,
        // Render ticks in the display timezone (echarts defaults to the client's local zone).
        formatter: (value: number) => i.fmtAxis(value),
      },
    },
    yAxis,
    toolbox: box.toolbox,
    // The box components carry the current zoom (see file header); the slider is the coarse x control.
    dataZoom: [
      ...box.dataZoom,
      {
        ...slider,
        type: 'slider', height: 16, bottom: 6, filterMode: 'none',
        start: zoom.x.start, end: zoom.x.end,
        textStyle: { ...slider.textStyle, fontSize: 9 },
      },
    ],
    series: [...series, ...regressionSeries],
  };
}
