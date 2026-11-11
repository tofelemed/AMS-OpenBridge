import { beforeAll, describe, expect, it } from 'vitest';
import { setActiveZone } from '../../../cpa/activeZone';
import { dayEndIso, dayStartIso, rangeQuery, stamp, stampSeconds } from './auditTime';

beforeAll(() => setActiveZone('UTC'));

describe('times on Governance (finding: browser format with seconds and the zone on every row)', () => {
  it('the list reads the day, month and time; the panel adds the year and seconds', () => {
    expect(stamp('2026-11-04T13:04:11.48+00:00')).toBe('4 Nov 13:04');
    expect(stampSeconds('2026-11-04T13:04:11.48+00:00')).toBe('4 Nov 2026 13:04:11');
    expect(stampSeconds(null)).toBe('—');
    expect(stampSeconds('broken')).toBe('—');
  });

  it('reads a time in the site zone', () => {
    setActiveZone('Asia/Dubai');
    expect(stampSeconds('2026-11-04T13:04:11Z')).toBe('4 Nov 2026 17:04:11');
    expect(dayStartIso('2026-11-04')).toBe('2026-11-03T20:00:00.000Z');
    setActiveZone('UTC');
  });
});

describe('the time range (owner answer 2: from / to)', () => {
  const now = Date.UTC(2026, 10, 11, 12, 0, 0);

  it('All time sends neither', () => {
    expect(rangeQuery('all', now, '', '')).toEqual({});
  });

  it('a span sends from, counted back from now', () => {
    expect(rangeQuery('24h', now, '', '')).toEqual({ from: '2026-11-10T12:00:00.000Z' });
    expect(rangeQuery('7d', now, '', '')).toEqual({ from: '2026-11-04T12:00:00.000Z' });
    expect(rangeQuery('30d', now, '', '')).toEqual({ from: '2026-10-12T12:00:00.000Z' });
  });

  it('a custom range sends the first and the last instant of its days, either alone', () => {
    expect(rangeQuery('custom', now, '2026-11-04', '2026-11-05')).toEqual({ from: '2026-11-04T00:00:00.000Z', to: '2026-11-05T23:59:59.999Z' });
    expect(rangeQuery('custom', now, '2026-11-04', '')).toEqual({ from: '2026-11-04T00:00:00.000Z' });
    expect(rangeQuery('custom', now, '', '2026-11-05')).toEqual({ to: '2026-11-05T23:59:59.999Z' });
    expect(dayEndIso('nonsense')).toBeNull();
  });
});
