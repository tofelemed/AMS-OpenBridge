// v2.5 Task 2E.1 (spec §3.1 axes: "UTC/site-time x"): times are shown in the SITE zone with the zone
// visible, DST-safe, and the site zone comes from the registry (UTC when it declares none).
import { describe, it, expect } from 'vitest';
import { formatInZone, zoneLabel, siteZoneOf } from './timezone';

describe('timezone', () => {
  it('formats across a DST boundary in the site zone', () => {
    // Europe/Oslo switched to summer time on 2026-03-29 at 01:00Z
    expect(formatInZone(Date.UTC(2026, 2, 29, 0, 30), 'Europe/Oslo')).toBe('2026-03-29 01:30:00');
    expect(formatInZone(Date.UTC(2026, 2, 29, 2, 30), 'Europe/Oslo')).toBe('2026-03-29 04:30:00');
  });
  it('labels the zone with its offset at that instant', () => {
    expect(zoneLabel('Europe/Oslo', Date.UTC(2026, 2, 29, 0, 30))).toBe('Europe/Oslo (UTC+01:00)');
    expect(zoneLabel('Europe/Oslo', Date.UTC(2026, 2, 29, 2, 30))).toBe('Europe/Oslo (UTC+02:00)');
    expect(zoneLabel('UTC', 0)).toBe('UTC (UTC+00:00)');
  });
  it('falls back to UTC when the registry declares no zone or an invalid one', () => {
    expect(siteZoneOf({ timezone: 'Asia/Dubai' })).toBe('Asia/Dubai');
    expect(siteZoneOf({ timezone: null })).toBe('UTC');
    expect(siteZoneOf({ timezone: 'Mars/Olympus' })).toBe('UTC');
    expect(siteZoneOf(undefined)).toBe('UTC');
  });
});
