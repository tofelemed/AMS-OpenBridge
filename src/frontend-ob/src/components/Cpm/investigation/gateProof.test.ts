// CHG-141: the values a gate's Calculation proof shows and the line under an opened gate. A placeholder never reads as a measurement.
import { describe, expect, it } from 'vitest';
import type { CpmGateCell, CpmGateMatrix } from '../../../api/cpm/gates';
import { row } from '../evidence/windowFixtures';
import { gateDetail, gateValues } from './gateProof';

const END = '2026-11-05T10:15:00Z';
const cell = (key: string, status: string, reason: string | null = null): CpmGateCell => ({ key, name: key, tier: 'short', status, reason });
const verdict = (over: Record<string, unknown>) => ({ legacy: false, ...over }) as unknown as CpmGateMatrix['verdictV2'];

describe('gateValues', () => {
  it('lists the gate\'s stored calculations by their catalogue names', () => {
    const m = row(END, { diagnosis: 'CONFIRMED_OSCILLATION', gates: [cell('G5', 'WARN')], metrics: { acf_period_s: 180, acf_regularity: 0.82 } });
    const values = gateValues('G5', m);
    expect(values.map(v => v.label)).toEqual(['Oscillation period (ACF)', 'Oscillation regularity']);
    expect(values[1].value).not.toBe('—');
  });

  it('shows a value that is not a measurement by its state, never as a number', () => {
    const m = row(END, { diagnosis: 'CONFIRMED_OSCILLATION', gates: [cell('G5', 'NOT_EVALUATED')], metrics: { acf_period_s: 0, acf_regularity: 0.82 } });
    expect(gateValues('G5', m)[0].value).toBe('Not calculated');
  });

  it('marks every value N/A on an excluded window', () => {
    const m = row(END, { diagnosis: 'EXCLUDED_MODE', gates: [cell('G5', 'PASS')], metrics: { acf_period_s: 180 } });
    expect(gateValues('G5', m)[0].value).toBe('N/A');
  });

  it('leaves out a field this row does not carry', () => {
    const m = row(END, { diagnosis: 'CONFIRMED_OSCILLATION', metrics: { mae: 1.5 } });
    expect(gateValues('G3', m).map(v => v.label)).toEqual(['Mean absolute error']);
  });

  it('reads G10 and G11 from their own quantities', () => {
    const m = row(END, { diagnosis: 'EXCLUDED_MODE', metrics: { sat_limit_dwell_s: 3600, saturation_pct: 0.5 } });
    expect(gateValues('G10', m).map(v => v.label)).toEqual(['Time at an output limit', 'Saturated samples']);
    expect(gateValues('G10', m)[1].value).toBe('50.0 %');
  });

  it('never claims no threshold is configured: this page has not read the configuration', () => {
    const m = row(END, { diagnosis: 'EXCLUDED_MODE', metrics: { sat_limit_dwell_s: 3600 } });
    expect(gateValues('G10', m)[0].value).not.toMatch(/threshold/);
  });

  it('calls the score an evidence score and says it is not a probability', () => {
    const m = row(END, { diagnosis: 'CONFIRMED_OSCILLATION', confidence: 1 });
    const [score] = gateValues('G15', m);
    expect(score.label).toMatch(/^Evidence score/);
    expect(score.value).toMatch(/100 of 100/);
    expect(score.value).toMatch(/not a probability/);
  });

  it('gives no values for a gate that reports a state', () => {
    expect(gateValues('G2', row(END, { diagnosis: 'CONFIRMED_OSCILLATION' }))).toEqual([]);
  });
});

describe('gateDetail', () => {
  it('says the reason in words', () => {
    const m = row(END, { gates: [cell('G12', 'NOT_EVALUATED', 'NO_STEP_TEST')] });
    expect(gateDetail('G12', m)).toBe('No approved step test is on record.');
  });

  it('falls back to what the mark means', () => {
    expect(gateDetail('G5', row(END, { gates: [cell('G5', 'PASS')] }))).toBe('Symptom not seen by this method.');
  });

  it('says what a pass was judged without', () => {
    const m = row(END, { gates: [cell('G11', 'PASS')] });
    expect(gateDetail('G11', m, { flags: ['HEALTH_NOT_CONFIGURED'] })).toMatch(/no transmitter health source/);
  });

  it('gives G14 the sentence that says what the confirmation means', () => {
    const m = row(END, {
      gates: [cell('G14', 'NOT_CONFIRMED', 'NO_VP')],
      verdictV2: verdict({ confirmation: { state: 'NOT_CONFIRMED', reason: 'NO_VP' } }),
    });
    expect(gateDetail('G14', m, { vpAbsentOnLoop: true })).toMatch(/This loop has no valve position/);
    expect(gateDetail('G14', m)).toMatch(/Without a valve-position \(VP\) signal/);
  });
});
