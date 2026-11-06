/** CHG-119: every time shown or typed is in the site zone X, whatever the browser's zone. The pages name X beside their times. */
import { afterEach, describe, expect, it } from 'vitest';
import { parseCustomRange, fmtRange, toLocalInput } from '../components/Cpm/historical/timeRange';
import { requestedEnd } from '../components/Cpm/evidence/evaluationState';
import { setActiveZone } from './activeZone';
import { browserZoneName, fromSiteInput, siteAxisTick, siteZone, toSiteInput, zoneAbbr } from './siteTime';
import { pickZone } from './useCpaContext';

const INSTANT = Date.parse('2026-10-05T20:45:00Z');

afterEach(() => setActiveZone(undefined as unknown as string));

describe('typed times', () => {
  it('shows an instant in the header zone', () => {
    setActiveZone('Asia/Tehran');
    expect(toSiteInput(INSTANT)).toBe('2026-10-06T00:15');
    setActiveZone('UTC');
    expect(toSiteInput(INSTANT)).toBe('2026-10-05T20:45');
  });

  it('reads a typed time in the header zone, the same instant back', () => {
    for (const zone of ['Asia/Tehran', 'UTC', 'America/New_York', 'Asia/Dubai']) {
      setActiveZone(zone);
      expect(fromSiteInput(toSiteInput(INSTANT))).toBe(INSTANT);
    }
  });

  it('sends the instant the operator typed, not the browser reading of it', () => {
    setActiveZone('Asia/Dubai');
    const r = parseCustomRange('2026-10-05T04:00', '2026-10-05T08:00');
    if (typeof r === 'string') throw new Error(r);
    expect(r.from.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-05T04:00:00.000Z');
    expect(toLocalInput(r.from)).toBe('2026-10-05T04:00');
  });

  it('evaluates the window the operator typed, on the 15-minute grid', () => {
    setActiveZone('Asia/Dubai');
    expect(new Date(requestedEnd('2026-10-05T04:07', INSTANT)).toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });

  it('refuses what is not a date', () => {
    setActiveZone('UTC');
    expect(fromSiteInput('')).toBeNaN();
    expect(parseCustomRange('', '')).toBe('Enter both dates.');
  });

  it('falls back to the browser zone before the shell has resolved one', () => {
    expect(siteZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('the plant zone as cplm-api names it', () => {
  it('turns a fixed offset into the name browsers accept', () => {
    expect(browserZoneName('UTC+03:30')).toBe('+03:30');
    expect(browserZoneName('UTC-05:00')).toBe('-05:00');
  });

  it('leaves real zone names alone', () => {
    expect(browserZoneName('Asia/Tehran')).toBe('Asia/Tehran');
    expect(browserZoneName('UTC')).toBe('UTC');
    expect(browserZoneName(null)).toBeUndefined();
  });

  it('never reads a +03:30 plant as UTC', () => {
    const zone = pickZone(null, null, 'UTC+03:30');
    expect(zone).toBe('+03:30');
    setActiveZone(zone);
    expect(toSiteInput(INSTANT)).toBe('2026-10-06T00:15');
    expect(zoneAbbr(zone)).toBe('GMT+3:30');
  });

  it('prefers a loop zone over the plant setting', () => {
    expect(pickZone('Asia/Tehran', null, 'UTC+01:00')).toBe('Asia/Tehran');
  });
});

describe('labels', () => {
  it('prints a range in the header zone', () => {
    setActiveZone('Asia/Tehran');
    expect(fmtRange(new Date(INSTANT), new Date(INSTANT + 3_600_000))).toMatch(/^06 Oct, 12:15 AM/);
  });

  it('reads the clock on a short span, seconds on a very short one', () => {
    setActiveZone('UTC');
    expect(siteAxisTick(3_600_000)(INSTANT)).toBe('20:45');
    expect(siteAxisTick(60_000)(INSTANT)).toBe('20:45:00');
  });

  it('names the day at the site midnight', () => {
    setActiveZone('Asia/Dubai');
    expect(siteAxisTick(3 * 86_400_000)(Date.parse('2026-10-04T20:00:00Z'))).toBe('5 Oct');
  });

  it('keeps the date on a span of days when the tick is not the site midnight', () => {
    setActiveZone('Asia/Tehran');
    expect(siteAxisTick(3 * 86_400_000)(Date.parse('2026-10-05T00:00:00Z'))).toBe('5 Oct 03:30');
  });
});
