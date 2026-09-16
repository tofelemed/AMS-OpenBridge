/**
 * v2.5 Task 2E.1 (spec §3.2–3.3): the immutable method-run and evidence API.
 * GET /method-runs/{id} (any tier's row or a response event), GET /method-runs/{id}/evidence
 * (manifest with ETag + readiness summary + reconstruction action), GET /evidence/{id}/chunks/{n}
 * (immutable bytes), POST /analysis-runs {purpose: EVIDENCE_RECONSTRUCTION}. Mirrors
 * CpmMethodRunsController / CpmEvidenceController / CpmAnalysisRunsController.
 */
import { apiFetch, apiJson, ApiError } from '../apiFetch';
import { CPM_BASE } from './base';

export type Readiness = 'COMPLETE' | 'PENDING' | 'FAILED' | 'EXPIRED';
export type ManifestReadiness = Readiness | 'NONE' | 'PARTIAL';

export interface MethodRunIdentity {
  bundleHash: string; contextRevision: number; resultRevision: number; purpose: string;
  analysisRunId: string | null; sourceCommit: string | null; jarSha256: string | null; datasetHash: string | null; source: string;
}

export interface MethodRun {
  methodRunId: string;
  tier: 'fusion' | 'short' | 'long' | 'response';
  gate: string;
  loopId: string;
  site: string | null;
  windowKind: string;
  gateResultId: number | null;
  support: { fromMs: number; toMs: number; sampleCount: number | null };
  identity: MethodRunIdentity;
  /** The gate's cell of the fused row (fusion tier only). */
  cell: { key: string; name: string; tier: string; status: string; reason: string | null } | null;
  verdictV2: unknown;
  /** The tier row's payload (short / long) or the response event's result JSON. */
  result: Record<string, unknown> | null;
  reconstruction: { supported: boolean; reason: string };
  computedAt: string;
}

export interface EvidenceArtifactMeta {
  artifactId: string;
  methodRunId: string;
  gate: string;
  kind: string;
  roleOrPath: string | null;
  x: { quantity: string | null; unit: string | null };
  y: { quantity: string | null; unit: string | null };
  dataType: string;
  columns: string[];
  encoding: string;
  calculationSamples: number | null;
  displayPoints: number | null;
  chunkCount: number;
  totalBytes: number;
  checksum: string;
  chunkChecksums: string[];
  chunksUrl: string;
  readiness: Readiness;
  readinessReason: string | null;
  provenance: Record<string, string>;
  retentionClass: string;
  pinned: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface EvidenceManifest {
  methodRunId: string;
  etag: string;
  readiness: ManifestReadiness;
  count: number;
  reconstructable: boolean;
  reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION'; methodRunId: string; endpoint: string };
  artifacts: EvidenceArtifactMeta[];
}

export interface ReconstructionAccepted {
  analysisRunId: string; loopId: string; purpose: string; jobId: string; reconstructs: string; gate: string; tier: string;
  windowKind: string; fromMs: number; toMs: number; evidenceUrl: string; statusUrl: string;
}

export const getMethodRun = (methodRunId: string, signal?: AbortSignal) =>
  apiJson<MethodRun>(`${CPM_BASE}/method-runs/${encodeURIComponent(methodRunId)}`, { signal });

export const getEvidenceManifest = (methodRunId: string, signal?: AbortSignal) =>
  apiJson<EvidenceManifest>(`${CPM_BASE}/method-runs/${encodeURIComponent(methodRunId)}/evidence`, { signal });

/** One immutable chunk as bytes; the server's ETag is the chunk's SHA-256 (verified again by the codec). */
export async function fetchChunk(evidenceId: string, n: number, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await apiFetch(`${CPM_BASE}/evidence/${encodeURIComponent(evidenceId)}/chunks/${n}`, {
    signal, headers: { Accept: 'application/octet-stream' },
  });
  if (!res.ok) {
    let detail: string | undefined;
    try { detail = ((await res.json()) as { error?: string }).error; } catch { /* binary or empty */ }
    throw new ApiError(res.status, detail ?? `chunk ${n} unavailable (HTTP ${res.status})`, detail);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export const postReconstruction = (methodRunId: string, source: 'kafka' | 'iotdb' = 'kafka') =>
  apiJson<ReconstructionAccepted>(`${CPM_BASE}/analysis-runs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId, source }),
  });
