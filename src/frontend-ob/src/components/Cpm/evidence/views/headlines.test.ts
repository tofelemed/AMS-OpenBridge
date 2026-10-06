// v2.5 workbench: the verdict card's key numbers per gate, read from the primary artifact's provenance
// (never derived), formatted through fmtQuantity (the raw text kept beside), at most five, none when the artifact is absent.
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
      { label: 'Regularity', value: '1.000' },
      { label: 'Accepted cycles', value: '33' },
    ]);
  });

  it('G7: accepted of total cycles; G9: polygons and mean area', () => {
    const ok = decoded({ gate: 'G7', kind: 'cycle_fit', x: [0], y: [0], provenance: { accepted: 'true', cycle_id: '0' } });
    const bad = decoded({ gate: 'G7', kind: 'cycle_fit', x: [0], y: [0], provenance: { accepted: 'false', cycle_id: '1', reject_reason: 'FLAT' } });
    expect(headlineOf('G7', arts({ cycle_fit: [ok, bad] }))).toEqual([{ label: 'Accepted cycles', value: '1 of 2' }]);
    const p = decoded({ gate: 'G9', kind: 'cycle_polygon', x: [0], y: [0], provenance: { area: '0.5', bbox_area: '1' } });
    expect(headlineOf('G9', arts({ cycle_polygon: [p, p] }))).toEqual([{ label: 'Cycle polygons', value: '2' }, { label: 'Mean area', value: '0.500' }]);
  });

  it('G13 and G15: the record states', () => {
    const i = decoded({ gate: 'G13', kind: 'interaction', x: [0], y: [0], provenance: { state: 'UNAVAILABLE', capability_state: 'INSTALLED', peer_ids: '', reason: 'NO_PEER_LINKS' } });
    expect(headlineOf('G13', arts({ interaction: [i] }))).toMatchObject([{ label: 'State', value: 'Unavailable' }, { label: 'Peers', value: '0' }]);
    const d = decoded({ gate: 'G15', kind: 'decision_record', x: [0], y: [0], provenance: { leading_hypothesis: 'STICTION', case_state: 'OPEN', condition_state: 'OPEN' } });
    expect(headlineOf('G15', arts({ decision_record: [d] }))).toMatchObject([{ label: 'Leading cause', value: 'Valve stiction / nonlinearity', raw: 'STICTION' }, { label: 'Case', value: 'Open' }, { label: 'Open condition', value: 'Open' }]);
  });

  it('is empty for an unknown gate or a missing artifact', () => {
    expect(headlineOf('G99', arts({}))).toEqual([]);
    expect(headlineOf('G5', arts({}))).toEqual([]);
  });
});
