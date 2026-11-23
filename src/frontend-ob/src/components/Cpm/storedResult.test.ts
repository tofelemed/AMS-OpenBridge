// CHG-226: the words for a result kept on screen until a new one arrives, in the one short CPA time format (site zone).
import { describe, expect, it, vi } from 'vitest';
import { LAST_STORED, lastStoredText, storedAtShownTime } from './storedResult';

vi.mock('../../cpa/siteTime', async orig => ({ ...(await orig<typeof import('../../cpa/siteTime')>()), siteZone: () => 'UTC' }));

const AT = '2026-11-23T10:15:00Z';

describe('lastStoredText', () => {
  it('names a stored result with the time of the result shown', () => {
    expect(lastStoredText({ lastStored: true, resultAt: AT, updatingSince: '2026-11-23T11:00:00Z' })).toBe('Last stored result · 23 Nov · 10:15');
  });

  it('says nothing for a new result, or when the fields are absent (an older server)', () => {
    expect(lastStoredText({ lastStored: false, resultAt: AT })).toBeNull();
    expect(lastStoredText({ resultAt: AT })).toBeNull();
    expect(lastStoredText({})).toBeNull();
    expect(lastStoredText(null)).toBeNull();
    expect(lastStoredText(undefined)).toBeNull();
  });

  it('keeps the words without a time it cannot read, never a false time', () => {
    expect(lastStoredText({ lastStored: true, resultAt: null })).toBe(LAST_STORED);
    expect(lastStoredText({ lastStored: true, resultAt: 'not a time' })).toBe(LAST_STORED);
  });

  it('uses no technical words', () => {
    expect(lastStoredText({ lastStored: true, resultAt: AT })).not.toMatch(/restart|warm|refill|flink|engine|refresh/i);
  });
});

describe('storedAtShownTime', () => {
  it('is true when the time a row already shows is the same minute as the stored result', () => {
    expect(storedAtShownTime({ lastStored: true, resultAt: AT }, '2026-11-23T10:15:30Z')).toBe(true);
  });

  it('is false for another minute, a new result or no time shown', () => {
    expect(storedAtShownTime({ lastStored: true, resultAt: AT }, '2026-11-23T10:30:00Z')).toBe(false);
    expect(storedAtShownTime({ lastStored: false, resultAt: AT }, AT)).toBe(false);
    expect(storedAtShownTime({ lastStored: true, resultAt: AT }, null)).toBe(false);
    expect(storedAtShownTime({ lastStored: true, resultAt: null }, AT)).toBe(false);
  });
});
