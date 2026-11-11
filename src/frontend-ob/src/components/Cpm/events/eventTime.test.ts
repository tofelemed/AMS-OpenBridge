// CHG-167 (owner review, Loop Events): times read "5 Oct 07:45", the zone once in a column heading ("Opened · UTC").
import { beforeAll, describe, expect, it } from 'vitest';
import { setActiveZone } from '../../../cpa/activeZone';
import { stamp, zoneTag } from './eventTime';

beforeAll(() => setActiveZone('UTC'));

describe('stamp', () => {
  it('writes the day, the month and the time, with no separator between them', () => {
    expect(stamp('2026-10-05T07:45:00Z')).toBe('5 Oct 07:45');
    expect(stamp(Date.UTC(2026, 10, 7, 10, 24))).toBe('7 Nov 10:24');
  });

  it('reads a missing or broken time as a dash, never as a time', () => {
    expect(stamp(null)).toBe('—');
    expect(stamp('')).toBe('—');
    expect(stamp('not a time')).toBe('—');
  });
});

describe('zoneTag', () => {
  it('names the site zone', () => {
    expect(zoneTag()).toBe('UTC');
  });
});
