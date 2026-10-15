/**
 * v2.5 Task 2E.1 (spec §3.2–3.3): the immutable method-run and evidence API.
 * GET /method-runs/{id} (any tier's row or a response event), GET /method-runs/{id}/evidence
 * (manifest with ETag + readiness summary + reconstruction action), GET /evidence/{id}/chunks/{n}
 * (immutable bytes), POST /method-runs/evidence/batch and GET /method-runs/{id}/evidence/bundle
 * (v2.5 batching: many manifests / all of a run's bytes in one call), POST /analysis-runs
 * {purpose: EVIDENCE_RECONSTRUCTION}. Mirrors
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
  /** gate -> method run id of the same row (the sibling runs of this window); empty for a response event. */
  methodRunIds: Record<string, string>;
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
  /** CHG-099: RETAINED = the live engine's proof; RECONSTRUCTED = rebuilt on request (absent on an older cplm-api). */
  basis?: 'RETAINED' | 'RECONSTRUCTED';
  analysisRunId?: string | null;
  /** CHG-099: the original evidence id a reconstruction was stored beside. */
  reconstructionOf?: string | null;
  sourceCommit?: string | null;
  jarSha256?: string | null;
}

/** CHG-099 (SME review 2 #18): a reconstruction stored beside the run's retained proof (differing artifacts only). */
export interface EvidenceReconstruction {
  analysisRunId: string;
  state: string;
  createdAt: string;
  source: string | null;
  differing: number;
  identical: number;
  /** PENDING until the run ends; SUPERSEDED = a newer reconstruction replaced its rows; NONE = it produced nothing. */
  readiness: 'COMPLETE' | 'PENDING' | 'FAILED' | 'IDENTICAL' | 'NONE' | 'SUPERSEDED' | 'IDENTITY_CHANGED';
  /** IDENTITY_CHANGED: the method run the rebuild landed under (the configuration changed since this run). */
  rebuiltAs?: string | null;
  sourceCommit: string | null;
  jarSha256: string | null;
  artifacts: EvidenceArtifactMeta[];
}

export interface EvidenceManifest {
  methodRunId: string;
  etag: string;
  readiness: ManifestReadiness;
  count: number;
  reconstructable: boolean;
  reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION'; methodRunId: string; endpoint: string };
  artifacts: EvidenceArtifactMeta[];
  /** CHG-099: newest first; absent on an older cplm-api. */
  reconstructions?: EvidenceReconstruction[];
}

export interface ReconstructionAccepted {
  analysisRunId: string; loopId: string; purpose: string; jobId: string; reconstructs: string; gate: string; tier: string;
  windowKind: string; fromMs: number; toMs: number; evidenceUrl: string; statusUrl: string;
}

/** CHG-099: an analysis run's state; reading it refreshes the state from the Flink job (cplm-api). */
export const getAnalysisRun = (analysisRunId: string, signal?: AbortSignal) =>
  apiJson<{ analysisRunId: string; state: string; jobState?: string | null; error?: string | null }>(
    `${CPM_BASE}/analysis-runs/${encodeURIComponent(analysisRunId)}`, { signal });

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

/** v2.5 batching: several runs' manifests in one call (null = unknown run or nothing retained). */
export const getEvidenceBatch = (methodRunIds: string[], signal?: AbortSignal) =>
  apiJson<{ count: number; manifests: Record<string, EvidenceManifest | null> }>(`${CPM_BASE}/method-runs/evidence/batch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ methodRunIds }), signal,
  });

/** v2.5 batching: every COMPLETE artifact of a run in one framed body (see artifactCodec.parseBundle). */
export async function fetchBundle(methodRunId: string, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await apiFetch(`${CPM_BASE}/method-runs/${encodeURIComponent(methodRunId)}/evidence/bundle`, {
    signal, headers: { Accept: 'application/octet-stream' },
  });
  if (!res.ok) {
    let detail: string | undefined;
    try { detail = ((await res.json()) as { error?: string }).error; } catch { /* binary or empty */ }
    throw new ApiError(res.status, detail ?? `bundle unavailable (HTTP ${res.status})`, detail);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Rebuild one method run's artifacts over exactly its support. The support is read from the
 * historian (IoTDB), the durable store: the Kafka samples topic keeps 12 h at the plant, so a
 * window older than that would rebuild from nothing (2026-10-03 decision).
 */
export const postReconstruction = (methodRunId: string, source: 'kafka' | 'iotdb' = 'iotdb') =>
  apiJson<ReconstructionAccepted>(`${CPM_BASE}/analysis-runs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId, source }),
  });
