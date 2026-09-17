// v2.5 workbench: the status / reason of a gate come from the fused row's cell when the run is a fusion
// run, and from the tier row's payload (gateN_status) otherwise; the parameters a run used are its
// artifacts' provenance with labels and formatted values; the identity block is one list, not prose.
import { describe, expect, it } from 'vitest';
import type { EvidenceManifest, MethodRun } from '../../../api/cpm/evidence';
import { gateReasonOf, gateStatusOf, identityOf, parametersOf } from './gateFacts';

const run = (over: Partial<MethodRun>): MethodRun => ({
  methodRunId: 'r', tier: 'short', gate: 'G3', loopId: 'FIC10302', site: 'hdpe', windowKind: '5m', gateResultId: null,
  support: { fromMs: 0, toMs: 300_000, sampleCount: 61 },
  identity: { bundleHash: 'profile:ffa30188e0775f18', contextRevision: 0, resultRevision: 1, purpose: 'LIVE', analysisRunId: null, sourceCommit: '3535c78aa45a0000', jarSha256: '4ea1da78ead80000', datasetHash: '35fa0ee2b0abd44f', source: 'flink' },
  cell: null, verdictV2: null, result: null, methodRunIds: {}, reconstruction: { supported: true, reason: '' }, computedAt: '2026-09-17T08:00:00Z',
  ...over,
});

describe('gate facts', () => {
  it('reads the fused cell first, then the tier payload (G2r spells gate2r_status)', () => {
    expect(gateStatusOf(run({ tier: 'fusion', cell: { key: 'G5', name: 'Oscillation', tier: 'long', status: 'WARN', reason: 'BANDWIDTH' } }), 'G5')).toBe('WARN');
    expect(gateReasonOf(run({ tier: 'fusion', cell: { key: 'G5', name: 'Oscillation', tier: 'long', status: 'WARN', reason: 'BANDWIDTH' } }), 'G5')).toBe('BANDWIDTH');
    expect(gateStatusOf(run({ result: { gate3_status: 'FAIL', gate0_reason: 'QUALITY_UNKNOWN' } }), 'G3')).toBe('FAIL');
    expect(gateStatusOf(run({ result: { gate2r_status: 'PASS' } }), 'G2r')).toBe('PASS');
    expect(gateReasonOf(run({ result: { gate0_status: 'FAIL', gate0_reason: 'QUALITY_UNKNOWN' } }), 'G0')).toBe('QUALITY_UNKNOWN');
    expect(gateStatusOf(undefined, 'G3')).toBeNull();
  });

  it('lists the parameters of the gate with labels and formatted values, raw key and value kept', () => {
    const manifest = { artifacts: [
      { gate: 'G5', kind: 'acf_series', provenance: { period_s: '290.23199999999997', regularity: '1.0', accepted_cycles: '33', loop_id: 'x', window_kind: '24h', column_units: '{}' } },
      { gate: 'G5', kind: 'preprocessed_signal', provenance: { preprocessing: 'LINEAR_DETREND;SUBTRACT_MEAN' } },
      { gate: 'G6', kind: 'psd', provenance: { fft_size: '4096' } },
    ] } as unknown as EvidenceManifest;
    const p = parametersOf(manifest, 'G5');
    expect(p.map(x => x.label)).toEqual(['Accepted cycles', 'ACF period', 'Regularity', 'Preprocessing']);
    expect(p.find(x => x.key === 'acf_series.period_s')).toMatchObject({ raw: '290.23199999999997', text: '290.2 s', kind: 'acf_series' });
    expect(p.find(x => x.label === 'Preprocessing')!.text).toBe('LINEAR_DETREND · SUBTRACT_MEAN');
    expect(p.some(x => x.key.includes('loop_id'))).toBe(false);
    // per-item artifacts (one per cycle) are results, not parameters
    const perCycle = { artifacts: [
      { gate: 'G9', kind: 'cycle_polygon', provenance: { cycle_id: '0', area: '1' } }, { gate: 'G9', kind: 'cycle_polygon', provenance: { cycle_id: '1', area: '2' } },
      { gate: 'G9', kind: 'corners', provenance: { mask: 'x' } },
    ] } as unknown as EvidenceManifest;
    expect(parametersOf(perCycle, 'G9')).toEqual([]);
  });

  it('names the identity of a run as labelled values', () => {
    const rows = identityOf(run({}));
    expect(rows.map(r => r.label)).toEqual(['Run', 'Build commit', 'Jar', 'Bundle', 'Dataset', 'Source', 'Purpose', 'Revisions']);
    expect(rows[0].value).toBe('r');
    expect(rows[7].value).toBe('context r0 · result r1');
  });
});
