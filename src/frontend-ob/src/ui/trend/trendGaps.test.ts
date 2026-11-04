import { describe, expect, it } from 'vitest';
import { clipIntervals, gapIntervals, gapStepFor, insertGapNulls, intersectIntervals, isolatedPoints, medianStep } from './trendGaps';

describe('insertGapNulls', () => {
  it('leaves evenly spaced rows alone', () => {
    expect(insertGapNulls([0, 10, 20], [1, 2, 3], 15)).toEqual([[0, 1], [10, 2], [20, 3]]);
  });

  it('puts one null inside a silence longer than the step', () => {
    expect(insertGapNulls([0, 10, 100, 110], [1, 2, 3, 4], 15)).toEqual([[0, 1], [10, 2], [55, null], [100, 3], [110, 4]]);
  });

  it('breaks every silence, and a step of exactly the spacing does not break', () => {
    expect(insertGapNulls([0, 15, 100, 200], [1, 2, 3, 4], 15)).toEqual([[0, 1], [15, 2], [57.5, null], [100, 3], [150, null], [200, 4]]);
  });

  it('keeps a null that was already there, and never turns one into a zero', () => {
    const rows = insertGapNulls([0, 10, 20], [1, null, 3], 15);
    expect(rows).toEqual([[0, 1], [10, null], [20, 3]]);
    expect(rows.some(r => r[1] === 0)).toBe(false);
  });

  it('keeps a real zero as a value', () => {
    expect(insertGapNulls([0, 10], [0, 0], 15)).toEqual([[0, 0], [10, 0]]);
  });

  it('reads NaN from a typed array as a gap, and skips a row with no x', () => {
    expect(insertGapNulls(new Float64Array([0, 10, NaN, 20]), new Float64Array([1, NaN, 5, 3]), null)).toEqual([[0, 1], [10, null], [20, 3]]);
  });

  it('only maps the rows when there is no step', () => {
    expect(insertGapNulls([0, 1000], [1, 2], null)).toEqual([[0, 1], [1000, 2]]);
    expect(insertGapNulls([0, 1000], [1, 2], 0)).toEqual([[0, 1], [1000, 2]]);
  });

  it('handles no rows and one row', () => {
    expect(insertGapNulls([], [], 10)).toEqual([]);
    expect(insertGapNulls([5], [1], 10)).toEqual([[5, 1]]);
  });
});

describe('medianStep and gapStepFor', () => {
  it('finds the spacing, and one outage does not move it', () => {
    expect(medianStep([0, 10, 20, 30, 1000, 1010, 1020])).toBe(10);
  });

  it('has no answer with too few rows', () => {
    expect(medianStep([0, 10])).toBeNull();
  });

  it('samples a long series without losing the spacing', () => {
    expect(medianStep(Float64Array.from({ length: 50_000 }, (_, i) => i * 5))).toBe(5);
  });

  it('uses an explicit step as given, and null as off', () => {
    expect(gapStepFor([0, 10, 20], false, 60)).toBe(60);
    expect(gapStepFor([0, 10, 20], false, null)).toBeNull();
    expect(gapStepFor([0, 10, 20], false, 0)).toBeNull();
  });

  it('derives three median steps on auto, but never for a held series', () => {
    expect(gapStepFor([0, 10, 20, 30], false, 'auto')).toBe(30);
    expect(gapStepFor([0, 10, 20, 30], true, 'auto')).toBeNull();
    expect(gapStepFor([0, 10, 20, 30], true, 60)).toBe(60);
  });
});

describe('gapIntervals', () => {
  it('finds a silence between samples', () => {
    expect(gapIntervals([0, 10, 100], [1, 2, 3], 15)).toEqual([{ from: 10, to: 100 }]);
  });

  it('finds a run of nulls whatever its length', () => {
    expect(gapIntervals([0, 10, 20, 30], [1, null, null, 4], 100)).toEqual([{ from: 0, to: 30 }]);
  });

  it('adds the edges of the window, so a partial feed reads as a gap', () => {
    expect(gapIntervals([50, 60, 70], [1, 2, 3], 15, { from: 0, to: 200 })).toEqual([{ from: 0, to: 50 }, { from: 70, to: 200 }]);
  });

  it('calls the whole window a gap when nothing arrived', () => {
    expect(gapIntervals([0, 10], [null, null], 15, { from: 0, to: 100 })).toEqual([{ from: 0, to: 100 }]);
    expect(gapIntervals([], [], 15, { from: 0, to: 100 })).toEqual([{ from: 0, to: 100 }]);
    expect(gapIntervals([], [], 15)).toEqual([]);
  });
});

describe('interval helpers', () => {
  it('intersects: both series must be silent', () => {
    expect(intersectIntervals([{ from: 0, to: 10 }, { from: 20, to: 40 }], [{ from: 5, to: 25 }, { from: 35, to: 50 }]))
      .toEqual([{ from: 5, to: 10 }, { from: 20, to: 25 }, { from: 35, to: 40 }]);
  });

  it('has nothing in common with an empty list', () => {
    expect(intersectIntervals([{ from: 0, to: 10 }], [])).toEqual([]);
  });

  it('clips to the window and drops what falls outside', () => {
    expect(clipIntervals([{ from: 0, to: 10 }, { from: 20, to: 30 }, { from: 90, to: 200 }], { from: 5, to: 100 }))
      .toEqual([{ from: 5, to: 10 }, { from: 20, to: 30 }, { from: 90, to: 100 }]);
  });
});

describe('isolatedPoints', () => {
  it('finds a reading with a gap on both sides', () => {
    expect(isolatedPoints([[0, 1], [1, 2], [2, null], [3, 4], [4, null], [5, 6], [6, 7]])).toEqual([[3, 4]]);
  });

  it('treats a single row, and a run at either end, correctly', () => {
    expect(isolatedPoints([[0, 1]])).toEqual([[0, 1]]);
    expect(isolatedPoints([[0, 1], [1, null], [2, 2], [3, 3]])).toEqual([[0, 1]]);
  });
});
