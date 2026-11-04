/**
 * The TrendPanel contract (SPEC §6.4, CD12 to CD14). Series carry their own x and y arrays, so the
 * typed arrays of an evidence artifact pass through unchanged. Null and NaN are gaps, never zero.
 */
import type { ReactNode } from 'react';

/** A half-open stretch of the x axis: milliseconds on a time axis, values on a value axis. */
export interface Interval {
  from: number;
  to: number;
}

/**
 * What a line is, which decides its colour and style (CD12). `overlay` is series 6, `neutral` a
 * reference mark, `danger` a defect marker, `pen` a /trend pen placed by `penIndex`.
 */
export type TrendRole = 'pv' | 'sp' | 'op' | 'vp' | 'overlay' | 'neutral' | 'danger' | 'pen';

/** Lane segment tone. The four CPM tones, plus neutral for a fact with no status (mode). */
export type TrendTone = 'good' | 'warn' | 'bad' | 'muted' | 'neutral';

export interface TrendAxis {
  id: string;
  /** "PV / SP", "Controller output". The unit is appended by the panel. */
  label: string;
  /** Registry unit. Blank renders "unit not set", never a guess. */
  unit?: string | null;
  /** Controller output: it says "%" only when `range` is declared. */
  output?: boolean;
  /** The declared engineering range. With `scale="range"` it also sets the axis bounds. */
  range?: { min: number; max: number } | null;
  /** Fixed bounds (a shared compare scale, a manual scale). Overrides `scale`. */
  bounds?: { min?: number; max?: number } | null;
  log?: boolean;
}

export interface TrendSeries {
  id: string;
  /** Shown as the direct label on the line, in the tooltip and as the table column. */
  label: string;
  role: TrendRole;
  /** Id of an axis of this pane. Defaults to the pane's first axis. */
  axis?: string;
  x: ArrayLike<number>;
  y: ArrayLike<number | null>;
  /** With role `pen`: the place in the palette (repeats with a dash pattern). */
  penIndex?: number;
  /** Predicted or estimated: a distinct dash pattern, and "(estimated)" in the label. */
  estimated?: boolean;
  /** The value holds until the next sample: drawn as a step, and read back as the held value. */
  held?: boolean;
  /** Points only, no line (events, crossings, peaks). */
  markers?: boolean;
  /** An echarts symbol for markers; a circle when absent. */
  markerSymbol?: string;
  /** Force a dashed line on a series that is not a setpoint (a band limit). */
  dashed?: boolean;
  area?: boolean;
  /** Extra tooltip lines for one sample, by index into `x` (quality, hold kind). */
  meta?: (index: number) => string[];
}

/** A shaded lo-hi envelope (PV min to max per plotted point). */
export interface TrendBand {
  id: string;
  label: string;
  /** Id of an axis of this pane. Defaults to the pane's first axis. */
  axis?: string;
  role?: TrendRole;
  x: ArrayLike<number>;
  lo: ArrayLike<number | null>;
  hi: ArrayLike<number | null>;
}

/** One grid of value axes on the shared x axis. */
export interface TrendPane {
  id: string;
  axes: TrendAxis[];
  series: TrendSeries[];
  bands?: TrendBand[];
  /** Plot height in px. The first pane defaults to 240, the rest to 120. */
  height?: number;
}

/** One lane segment. Mode and verdict segments, `LaneInterval` and `Segment` all fit this shape. */
export interface TrendSegment {
  /** Defaults to the start time. Must be unique within the lane to be selectable. */
  id?: string;
  startMs: number;
  endMs: number;
  /** Drawn inside the segment. Text, never colour alone. */
  label: string;
  /** Used where `label` does not fit. */
  shortLabel?: string;
  tone: TrendTone;
}

export interface TrendLane {
  id: string;
  /** Drawn in the gutter and used as a table column. */
  label: string;
  /** `verdict` segments are selectable. Everything else is read-only context. */
  kind?: 'mode' | 'verdict' | 'context';
  /** Sorted by time. A hole stays empty: a lane never paints a state it was not given. */
  segments: TrendSegment[];
}

/** A labelled shaded area (evaluated window, bounds of a trajectory). */
export interface TrendMark {
  from: number;
  to: number;
  label: string;
  yFrom?: number;
  yTo?: number;
}

/** The x axis. Time is the default; `value` serves lag, frequency and phase-plane charts. */
export type TrendX =
  | { kind: 'time' }
  | { kind: 'value'; label: string; unit?: string | null };

/**
 * Sample spacing beyond which a line breaks: a number in ms, `auto` (three times the median step,
 * never on a held series) or `null` to keep only the nulls in the data.
 */
export type GapStep = number | 'auto' | null;

export type TrendState =
  | { kind: 'ready' }
  | { kind: 'loading'; message?: string }
  | { kind: 'empty'; message?: string; action?: ReactNode }
  | { kind: 'error'; message?: string; action?: ReactNode }
  | { kind: 'stale'; since: number; message?: string };

export interface TrendPanelProps {
  /** The panel name. Not `title`, which lint gate T8 reserves. */
  heading: string;
  headingLevel?: 2 | 3 | 4;
  /** Required: the site zone (IANA). The browser zone is never used. */
  zone: string;
  panes: TrendPane[];
  /** Ignored on a value axis: lanes are time bands. */
  lanes?: TrendLane[];
  /** The requested span. The axis is pinned to it, so a partial feed reads as a gap. */
  plotWindow?: Interval;
  x?: TrendX;
  gapStepMs?: GapStep;
  /** Known no-sample intervals. Computed from the data when absent. */
  noSample?: Interval[];
  marks?: TrendMark[];
  /** `fit` to the data (default) or the declared `range` of each axis. */
  scale?: 'fit' | 'range';
  /** Where the data comes from, shown under the chart. */
  source: string;
  /** How a plotted point was made, shown under the chart. */
  aggregation: string;
  state?: TrendState;
  /** The selected context (tag, loop, window). Stays visible in every state. */
  context?: ReactNode;
  /** Page controls placed before the zoom buttons (series toggles, range, export). */
  toolbar?: ReactNode;
  /** Panels with the same group share a cursor (`echarts.connect`). They need the same window. */
  group?: string;
  selectedBandId?: string | null;
  /** A verdict band chosen by click or Enter; `null` when cleared. */
  onSelectBand?: (band: TrendSegment | null, lane: TrendLane | null) => void;
  /** Controlled cursor. Leave undefined to let the panel own it. */
  cursorAt?: number | null;
  onCursorChange?: (at: number | null) => void;
}
