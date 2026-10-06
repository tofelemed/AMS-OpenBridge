// v2.5 workbench: the evaluated windows of one loop as picker options - fused rows (12h/24h summary
// rows) and short / long feature rows (KPI rows with their run ids) in ONE shape, newest first, each
// labelled with its state and age; the landing picks the newest window that carries run ids.
import { describe, expect, it } from 'vitest';
import { findOptionOfRun, fusedOptions, kpiOptions, neighbours, resolveLanding } from './useEvidenceWindows';
import type { CpmWindowSummary } from '../../../api/cpm/gates';
import type { CpmKpiRow } from '../../../api/cpm/kpis';

const NOW = Date.UTC(2026, 8, 17, 8, 20);
const summary = (over: Partial<CpmWindowSummary>): CpmWindowSummary => ({
  loopId: 'FIC10405', windowKind: '24h', windowStart: '2026-09-16T08:00:00Z', windowEnd: '2026-09-17T08:00:00Z', sampleCount: 1977,
  diagnosis: 'INSUFFICIENT_DATA', severity: null, confidence: null,
  gates: [{ key: 'G5', status: 'WARN', reason: 'BANDWIDTH', methodRunId: 'g5' }], methodRunIds: { G5: 'g5', G15: 'g15' }, bundleHash: 'b', resultRevision: 1,
  observabilityFlags: ['NO_VP'], familyDisqualifiers: [], insufficientEvidenceReason: 'INSUFFICIENT_SAMPLES', methodEligibility: null, computedAt: '2026-09-17T08:01:00Z', jarSha256: 'j',
  ...over,
});

describe('fusedOptions', () => {
  it('labels an insufficient window with its reason and age, a verdict with its confidence, and flags rows without run ids', () => {
    const rows = [
      summary({}),
      summary({ windowEnd: '2026-09-02T20:45:00Z', diagnosis: 'SUSPECTED_FINAL_ELEMENT_NONLINEARITY', confidence: 0.89, insufficientEvidenceReason: null, methodRunIds: {}, gates: [] }),
    ];
    const o = fusedOptions(rows, NOW, 'UTC');
    expect(o[0].label).toBe('ends 2026-09-17 08:00:00 · INSUFFICIENT DATA (INSUFFICIENT_SAMPLES) · 20 min ago');
    expect(o[0].tone).toBe('muted');
    expect(o[0].hasRunIds).toBe(true);
    expect(o[0].gates[0]).toEqual({ key: 'G5', status: 'WARN', reason: 'BANDWIDTH' });
    expect(o[1].label).toMatch(/^ends 2026-09-02 20:45:00 · Valve nonlinearity \(stiction\) suspected 89% · 14\.5 d ago · no run identity \(pre-v2\.5\)$/);
    expect(o[1].hasRunIds).toBe(false);
    expect(o[1].tone).toBe('bad');
  });
});

describe('kpiOptions', () => {
  it('turns short KPI rows into the same shape: run ids parsed, the gate statuses from gateN_status, the worst status in the label', () => {
    const rows: CpmKpiRow[] = [
      { window_start: '2026-09-17T08:00:00Z', window_end: '2026-09-17T08:15:00Z', sample_count: 180, created_at: '2026-09-17T08:15:02Z', sufficient_data: true,
        gate0_status: 'PASS', gate1_status: 'PASS', gate2_status: 'PASS', gate2r_status: 'PASS', gate3_status: 'WARN', gate4_status: 'PASS', gate0_reason: null, evaluation_state: 'EVALUATED', evaluation_reason: null,
        method_run_ids: '{"G0":"a","G3":"b"}', bundle_hash: 'bh', purpose: 'LIVE' },
      { window_start: null, window_end: '2026-09-17T07:45:00Z', sample_count: 0, created_at: 'x', sufficient_data: false, gate0_status: 'FAIL', gate0_reason: 'QUALITY_UNKNOWN', evaluation_state: 'EVALUATED', evaluation_reason: null, method_run_ids: '{}', bundle_hash: null, purpose: 'LIVE' },
    ];
    const o = kpiOptions(rows, '15m', 'short', NOW, 'UTC');
    expect(o[0].label).toBe('ends 2026-09-17 08:15:00 · G3 attention · 5 min ago');
    expect(o[0].methodRunIds).toEqual({ G0: 'a', G3: 'b' });
    expect(o[0].gates.find(g => g.key === 'G3')).toEqual({ key: 'G3', status: 'WARN', reason: null });
    expect(o[0].tone).toBe('warn');
    expect(o[1].label).toBe('ends 2026-09-17 07:45:00 · G0 not usable (source quality unknown) · 35 min ago · no run identity (pre-v2.5)');
    expect(o[1].hasRunIds).toBe(false);
  });

  it('states a WAITING / WARMUP window by its evaluation state', () => {
    const rows: CpmKpiRow[] = [{ window_start: null, window_end: '2026-09-17T08:15:00Z', sample_count: 10, created_at: 'x', evaluation_state: 'WAITING', evaluation_reason: 'WARMUP', method_run_ids: '{"G0":"a"}', bundle_hash: 'b', purpose: 'LIVE' }];
    expect(kpiOptions(rows, '1m', 'short', NOW, 'UTC')[0].label).toBe('ends 2026-09-17 08:15:00 · Waiting (warmup) · 5 min ago');
  });
});

describe('navigation over options', () => {
  const o = fusedOptions([summary({}), summary({ windowEnd: '2026-09-17T07:45:00Z', methodRunIds: { G5: 'g5b', G15: 'g15b' } }), summary({ windowEnd: '2026-09-17T07:30:00Z', methodRunIds: {} })], NOW, 'UTC');
  it('finds the option carrying a run and its newer / older neighbours', () => {
    expect(findOptionOfRun(o, 'g15b')).toBe(1);
    expect(findOptionOfRun(o, 'nope')).toBe(-1);
    expect(neighbours(o, 1)).toEqual({ newer: o[0], older: o[2] });
    expect(neighbours(o, 0).newer).toBeNull();
    expect(neighbours(o, -1)).toEqual({ newer: null, older: null });
  });
  it('lands on the newest option with run ids, keeping the wanted gate when it has a run, else G15, else the first gate with a run', () => {
    expect(resolveLanding(o, 'G5')).toEqual({ methodRunId: 'g5', gate: 'G5' });
    expect(resolveLanding(o, 'G3')).toEqual({ methodRunId: 'g15', gate: 'G15' });
    expect(resolveLanding([o[2]], 'G5')).toBeNull();
    const short = kpiOptions([{ window_start: null, window_end: '2026-09-17T08:15:00Z', sample_count: 1, created_at: 'x', method_run_ids: '{"G3":"b","G0":"a"}', bundle_hash: 'b', purpose: 'LIVE' }], '15m', 'short', NOW, 'UTC');
    expect(resolveLanding(short, 'G5')).toEqual({ methodRunId: 'a', gate: 'G0' });
  });
});
