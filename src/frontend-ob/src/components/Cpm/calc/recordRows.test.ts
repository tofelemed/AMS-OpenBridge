// Task 20: Record details reads Not reported for anything the payloads do not carry, and finds the evidence-score band.
import { describe, expect, it } from 'vitest';
import { METRICS } from '../calcCatalogue';
import { NOT_REPORTED, recordRows } from './recordRows';

const metric = (id: string) => METRICS.find(m => m.id === id)!;
const get = (rows: Array<[string, string]>, label: string) => rows.find(r => r[0] === label)?.[1];

describe('recordRows', () => {
  it('reads Not reported for every absent fact', () => {
    const rows = recordRows(metric('CPLM-010'), 0.5, { row: undefined, matrix: undefined, catalogue: undefined });
    for (const l of ['Window qualification', 'Evidence-score band', 'Catalogue note', 'Engine', 'Emitted']) expect(get(rows, l)).toBe(NOT_REPORTED);
    expect(get(rows, 'Gate G3 in stored results')).toBe(NOT_REPORTED);
    expect(get(rows, 'Kind')).toBe('Calculation');
    expect(get(rows, 'Stored in')).toMatch(/cplm_long_feature_results/);
  });

  it('names the band of the evidence score and the gate that was observed', () => {
    const catalogue = { note: 'n', gates: [{ key: 'G15', observedInResults: true }], bands: [{ band: 'LOW', maxConfidence: 0.55 }, { band: 'NO_CALL', maxConfidence: 0.35 }] };
    const rows = recordRows(metric('CPLM-090'), 0.4, { row: undefined, matrix: undefined, catalogue: catalogue as never });
    expect(get(rows, 'Evidence-score band')).toBe('LOW (evidence score ≤ 55)');
    expect(get(rows, 'Gate G15 in stored results')).toBe('Observed');
    expect(get(rows, 'Kind')).toBe('Decision');
  });

  it('reports qualification from the feature row', () => {
    const rows = recordRows(metric('CPLM-010'), 1, { row: { long_metrics_qualified: false, created_at: '2026-11-05T13:50:00Z' } as never, matrix: undefined, catalogue: undefined });
    expect(get(rows, 'Window qualification')).toBe('Unqualified');
    expect(get(rows, 'Emitted')).not.toBe(NOT_REPORTED);
  });
});
