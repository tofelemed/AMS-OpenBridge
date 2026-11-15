/**
 * CHG-197: what every response trend shares: its spec (heading, the "?" tip, curves, marks, height), the PV curve with the
 * rejected samples as gaps, the step line, and label placement above / below the measured PV (placement only, never a value).
 */
import type { CpmSeries } from '../../evidence/CpmChart';
import type { DecodedArtifact } from '../../evidence/artifactCodec';
import type { Mark, MarkLabel } from './annotations';
import { pvSpan, type ResponseFacts } from './responseFacts';

/** The Response chart's output pane height before CHG-197; the input pane's. */
export const TREND_HEIGHT = 320;
export const INPUT_HEIGHT = 180;

export interface TrendSpec {
  id: string;
  title: string;
  /** The "?" tip: how the engine measures what the trend draws, one paragraph each. */
  help: string[];
  series: CpmSeries[];
  marks: Mark[];
  /** The value unit the marks sit on. */
  unit: string;
  height: number;
}

export const ms = (s: number) => s * 1000;

/** An artifact column on the time axis; a rejected sample (mask false) or a non-number is a gap, never bridged. */
export function timeSeries(d: DecodedArtifact, id: string, label: string, unit: string, pen: CpmSeries['pen'], extra: Partial<CpmSeries> = {}, column = 'y'): CpmSeries {
  const raw = d.columns[column];
  const x = new Float64Array(d.n);
  const y: Array<number | null> = [];
  for (let i = 0; i < d.n; i++) {
    x[i] = d.columns.x[i] * 1000;
    y.push((d.mask && !d.mask[i]) || !Number.isFinite(raw[i]) ? null : raw[i]);
  }
  return { id, label, unit, x, y, pen, csvLabel: id, ...extra };
}

export const pvSeries = (f: ResponseFacts): CpmSeries => timeSeries(f.samples, 'pv', 'PV', f.pvUnit, 'pv');

/** The setpoint the engine held after the step, dashed and labelled, on a setpoint step only. */
export const setpointSeries = (f: ResponseFacts): CpmSeries[] => (f.setpoint == null ? [] : [{
  id: 'reference', csvLabel: 'reference', label: 'Setpoint', unit: f.pvUnit, x: [ms(f.t0), ms(f.tEnd)], y: [f.setpoint, f.setpoint], pen: 'sp', dashed: true,
}]);

export const stepMark = (f: ResponseFacts): Mark => ({ kind: 'step', x: ms(f.t0), label: 'Step' });

/** Places a mark a fraction of the PV range below the lowest or above the highest measured PV. */
export function placement(f: ResponseFacts) {
  const { min, max } = pvSpan(f.samples);
  const range = Math.max(max - min, Math.abs(f.change ?? 0), 1e-9);
  const width = f.xRange[1] - f.xRange[0];
  return {
    min, max, range,
    below: (k: number) => min - k * range,
    above: (k: number) => max + k * range,
    /** A time a fraction of the window from its start. */
    at: (k: number) => f.xRange[0] + k * width,
  };
}

/** True when an artifact has a sample inside the tab's time range (the holdout prediction lies on the previous event's times). */
export function insideWindow(d: DecodedArtifact | undefined, f: ResponseFacts): d is DecodedArtifact {
  if (!d) return false;
  for (let i = 0; i < d.n; i++) { const t = d.columns.x[i] * 1000; if (t >= f.xRange[0] && t <= f.xRange[1]) return true; }
  return false;
}

/** A span between two times (ms) at a level; one too short for its label (under 15 % of the window) carries the label after it. */
export const spanMark = (f: ResponseFacts, x1: number, x2: number, y: number, label: MarkLabel): Mark =>
  ({ kind: 'span', x1, x2, y, label, short: Math.abs(x2 - x1) < 0.15 * (f.xRange[1] - f.xRange[0]) });
