// Test-only: a minimal fused gate row for the window hooks' tests.
import type { CpmGateMatrix } from '../../../api/cpm/gates';

export const row = (end: string, over: Partial<CpmGateMatrix> & { replayId?: string | null } = {}): CpmGateMatrix => {
  const { replayId = null, ...rest } = over;
  return {
    loopId: 'FIC10401', windowKind: '12h', windowStart: '2026-10-05T00:30:00Z', windowEnd: end, sampleCount: 100, diagnosis: 'NO_CALL', severity: null,
    confidence: null, gates: [], observabilityFlags: [], familyDisqualifiers: [], hasPeerLinks: false, insufficientEvidenceReason: null, metrics: {},
    narrative: { selectedFamily: null, statusReason: null, recommendation: null }, verdictV2: {} as CpmGateMatrix['verdictV2'],
    metadata: { replayId, computedAt: end } as CpmGateMatrix['metadata'], ...rest,
  };
};
