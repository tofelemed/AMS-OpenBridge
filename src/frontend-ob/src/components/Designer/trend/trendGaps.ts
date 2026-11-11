/**
 * CHG-175: a line is broken where nothing was stored, instead of a straight line drawn across the gap as if it were data.
 *
 * The threshold comes from the series itself. The historian answers buckets sized to the plot width and TrendCore drops
 * the empty ones, so a series' own sample period on screen is the spacing its samples usually have: the MEDIAN interval
 * between consecutive samples (a few missed samples or a burst do not move it). A gap is an interval longer than
 * GAP_FACTOR (5) sample periods: one or two missed samples (two to three periods) stay joined, while FIC10401's
 * 5 Nov 08:00 to 6 Nov 07:30 on a 7-day plot (517 s buckets) breaks. With fewer than three samples there is no period,
 * so nothing is broken. Pure.
 */
import type { TrendPoint } from './trendSupport';

export const GAP_FACTOR = 5;

/** The median interval between consecutive samples (ms), or null with fewer than two intervals. */
export function samplePeriod(points: TrendPoint[]): number | null {
  const steps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = points[i].ts - points[i - 1].ts;
    if (d > 0) steps.push(d);
  }
  if (steps.length < 2) return null;
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

/** The points as chart data, with an empty value (ECharts breaks the line there) midway across every gap. */
export function withGaps(points: TrendPoint[]): Array<[number, number | null]> {
  const period = samplePeriod(points);
  const out: Array<[number, number | null]> = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (period != null && prev && p.ts - prev.ts > GAP_FACTOR * period) out.push([(prev.ts + p.ts) / 2, null]);
    out.push([p.ts, p.value]);
  });
  return out;
}
