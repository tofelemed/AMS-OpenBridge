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

/** 2026-09-17 audit F4: a companion window named beside a served matrix (the last verdict, or the newest window). */
export interface CpmWindowReference {
  windowKind: string;
  windowStart: string | null;
  windowEnd: string | null;
  diagnosis: string | null;
  severity: string | null;
  confidence: number | null;
  ageMs: number | null;
  insufficientEvidenceReason: string | null;
  methodRunIds: Record<string, string>;
  computedAt: string;
}

export interface CpmGateMatrix {
  /** 'newest' (default: the loop's newest evaluated window) or 'verdict' (?prefer=verdict). */
  served?: 'newest' | 'verdict';
  /** The newest OLDER real verdict when the served row is a newer window without one; null otherwise. */
  lastVerdict?: CpmWindowReference | null;
  /** With ?prefer=verdict: the newer window the verdict row is not. */
  newestWindow?: CpmWindowReference | null;
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
  /** v2.5 (2G.1, NR-016): {G5|G6|G12: {state, reason, detail}} - what the acquisition grid lets each method claim (served, typed here for the workbench). */
  methodEligibility?: Record<string, { state: string; reason: string | null; detail: string | null }> | null;
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

/**
 * v2.5 workbench: one evaluated window as the picker sees it - the identity, the verdict, the 17
 * statuses / reasons / run ids and the flags (~0.5 KB; `GET …/gates?projection=summary`). A window
 * without run ids predates v2.5 and cannot be opened in the workbench.
 */
export interface CpmWindowSummary {
  loopId: string;
  windowKind: string;
  windowStart: string | null;
  windowEnd: string;
  sampleCount: number | null;
  diagnosis: string | null;
  severity: string | null;
  confidence: number | null;
  gates: Array<{ key: string; status: string | null; reason: string | null; methodRunId: string | null }>;
  methodRunIds: Record<string, string>;
  bundleHash: string | null;
  resultRevision: number | null;
  observabilityFlags: string[];
  familyDisqualifiers: string[];
  insufficientEvidenceReason: string | null;
  methodEligibility: Record<string, { state: string; reason: string | null; detail: string | null }> | null;
  computedAt: string;
  jarSha256: string | null;
}

export interface WindowSummaryOptions { to?: string; limit?: number; includeInsufficient?: boolean }

/** Every evaluated window of the loop, newest first; `to` pages backwards from the oldest loaded window. */
export const getWindowSummaries = (loopId: string, windowKind = '24h', opts: WindowSummaryOptions = {}, signal?: AbortSignal) => {
  const params = new URLSearchParams({ windowKind, limit: String(opts.limit ?? 100), projection: 'summary', includeInsufficient: String(opts.includeInsufficient ?? true) });
  if (opts.to) params.set('to', opts.to);
  return apiJson<{ loopId: string; windowKind: string; count: number; projection: string; windows: CpmWindowSummary[] }>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/gates?${params.toString()}`, { signal });
};

export const getGateHistory = (
  loopId: string, windowKind = '24h', from?: string, to?: string, limit = 100, signal?: AbortSignal, includeInsufficient = false,
) => {
  const params = new URLSearchParams({ windowKind, limit: String(limit) });
  if (includeInsufficient) params.set('includeInsufficient', 'true');
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return apiJson<{ loopId: string; windowKind: string; count: number; windows: CpmGateMatrix[] }>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/gates?${params.toString()}`, { signal });
};
