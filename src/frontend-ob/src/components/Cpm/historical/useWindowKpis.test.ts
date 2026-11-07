import { describe, it, expect } from 'vitest';
import type { CpmGateMatrix, CpmWindowSummary } from '../../../api/cpm/gates';
import { mergeWindows } from './useWindowKpis';

const summary = (end: string, metrics: Record<string, number> = {}): CpmWindowSummary => ({
  source: 'historian', loopId: 'L', windowKind: '12h', windowStart: null, windowEnd: end, sampleCount: null, diagnosis: 'NO_CALL',
  severity: null, confidence: null, gates: [], methodRunIds: {}, bundleHash: null, resultRevision: null, observabilityFlags: [],
  familyDisqualifiers: [], insufficientEvidenceReason: null, methodEligibility: null, metrics, computedAt: end, jarSha256: null,
});
const full = (end: string): CpmGateMatrix => ({
  loopId: 'L', windowKind: '12h', windowStart: '2026-11-01T00:00:00Z', windowEnd: end, sampleCount: 5, diagnosis: 'NO_CALL', severity: null,
  confidence: 0.3, gates: [{ key: 'G0', name: 'x', tier: 'short', status: 'PASS', reason: null }], observabilityFlags: [], familyDisqualifiers: [],
  hasPeerLinks: false, insufficientEvidenceReason: null, metrics: { good_error_pct: 0.8 },
  narrative: { selectedFamily: null, statusReason: null, recommendation: null }, verdictV2: {} as CpmGateMatrix['verdictV2'],
  metadata: { calculationVersion: '7', dynamicsProfileVersion: '3' } as CpmGateMatrix['metadata'],
});

describe('mergeWindows', () => {
  it('lists older summaries and full rows together, oldest first, each window once', () => {
    const merged = mergeWindows([full('2026-11-05T00:00:00Z')], [summary('2026-11-05T00:00:00Z', { good_error_pct: 0.1 }), summary('2026-10-01T00:00:00Z', { good_error_pct: 0.9 })]);
    expect(merged.map(w => w.windowEnd)).toEqual(['2026-10-01T00:00:00Z', '2026-11-05T00:00:00Z']);
    expect(merged[1].metrics?.good_error_pct).toBe(0.8);         // the full row wins
    expect(merged[1].calculation).toBe('v7 · profile v3');
    expect(merged[0].metrics?.good_error_pct).toBe(0.9);         // an older window keeps its value
  });

  it('counts +00:00 and Z spellings of one instant as one window (CHG-153)', () => {
    const merged = mergeWindows([full('2026-11-05T00:00:00Z')], [summary('2026-11-05T00:00:00+00:00', {})]);
    expect(merged).toHaveLength(1);
    expect(merged[0].calculation).toBe('v7 · profile v3');
  });
});
