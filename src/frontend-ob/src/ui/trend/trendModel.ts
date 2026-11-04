/**
 * Props to a prepared model: gaps broken, axes numbered, the domain fixed, and the sorted points
 * the cursor walks. One `snapshotAt` feeds the tooltip, the live region and the table, so the three
 * can never disagree about a reading. Pure: no canvas, no DOM.
 */
import { NO_SAMPLE, axisUnit, numberText, valueText, xFormat } from './trendFormat';
import { clipIntervals, gapIntervals, gapStepFor, insertGapNulls, intersectIntervals, isSample, isolatedPoints, medianStep, type Row } from './trendGaps';
import { axisSlot, trendLayout, type TrendLayout } from './trendLayout';
import type { GapStep, Interval, TrendAxis, TrendBand, TrendLane, TrendPane, TrendSegment, TrendSeries, TrendX } from './trendTypes';

const TIME_X: TrendX = { kind: 'time' };
const FALLBACK_AXIS: TrendAxis = { id: 'value', label: 'Value' };

export interface PreparedAxis {
  axis: TrendAxis;
  /** Index into the option's yAxis list. */
  index: number;
  gridIndex: number;
  side: 'left' | 'right';
  offset: number;
  row: number;
}

/** Ascending view of a series for lookup. `rows` maps a position back to the caller's index. */
export interface Ordered {
  x: ArrayLike<number>;
  y: ArrayLike<number | null>;
  rows: Uint32Array | null;
}

export interface PreparedSeries {
  source: TrendSeries;
  axis: PreparedAxis;
  gridIndex: number;
  /** Drawing rows: ascending with gap nulls on a time axis, sample order on a value axis. */
  data: Row[];
  isolated: Array<[number, number]>;
  ordered: Ordered;
  stepMs: number | null;
  toleranceMs: number;
}

export interface PreparedBand {
  source: TrendBand;
  axis: PreparedAxis;
  gridIndex: number;
  lo: Row[];
  span: Row[];
}

export interface PreparedPane {
  pane: TrendPane;
  gridIndex: number;
  axes: PreparedAxis[];
  series: PreparedSeries[];
  bands: PreparedBand[];
  noSample: Interval[];
}

export interface TrendModel {
  x: TrendX;
  panes: PreparedPane[];
  series: PreparedSeries[];
  axes: PreparedAxis[];
  lanes: TrendLane[];
  domain: Interval | null;
  /** Sorted, unique x of every sample: the points the cursor steps through. */
  times: Float64Array;
  layout: TrendLayout;
  hasData: boolean;
  /** Most rows of any one series, for the drawn-sampled note. */
  maxRows: number;
}

export interface TrendInput {
  panes: TrendPane[];
  lanes?: TrendLane[];
  plotWindow?: Interval;
  x?: TrendX;
  gapStepMs?: GapStep;
  noSample?: Interval[];
}

function ordered(x: ArrayLike<number>, y: ArrayLike<number | null>): Ordered {
  let ascending = true;
  for (let i = 1; i < x.length && ascending; i++) ascending = x[i] >= x[i - 1];
  if (ascending) return { x, y, rows: null };
  const rows = Uint32Array.from({ length: x.length }, (_, i) => i).sort((a, b) => x[a] - x[b]);
  return { x: Array.from(rows, r => x[r]), y: Array.from(rows, r => y[r]), rows };
}

function prepareSeries(s: TrendSeries, axis: PreparedAxis, gridIndex: number, isTime: boolean, gap: GapStep): PreparedSeries {
  const view = ordered(s.x, s.y);
  const stepMs = isTime ? gapStepFor(view.x, !!s.held, gap) : null;
  const data = isTime ? insertGapNulls(view.x, view.y, stepMs) : insertGapNulls(s.x, s.y, null);
  const toleranceMs = !isTime ? Infinity : (stepMs ?? medianStep(view.x) ?? 0) / 2;
  return { source: s, axis, gridIndex, data, isolated: isolatedPoints(data), ordered: view, stepMs, toleranceMs };
}

function prepareBand(b: TrendBand, axis: PreparedAxis, gridIndex: number, isTime: boolean, gap: GapStep): PreparedBand {
  const stepMs = isTime ? gapStepFor(b.x, false, gap) : null;
  const lo = insertGapNulls(b.x, b.lo, stepMs);
  const hi = insertGapNulls(b.x, b.hi, stepMs);
  const span = lo.map(([t, v], i): Row => {
    const top = hi[i]?.[1] ?? null;
    return [t, v != null && top != null ? top - v : null];
  });
  return { source: b, axis, gridIndex, lo: lo.map(([t, v], i) => [t, span[i][1] == null ? null : v]), span };
}

function domainOf(input: TrendInput, series: PreparedSeries[], lanes: TrendLane[], isTime: boolean): Interval | null {
  const asked = input.plotWindow;
  if (asked && asked.to > asked.from) return { from: asked.from, to: asked.to };
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    const { x, y } = s.ordered;
    for (let i = 0; i < x.length; i++) {
      if (isSample(y[i])) { lo = Math.min(lo, x[i]); hi = Math.max(hi, x[i]); }
    }
  }
  for (const lane of lanes) for (const seg of lane.segments) { lo = Math.min(lo, seg.startMs); hi = Math.max(hi, seg.endMs); }
  if (!Number.isFinite(lo)) return null;
  if (hi > lo) return { from: lo, to: hi };
  // One lone reading still needs an axis with a width.
  const pad = isTime ? 60_000 : 1;
  return { from: lo - pad, to: hi + pad };
}

function unionTimes(series: PreparedSeries[]): Float64Array {
  const all = new Float64Array(series.reduce((n, s) => n + s.ordered.x.length, 0));
  let n = 0;
  for (const s of series) {
    const { x, y } = s.ordered;
    for (let i = 0; i < x.length; i++) if (isSample(y[i])) all[n++] = x[i];
  }
  const sorted = all.subarray(0, n).sort();
  let u = 0;
  for (let i = 0; i < n; i++) if (i === 0 || sorted[i] !== sorted[i - 1]) sorted[u++] = sorted[i];
  return sorted.slice(0, u);
}

/** A pane has no sample only where every measured series is silent. A held SP does not fill a PV outage. */
function paneNoSample(series: PreparedSeries[], domain: Interval | null): Interval[] {
  const measured = series.filter(s => !s.source.held && s.source.role !== 'sp');
  const basis = measured.length ? measured : series;
  if (!basis.length) return [];
  const lists = basis.map(s => gapIntervals(s.ordered.x, s.ordered.y, s.stepMs, domain));
  return clipIntervals(lists.reduce(intersectIntervals), domain);
}

export function prepareTrend(input: TrendInput): TrendModel {
  const x = input.x ?? TIME_X;
  const isTime = x.kind === 'time';
  const lanes = isTime ? input.lanes ?? [] : [];
  const gap = input.gapStepMs === undefined ? 'auto' : input.gapStepMs;
  const axes: PreparedAxis[] = [];

  const panes = input.panes.map((pane, gridIndex) => {
    const declared = pane.axes.length ? pane.axes : [FALLBACK_AXIS];
    const paneAxes = declared.map((axis, i) => {
      const prepared: PreparedAxis = { axis, index: axes.length, gridIndex, ...axisSlot(i) };
      axes.push(prepared);
      return prepared;
    });
    const axisFor = (id: string | undefined, owner: string) => {
      const found = id == null ? paneAxes[0] : paneAxes.find(a => a.axis.id === id);
      // A series on the wrong axis reads as the wrong unit, so this fails rather than guessing.
      if (!found) throw new Error(`TrendPanel: ${owner} names axis "${id}", which pane "${pane.id}" does not declare`);
      return found;
    };
    return {
      pane, gridIndex, axes: paneAxes,
      series: pane.series.map(s => prepareSeries(s, axisFor(s.axis, s.id), gridIndex, isTime, gap)),
      bands: (pane.bands ?? []).map(b => prepareBand(b, axisFor(b.axis, b.id), gridIndex, isTime, gap)),
      noSample: [] as Interval[],
    };
  });

  const series = panes.flatMap(p => p.series);
  const domain = domainOf(input, series, lanes, isTime);
  if (isTime) {
    for (const p of panes) p.noSample = input.noSample ? clipIntervals(input.noSample, domain) : paneNoSample(p.series, domain);
  }
  const times = unionTimes(series);
  return {
    x, panes, series, axes, lanes, domain, times,
    layout: trendLayout(input.panes.map(p => ({ height: p.height, axisCount: Math.max(1, p.axes.length) })), lanes.map(l => l.label)),
    hasData: times.length > 0 || lanes.some(l => l.segments.length > 0),
    maxRows: series.reduce((n, s) => Math.max(n, s.data.length), 0),
  };
}

/** First position whose value is at or above `t`. */
export function lowerBound(xs: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid] < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** First position whose value is above `t`. */
function upperBound(xs: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid] <= t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** The sample points inside a window. */
export const windowTimes = (times: Float64Array, w: Interval): Float64Array =>
  times.subarray(lowerBound(times, w.from), upperBound(times, w.to));

export function nearestPosition(xs: ArrayLike<number>, t: number): number {
  if (!xs.length) return -1;
  const i = lowerBound(xs, t);
  if (i >= xs.length) return xs.length - 1;
  if (i === 0) return 0;
  return t - xs[i - 1] <= xs[i] - t ? i - 1 : i;
}

/**
 * The sample point under a pointer or click. Inside a gap no sample is near, so the position stands
 * and the reading says "No sample" rather than the value from the far side of the gap.
 */
export function snapToPoint(model: TrendModel, plotted: Interval | null, at: number): number {
  const points = plotted ? windowTimes(model.times, plotted) : model.times;
  const i = nearestPosition(points, at);
  if (i < 0) return at;
  const hair = plotted ? (plotted.to - plotted.from) / 100 : 0;
  const reach = model.series.reduce((most, s) => Math.max(most, s.toleranceMs), hair);
  return Math.abs(points[i] - at) <= reach ? points[i] : at;
}

/** A reading at `t`: the nearest sample in tolerance, the held value, or null. Never interpolated. */
export function sampleAt(s: PreparedSeries, t: number): { index: number; value: number } | null {
  const { x, y, rows } = s.ordered;
  let pos: number;
  if (s.source.held) {
    pos = upperBound(x, t) - 1;
    if (pos < 0 || (s.stepMs != null && t - x[pos] > s.stepMs)) return null;
  } else {
    pos = nearestPosition(x, t);
    if (pos < 0 || Math.abs(x[pos] - t) > s.toleranceMs) return null;
  }
  const value = y[pos];
  return isSample(value) ? { index: rows ? rows[pos] : pos, value } : null;
}

export const segmentKey = (segment: TrendSegment) => segment.id ?? String(segment.startMs);

export const segmentAt = (lane: TrendLane, t: number): TrendSegment | null =>
  lane.segments.find(s => t >= s.startMs && t < s.endMs) ?? null;

/** The segments of a lane that show in a window, in order. */
export const visibleSegments = (lane: TrendLane, w: Interval): TrendSegment[] =>
  lane.segments.filter(s => s.endMs > w.from && s.startMs < w.to);

export interface CursorSnapshot {
  at: number;
  xText: string;
  values: Array<{ id: string; label: string; unit: string | null; value: number | null; text: string; meta: string[] }>;
  bands: Array<{ id: string; label: string; text: string }>;
  lanes: Array<{ id: string; label: string; text: string; segment: TrendSegment | null }>;
}

const bandText = (b: PreparedBand, t: number): string => {
  const i = nearestPosition(b.source.x, t);
  if (i < 0 || b.source.x[i] !== t) return NO_SAMPLE;
  const lo = b.source.lo[i];
  const hi = b.source.hi[i];
  if (!isSample(lo) || !isSample(hi)) return NO_SAMPLE;
  return `${numberText(lo)} to ${valueText(hi, axisUnit(b.axis.axis))}`;
};

export function snapshotAt(model: TrendModel, t: number, zone: string): CursorSnapshot {
  return {
    at: t,
    xText: xFormat(model.x, zone).cursor(t),
    values: model.series.map(s => {
      const hit = sampleAt(s, t);
      const unit = axisUnit(s.axis.axis);
      return {
        id: s.source.id, label: s.source.label, unit, value: hit?.value ?? null,
        text: valueText(hit?.value ?? null, unit),
        meta: hit && s.source.meta ? s.source.meta(hit.index) : [],
      };
    }),
    bands: model.panes.flatMap(p => p.bands.map(b => ({ id: b.source.id, label: b.source.label, text: bandText(b, t) }))),
    lanes: model.lanes.map(lane => {
      const segment = segmentAt(lane, t);
      return { id: lane.id, label: lane.label, text: segment?.label ?? 'No value', segment };
    }),
  };
}

/** One sentence for the live region. */
export function snapshotSentence(s: CursorSnapshot): string {
  const parts = [
    s.xText,
    ...s.values.map(v => `${v.label} ${v.text}`),
    ...s.bands.map(b => `${b.label} ${b.text}`),
    ...s.lanes.map(l => `${l.label} ${l.text}`),
  ];
  return `${parts.join('. ')}.`;
}

/** The chart in words, for `aria-label` and the ECharts `aria` option. */
export function describeTrend(model: TrendModel, heading: string, plotted: string): string {
  const signals = model.series.map(s => {
    const unit = axisUnit(s.axis.axis);
    return unit ? `${s.source.label} in ${unit}` : `${s.source.label}, unit not set`;
  });
  const gaps = model.panes.reduce((n, p) => n + p.noSample.length, 0);
  const lanes = model.lanes.map(l => `${l.label} lane with ${l.segments.length} ${l.segments.length === 1 ? 'segment' : 'segments'}`);
  return [
    `Trend chart: ${heading}`,
    signals.length ? `Signals: ${signals.join(', ')}` : '',
    plotted,
    gaps ? `${gaps} ${gaps === 1 ? 'interval' : 'intervals'} with no sample` : '',
    lanes.join(', '),
  ].filter(Boolean).join('. ') + '.';
}
