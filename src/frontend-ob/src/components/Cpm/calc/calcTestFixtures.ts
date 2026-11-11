// Test-only: the fused row, feature row and window options the Calculations page tests read (CHG-166).
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { EvidenceWindows, WindowOption } from '../evidence/useEvidenceWindows';

export const NOW = '2026-11-05T13:45:00Z';
export const MID = '2026-11-05T01:45:00Z';
export const PAST = '2026-11-04T13:45:00Z';

const cell = (key: string, status: string) => ({ key, name: key, tier: 'short', status, reason: null, methodRunId: `run-${key}` });

export const matrix = (end: string, over: Partial<CpmGateMatrix> = {}) => ({
  loopId: 'FIC10401', windowKind: '12h', windowStart: new Date(Date.parse(end) - 12 * 3600_000).toISOString(), windowEnd: end, sampleCount: 8639,
  diagnosis: 'EXCLUDED_MODE', severity: null, confidence: null, observabilityFlags: [], familyDisqualifiers: [],
  gates: [cell('G0', 'PASS'), cell('G1', 'EXCLUDED'), cell('G3', 'WARN'), cell('G4', 'PASS'), cell('G15', 'INSUFFICIENT_EVIDENCE')],
  methodRunIds: { G3: 'run-G3', G15: 'run-G15' }, hasPeerLinks: false, insufficientEvidenceReason: null, metrics: {},
  narrative: { selectedFamily: null, statusReason: null, recommendation: null }, verdictV2: {},
  metadata: { calculationVersion: '3.0.0', dynamicsProfileVersion: '2.0.0', computedAt: end, replayId: null }, ...over,
}) as unknown as CpmGateMatrix;

export const kpiRow = (end: string, over: Record<string, unknown> = {}) => ({
  window_start: new Date(Date.parse(end) - 12 * 3600_000).toISOString(), window_end: end, sample_count: 8639, created_at: end,
  completeness: 1, mae: 0.7103, good_error_pct: 0, vw_mae: 0.7103, vw_good_error_pct: 0, vw_completeness: 1, vw_sample_count: 8639,
  acf_period_s: null, long_metrics_qualified: true, calculation_version: '3.0.0', ...over,
});

export const option = (end: string, label: string): WindowOption => ({
  windowEnd: end, windowStart: null, kind: '12h', tier: 'fused', label, tone: 'muted', ageMs: 0, sampleCount: 8639,
  methodRunIds: { G15: `g15-${end}` }, hasRunIds: true, gates: [], flags: undefined, methodEligibility: null, purpose: null,
  diagnosis: 'EXCLUDED_MODE',
});

export const windowList = (over: Partial<EvidenceWindows> = {}): EvidenceWindows => ({
  options: [option(NOW, '5 Nov 13:45 · Excluded'), option(MID, '5 Nov 01:45 · Excluded'), option(PAST, '4 Nov 13:45 · Excluded')],
  isLoading: false, error: null, refetch: () => undefined, hasMore: false, loadMore: () => undefined, isLoadingMore: false, ...over,
});

export const atResult = (row: CpmGateMatrix | undefined, over: Record<string, unknown> = {}) => ({
  row, rerun: false, others: [], notFound: false, isLoading: false, isError: false, error: null, refetch: () => undefined, ...over,
});
