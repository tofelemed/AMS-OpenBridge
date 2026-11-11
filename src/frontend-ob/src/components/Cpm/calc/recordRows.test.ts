// Task 20: Record details reads Not reported for anything the payloads do not carry, and finds the evidence-score band.
// CHG-166 (owner review): Engine, Emitted, Catalogue note and Kind are gone (said elsewhere, or the page's name); the
// evidence-score band is a row only on the fused score, the one metric on that scale.
import { describe, expect, it } from 'vitest';
import { METRICS } from '../calcCatalogue';
import { NOT_REPORTED, recordRows } from './recordRows';

const metric = (id: string) => METRICS.find(m => m.id === id)!;
const get = (rows: Array<[string, string]>, label: string) => rows.find(r => r[0] === label)?.[1];
const labels = (rows: Array<[string, string]>) => rows.map(r => r[0]);

describe('recordRows', () => {
  it('holds qualification, the gate in stored results and where the value is stored', () => {
    const rows = recordRows(metric('CPLM-010'), 0.5, { row: undefined, catalogue: undefined });
    expect(labels(rows)).toEqual(['Window qualification', 'Gate G3 in stored results', 'Stored in']);
    expect(get(rows, 'Window qualification')).toBe(NOT_REPORTED);
    expect(get(rows, 'Gate G3 in stored results')).toBe(NOT_REPORTED);
    expect(get(rows, 'Stored in')).toMatch(/cplm_long_feature_results/);
  });

  it('drops Engine, Emitted, Catalogue note and Kind', () => {
    const catalogue = { note: 'n', gates: [], bands: [] };
    const rows = recordRows(metric('CPLM-010'), 1, { row: { created_at: '2026-11-05T13:50:00Z' } as never, catalogue: catalogue as never });
    for (const l of ['Engine', 'Emitted', 'Catalogue note', 'Kind', 'Evidence-score band']) expect(labels(rows)).not.toContain(l);
  });

  it('names the band of the fused evidence score and the gate that was observed', () => {
    const catalogue = { note: 'n', gates: [{ key: 'G15', observedInResults: true }], bands: [{ band: 'LOW', maxConfidence: 0.55 }, { band: 'NO_CALL', maxConfidence: 0.35 }] };
    const rows = recordRows(metric('CPLM-090'), 0.4, { row: undefined, catalogue: catalogue as never });
    expect(labels(rows)).toEqual(['Window qualification', 'Evidence-score band', 'Gate G15 in stored results', 'Stored in']);
    expect(get(rows, 'Evidence-score band')).toBe('LOW (evidence score ≤ 55)');
    expect(get(rows, 'Gate G15 in stored results')).toBe('Observed');
    expect(get(rows, 'Stored in')).toBe('cplm_gate_results');
  });

  it('reads Not reported for the band of a fused score with no value', () => {
    const rows = recordRows(metric('CPLM-090'), null, { row: undefined, catalogue: undefined });
    expect(get(rows, 'Evidence-score band')).toBe(NOT_REPORTED);
  });

  it('reports qualification from the feature row', () => {
    const rows = recordRows(metric('CPLM-010'), 1, { row: { long_metrics_qualified: false } as never, catalogue: undefined });
    expect(get(rows, 'Window qualification')).toBe('Unqualified');
  });
});
