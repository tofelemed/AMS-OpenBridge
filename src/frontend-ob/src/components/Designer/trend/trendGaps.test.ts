/** CHG-175: a line is broken where nothing was stored; the threshold comes from the series' own sample period. */
import { describe, expect, it } from 'vitest';
import { GAP_FACTOR, samplePeriod, withGaps } from './trendGaps';

const pts = (ts: number[]) => ts.map((t, i) => ({ ts: t, value: i }));
const breaks = (out: Array<[number, number | null]>) => out.filter(p => p[1] === null).map(p => p[0]);

describe('the sample period', () => {
  it('is the median interval between samples, so a few missed ones do not move it', () => {
    expect(samplePeriod(pts([0, 517, 1034, 1551, 90_000, 90_517]))).toBe(517);
    expect(samplePeriod(pts([0, 10, 20, 50, 60]))).toBe(10);
  });

  it('is unknown with fewer than three samples', () => {
    expect(samplePeriod(pts([0, 10]))).toBeNull();
    expect(samplePeriod(pts([]))).toBeNull();
  });
});

describe('gaps', () => {
  it('break at more than five sample periods', () => {
    expect(GAP_FACTOR).toBe(5);
    expect(breaks(withGaps(pts([0, 10, 20, 30, 90, 100, 110])))).toEqual([60]);   // 60 = six periods
    expect(breaks(withGaps(pts([0, 10, 20, 30, 80, 90, 100])))).toEqual([]);      // 50 = five periods, still joined
  });

  it('keep one or two missed samples joined', () => {
    expect(breaks(withGaps(pts([0, 10, 20, 50, 60, 70])))).toEqual([]);
  });

  it('keep every sample, the break sitting between the two', () => {
    const out = withGaps(pts([0, 10, 20, 30, 90, 100]));
    expect(out).toEqual([[0, 0], [10, 1], [20, 2], [30, 3], [60, null], [90, 4], [100, 5]]);
  });

  it('break the 7-day plot where FIC10401 stored nothing (5 Nov 08:00 to 6 Nov 07:30)', () => {
    const bucket = 517_000; // a 7 d window over 1170 px
    const a = Date.parse('2026-11-04T17:51:00Z'); const aEnd = Date.parse('2026-11-05T08:00:00Z');
    const b = Date.parse('2026-11-06T07:30:00Z'); const bEnd = Date.parse('2026-11-07T11:51:00Z');
    const ts: number[] = [];
    for (let t = a; t <= aEnd; t += bucket) ts.push(t);
    for (let t = b; t <= bEnd; t += bucket) ts.push(t);
    const cut = breaks(withGaps(pts(ts)));
    expect(cut).toHaveLength(1);
    expect(cut[0]).toBeGreaterThan(aEnd);
    expect(cut[0]).toBeLessThan(b);
  });

  it('break nothing with fewer than three samples', () => {
    expect(breaks(withGaps(pts([0, 1_000_000])))).toEqual([]);
  });
});
