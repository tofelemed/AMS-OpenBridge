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
 *
 * Phase 5 (cpa-ui-fix-plan): rectangle zoom — x across every lane, y on the
 * signals grid only; the box components, the slider and the wheel share state.
 */
import type { CpmKpiRow, CpmTrendPoint } from '../../../api/cpmApi';
import { pvAxisName } from '../trend/trendOption';
import { escapeHtml } from '../../../utils/escapeHtml';
import type { CpmTone } from '../shared';
import { formatInZone, zoneLabel } from '../evidence/timezone';
import { FULL_ZOOM, boxZoomOption, type ZoomState } from '../../charts/boxZoom';

/** Grid geometry, in px from the top of the canvas. Lane labels reuse these. */
// CHG-047: the signals lane starts lower and the overlay sits 30 px under it, so the named axes
// ("PV / SP (kg/h)", "OP / VP (%)", the overlay's unit) have their own row instead of overprinting
// the lane above.
export const LANES = {
  signals: { top: 36, height: 190 },
  overlay: { top: 256, height: 80 },
  mode: { top: 352, height: 14 },
  verdict: { top: 374, height: 20 },
  /** v2.5 (1H.6): optional Instrumental health lane (PV eligibility intervals). */
  health: { top: 402, height: 14 },
  axisLabels: 24,
  slider: { height: 20, bottom: 6 },
};
export const CHART_HEIGHT = 464;

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
  /** v2.5 (1H.6): PV instrument eligibility intervals; omitted = no health lane drawn. */
  healthSegments?: Segment[];
  from: Date;
  to: Date;
  pens: { good: string; amber: string; grey: string; accent: string; pink: string };
  tones: Record<CpmTone, string>;
  /** v2.5 (2E.2, R14): the PV engineering unit for the EU axis (SP shares it); 'EU' when the registry declares none. */
  pvUnit?: string;
  /** v2.5 (2E.2): the site zone every time is shown in (UTC when undeclared). */
  timeZone?: string;
  /** v2.5 (2E.2): explicit Normalise toggle - every signal on one "fraction of own span" axis, labelled as such. */
  normalize?: boolean;
  /** Phase 5: the current rectangle / slider zoom (percent ranges), so a re-applied option keeps it. */
  zoom?: ZoomState;
}

const num = (v: unknown) => (typeof v === 'number' ? v : null);

/** Series whose values are scaffolding, not readings — excluded from tooltips. */
const HELPER_SERIES = new Set(['pv-min', 'pv-band', 'mode-track', 'verdict-track', 'health-track']);

/** Which segment (if any) covers an instant. */
const segmentAt = (segs: Segment[], ts: number) =>
  segs.find(s => ts >= s.startMs && ts < s.endMs);

/**
 * Rect renderer for a lane. Clamped to the grid so a zoomed-in view cannot paint
 * a band over the axis gutter.
 */
export function laneRenderer(segments: Segment[], tones: Record<CpmTone, string>) {
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
    points, kpiRows, overlay, signals, modeSegments, verdictSegments, healthSegments,
    from, to, pens, tones,
  } = input;
  const { good, amber, grey, accent, pink } = pens;

  const domain = { min: from.getTime(), max: to.getTime() };
  const hasHealth = healthSegments != null;
  const zoomAxes = hasHealth ? [0, 1, 2, 3, 4] : [0, 1, 2, 3];
  const pvUnit = input.pvUnit?.trim() || '';
  const tz = input.timeZone || 'UTC';
  const normalize = !!input.normalize;
  // v2.5 (2E.2, R14): a 400 °C PV and a 0-100 pp OP never share an axis. The signals grid carries
  // an EU axis (PV / SP) and a percentage-point axis (OP / VP); the pp axis is appended AFTER the
  // lane axes so their indices stay put. Normalise collapses both onto "fraction of own span".
  const ppAxisIndex = hasHealth ? 5 : 4;
  // Phase 5: the box zooms x on every lane and y on the signals grid's own axes only (the lanes'
  // 0..1 band axes must never zoom). The slider stays as the coarse x control on the same axes.
  const box = boxZoomOption(
    { xAxisIndex: zoomAxes, yAxisIndex: normalize ? [0] : [0, ppAxisIndex], panOnDrag: true },
    input.zoom ?? FULL_ZOOM,
  );
  const spanOf = (get: (p: CpmTrendPoint) => number | null) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of points) { const v = get(p); if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    return { lo, hi };
  };
  const norm = (v: number | null, span: { lo: number; hi: number }) =>
    v == null ? null : span.hi > span.lo ? (v - span.lo) / (span.hi - span.lo) : 0;
  const pvGet = (p: CpmTrendPoint) => num(p.pv_avg) ?? num(p.pv);
  const spGet = (p: CpmTrendPoint) => num(p.sp);
  const opGet = (p: CpmTrendPoint) => num(p.op_avg) ?? num(p.op);
  const vpGet = (p: CpmTrendPoint) => num(p.vp_avg) ?? num(p.vp);
  const spans = { pv: spanOf(pvGet), sp: spanOf(spGet), op: spanOf(opGet), vp: spanOf(vpGet) };
  const sig = (name: string) => (normalize ? `${name} (÷ own span)` : name);
  const dataOf = (get: (p: CpmTrendPoint) => number | null, span: { lo: number; hi: number }) =>
    points.map(p => [p.ts, normalize ? norm(get(p), span) : get(p)] as [number, number | null]);
  // Tooltip HTML: the registry unit is user input, escaped here (the axis name is canvas text).
  const unitOf = (name: string) => (name === 'PV' || name === 'SP' ? escapeHtml(pvUnit) : '%');
  const originalAt = (name: string, ts: number): number | null => {
    const p = points.find(pt => pt.ts === ts);
    if (!p) return null;
    return name === 'PV' ? pvGet(p) : name === 'SP' ? spGet(p) : name === 'OP' ? opGet(p) : name === 'VP' ? vpGet(p) : null;
  };

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
      { left: 60, right: 60, top: LANES.signals.top, height: LANES.signals.height },
      { left: 60, right: 60, top: LANES.overlay.top, height: LANES.overlay.height },
      { left: 60, right: 60, top: LANES.mode.top, height: LANES.mode.height },
      { left: 60, right: 60, top: LANES.verdict.top, height: LANES.verdict.height },
      ...(hasHealth ? [{ left: 60, right: 60, top: LANES.health.top, height: LANES.health.height }] : []),
    ],
    // The point of the rebuild: one crosshair, four lanes.
    axisPointer: { link: [{ xAxisIndex: 'all' as const }], snap: false },
    graphic: [
      { type: 'text', left: 8, top: LANES.mode.top, style: { text: 'MODE', fill: grey, font: '10px sans-serif' } },
      { type: 'text', left: 8, top: LANES.verdict.top + 4, style: { text: 'VERDICT', fill: grey, font: '10px sans-serif' } },
    ],
    toolbox: box.toolbox,
    dataZoom: [
      ...box.dataZoom,
      {
        type: 'slider', xAxisIndex: zoomAxes, filterMode: 'none',
        start: (input.zoom ?? FULL_ZOOM).x.start, end: (input.zoom ?? FULL_ZOOM).x.end,
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
            const base = x.seriesName.replace(' (÷ own span)', '');
            const isSignal = base === 'PV' || base === 'SP' || base === 'OP' || base === 'VP';
            const v = x.value?.[1];
            if (!isSignal) return `${x.marker} ${x.seriesName}: ${v == null ? '—' : Number(v).toFixed(2)}${x.seriesName === overlay.label ? ` ${escapeHtml(overlay.unit)}` : ''}`;
            const original = typeof ts === 'number' ? originalAt(base, ts) : null;
            const shown = original ?? v;
            const frac = normalize && v != null ? ` (${Number(v).toFixed(2)} of own span)` : '';
            return `${x.marker} ${base}: ${shown == null ? '— (no sample)' : `${Number(shown).toFixed(2)} ${unitOf(base)}`}${frac}`;
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
        const when = typeof ts === 'number' ? `${formatInZone(ts, tz)} — ${zoneLabel(tz, ts)}` : String(ts);
        return [`<strong>${when}</strong>`, ...rows].join('<br/>');
      },
    },
    xAxis: hasHealth
      ? [timeAxis(0, false), timeAxis(1, false), timeAxis(2, false), timeAxis(3, false), timeAxis(4, true)]
      : [timeAxis(0, false), timeAxis(1, false), timeAxis(2, false), timeAxis(3, true)],
    yAxis: [
      { type: 'value', gridIndex: 0, scale: !normalize, ...(normalize ? { min: 0, max: 1 } : {}),
        name: normalize ? 'fraction of own span (normalised)' : pvAxisName(pvUnit), nameTextStyle: { color: grey, fontSize: 10 },
        axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
      { type: 'value', gridIndex: 1, scale: true, name: overlay.unit, nameTextStyle: { color: grey, fontSize: 10 }, axisLabel: { color: grey }, splitLine: { show: false } },
      laneY(2),
      laneY(3),
      ...(hasHealth ? [laneY(4)] : []),
      // the percentage-point axis of the signals grid (OP / VP), on the right; absent when normalised
      ...(normalize ? [] : [{ type: 'value' as const, gridIndex: 0, scale: true, position: 'right' as const, name: 'OP / VP (%)',
        nameTextStyle: { color: grey, fontSize: 10 }, axisLabel: { color: grey }, splitLine: { show: false } }]),
    ],
    series: [
      // PV keeps its envelope: the band is the honest rendering of oscillation
      // inside a decimation bucket. VP gets its own pen — VP tracking OP is a
      // healthy valve, VP staircasing against a smooth OP is stiction.
      ...(signals.includes('pv') && !normalize ? [
        { name: 'pv-min', type: 'line', stack: 'pv-band', silent: true, symbol: 'none', connectNulls: false,
          lineStyle: { width: 0 }, data: points.map(p => [p.ts, num(p.pv_min)]) },
        { name: 'pv-band', type: 'line', stack: 'pv-band', silent: true, symbol: 'none', connectNulls: false,
          lineStyle: { width: 0 }, areaStyle: { color: good, opacity: 0.18 },
          data: points.map(p => {
            const lo = num(p.pv_min); const hi = num(p.pv_max);
            return [p.ts, lo != null && hi != null ? hi - lo : null];
          }) },
      ] : []),
      ...(signals.includes('pv') ? [
        { name: sig('PV'), type: 'line', symbol: 'none', connectNulls: false, yAxisIndex: 0, color: good, lineStyle: { color: good, width: 2 },
          data: dataOf(pvGet, spans.pv) },
      ] : []),
      ...(signals.includes('sp') ? [
        { name: sig('SP'), type: 'line', symbol: 'none', connectNulls: false, yAxisIndex: 0, color: grey, lineStyle: { color: grey, width: 1, type: 'dashed' },
          data: dataOf(spGet, spans.sp) },
      ] : []),
      ...(signals.includes('op') ? [
        { name: sig('OP'), type: 'line', symbol: 'none', connectNulls: false, color: amber, lineStyle: { color: amber, width: 1.5 },
          ...(normalize ? {} : { yAxisIndex: ppAxisIndex }), data: dataOf(opGet, spans.op) },
      ] : []),
      ...(signals.includes('vp') ? [
        { name: sig('VP'), type: 'line', symbol: 'none', connectNulls: false, color: pink, lineStyle: { color: pink, width: 1.5 },
          ...(normalize ? {} : { yAxisIndex: ppAxisIndex }), data: dataOf(vpGet, spans.vp) },
      ] : []),
      { name: overlay.label, type: 'line', xAxisIndex: 1, yAxisIndex: 1, symbol: 'circle', connectNulls: false,
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
      // v2.5 (1H.6): the health lane is a step band of the PV instrument's eligibility intervals;
      // gaps (not configured / not observed) stay empty — never painted as healthy.
      ...(hasHealth ? [{
        name: 'health-track', type: 'custom' as const, xAxisIndex: 4, yAxisIndex: 4, silent: true,
        renderItem: laneRenderer(healthSegments!, tones),
        data: healthSegments!.map(s => [s.startMs, 0.5]),
      }] : []),
    ],
  };
}
