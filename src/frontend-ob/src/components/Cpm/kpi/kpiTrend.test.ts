// KPI Phase 5: one KPI's daily series — share per day, "no data" (null) when the day had nothing to judge, never 0 %.
import { describe, expect, it } from 'vitest';
import type { FleetKpiTrend } from '../../../api/cpm/fleetKpis';
import { kpiSeries, seriesRange } from './kpiTrend';

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
});
