/**
 * SME review #9/#10 (CHG-047): the loop signal trend's ECharts option, shared by the Overview
 * focus panel, the Explorer operating state and the Investigation evidence chart.
 *
 * Before, each drew PV, SP, OP and the PV band on ONE unnamed value axis: a flow loop at PV ≈ 800
 * with OP ≈ 29 plotted both on a 0–800 scale, so its confirmed oscillation looked flat, and loops
 * whose PV and OP happened to share a magnitude looked "reasonable" with mixed units. Now:
 *  - left axis  = PV and SP, in the loop's PV unit ("unit not set" until the registry has one);
 *  - right axis = OP (and VP), in %;
 *  - each axis is named, and its name and line are drawn in its signal's pen colour;
 *  - the shaded band has a legend entry (BAND_LABEL) and the chart a ? holding its note (BAND_NOTE);
 *  - the tooltip prints units;
 *  - two scale modes, as on DCS / PI trends: 'fit' (autorange to the data — shows the SHAPE, the
 *    default here) and 'range' (the registered engineering range — shows where the loop sits in
 *    its span). 'range' needs a range; without one the caller offers 'fit' only.
 */
import type { CpmTrendPoint } from '../../../api/cpm/kpis';
import type { CpmEngineeringRange } from '../../../api/cpmApi';
import { axisChrome, baseOption, type ChartPalette } from '../../../charts/chartTheme';
import { fmtDateTime } from '../shared';
import { escapeHtml } from '../../../utils/escapeHtml';
import { siteAxisTick } from '../../../cpa/siteTime';

export type TrendScale = 'fit' | 'range';

export const BAND_LABEL = 'PV min–max per point';
export const BAND_NOTE =
  'Shaded band: the lowest-to-highest PV inside each plotted point. Each point averages many samples; the band shows the swing the average hides.';
const BAND_BASE = 'pv-band-base';

export const pvAxisName = (pvUnit: string | null | undefined) => `PV / SP (${pvUnit?.trim() || 'unit not set'})`;

export interface SignalTrendInput {
  points: CpmTrendPoint[];
  palette: ChartPalette;
  hasVp?: boolean;
  pvUnit?: string | null;
  scale: TrendScale;
  range?: CpmEngineeringRange | null;
  /** boxZoomOption(...) for x axis 0 and y axes [0, 1], spread into the option. */
  zoom: Record<string, unknown>;
  /** CHG-067: the plotted range — the x axis spans it even where the data is partial. */
  xRange?: { fromMs: number; toMs: number } | null;
  /** CHG-067: the engine's evaluated window, drawn as a labelled band where it overlaps the range. */
  evaluated?: { startMs: number; endMs: number; label: string } | null;
  /** CHG-067: one y-scale shared with another trend (compare mode); overrides fit, not an explicit range. */
  yBounds?: { pv: { min: number; max: number } | null; op: { min: number; max: number } | null } | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** True when the registry range can scale the PV axis (both ends, max above min). */
export function hasPvRange(r: CpmEngineeringRange | null | undefined): boolean {
  return num(r?.pvMin) != null && num(r?.pvMax) != null && (r!.pvMax as number) > (r!.pvMin as number);
}

/** Axis bounds for a scale mode: data-fit, or the engineering range (OP falls back to 0–100 %). */
export function axisBounds(scale: TrendScale, r: CpmEngineeringRange | null | undefined) {
  if (scale === 'range' && hasPvRange(r)) {
    const opMin = num(r?.opMin) ?? 0;
    const opMax = num(r?.opMax) ?? 100;
    return {
      pv: { min: r!.pvMin as number, max: r!.pvMax as number, scale: false },
      op: { min: opMin, max: opMax > opMin ? opMax : 100, scale: false },
    };
  }
  return { pv: { scale: true }, op: { scale: true } };
}

const fmtVal = (v: number | null, unit: string) => (v == null ? '—' : `${Number(v.toFixed(2))} ${unit}`.trim());

export function signalTrendOption(i: SignalTrendInput) {
  const { points, palette, hasVp, pvUnit, scale, range, zoom, xRange, evaluated, yBounds } = i;
  const { pv, sp, op, vp, tick } = palette;
  const base = baseOption(palette);
  const axis = axisChrome(palette);
  // Tooltip HTML only (axis names are canvas text): a registry unit is user input.
  const unit = escapeHtml(pvUnit?.trim() || '');
  const fitted = axisBounds(scale, range);
  // Compare mode: both trends on one scale (only when fitting — an explicit engineering range wins).
  const bounds = scale === 'fit' && yBounds ? {
    pv: yBounds.pv ? { min: yBounds.pv.min, max: yBounds.pv.max, scale: false } : fitted.pv,
    op: yBounds.op ? { min: yBounds.op.min, max: yBounds.op.max, scale: false } : fitted.op,
  } : fitted;
  // The evaluated window as a band on the PV series; ECharts clips it to the x range.
  const markArea = evaluated ? {
    silent: true,
    itemStyle: { color: tick, opacity: 0.12, borderColor: tick, borderWidth: 1, borderType: 'dashed' },
    label: { show: true, position: 'insideTop', color: tick, fontSize: 12, formatter: evaluated.label },
    data: [[{ xAxis: evaluated.startMs }, { xAxis: evaluated.endMs }]],
  } : undefined;
  const at = (p: CpmTrendPoint, ...keys: string[]) => keys.map(k => num(p[k])).find(v => v != null) ?? null;
  const byTs = new Map(points.map(p => [p.ts, p]));
  const axisStyle = (colour: string) => ({
    ...axis,
    nameTextStyle: { color: colour, fontSize: 12 },
    axisLine: { show: true, lineStyle: { color: colour } },
  });

  return {
    ...base,
    animation: false,
    // The legend sits under the time axis so the two axis titles own the top edge (on the right, "OP (%)"
    // and a top-right legend overlapped).
    grid: { left: 52, right: 52, top: 36, bottom: 56 },
    ...zoom,
    legend: {
      ...base.legend,
      data: ['PV', BAND_LABEL, 'SP', 'OP', ...(hasVp ? ['VP'] : [])],
      bottom: 0, left: 'center',
    },
    tooltip: {
      ...base.tooltip,
      trigger: 'axis',
      formatter: (ps: Array<{ seriesName: string; marker: string; value: [number, number | null] }>) => {
        if (!ps.length) return '';
        const ts = ps[0].value?.[0];
        const p = byTs.get(ts);
        const rows = ps
          .filter(x => x.seriesName !== BAND_BASE && x.seriesName !== BAND_LABEL)
          .map(x => `${x.marker} ${x.seriesName}: ${fmtVal(x.value?.[1] ?? null, x.seriesName === 'PV' || x.seriesName === 'SP' ? unit : '%')}`);
        const lo = p ? num(p.pv_min) : null; const hi = p ? num(p.pv_max) : null;
        if (lo != null && hi != null) rows.push(`${BAND_LABEL}: ${fmtVal(lo, unit)} – ${fmtVal(hi, unit)}`);
        return [`<strong>${fmtDateTime(ts)}</strong>`, ...rows].join('<br/>');
      },
    },
    // Day boundaries read "5 Oct", not ECharts' bare day number "5".
    xAxis: { ...axis, type: 'time',
      ...(xRange ? { min: xRange.fromMs, max: xRange.toMs } : {}),
      axisLabel: { ...axis.axisLabel, hideOverlap: true,
        formatter: siteAxisTick(xRange ? xRange.toMs - xRange.fromMs : points.length > 1 ? points[points.length - 1].ts - points[0].ts : 3_600_000) } },
    yAxis: [
      { type: 'value', name: pvAxisName(pvUnit), position: 'left', ...bounds.pv, ...axisStyle(pv),
        splitLine: { lineStyle: { ...axis.splitLine.lineStyle, opacity: 0.2 } } },
      { type: 'value', name: hasVp ? 'OP / VP (%)' : 'OP (%)', position: 'right', ...bounds.op, ...axisStyle(op),
        splitLine: { show: false } },
    ],
    series: [
      // The band: min as an invisible base, (max − min) stacked and filled — the honest rendering of
      // oscillation inside each decimation bucket. Toggling its legend entry hides it.
      { name: BAND_BASE, type: 'line', stack: 'pv-band', yAxisIndex: 0, silent: true, symbol: 'none',
        color: pv, lineStyle: { width: 0 }, data: points.map(p => [p.ts, num(p.pv_min)]) },
      { name: BAND_LABEL, type: 'line', stack: 'pv-band', yAxisIndex: 0, silent: true, symbol: 'none',
        color: pv, lineStyle: { width: 0 }, areaStyle: { color: pv, opacity: 0.18 },
        data: points.map(p => {
          const lo = num(p.pv_min); const hi = num(p.pv_max);
          return [p.ts, lo != null && hi != null ? hi - lo : null];
        }) },
      { name: 'PV', type: 'line', yAxisIndex: 0, symbol: 'none', color: pv, lineStyle: { color: pv, width: 2 },
        ...(markArea ? { markArea } : {}),
        data: points.map(p => [p.ts, at(p, 'pv_avg', 'pv')]) },
      { name: 'SP', type: 'line', yAxisIndex: 0, symbol: 'none', color: sp, lineStyle: { color: sp, width: 1, type: 'dashed' },
        data: points.map(p => [p.ts, at(p, 'sp')]) },
      { name: 'OP', type: 'line', yAxisIndex: 1, symbol: 'none', color: op, lineStyle: { color: op, width: 1.5 },
        data: points.map(p => [p.ts, at(p, 'op_avg', 'op')]) },
      ...(hasVp ? [
        { name: 'VP', type: 'line', yAxisIndex: 1, symbol: 'none', color: vp, lineStyle: { color: vp, width: 1.5 },
          data: points.map(p => [p.ts, at(p, 'vp_avg', 'vp')]) },
      ] : []),
    ],
  };
}

/** True when any bucket carries a plottable signal value (a stalled feed returns buckets of nulls). */
export function hasSignalValues(points: CpmTrendPoint[]): boolean {
  const keys = ['pv_avg', 'pv', 'sp', 'op_avg', 'op', 'vp_avg', 'vp'];
  return points.some(p => keys.some(k => num(p[k]) != null));
}
