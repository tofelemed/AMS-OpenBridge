// CHG-200 (final test #16, C3, C8): a value axis whose range and step are fixed by the caller, so short charts get fewer ticks
// that never touch, a trend's labels can be placed against a known axis, and values with little spread keep few decimals.
import { describe, expect, it } from 'vitest';
import { niceRange, paddedRange } from './niceRange';

describe('niceRange', () => {
  it('rounds the range out to whole steps of a 1-2-3-5 step', () => {
    expect(niceRange(96.2, 117.3, 5)).toEqual({ min: 95, max: 120, interval: 5 });
    expect(niceRange(40, 45, 3)).toEqual({ min: 40, max: 46, interval: 2 });
  });

  it('carries no float noise in its numbers', () => {
    expect(niceRange(0.1, 0.7, 3)).toEqual({ min: 0, max: 0.8, interval: 0.2 });
    expect(niceRange(-0.00021, 0.00048, 3)).toEqual({ min: -0.0004, max: 0.0006, interval: 0.0002 });
  });

  it('opens a single value into a range around it', () => {
    const r = niceRange(42, 42, 5);
    expect(r.min).toBeLessThan(42);
    expect(r.max).toBeGreaterThan(42);
  });
});

describe('niceRange with a step limit', () => {
  // CHG-200 (final test #16, C3): the 180 px Input trend has room for three steps; a larger 1-2-3-5 step is taken until it fits
  it('takes the next larger step until the range holds no more than the limit', () => {
    expect(niceRange(41.76, 46.24, 2, 3)).toEqual({ min: 39, max: 48, interval: 3 });
    expect(niceRange(21.5, 38.5, 2, 3)).toEqual({ min: 20, max: 40, interval: 10 });
  });
});

describe('paddedRange', () => {
  it('one model (or a tiny spread) gets a range at least a tenth of its size wide, with two decimals at most', () => {
    for (const [lo, hi] of [[2.999978, 2.999978], [2.99997, 2.99999]]) {
      const r = paddedRange(lo, hi, 5);
      expect(r.min).toBeLessThan(lo);
      expect(r.max).toBeGreaterThan(hi);
      expect(r.interval).toBeGreaterThanOrEqual(0.01);
      for (const v of [r.min, r.max, r.interval]) expect(String(v).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    }
  });

  it('keeps a real spread as it is, rounded out', () => {
    expect(paddedRange(2.1, 3.4, 5)).toEqual(niceRange(2.1, 3.4, 5));
  });
});
