// CHG-082 / KPI Phase 3: the proof words — the deciding value against its threshold, the inputs to check next (never a 0
// for a value that was not measured), and the links to the evidence.
import { describe, expect, it } from 'vitest';
import type { FleetKpiRow } from '../../../api/cpm/fleetKpis';
import { commonMeasure, contextText, decidingText, decidingValue, proofLinks, verdictText } from './kpiProof';

const row = (over: Partial<FleetKpiRow>): FleetKpiRow => ({
  loopId: 'FIC1', state: 'Assessed', outcome: 'Finding', windowKind: '24h', windowEnd: '2026-10-10T12:00:00Z', ageSeconds: 600,
  deciding: { label: 'State', value: null, threshold: null, unit: '', comparator: '', measured: false }, inputs: {}, ...over,
});

describe('KPI proof words (CHG-082)', () => {
  it('states the deciding value against its threshold, in the direction it fails or meets', () => {
    expect(decidingText(row({ deciding: { label: 'Time in AUTO / CASCADE', value: 0.62, threshold: 0.95, unit: 'fraction', comparator: '>=', measured: true } })))
      .toBe('Time in AUTO / CASCADE 62 % — below 95 %');
    expect(decidingText(row({ deciding: { label: 'Time in AUTO / CASCADE', value: 0.99, threshold: 0.95, unit: 'fraction', comparator: '>=', measured: true } })))
      .toBe('Time in AUTO / CASCADE 99 % — at or above 95 %');
    expect(decidingText(row({ deciding: { label: 'Time with OP fully open or closed', value: 0.3, threshold: 0.1, unit: 'fraction', comparator: '>', measured: true } })))
      .toBe('Time with OP fully open or closed 30 % — above 10 %');
    expect(decidingText(row({ deciding: { label: 'Sample completeness', value: 0.66, threshold: 0.95, unit: 'fraction', comparator: '<', measured: true } })))
      .toBe('Sample completeness 66 % — below 95 %');
    expect(decidingText(row({ deciding: { label: 'Time in AUTO / CASCADE', value: null, threshold: 0.95, unit: 'fraction', comparator: '>=', measured: false } })))
      .toBe('Time in AUTO / CASCADE: not measured');
  });

  it('a period of an oscillation is "not measured", never 0 s; the saturation basis is named', () => {
    expect(contextText(row({ inputs: { periodS: null, periodStatus: 'NO_VALID_CYCLE' } }), 'oscillating')).toBe('period not measured (no valid cycle)');
    expect(contextText(row({ inputs: { limitSource: 'FALLBACK_0_100' } }), 'saturated')).toMatch(/0–100 % fallback/);
    expect(contextText(row({ state: 'NotAssessable', inputs: { sampleCount: 11481, expectedSampleCount: 17280, maxGapS: 20511 } }), 'not-assessable'))
      .toBe('11481 of 17280 samples · longest gap 342 min');
    expect(contextText(row({ state: 'NotAssessable', lastVerdict: { diagnosis: 'EXCLUDED_MODE', windowEnd: '2026-10-10T12:00:00Z' } }), 'not-assessable'))
      .toBe('', 'an exclusion of the same window is not a "last verdict"');
  });

  it('no evidence score without a verdict; links reach the loop, its window, the formula and the trend', () => {
    expect(verdictText(row({ state: 'NotAssessable', reason: 'INCOMPLETE_DATA', evidenceScore: null }))).toBe('Not assessable — incomplete data');
    expect(verdictText(row({ diagnosis: 'NO_CALL', evidenceScore: 10 }))).toBe('No fault identified · evidence 10');
    const links = proofLinks(row({})).map(l => l.label);
    expect(links).toEqual(['Loop', 'Window', 'Calculations', 'Trend']);
    expect(proofLinks(row({ state: 'NeverEvaluated', windowEnd: null })).map(l => l.label)).toEqual(['Loop']);
    expect(proofLinks(row({})).find(l => l.label === 'Window')!.href).toBe('/cpm/windows?loop=FIC1&profile=24h&window=2026-10-10T12%3A00%3A00Z');
  });
});

describe('each fact once in a row (CHG-132)', () => {
  const age = (value: number | null) => row({ state: 'Stale', ageSeconds: 7200,
    deciding: { label: 'Age of the newest result', value, threshold: 3600, unit: 'seconds', comparator: '<=', measured: value != null } });

  it('gives the value without the name of the measure', () => {
    expect(decidingValue(age(7200))).toBe('2 h — above 60 min');
    expect(decidingText(age(7200))).toBe('Age of the newest result 2 h — above 60 min');
    expect(decidingValue(age(null))).toBe('not measured');
    expect(decidingText(age(null))).toBe('Age of the newest result: not measured');
    expect(decidingValue(row({ state: 'NeverEvaluated' }))).toBe('No result yet');
  });

  it('names the measure once only when every row shares it', () => {
    expect(commonMeasure([age(1), age(2)])).toBe('Age of the newest result');
    expect(commonMeasure([age(1), row({})])).toBeNull();
    expect(commonMeasure([row({})])).toBeNull();
    expect(commonMeasure([])).toBeNull();
  });

  it('a stale verdict is one word; the age stays in Measured', () => {
    expect(verdictText(age(7200))).toBe('Stale');
  });
});

describe('why a no-fault loop is not performing acceptably (CHG-093, SME review 2 #12)', () => {
  it('names every missed performance criterion', () => {
    const r = row({ state: 'Assessed', diagnosis: 'NO_CALL', limitedBy: ['G3_BELOW_FLOOR', 'G4_STRONG'],
      inputs: { goodErrorPct: 0.42, g4Status: 'STRONG', manualPct: 0 } });
    expect(contextText(r, 'no-fault-limited'))
      .toBe('limited by: good-error share below the floor (G3), strong actuator activity (G4) · good-error 42 % · G4 strong · manual 0 %');
  });
});
