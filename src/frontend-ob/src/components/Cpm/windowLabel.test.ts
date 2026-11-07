// SME review #18 (CHG-054): a window is named by its size and end — sliding 24 h windows that end on the
// same day (and often share a verdict) still read differently.
import { describe, expect, it } from 'vitest';
import { clockOf, dayOf, profileLabel, windowLabel, windowSize, windowSpan } from './windowLabel';

describe('windowLabel', () => {
  it('names the size from the kind, or from the span', () => {
    expect(windowSize({ windowKind: '24h' })).toBe('24 h');
    expect(windowSize({ windowKind: '15m' })).toBe('15 min');
    expect(windowSize({ windowStart: '2026-10-05T10:00:00Z', windowEnd: '2026-10-05T22:00:00Z' })).toBe('12 h');
    expect(windowSize({ windowStart: '2026-10-05T10:00:00Z', windowEnd: '2026-10-05T10:05:00Z' })).toBe('5 min');
    expect(windowSize({})).toBe('');
  });

  it('tells two sliding windows of the same day apart', () => {
    const a = windowLabel({ windowKind: '24h', windowEnd: '2026-08-09T21:00:00Z' }, 'UTC');
    const b = windowLabel({ windowKind: '24h', windowEnd: '2026-08-09T20:45:00Z' }, 'UTC');
    expect(a).toBe('24 h · ends 9 Aug 21:00 UTC');
    expect(b).toBe('24 h · ends 9 Aug 20:45 UTC');
  });

  it('spells out the span for hover and screen readers', () => {
    expect(windowSpan({ windowKind: '24h', windowStart: '2026-08-08T21:00:00Z', windowEnd: '2026-08-09T21:00:00Z' }, 'UTC'))
      .toBe('24 h window · 8 Aug 21:00 → 9 Aug 21:00 UTC');
  });
});

describe('list and profile labels', () => {
  it('names a profile by size and slide', () => {
    expect(profileLabel({ kind: '15m', tier: 'short', assigner: 'sliding', sizeMs: 900_000, slideMs: 300_000, allowedLatenessMs: null, cadenceMs: null, minSamples: null, feeds: '', overlapping: true })).toBe('15 min · 5 min slide');
    expect(profileLabel({ kind: '1m', tier: 'short', assigner: 'tumbling', sizeMs: 60_000, slideMs: null, allowedLatenessMs: null, cadenceMs: null, minSamples: null, feeds: '', overlapping: false })).toBe('1 min · tumbling');
    expect(profileLabel({ kind: '12h', tier: 'long', assigner: 'rolling-buffer', sizeMs: 43_200_000, slideMs: null, allowedLatenessMs: null, cadenceMs: 900_000, minSamples: null, feeds: '', overlapping: true })).toBe('12 h · 15 min cadence');
  });
  it('gives the time of day and the date apart, in the zone', () => {
    expect(clockOf('2026-11-04T13:35:00Z', 'UTC')).toBe('13:35');
    expect(dayOf('2026-11-04T13:35:00Z', 'UTC')).toBe('4 Nov');
    expect(dayOf('2026-11-04T23:35:00Z', 'Asia/Dubai')).toBe('5 Nov');
    expect(clockOf(null, 'UTC')).toBe('—');
  });
});
