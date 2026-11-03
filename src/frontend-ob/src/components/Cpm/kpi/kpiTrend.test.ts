// KPI Phase 5: one KPI's daily series — share per day, "no data" (null) when the day had nothing to judge, never 0 %.
import { describe, expect, it } from 'vitest';
import type { FleetKpiTrend } from '../../../api/cpm/fleetKpis';
import { kpiSeries, plantDayLabel, pointLabel, seriesRange } from './kpiTrend';

const T = {
  basis: {} as FleetKpiTrend['basis'], days: 3, anchor: '2026-10-10T12:00:00Z',
  points: [
    { asOf: '2026-10-08T12:00:00Z', monitored: 10, assessed: 0, kpis: [{ key: 'oscillating', count: 0, denominator: 0 }] },
    { asOf: '2026-10-09T12:00:00Z', monitored: 10, assessed: 6, kpis: [{ key: 'oscillating', count: 2, denominator: 6 }] },
    { asOf: '2026-10-10T12:00:00Z', monitored: 10, assessed: 6, kpis: [{ key: 'oscillating', count: 1, denominator: 6 }] },
  ],
} as FleetKpiTrend;

describe('KPI trend series (Phase 5)', () => {
  it('a day with nothing to judge is no data, not 0 %', () => {
    expect(kpiSeries(T, 'oscillating').map(d => d.pct)).toEqual([null, 33.3, 16.7]);
  });
  it('keeps each day\'s count and denominator for the tooltip and the "matches that day" check', () => {
    expect(kpiSeries(T, 'oscillating')[1]).toMatchObject({ asOf: '2026-10-09T12:00:00Z', count: 2, denominator: 6 });
  });
  it('the range covers only days with data; none at all is null', () => {
    expect(seriesRange(kpiSeries(T, 'oscillating'))).toEqual({ min: 16.7, max: 33.3 });
    expect(seriesRange(kpiSeries(T, 'valve'))).toBeNull();
  });
  it('CHG-102: a stored day is labelled by its plant day (UTC), not by its 00:00 end instant', () => {
    const d = { asOf: '2026-10-11T00:00:00Z', day: '2026-10-10' };
    expect(pointLabel(d)).toBe(new Date('2026-10-10T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }));
    expect(pointLabel(d, true)).toContain('2026');
    expect(kpiSeries(T, 'oscillating')[0].day).toBeNull();
  });

  it('CHG-102: the plant day label names the zone the days are counted in', () => {
    expect(plantDayLabel(undefined)).toBe('UTC day');
    expect(plantDayLabel({})).toBe('UTC day');
    expect(plantDayLabel({ plantDay: { setting: 'UTC', zone: 'UTC', utcOffset: '+00:00' } })).toBe('UTC day');
    expect(plantDayLabel({ plantDay: { setting: 'IR', zone: 'Asia/Tehran', utcOffset: '+03:30' } })).toBe('Asia/Tehran day (UTC+03:30)');
    expect(plantDayLabel({ plantDay: { setting: '+03:30', zone: 'UTC+03:30', utcOffset: '+03:30' } })).toBe('UTC+03:30 day');
  });
});
