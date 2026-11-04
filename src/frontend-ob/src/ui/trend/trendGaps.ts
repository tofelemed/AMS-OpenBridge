/**
 * Gaps stay gaps (CD14). Rows absent from a raw slice are invisible to `connectNulls: false`, so a
 * null is placed inside any long silence, and the same silences feed the no-sample hatch. Nothing
 * here joins two samples or invents a value.
 */
import type { GapStep, Interval } from './trendTypes';

/** Auto break threshold, in median steps. */
export const GAP_FACTOR = 3;
const MEDIAN_SAMPLE = 2000;

export type Row = [number, number | null];

export const isSample = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The rows with a null between neighbours further apart than `stepMs`. Every existing null is kept,
 * and no value is ever changed or added. A step of null or below 1 only maps the rows.
 */
export function insertGapNulls(x: ArrayLike<number>, y: ArrayLike<number | null>, stepMs: number | null): Row[] {
  const out: Row[] = [];
  const breaks = stepMs != null && stepMs > 0;
  for (let i = 0; i < x.length; i++) {
    const t = x[i];
    if (!Number.isFinite(t)) continue;
    const prev = out.length ? out[out.length - 1][0] : null;
    if (breaks && prev != null && t - prev > stepMs) out.push([prev + (t - prev) / 2, null]);
    out.push([t, isSample(y[i]) ? y[i] : null]);
  }
  return out;
}

/** The median spacing of x, or null with too few rows to tell. */
export function medianStep(x: ArrayLike<number>): number | null {
  if (x.length < 3) return null;
  const stride = Math.max(1, Math.floor((x.length - 1) / MEDIAN_SAMPLE));
  const diffs: number[] = [];
  for (let i = 1; i < x.length; i += stride) {
    const d = x[i] - x[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (!diffs.length) return null;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

/** The break threshold for one series. A held series keeps its value, so auto never breaks it. */
export function gapStepFor(x: ArrayLike<number>, held: boolean, gap: GapStep): number | null {
  if (typeof gap === 'number') return gap > 0 ? gap : null;
  if (gap === null || held) return null;
  const median = medianStep(x);
  return median == null ? null : median * GAP_FACTOR;
}

/**
 * Where one series has no sample: between samples further apart than `stepMs`, across any null, and
 * from the window edges to the first and last sample. `x` must be ascending.
 */
export function gapIntervals(x: ArrayLike<number>, y: ArrayLike<number | null>, stepMs: number | null, domain?: Interval | null): Interval[] {
  const out: Interval[] = [];
  const slack = stepMs ?? 0;
  let prev: number | null = null;
  let sawNull = false;
  for (let i = 0; i < x.length; i++) {
    if (!isSample(y[i])) { sawNull = true; continue; }
    const t = x[i];
    if (prev == null) {
      if (domain && t - domain.from > slack) out.push({ from: domain.from, to: t });
    } else if (sawNull || (stepMs != null && t - prev > stepMs)) {
      out.push({ from: prev, to: t });
    }
    prev = t;
    sawNull = false;
  }
  if (prev == null) return domain ? [{ from: domain.from, to: domain.to }] : [];
  if (domain && domain.to - prev > slack) out.push({ from: prev, to: domain.to });
  return out;
}

/** The stretches common to two ascending interval lists. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const from = Math.max(a[i].from, b[j].from);
    const to = Math.min(a[i].to, b[j].to);
    if (to > from) out.push({ from, to });
    if (a[i].to < b[j].to) i++; else j++;
  }
  return out;
}

/** Limits intervals to a window and drops what falls outside it. */
export function clipIntervals(list: Interval[], domain: Interval | null): Interval[] {
  if (!domain) return list;
  return list
    .map(iv => ({ from: Math.max(iv.from, domain.from), to: Math.min(iv.to, domain.to) }))
    .filter(iv => iv.to > iv.from);
}

/**
 * Samples with a gap on both sides. A line with no symbols draws nothing for them, so a lone reading
 * would vanish; the option builder gives them a marker.
 */
export function isolatedPoints(rows: Row[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i][1];
    if (v == null) continue;
    if ((i === 0 || rows[i - 1][1] == null) && (i === rows.length - 1 || rows[i + 1][1] == null)) out.push([rows[i][0], v]);
  }
  return out;
}
