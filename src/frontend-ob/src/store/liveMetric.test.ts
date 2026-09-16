// v2.5 Task 1C.1 (spec v6 R20): the browser must show SOURCE age, not emission age.
// A heartbeat republishes an old value with a fresh emission time; the staleness chip
// must keep ageing on the source time while the emission time proves the feed is alive.
import { describe, it, expect } from 'vitest';
import { parseSnapshotMetric, liveAges, type LiveMetric } from './liveMetric';

const T0 = 1_756_600_000_000;

describe('parseSnapshotMetric', () => {
  it('reads the three timestamps from a v2.5 snapshot and keeps ts as the source time', () => {
    const m = parseSnapshotMetric({ v: 42.5, q: 192, ts: T0, src: T0, ver: T0 + 1000, emit: T0 + 300_000, qt: 'GOOD' });
    expect(m).not.toBeNull();
    expect(m!.value).toBe(42.5);
    expect(m!.quality).toBe(192);
    expect(m!.ts).toBe(T0);
    expect(m!.sourceTs).toBe(T0);
    expect(m!.verifiedTs).toBe(T0 + 1000);
    expect(m!.emissionTs).toBe(T0 + 300_000);
    expect(m!.qualityToken).toBe('GOOD');
  });

  it('accepts a pre-v2.5 snapshot and leaves the new fields undefined (never invented)', () => {
    const m = parseSnapshotMetric({ v: 1, q: 192, ts: T0 });
    expect(m!.sourceTs).toBeUndefined();
    expect(m!.emissionTs).toBeUndefined();
    expect(m!.qualityToken).toBeUndefined();
  });

  it('does not default a missing quality to GOOD', () => {
    const m = parseSnapshotMetric({ v: 1, ts: T0 });
    expect(m!.quality).not.toBe(192);
  });
});

describe('liveAges', () => {
  it('source age keeps growing across heartbeats while emission age resets', () => {
    const m: LiveMetric = { value: 1, quality: 192, ts: T0, sourceTs: T0, emissionTs: T0 + 300_000 };
    const ages = liveAges(m, T0 + 301_000);
    expect(ages.sourceAgeMs).toBe(301_000);
    expect(ages.emissionAgeMs).toBe(1_000);
  });

  it('falls back to ts when the source time is absent and reports the emission age as unknown', () => {
    const ages = liveAges({ value: 1, quality: 192, ts: T0 }, T0 + 5_000);
    expect(ages.sourceAgeMs).toBe(5_000);
    expect(ages.emissionAgeMs).toBeNull();
  });
});
