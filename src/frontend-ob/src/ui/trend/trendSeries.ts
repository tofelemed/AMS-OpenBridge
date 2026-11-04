/**
 * Signal series for the option: role styles from `chartPalette` (violet is not in that palette, by
 * CD10), direct labels, gaps and the no-sample hatch. `connectNulls` is false on every line.
 */
import { type ChartPalette, penStyle } from '../../charts/chartTheme';
import { NO_SAMPLE } from './trendFormat';
import type { PreparedBand, PreparedPane, PreparedSeries } from './trendModel';
import type { Interval, TrendMark, TrendSeries } from './trendTypes';

/** Above this many rows a line is drawn through LTTB, which keeps nulls. The table lists every value. */
export const SAMPLE_ABOVE = 5000;
/** A pattern no measured or setpoint line uses, so an estimate reads as one in print. */
export const ESTIMATED_DASH = [6, 3, 1, 3];

const LABEL_SIZE = 12;
const HATCH_TILE = 8;
/** A hatch narrower than this share of the window has no room for its label. */
const HATCH_LABEL_SHARE = 0.08;
/** Direct labels step left across the window, so two lines close in value do not stack their text. */
const LABEL_START = 0.05;
const LABEL_STEP = 0.12;
const LABEL_SLOTS = 7;
const VP_MARKS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];

export interface LineLook {
  color: string;
  width: number;
  type: 'solid' | 'dashed' | 'dotted' | number[];
}

/** A line's look. Measured is solid, a setpoint dashed, an estimate its own pattern (skill §6). */
export function lineLook(s: TrendSeries, p: ChartPalette): LineLook {
  const looks: Record<Exclude<TrendSeries['role'], 'pen'>, LineLook> = {
    pv: { color: p.pv, width: 2, type: 'solid' },
    sp: { color: p.sp, width: 1.5, type: 'dashed' },
    op: { color: p.op, width: 1.5, type: 'solid' },
    vp: { color: p.vp, width: 1.5, type: 'solid' },
    overlay: { color: p.pens[4], width: 1.5, type: 'solid' },
    neutral: { color: p.tick, width: 1, type: 'solid' },
    danger: { color: p.danger, width: 1.5, type: 'solid' },
  };
  const look = s.role === 'pen' ? { ...penStyle(p, s.penIndex ?? 0), width: 1.5 } : looks[s.role];
  if (s.estimated) return { ...look, type: ESTIMATED_DASH };
  return s.dashed ? { ...look, type: 'dashed' } : look;
}

export const directLabel = (s: TrendSeries) => (s.estimated ? `${s.label} (estimated)` : s.label);

/** The sample nearest a share of the plotted window, measured from its right edge. */
function pointNear(s: PreparedSeries, plotted: Interval, share: number): [number, number] | null {
  const anchor = plotted.to - (plotted.to - plotted.from) * share;
  let best: [number, number] | null = null;
  let distance = Infinity;
  for (const [t, v] of s.data) {
    if (v == null || t < plotted.from || t > plotted.to) continue;
    const d = Math.abs(t - anchor);
    if (d < distance) { distance = d; best = [t, v]; }
  }
  return best;
}

function markPoints(s: PreparedSeries, slot: number, plotted: Interval | null, look: LineLook, p: ChartPalette, font: string) {
  if (!plotted) return undefined;
  const at = pointNear(s, plotted, LABEL_START + (slot % LABEL_SLOTS) * LABEL_STEP);
  if (!at) return undefined;
  const text = directLabel(s.source);
  const label = {
    show: true, position: 'top' as const, formatter: () => text,
    color: look.color, fontSize: LABEL_SIZE, fontWeight: 600 as const, fontFamily: font,
    backgroundColor: p.surface, padding: [1, 3],
  };
  // VP is measured, so it stays solid; triangles tell it from OP on the same axis without colour.
  const shapes = s.source.role === 'vp'
    ? VP_MARKS.flatMap(share => {
        const point = pointNear(s, plotted, share);
        return point ? [{ coord: point, symbol: 'triangle', symbolSize: 7, itemStyle: { color: look.color }, label: { show: false } }] : [];
      })
    : [];
  return {
    silent: true, animation: false,
    data: [{ coord: at, symbol: 'circle', symbolSize: 2, itemStyle: { color: look.color }, label }, ...shapes],
  };
}

export function lineSeries(s: PreparedSeries, slot: number, plotted: Interval | null, p: ChartPalette, font: string) {
  const look = lineLook(s.source, p);
  const markers = !!s.source.markers;
  const many = s.data.length > SAMPLE_ABOVE;
  const line = {
    id: s.source.id,
    name: s.source.label,
    type: 'line' as const,
    xAxisIndex: s.gridIndex,
    yAxisIndex: s.axis.index,
    connectNulls: false,
    showSymbol: markers,
    symbol: markers ? s.source.markerSymbol ?? 'circle' : 'none',
    symbolSize: 7,
    color: look.color,
    lineStyle: { color: look.color, width: markers ? 0 : look.width, type: look.type },
    itemStyle: { color: look.color },
    data: s.data,
    ...(s.source.area ? { areaStyle: { color: look.color, opacity: 0.12 } } : {}),
    ...(s.source.held ? { step: 'end' as const } : {}),
    ...(many ? (markers ? { large: true, largeThreshold: SAMPLE_ABOVE } : { sampling: 'lttb' as const }) : {}),
    markPoint: markPoints(s, slot, plotted, look, p, font),
  };
  if (markers || !s.isolated.length) return [line];
  // A lone reading between two gaps has no line to draw; without this it would not show at all.
  return [line, {
    id: `${s.source.id}:isolated`,
    name: s.source.label,
    type: 'scatter' as const,
    xAxisIndex: s.gridIndex,
    yAxisIndex: s.axis.index,
    silent: true,
    symbol: 'circle',
    symbolSize: 5,
    itemStyle: { color: look.color },
    tooltip: { show: false },
    data: s.isolated,
  }];
}

/** The envelope: an invisible base plus the span stacked on it. `all`, or a negative PV breaks the stack. */
export function bandSeries(b: PreparedBand, p: ChartPalette) {
  const color = b.source.role ? lineLook({ role: b.source.role } as TrendSeries, p).color : p.pv;
  const common = {
    type: 'line' as const, stack: b.source.id, stackStrategy: 'all' as const,
    xAxisIndex: b.gridIndex, yAxisIndex: b.axis.index,
    silent: true, symbol: 'none', connectNulls: false, color, lineStyle: { width: 0 }, tooltip: { show: false },
  };
  return [
    { ...common, id: `${b.source.id}:base`, name: `${b.source.label} base`, data: b.lo },
    { ...common, id: b.source.id, name: b.source.label, areaStyle: { color, opacity: 0.18 }, data: b.span },
  ];
}

type HatchFill = string | { image: HTMLCanvasElement; repeat: 'repeat' };
const hatchTiles = new Map<string, HatchFill>();

/** Canvas `decal` does not reach `markArea` (ECharts applies it to series data only), so the tile is drawn here. */
export function hatchFill(p: ChartPalette): HatchFill {
  const key = `${p.raised}|${p.axis}`;
  const known = hatchTiles.get(key);
  if (known) return known;
  const tile = document.createElement('canvas');
  tile.width = HATCH_TILE;
  tile.height = HATCH_TILE;
  const ctx = tile.getContext('2d');
  if (!ctx) return p.raised; // no canvas: the band and its label still show
  ctx.fillStyle = p.raised;
  ctx.fillRect(0, 0, HATCH_TILE, HATCH_TILE);
  ctx.strokeStyle = p.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const shift of [-HATCH_TILE, 0, HATCH_TILE]) {
    ctx.moveTo(shift, HATCH_TILE);
    ctx.lineTo(shift + HATCH_TILE, 0);
  }
  ctx.stroke();
  const fill: HatchFill = { image: tile, repeat: 'repeat' };
  hatchTiles.set(key, fill);
  return fill;
}

/** The hatch of one pane, on an empty carrier series so it survives a hidden or missing signal. */
export function hatchSeries(pane: PreparedPane, plotted: Interval | null, fill: HatchFill, p: ChartPalette, font: string) {
  if (!pane.noSample.length) return [];
  const wide = plotted ? (plotted.to - plotted.from) * HATCH_LABEL_SHARE : 0;
  return [{
    id: `hatch:${pane.pane.id}`,
    name: NO_SAMPLE,
    type: 'line' as const,
    xAxisIndex: pane.gridIndex,
    yAxisIndex: pane.axes[0].index,
    silent: true,
    tooltip: { show: false },
    data: [],
    markArea: {
      silent: true,
      animation: false,
      itemStyle: { color: fill, borderColor: p.axis, borderWidth: 1, borderType: 'dashed' as const },
      label: { color: p.tick, fontSize: LABEL_SIZE, fontFamily: font, position: 'insideTop' as const, formatter: () => NO_SAMPLE },
      data: pane.noSample.map(iv => [
        { xAxis: iv.from, label: { show: iv.to - iv.from >= wide } },
        { xAxis: iv.to },
      ]),
    },
  }];
}

/** Labelled shaded areas on the first pane. */
export function markSeries(pane: PreparedPane | undefined, marks: TrendMark[] | undefined, p: ChartPalette, font: string) {
  if (!pane || !marks?.length) return [];
  return [{
    id: 'marks',
    name: 'marks',
    type: 'line' as const,
    xAxisIndex: pane.gridIndex,
    yAxisIndex: pane.axes[0].index,
    silent: true,
    tooltip: { show: false },
    data: [],
    markArea: {
      silent: true,
      animation: false,
      itemStyle: { color: p.tick, opacity: 0.12, borderColor: p.tick, borderWidth: 1, borderType: 'dashed' as const },
      label: { color: p.tick, fontSize: LABEL_SIZE, fontFamily: font, position: 'insideTop' as const },
      data: marks.map(m => [
        { name: m.label, xAxis: m.from, ...(m.yFrom != null ? { yAxis: m.yFrom } : {}) },
        { xAxis: m.to, ...(m.yTo != null ? { yAxis: m.yTo } : {}) },
      ]),
    },
  }];
}
