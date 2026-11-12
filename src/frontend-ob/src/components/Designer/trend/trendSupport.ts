/**
 * Trend engine support (split out of TrendCore, cpa-ui-fix-plan Phase 5): pen
 * types, ranges, unit guesses, path splitting and the regression fit. Pure
 * helpers only; TrendCore owns the state.
 */

/** P2-23 - sentinel distinguishing "fetch failed" from a legitimately empty series. */
export const FETCH_FAILED = Symbol('fetch-failed');

export interface PenSpec {
  /** UNS path, e.g. houston/crude1/pump101.speed */
  path: string;
  label?: string;
  // Phase 6 — per-trace styling (E1.2–E1.4). All optional; defaults reproduce the prior look exactly.
  color?: string;                                   // overrides the auto-assigned pen colour
  lineWidth?: number;                               // default 1.5
  lineStyle?: 'solid' | 'dashed' | 'dotted';        // default solid
  showMarkers?: boolean;                            // default false
  hidden?: boolean;                                 // initial hidden state (clickable legend, E1.17)
  /** Authoritative unit from the asset catalog / per-item UOM override; falls back to the name guess. */
  unitOverride?: string;
  /**
   * CHG-175: a registry loop's signal. Its binding must come from the asset model: a binding the resolver only derived
   * from the path string (provenance "fallback") or could not resolve points where loop signals never live, so the pen
   * is not read. Tag pens and the Designer's pens leave this off (a path-derived binding can be right for them; the
   * Designer flags them instead, CHG-176: TrendCore's `flagFallback`).
   */
  needsModelBinding?: boolean;
}

export interface Pen extends PenSpec {
  label: string;
  unit: string;
  iotSeries?: string;    // root.<site>.<unit>.<device>
  measurement?: string;  // metric
  liveKey?: string;      // device/metric (matches the mqtt ring-buffer key)
  /** CHG-175: a loop pen without a binding from the asset model; nothing is read for it. */
  unread?: boolean;
  /** CHG-176: why the pen's binding is not trusted (a Designer fallback pen); the legend names it, NE107 Uncertain. */
  trustReason?: string;
}

export interface TrendPoint { ts: number; value: number }

/** Least-squares fit over [ts,value] points → the two window-spanning endpoints, or null if degenerate. */
export function regressionLine(pts: TrendPoint[]): Array<[number, number]> | null {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of pts) { sx += p.ts; sy += p.value; sxy += p.ts * p.value; sxx += p.ts * p.ts; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const x0 = pts[0].ts, x1 = pts[n - 1].ts;
  return [[x0, slope * x0 + intercept], [x1, slope * x1 + intercept]];
}

export const RANGES = [
  { label: '15m', ms: 15 * 60_000 },
  { label: '1h', ms: 60 * 60_000 },
  { label: '8h', ms: 8 * 60 * 60_000 },
  { label: '1d', ms: 24 * 60 * 60_000 },
  { label: '1w', ms: 7 * 24 * 60 * 60_000 },
];

/** Engineering unit for a measurement (the UNS catalog carries no unit field today). */
const UNITS: Array<[RegExp, string]> = [
  [/level|position|opening|pct|percent/i, '%'],
  [/speed|rpm/i, 'RPM'],
  [/press/i, 'PSI'],
  [/temp/i, '°C'],
  [/current|amp/i, 'A'],
  [/flow/i, 'm³/h'],
  [/vibration/i, 'mm/s'],
];
export function unitFor(measurement?: string): string {
  if (!measurement) return '';
  return UNITS.find(([re]) => re.test(measurement))?.[1] ?? '';
}

export function splitIoTPath(iotDbPath?: string): { series?: string; measurement?: string } {
  if (!iotDbPath) return {};
  const dot = iotDbPath.lastIndexOf('.');
  if (dot < 0) return { series: iotDbPath };
  return { series: iotDbPath.slice(0, dot), measurement: iotDbPath.slice(dot + 1) };
}

/** The Designer time bar's two clocks. CHG-175: axis ticks and the cursor are formatted in ./trendTime. */
export const CLOCK_OPTS: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
