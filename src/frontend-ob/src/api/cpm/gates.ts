/**
 * api/cpm/gates — the gate matrix (gates/latest, gate history). Split out of ../cpmApi.ts in
 * v2.5 (1E.2) for the file-size rule; ../cpmApi.ts re-exports everything here, so existing
 * imports keep working. New code imports from './cpm'.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE as BASE } from './base';
import type { CpmVerdictV2 } from './verdict';

// ── Gates & KPIs (U1/U3/U5/U8) ──────────────────────────────────────────────

export interface CpmGateCell {
  key: string;
  name: string;
  tier: 'short' | 'long' | 'fusion';
  status: string;
  reason: string | null;
  /** v2.5 (2E.3, R13): the immutable method run this cell IS; null on pre-v2.5 rows (nothing immutable to open). */
  methodRunId?: string | null;
}

export interface CpmGateMatrix {
  loopId: string;
  windowKind: string;
  windowStart: string | null;
  windowEnd: string | null;
  sampleCount: number | null;
  diagnosis: string | null;
  severity: string | null;
  confidence: number | null;
  gates: CpmGateCell[];
  /** v2.5 (2E.3): gate -> method run id of this row (sibling runs of the same window); empty on pre-v2.5 rows. */
  methodRunIds?: Record<string, string>;
  bundleHash?: string | null;
  resultRevision?: number | null;
  observabilityFlags: string[];
  familyDisqualifiers: string[];
  hasPeerLinks: boolean;
  insufficientEvidenceReason: string | null;
  /** All numeric payload fields (family scores, freeze index, shape metrics, …). */
  metrics: Record<string, number>;
  narrative: {
    selectedFamily: string | null;
    statusReason: string | null;
    recommendation: string | null;
  };
  /** v2.5 (1E.2): observations / hypotheses / fault-scoped confirmation; `legacy` on pre-v2.5 rows. */
  verdictV2: CpmVerdictV2;
  metadata: {
    schemaVersion: number | null;
    calculationVersion: string | null;
    dynamicsProfileVersion: string | null;
    dynamicsClass: string | null;
    profileSource: string | null;
    calculationSource: string | null;
    replayId: string | null;
    sourceCommit: string | null;
    jarSha256: string | null;
    contractVersion: string | null;
    computedAt: string;
  };
}

export const getLatestGates = (loopId: string, windowKind = '24h', signal?: AbortSignal) =>
  apiJson<CpmGateMatrix>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/gates/latest?windowKind=${windowKind}`, { signal });

export const getGateHistory = (
  loopId: string, windowKind = '24h', from?: string, to?: string, limit = 100, signal?: AbortSignal,
) => {
  const params = new URLSearchParams({ windowKind, limit: String(limit) });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return apiJson<{ loopId: string; windowKind: string; count: number; windows: CpmGateMatrix[] }>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/gates?${params.toString()}`, { signal });
};
