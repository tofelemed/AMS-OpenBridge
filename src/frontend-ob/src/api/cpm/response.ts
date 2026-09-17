/**
 * v2.5 Task 2E.5 (spec §2.10, §6.5): the G12 system-response API - events (incl. rejected and
 * censored, cursor-paged), one event in full (subgates + the 52 quantities), the as-of models of a
 * loop, one model, the server-owned review. Mirrors CpmResponseController / CpmModelsController.
 */
import { apiFetch, apiJson, ApiError } from '../apiFetch';
import { CPM_BASE } from './base';

export interface ResponseEventSummary {
  eventId: string; methodRunId: string; eventType: string; pathId: string; t0Ms: number; tEndMs: number | null;
  captureState: string; censorReason: string; evaluationState: string; eligibility: string; finding: string; modelState: string;
  purpose: string; bundleHash: string; resultRevision: number; emittedAtMs: number | null;
}

/** 2026-09-17 audit F19/F20: `censoredCount` is the range's censored candidates, listed only with includeCensored. */
export interface ResponseEventPage { loopId: string; purpose: string; count: number; censoredCount?: number; includeCensored?: boolean; nextCursor: number | null; events: ResponseEventSummary[] }

export interface ResponseQuantity {
  quantityId: string; value: number | null; unit: string; pathId: string; uncertainty: number | null; method: string;
  supportFromMs: number | null; supportToMs: number | null; configHash: string; reasonIfNull: string;
}

export interface ResponseSubgate { state: string; outputs: Record<string, unknown> }

export interface ResponseEventDetail {
  result: {
    event_id: string; method_run_id: string; loop_id: string; path_id: string; evaluation_state: string; eligibility: string; finding: string; model_state: string;
    subgates: Record<string, ResponseSubgate>; window_start_ms: number; window_end_ms: number; bundle_hash: string; purpose: string;
    [k: string]: unknown;
  };
  metrics: ResponseQuantity[];
}

export interface SystemModel {
  modelId: string; loopId: string; pathId: string; family: string; parameters: Record<string, { value: number | null; unit: string; uncertainty: number | null; method: string; reason: string | null }> | null;
  estimator: string; uncertaintyMethod: string; trainingSupport: Record<string, unknown> | null; validationSupport: Record<string, unknown> | null;
  modelState: string; approvedDomain: Record<string, unknown> | null; controllerSnapshotId: string | null; contextRevision: number;
  createdFromEvent: string | null; methodRunId: string | null; bundleHash: string; revision: number; reviewedBy: string | null; reviewedAt: string | null;
  reviewNote: string | null; createdAt: string; supersededBy: string | null;
}

export const getResponseEvents = (loopId: string, opts: { from?: string; to?: string; cursor?: number; limit?: number; purpose?: string; includeCensored?: boolean } = {}, signal?: AbortSignal) => {
  const p = new URLSearchParams();
  if (opts.from) p.set('from', opts.from);
  if (opts.to) p.set('to', opts.to);
  if (opts.cursor != null) p.set('cursor', String(opts.cursor));
  if (opts.limit) p.set('limit', String(opts.limit));
  if (opts.purpose) p.set('purpose', opts.purpose);
  if (opts.includeCensored === false) p.set('includeCensored', 'false');
  const q = p.toString();
  return apiJson<ResponseEventPage>(`${CPM_BASE}/loops/${encodeURIComponent(loopId)}/response-events${q ? `?${q}` : ''}`, { signal });
};

export const getResponseEvent = (eventId: string, signal?: AbortSignal) =>
  apiJson<ResponseEventDetail>(`${CPM_BASE}/response-events/${encodeURIComponent(eventId)}`, { signal });

export const getModels = (loopId: string, at?: string, signal?: AbortSignal) =>
  apiJson<{ loopId: string; at: string; count: number; models: SystemModel[] }>(`${CPM_BASE}/loops/${encodeURIComponent(loopId)}/models${at ? `?at=${encodeURIComponent(at)}` : ''}`, { signal });

export type ReviewDecision = 'VALIDATED' | 'REJECTED' | 'ACTIVE_BASELINE' | 'EXPIRED';

/** Server-owned review guarded by If-Match on the model's revision (409 when stale). */
export async function reviewModel(modelId: string, revision: number, decision: ReviewDecision, note?: string, domain?: Record<string, unknown>): Promise<{ modelId: string; revision: number; modelState: string }> {
  const res = await apiFetch(`${CPM_BASE}/models/${encodeURIComponent(modelId)}/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': `"${revision}"` },
    body: JSON.stringify({ decision, note, domain }),
  });
  if (!res.ok) {
    let detail: string | undefined;
    try { detail = ((await res.json()) as { error?: string }).error; } catch { /* empty */ }
    throw new ApiError(res.status, res.status === 409 ? 'The model was reviewed by someone else; reload and decide again.' : detail ?? `review failed (HTTP ${res.status})`, detail);
  }
  return res.json() as Promise<{ modelId: string; revision: number; modelState: string }>;
}
