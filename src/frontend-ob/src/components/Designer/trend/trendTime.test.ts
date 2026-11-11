/** CHG-175: every time the trend engine prints is in one zone and one format. */
import { afterEach, describe, expect, it } from 'vitest';
import { axisTickIn, browserZone, cursorTime, ticksInUtc, zoneOf } from './trendTime';
import { setActiveZone } from '../../../cpa/activeZone';
import { siteAxisTick } from '../../../cpa/siteTime';

const H = 3_600_000;
const T = (iso: string) => Date.parse(iso);

afterEach(() => setActiveZone(undefined as unknown as string));

describe('the zone', () => {
  it('reads the Designer display zone "local" as the browser zone', () => {
    expect(zoneOf('local')).toBe(browserZone());
    expect(zoneOf(undefined)).toBe(browserZone());
  });
  it('keeps a valid zone and falls back to UTC on an invalid one', () => {
    expect(zoneOf('Asia/Tehran')).toBe('Asia/Tehran');
    expect(zoneOf('Mars/Olympus')).toBe('UTC');
  });
  it('places ticks on the browser clock only when the chart is in the browser zone', () => {
    expect(ticksInUtc(browserZone())).toBe(false);
    expect(ticksInUtc(browserZone() === 'UTC' ? 'Asia/Dubai' : 'UTC')).toBe(true);
  });
});

describe('axis ticks', () => {
  it('carry no seconds on a 12 h window and a date where a day starts', () => {
    const tick = axisTickIn(12 * H, 'UTC');
    expect(tick(T('2026-11-06T11:00:00Z'))).toBe('11:00');
    expect(tick(T('2026-11-07T00:00:00Z'))).toBe('7 Nov');
  });
  it('read dates on a 7-day window, not seven times 00:00:00', () => {
    const tick = axisTickIn(7 * 24 * H, 'UTC');
    expect([5, 6, 7].map(d => tick(Date.UTC(2026, 10, d)))).toEqual(['5 Nov', '6 Nov', '7 Nov']);
  });
  it('carry seconds under ten minutes on screen', () => {
    expect(axisTickIn(5 * 60_000, 'UTC')(T('2026-11-06T11:02:30Z'))).toBe('11:02:30');
  });
  it('are read in the zone given', () => {
    expect(axisTickIn(12 * H, 'Asia/Dubai')(T('2026-11-06T11:00:00Z'))).toBe('15:00');
  });
  it('leave the site tick of the other pages as it was', () => {
    setActiveZone('UTC');
    expect(siteAxisTick(12 * H)(T('2026-11-06T11:00:00Z'))).toBe('11:00');
    expect(siteAxisTick(7 * 24 * H)(T('2026-11-06T11:00:00Z'))).toBe('6 Nov 11:00');
  });
});

describe('the cursor time', () => {
  it('reads day and minute in the zone', () => {
    expect(cursorTime(T('2026-11-06T20:32:41Z'), 12 * H, 'UTC')).toBe('6 Nov 20:32');
    expect(cursorTime(T('2026-11-06T20:32:41Z'), 12 * H, 'Asia/Dubai')).toBe('7 Nov 00:32');
  });
  it('adds seconds when the axis does', () => {
    expect(cursorTime(T('2026-11-06T20:32:41Z'), 5 * 60_000, 'UTC')).toBe('6 Nov 20:32:41');
  });
});
