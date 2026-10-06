// SME review #19 (CHG-055): measured value against the threshold that applied — a requirement gets ✓ / ✕,
// a detection threshold a position, a missing threshold says so, a placeholder is not a value.
import { describe, expect, it } from 'vitest';
import { whyRows } from './whyRules';
import type { CpmGateMatrix } from '../../../api/cpm/gates';

const cfg: Record<string, unknown> = {
  'G5.min_complete_cycles': 5, 'G5.regularity_min': 0.1, 'G5.period_min_s': 10, 'G5.period_max_s': 900, 'G5.min_samples_per_period': 8,
  'G4.activity_warn_ratio': 3, 'G4.activity_high_ratio': 8, 'G7.shape_score_high': 0.8,
};
const row = (metrics: Record<string, number>, gates: Array<{ key: string; status: string }> = []) => ({
  diagnosis: 'CONFIRMED_OSCILLATION', metrics, gates, observabilityFlags: [], familyDisqualifiers: [],
}) as unknown as CpmGateMatrix;
const src = (prov: Record<string, string>, r?: CpmGateMatrix, detail: string | null = null) =>
  ({ prov: (_k: string, key: string) => prov[key], row: r, cfg: (p: string) => cfg[p], eligibilityDetail: detail });

describe('whyRows', () => {
  it('G5: requirements with ✓ / ✕, the period in its resolvable range, the sampling limit', () => {
    const rows = whyRows('G5', src({ accepted_cycles: '33', regularity: '1.0', period_s: '290.23' }, undefined, '3.4 samples per 17 s period < 4 (declared 5 s)'));
    expect(rows.map(r => [r.label, r.value, r.against, r.ok])).toEqual([
      ['Accepted cycles', '33', '≥ 5 required', true],
      ['Regularity', '1', '≥ 0.1 required', true],
      ['Oscillation period', '4.8 min', '10 s – 15 min resolvable', true],
      ['Sampling', '3.4 samples per 17 s period < 4 (declared 5 s)', '≥ 8 samples per period required', false],
    ]);
  });

  it('G4: a detection threshold reads as a position, from the engine copy in the row first', () => {
    const [r] = whyRows('G4', src({}, row({ effort_ratio: 2.49, gate4_warn_ratio: 3, gate4_high_ratio: 8 }, [{ key: 'G4', status: 'PASS' }])));
    expect(r).toEqual({ label: 'Actuator activity (effort ratio)', value: '2.49 — below the attention level', against: 'attention at 3 · high at 8', ok: null });
  });

  it('says when no threshold is configured, and never shows a placeholder as a value', () => {
    const rows = whyRows('G7', src({}, row({ valid_cycles: 0, triangularity: 0 }, [{ key: 'G7', status: 'NOT_EVALUATED' }])));
    expect(rows[0]).toMatchObject({ label: 'Valid cycles', value: '0', against: 'no threshold configured for this profile', ok: null });
    expect(rows[1]).toMatchObject({ label: 'Triangular OP waveform (shape score)', value: 'Not calculated (G7 not evaluated)' });
  });

  it('G15: persistence from the engine fields', () => {
    const [r] = whyRows('G15', src({}, row({ persistence_agree_count: 3, persistence_windows_required: 3 })));
    expect(r).toEqual({ label: 'Agreeing windows (persistence)', value: '3', against: '≥ 3 required to persist', ok: true });
  });
});
