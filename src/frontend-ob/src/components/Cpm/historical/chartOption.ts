/**
 * The Historical explorer's chart: four lanes on ONE shared time axis.
 *
 * The defect this replaces: the signals chart used an echarts `time` axis, while
 * the mode ribbon and the diagnosis bands were flex rows of EQUAL-WIDTH segments
 * positioned by array index. A band's horizontal position therefore had no
 * relationship to when that window happened, and a gap in evaluation collapsed
 * to nothing instead of reading as a gap. On a screen whose entire job is "the
 * verdict flipped here — what was OP doing there?", the two lanes could not be
 * compared at all.
 *
 * Now mode and verdict are echarts `custom` series drawn from real
 * start/end instants on grids that share the signals' x domain, so a band's
 * WIDTH is its duration, every lane is pinned to the same [from, to] domain, and
 * one linked axisPointer crosses all four.
 */
import type { CpmKpiRow, CpmTrendPoint } from '../../../api/cpmApi';
import type { CpmTone } from '../shared';

/** Grid geometry, in px from the top of the canvas. Lane labels reuse these. */
export const LANES = {
  signals: { top: 24, height: 190 },
  overlay: { top: 232, height: 80 },
  mode: { top: 328, height: 14 },
  verdict: { top: 350, height: 20 },
  axisLabels: 24,
  slider: { height: 20, bottom: 6 },
};
export const CHART_HEIGHT = 440;

export interface Segment {
  startMs: number;
  endMs: number;
  tone: CpmTone;
  label: string;
  /** Verdict segments carry the window id so a click can select it. */
  windowEnd?: string | null;
}

export interface ChartInput {
  points: CpmTrendPoint[];
  kpiRows: CpmKpiRow[];
  overlay: { key: string; label: string; unit: string };
  signals: string[];
  modeSegments: Segment[];
  verdictSegments: Segment[];
  from: Date;
  to: Date;
  pens: { good: string; amber: string; grey: string; accent: string; pink: string };
  tones: Record<CpmTone, string>;
}

const num = (v: unknown) => (typeof v === 'number' ? v : null);

/** Series whose values are scaffolding, not readings — excluded from tooltips. */
const HELPER_SERIES = new Set(['pv-min', 'pv-band', 'mode-track', 'verdict-track']);

/** Which segment (if any) covers an instant. */
const segmentAt = (segs: Segment[], ts: number) =>
  segs.find(s => ts >= s.startMs && ts < s.endMs);

/**
 * Rect renderer for a lane. Clamped to the grid so a zoomed-in view cannot paint
 * a band over the axis gutter.
 */
function laneRenderer(segments: Segment[], tones: Record<CpmTone, string>) {
  return (
    params: { dataIndex: number; coordSys: { x: number; y: number; width: number; height: number } },
    api: { coord: (v: number[]) => number[] },
  ) => {
    const seg = segments[params.dataIndex];
    if (!seg) return null;
    const cs = params.coordSys;
    const x0 = Math.max(api.coord([seg.startMs, 0])[0], cs.x);
    const x1 = Math.min(api.coord([seg.endMs, 0])[0], cs.x + cs.width);
    if (x1 <= x0) return null;
    return {
      type: 'rect' as const,
      shape: { x: x0, y: cs.y, width: Math.max(1, x1 - x0), height: cs.height },
      style: { fill: tones[seg.tone] },
    };
  };
}

export function buildChartOption(input: ChartInput) {
  const {
    points, kpiRows, overlay, signals, modeSegments, verdictSegments,
    from, to, pens, tones,
  } = input;
  const { good, amber, grey, accent, pink } = pens;

  const domain = { min: from.getTime(), max: to.getTime() };
  const zoomAxes = [0, 1, 2, 3];

  const overlayData = kpiRows
    .filter(r => r.window_end && typeof r[overlay.key] === 'number')
    .map(r => [new Date(r.window_end!).getTime(), r[overlay.key] as number]);

  // Every lane pins the SAME min/max, which is what makes a vertical read
  // across them valid even where one lane has no data at all.
  const timeAxis = (gridIndex: number, showLabels: boolean) => ({
    type: 'time' as const,
    gridIndex,
    ...domain,
    axisLabel: { show: showLabels, color: grey },
    axisLine: { show: showLabels, lineStyle: { color: grey } },
    axisTick: { show: showLabels },
    splitLine: { show: false },
  });

  const laneY = (gridIndex: number) => ({
    type: 'value' as const, gridIndex, min: 0, max: 1, show: false,
  });

  return {
    animation: false,
    grid: [
      { left: 60, right: 24, top: LANES.signals.top, height: LANES.signals.height },
      { left: 60, right: 24, top: LANES.overlay.top, height: LANES.overlay.height },
      { left: 60, right: 24, top: LANES.mode.top, height: LANES.mode.height },
      { left: 60, right: 24, top: LANES.verdict.top, height: LANES.verdict.height },
    ],
    // The point of the rebuild: one crosshair, four lanes.
    axisPointer: { link: [{ xAxisIndex: 'all' as const }], snap: false },
    graphic: [
      { type: 'text', left: 8, top: LANES.mode.top, style: { text: 'MODE', fill: grey, font: '10px sans-serif' } },
      { type: 'text', left: 8, top: LANES.verdict.top + 4, style: { text: 'VERDICT', fill: grey, font: '10px sans-serif' } },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: zoomAxes, filterMode: 'none' },
      {
        type: 'slider', xAxisIndex: zoomAxes, filterMode: 'none',
        height: LANES.slider.height, bottom: LANES.slider.bottom,
        borderColor: grey, textStyle: { color: grey },
      },
    ],
    tooltip: {
      trigger: 'axis',
      formatter: (
        params: Array<{ seriesName: string; marker: string; value: [number, number | null] }>,
      ) => {
        if (!params.length) return '';
        const ts = params[0].value?.[0];
        const p = points.find(pt => pt.ts === ts);
        const rows = params
          .filter(x => !HELPER_SERIES.has(x.seriesName))
          .map(x => {
            const v = x.value?.[1];
            return `${x.marker} ${x.seriesName}: ${v == null ? '—' : Number(v).toFixed(2)}`;
          });
        const lo = num(p?.pv_min); const hi = num(p?.pv_max);
        if (lo != null && hi != null) rows.push(`PV range: ${lo.toFixed(2)} – ${hi.toFixed(2)}`);
        // The two lanes join the SAME tooltip rather than carrying their own,
        // so one hover answers "what was the loop doing and what did the engine
        // conclude, at this instant".
        const mode = typeof ts === 'number' ? segmentAt(modeSegments, ts) : undefined;
        const verdict = typeof ts === 'number' ? segmentAt(verdictSegments, ts) : undefined;
        if (mode) rows.push(`Mode: ${mode.label}`);
        if (verdict) rows.push(`Verdict: ${verdict.label}`);
        return [`<strong>${new Date(ts).toLocaleString()}</strong>`, ...rows].join('<br/>');
      },
    },
    xAxis: [timeAxis(0, false), timeAxis(1, false), timeAxis(2, false), timeAxis(3, true)],
    yAxis: [
      { type: 'value', gridIndex: 0, scale: true, axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
      { type: 'value', gridIndex: 1, scale: true, name: overlay.unit, nameTextStyle: { color: grey, fontSize: 10 }, axisLabel: { color: grey }, splitLine: { show: false } },
      laneY(2),
      laneY(3),
    ],
    series: [
      // PV keeps its envelope: the band is the honest rendering of oscillation
      // inside a decimation bucket. VP gets its own pen — VP tracking OP is a
      // healthy valve, VP staircasing against a smooth OP is stiction.
      ...(signals.includes('pv') ? [
        { name: 'pv-min', type: 'line', stack: 'pv-band', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, data: points.map(p => [p.ts, num(p.pv_min)]) },
        { name: 'pv-band', type: 'line', stack: 'pv-band', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, areaStyle: { color: good, opacity: 0.18 },
          data: points.map(p => {
            const lo = num(p.pv_min); const hi = num(p.pv_max);
            return [p.ts, lo != null && hi != null ? hi - lo : null];
          }) },
        { name: 'PV', type: 'line', symbol: 'none', lineStyle: { color: good, width: 2 },
          data: points.map(p => [p.ts, num(p.pv_avg) ?? num(p.pv)]) },
      ] : []),
      ...(signals.includes('sp') ? [
        { name: 'SP', type: 'line', symbol: 'none', lineStyle: { color: grey, width: 1, type: 'dashed' },
          data: points.map(p => [p.ts, num(p.sp)]) },
      ] : []),
      ...(signals.includes('op') ? [
        { name: 'OP', type: 'line', symbol: 'none', lineStyle: { color: amber, width: 1.5 },
          data: points.map(p => [p.ts, num(p.op_avg) ?? num(p.op)]) },
      ] : []),
      ...(signals.includes('vp') ? [
        { name: 'VP', type: 'line', symbol: 'none', lineStyle: { color: pink, width: 1.5 },
          data: points.map(p => [p.ts, num(p.vp_avg) ?? num(p.vp)]) },
      ] : []),
      { name: overlay.label, type: 'line', xAxisIndex: 1, yAxisIndex: 1, symbol: 'circle',
        symbolSize: 5, lineStyle: { color: accent, width: 1.5 }, itemStyle: { color: accent },
        data: overlayData },
      {
        name: 'mode-track', type: 'custom', xAxisIndex: 2, yAxisIndex: 2, silent: true,
        renderItem: laneRenderer(modeSegments, tones),
        data: modeSegments.map(s => [s.startMs, 0.5]),
      },
      {
        name: 'verdict-track', type: 'custom', xAxisIndex: 3, yAxisIndex: 3,
        renderItem: laneRenderer(verdictSegments, tones),
        data: verdictSegments.map(s => [s.startMs, 0.5]),
      },
    ],
  };
}
