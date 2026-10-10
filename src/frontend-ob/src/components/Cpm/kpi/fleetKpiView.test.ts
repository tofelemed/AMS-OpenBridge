// CHG-082 / KPI Phase 2: the Overview arranges the server's figures — every loop in one bar segment, every tile with a named
// denominator, colour only where it means something.
import { describe, expect, it } from 'vitest';
import type { FleetKpiFigure, FleetKpis } from '../../../api/cpm/fleetKpis';
import { KPI_GROUPS, basisText, denominatorText, kpiTone, pct, reasonLabel, reasonsText, stateSegments } from './fleetKpiView';

const fig = (key: FleetKpiFigure['key'], count: number, denominator = 100): FleetKpiFigure =>
  ({ key, label: key, count, denominator, denominatorLabel: 'assessed loops', rule: 'r' });

const K: FleetKpis = {
  basis: { windowKind: '24h', freshSeconds: 3600, normalModeMin: 0.95, saturationMax: 0.1, g0CompletenessMin: 0.95,
    g0BadQualityMax: 0.5, findingBands: ['SUSPECTED', 'CONFIRMED'], symptomBands: [], noFaultCodes: [], reference: '' },
  computedAt: '2026-10-10T12:00:00Z', monitored: 20,
  states: { assessed: 12, notAssessable: 4, stale: 3, neverEvaluated: 1 },
  notAssessableByReason: [{ reason: 'INCOMPLETE_DATA', count: 3 }, { reason: 'MANUAL_MODE', count: 1 }],
  assessed: { acceptable: 6, noFaultLimited: 1, finding: 4, symptomOnly: 1, unrecognised: 0 },
  kpis: [],
};

describe('fleet KPI view (CHG-082)', () => {
  it('the bar puts every monitored loop in exactly one segment', () => {
    const segs = stateSegments(K);
    expect(segs.reduce((n, s) => n + s.count, 0)).toBe(K.monitored);
    expect(segs.map(s => s.drill)).toEqual(['acceptable', 'finding', 'symptom', 'no-fault-limited', 'not-assessable', 'stale', 'never-evaluated']);
    expect(stateSegments({ ...K, states: { ...K.states, stale: 0 } }).some(s => s.key === 'stale')).toBe(false);
  });

  it('tiles: green for performing, amber for conditions and a stopped pipeline, muted at zero', () => {
    expect(kpiTone(fig('acceptable', 5))).toBe('good');
    expect(kpiTone(fig('oscillating', 3))).toBe('warn');
    expect(kpiTone(fig('oscillating', 0))).toBe('muted');
    expect(kpiTone(fig('stale', 2))).toBe('warn');
    expect(kpiTone(fig('never-evaluated', 9))).toBe('muted');
    // Emerson: fewer than 10 % of loops out of mode is the target
    expect(kpiTone(fig('normal-mode', 91, 100))).toBe('good');
    expect(kpiTone(fig('normal-mode', 90, 100))).toBe('warn');
  });

  it('names the denominator, the reasons and the basis', () => {
    expect(denominatorText(fig('oscillating', 3, 12))).toBe('of 12 assessed loops');
    expect(pct(3, 12)).toBe(25);
    expect(pct(1, 0)).toBe(0);
    expect(reasonsText(K)).toBe('incomplete data 3 · manual mode 1');
    expect(reasonLabel('SOMETHING_ELSE')).toBe('something else');
    expect(basisText(K)).toMatch(/at most 60 min old · normal mode ≥ 95 % · at limit > 10 %/);
  });

  it('groups cover every Overview figure once', () => {
    const keys = KPI_GROUPS.flatMap(g => g.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['acceptable', 'normal-mode', 'oscillating', 'valve', 'effort', 'saturated', 'not-assessable', 'stale', 'never-evaluated']);
  });
});
