// Task 16: the Proof tab's input table. Each measured input with its metric id, value and unit; a value that is not a
// measurement shows its reason and never a 0; a nominal sample count says it is nominal.
import { describe, expect, it } from 'vitest';
import { nominalSamples, proofRows } from './proofRows';
import { methodRun } from './runFixture';

describe('proofRows', () => {
  it('shows measured input, value and unit with the metric id', () => {
    expect(proofRows('G3', methodRun())).toEqual([{ name: 'Mean absolute error', id: 'CPLM-010', value: '0.7103', unit: 'PV units' }]);
  });

  it('shows the reason for a missing value, never 0', () => {
    const rows = proofRows('G5', methodRun({ result: { acf_period_s: 0, gate5_status: 'WARN' } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('CPLM-030');
    expect(rows[0].value).toMatch(/^Not calculated/);
    expect(rows[0].value).toMatch(/no oscillation period found/);
    expect(rows[0].value).not.toMatch(/^0/);
  });

  it('leaves out a calculation this run does not carry', () => {
    expect(proofRows('G5', methodRun({ result: { acf_regularity: 0.82, gate5_status: 'WARN' } })).map(r => r.id)).toEqual(['CPLM-031']);
  });

  it('gives no rows for a gate the catalogue has no calculation for', () => {
    expect(proofRows('G2', methodRun())).toEqual([]);
  });
});

describe('nominalSamples', () => {
  it('is the window divided by the sample period, and absent without a period', () => {
    expect(nominalSamples(methodRun({ support: { fromMs: 0, toMs: 43_200_000, sampleCount: 1 } }), 5)).toBe(8640);
    expect(nominalSamples(methodRun(), null)).toBeNull();
  });
});
