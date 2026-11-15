// v2.5 workbench: the verdict card's key numbers per gate, read from the primary artifact's provenance
// (never derived), formatted through fmtQuantity (the raw text kept beside), at most five, none when the artifact is absent.
// CHG-187 (owner review 11.2): each card has its ? tip; a card that is a stored calculation names its field (so the Proof
// table leaves it out); G8 shows its measure; no artifact is never a 0.
import { describe, expect, it } from 'vitest';
import { decoded } from './fixtures';
import { headlineOf } from './headlines';
import type { GateArtifacts } from '../useGateArtifacts';

const arts = (byKind: Record<string, ReturnType<typeof decoded>[]>): GateArtifacts => ({ byKind, loading: false, errors: [], unavailable: [] });

describe('headlineOf', () => {
  it('G5: period, regularity and accepted cycles from the ACF artifact', () => {
    const a = arts({ acf_series: [decoded({ gate: 'G5', kind: 'acf_series', x: [0, 1], y: [1, 0.5], provenance: { period_s: '290.23199999999997', regularity: '1.0', accepted_cycles: '33', regularity_method: 'ACF_PEAK_REGULARITY_V1' } })] });
    expect(headlineOf('G5', a)).toMatchObject([
      { label: 'ACF period', value: '290.2', unit: 's' },
      { label: 'Regularity', value: '1.00' },
      { label: 'Accepted cycles', value: '33' },
    ]);
  });

  it('G7: accepted of total cycles; G9: polygons and mean area', () => {
    const ok = decoded({ gate: 'G7', kind: 'cycle_fit', x: [0], y: [0], provenance: { accepted: 'true', cycle_id: '0' } });
    const bad = decoded({ gate: 'G7', kind: 'cycle_fit', x: [0], y: [0], provenance: { accepted: 'false', cycle_id: '1', reject_reason: 'FLAT' } });
    expect(headlineOf('G7', arts({ cycle_fit: [ok, bad] }))).toMatchObject([{ label: 'Accepted cycles', value: '1 of 2' }]);
    const p = decoded({ gate: 'G9', kind: 'cycle_polygon', x: [0], y: [0], provenance: { area: '0.5', bbox_area: '1' } });
    expect(headlineOf('G9', arts({ cycle_polygon: [p, p] }))).toMatchObject([{ label: 'Cycle polygons', value: '2' }, { label: 'Mean area', value: '0.50' }]);
  });

  it('G7: cycle_scores (every cycle) wins over the capped cycle_fit artifacts', () => {
    const fit = decoded({ gate: 'G7', kind: 'cycle_fit', x: [0], y: [0], provenance: { accepted: 'false', cycle_id: '0' } });
    const scores = decoded({ gate: 'G7', kind: 'cycle_scores', x: [0, 1, 2, 3], y: [0.1, 0.9, 0.8, 0.2], columns: { accepted: [0, 1, 1, 0] } });
    expect(headlineOf('G7', arts({ cycle_fit: [fit], cycle_scores: [scores] }))).toMatchObject([{ label: 'Accepted cycles', value: '2 of 4' }]);
    expect(headlineOf('G7', arts({ cycle_scores: [scores] }))).toMatchObject([{ label: 'Accepted cycles', value: '2 of 4' }]);
  });

  it('G13 and G15: the record states', () => {
    const i = decoded({ gate: 'G13', kind: 'interaction', x: [0], y: [0], provenance: { state: 'UNAVAILABLE', capability_state: 'INSTALLED', peer_ids: '', reason: 'NO_PEER_LINKS' } });
    expect(headlineOf('G13', arts({ interaction: [i] }))).toMatchObject([{ label: 'State', value: 'Unavailable' }, { label: 'Peers', value: '0' }]);
    const d = decoded({ gate: 'G15', kind: 'decision_record', x: [0], y: [0], provenance: { leading_hypothesis: 'STICTION', case_state: 'OPEN', condition_state: 'OPEN' } });
    expect(headlineOf('G15', arts({ decision_record: [d] }))).toMatchObject([{ label: 'Possible cause', value: 'Valve stiction / nonlinearity', raw: 'STICTION' }, { label: 'Case', value: 'Open' }, { label: 'Open condition', value: 'Open' }]);
  });

  it('G5: the period and regularity name their calculations, and read the run\'s own when no artifact is held', () => {
    const a = arts({ acf_series: [decoded({ gate: 'G5', kind: 'acf_series', x: [0], y: [1], provenance: { period_s: '280.5', regularity: '1.0', accepted_cycles: '71' } })] });
    expect(headlineOf('G5', a).map(h => h.field)).toEqual(['acf_period_s', 'acf_regularity', undefined]);
    expect(headlineOf('G5', a).every(h => !!h.tip)).toBe(true);
    const metric = (f: string) => ({ acf_period_s: 1844.8, acf_regularity: 1 } as Record<string, number>)[f];
    expect(headlineOf('G5', arts({}), metric)).toMatchObject([
      { label: 'ACF period', value: '1844.8', unit: 's', field: 'acf_period_s' }, { label: 'Regularity', value: '1.00', field: 'acf_regularity' },
    ]);
  });

  it('G8: the measure (Horch oddness) in place of the method, bicoherence and capability cards', () => {
    const lag = decoded({ gate: 'G8', kind: 'lag_structure', x: [0], y: [0], provenance: { method_id: 'G8.XCORR_ASYMMETRY_V1', bicoherence: 'NOT_INSTALLED', capability_reason: 'BISPECTRAL_ESTIMATOR_NOT_INSTALLED' } });
    const h = headlineOf('G8', arts({ lag_structure: [lag] }), f => (f === 'horch_oddness' ? 0.8107 : undefined));
    expect(h).toMatchObject([{ label: 'Horch oddness', value: '0.81', unit: 'score', field: 'horch_oddness' }]);
    expect(h[0].tip).toMatch(/not an odd-harmonic spectrum/);
    expect(JSON.stringify(h)).not.toMatch(/Method|Bicoherence|Capability|installed/i);
  });

  it('G15: the decision as five cards, the qualified support among them; G14 names its reason', () => {
    const d = decoded({ gate: 'G15', kind: 'decision_record', x: [0], y: [0], provenance: { leading_hypothesis: 'OSCILLATION_TUNING', case_state: 'CONFIRMED_OSCILLATION', condition_state: 'NONE_OPEN', availability: 'HEALTH_NOT_CONFIGURED', qualified_support: '41760000' } });
    expect(headlineOf('G15', arts({ decision_record: [d] })).map(x => x.label)).toEqual(['Possible cause', 'Case', 'Open condition', 'Availability', 'Qualified support']);
    const c = decoded({ gate: 'G14', kind: 'confirmation_record', x: [0], y: [0], provenance: { state: 'NOT_APPLICABLE', claim_type: 'FINAL_ELEMENT_NON_FOLLOWING', reason: 'NOT_A_FINAL_ELEMENT_CLAIM', scope: 'VP tracking', non_following_dwell_s: '0' } });
    expect(headlineOf('G14', arts({ confirmation_record: [c] })).map(x => x.label)).toEqual(['State', 'Claim', 'Reason', 'Scope', 'Non-following dwell']);
  });

  it('never makes a 0 out of a missing record (G6, G10, G11, G13 counted from nothing before)', () => {
    for (const g of ['G6', 'G10', 'G11', 'G13', 'G8']) expect(headlineOf(g, arts({}))).toEqual([]);
  });

  it('is empty for an unknown gate or a missing artifact', () => {
    expect(headlineOf('G99', arts({}))).toEqual([]);
    expect(headlineOf('G5', arts({}))).toEqual([]);
  });
});
