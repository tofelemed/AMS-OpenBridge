/**
 * CPLM Phase 7 (F0.2) — the typed client for every CPM endpoint.
 *
 * All CPM data access goes through here and is consumed via react-query hooks
 * (src/hooks/useCpm.ts). No component issues raw fetches — that was the
 * TrendCore anti-pattern the build plan told us not to inherit.
 *
 * Types mirror the C# DTOs in AMS.Api (CpmLoopsController, CpmAnalyticsController,
 * CpmFleetController, CpmReadinessController, CpmEventsController).
 */
import { apiJson } from './apiFetch';
import { CPM_BASE as BASE } from './cpm/base';
import type { CpmTrendPoint } from './cpm/kpis';
// v2.5: the gate matrix, KPI/trend/resolutions and the fusion v2 verdict types live in
// ./cpm/* (file-size rule); they are re-exported here so existing imports keep working.
export * from './cpm/gates';
export * from './cpm/kpis';
export type { CpmVerdictV2 } from './cpm/verdict';

// ── Registry (U10) ──────────────────────────────────────────────────────────

export interface CpmLoopLink {
  toLoopId: string;
  relType: string;
  origin: string;
}

export interface CpmLoop {
  loopId: string;
  assetId: string | null;
  displayName: string;
  site: string;
  area: string | null;
  unit: string | null;
  loopType: string;
  criticality: string;
  isActive: boolean;
  monitoringEnabled: boolean;
  tags: Record<string, string>;
  observabilityFlags: string[];
  links: CpmLoopLink[];
  stepTestApproved: boolean;
  thresholdProfileId: string | null;
  /** Declared OP/PV ranges, null when the loop declares none. */
  engineering?: CpmEngineeringRange | null;
  /** v2.5 (2E.2): the site zone the loop's times are shown in; 'UTC' when the registry declares none. */
  timezone?: string | null;
}

export interface CpmTagMapEntry {
  signalRole: string;
  unsPath: string;
  sourceSystem?: string | null;
  sourceTag?: string | null;
}

/**
 * Declared engineering ranges for the loop's signals. Both are optional and both
 * change how gates are computed, so neither is cosmetic:
 *  - OP range normalises the controller output to 0-100 before saturation (G10)
 *    and operating-region (G2r) maths — a 0-1 valve fraction otherwise makes both
 *    meaningless.
 *  - PV range scales the "good error" band. Without it the band is a hardcoded
 *    0.5 absolute EU, so G3 is unreachable on a 0-1000 t/h flow and trivial on a
 *    0-1 fraction.
 * Omit a bound to leave it undeclared; a zero would be read as a real bound.
 */
export interface CpmEngineeringRange {
  opMin?: number | null;
  opMax?: number | null;
  pvMin?: number | null;
  pvMax?: number | null;
}

export interface CpmActivateRequest {
  loopId: string;
  displayName: string;
  site: string;
  loopType: string;
  area?: string | null;
  unit?: string | null;
  criticality?: string | null;
  assetId?: string | null;
  tags?: CpmTagMapEntry[];
  thresholdProfileId?: string | null;
  enableMonitoring?: boolean;
  stepTestApproved?: boolean;
  engineering?: CpmEngineeringRange | null;
  /** G-07: cplm-api rejects a site/area/unit chain that is not in the asset
   *  model (422 LOCATION_NOT_IN_UNS) unless this explicit opt-out is set. */
  allowUnmodelledLocation?: boolean;
}

export interface CpmRegistryContract {
  requiredSignalRoles: string[];
  optionalSignalRoles: string[];
  loopTypes: string[];
  relationshipTypes: string[];
  notes: { loopType: string; vp: string; peerLinks: string };
}

export const getLoops = () =>
  apiJson<{ loops: CpmLoop[]; count: number }>(`${BASE}/loops`);

export const getLoop = (loopId: string) =>
  apiJson<CpmLoop>(`${BASE}/loops/${encodeURIComponent(loopId)}`);

export const activateLoop = (request: CpmActivateRequest) =>
  apiJson<CpmLoop>(`${BASE}/loops/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

/** One outcome per submitted row; `code` mirrors the single-activate error codes. */
export interface CpmBulkActivateItem {
  loopId: string;
  ok: boolean;
  error?: string | null;
  code?: string | null;
}

export interface CpmBulkActivateResult {
  requested: number;
  activated: number;
  failed: number;
  /** Server-side duration, excluding transport. */
  elapsedMs: number;
  results: CpmBulkActivateItem[];
  /** Rows committed but a post-commit projection did not — the loops exist. */
  warning?: string | null;
}

/**
 * Onboards a whole batch in ONE request. This is deliberately not N calls: the
 * gateway counts one mutation per request (120/minute/user), so a per-row import
 * hit the limit at 120 loops, and the server can batch its own reads and writes
 * only when it sees the whole set.
 */
export const bulkActivateLoops = (loops: CpmActivateRequest[]) =>
  apiJson<CpmBulkActivateResult>(`${BASE}/loops/bulk-activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loops }),
  });

export const deleteLoop = (loopId: string) =>
  apiJson<{ loopId: string; deleted: boolean }>(
    `${BASE}/loops/${encodeURIComponent(loopId)}`, { method: 'DELETE' });

export const republishEvidence = (loopId: string) =>
  apiJson<{
    loopId: string; republished: boolean; projected: number; links: number;
    /** UNS signal assets upserted by the projection (older API builds omit it). */
    signalAssets?: number;
  }>(`${BASE}/loops/${encodeURIComponent(loopId)}/republish-evidence`, { method: 'POST' });

export const getRegistryContract = () =>
  apiJson<CpmRegistryContract>(`${BASE}/registry-contract`);

// ── Readiness (U10 wizard post-save, U2) ────────────────────────────────────

export interface CpmReadinessCheck {
  id: string;
  label: string;
  ok: boolean;
  message: string | null;
}

export interface CpmReadiness {
  loopId: string;
  displayName?: string;
  ready: boolean;
  degraded?: boolean;
  checks: CpmReadinessCheck[];
  blockers: string[];
  warnings: string[];
  evidence?: { shortFeatures: number; longFeatures: number; verdicts: number };
}

export const getReadiness = (loopId: string) =>
  apiJson<CpmReadiness>(`${BASE}/loops/${encodeURIComponent(loopId)}/readiness`);

// ── Events (U4) ─────────────────────────────────────────────────────────────

export interface CpmEventFrame {
  id: number;
  loop_id: string;
  window_kind: string;
  family: string;
  opened_at: string;
  closed_at: string | null;
  peak_diagnosis: string;
  peak_confidence: number;
  last_diagnosis: string | null;
  last_confidence: number | null;
  severity: string | null;
  window_count: number;
  ack_state: 'UNACKNOWLEDGED' | 'ACKNOWLEDGED' | 'SHELVED';
  acked_by: string | null;
  acked_at: string | null;
  shelve_until: string | null;
  note: string | null;
  calculation_version: string | null;
  dynamics_profile_version: string | null;
  /** v2.5 (1F): OBSERVED | UNOBSERVABLE — whether the newest result could judge the loop; absent on pre-v2.5 rows. */
  availability_state: string | null;
  /** v2.5 (1F): OPEN | CLOSED — whether the condition is still standing. */
  condition_state: string | null;
  result_revision: number | null;
  /** v2.5 (1F, NR-029): union of the qualified support the episode rests on, ms. */
  qualified_support_ms: number | null;
  /** v2.5 (1F): RECOVERED | FAMILY_CHANGED on a closed frame. */
  close_reason: string | null;
}

export interface CpmEventsQuery {
  loopId?: string;
  openOnly?: boolean;
  includeShelved?: boolean;
  from?: string;
  limit?: number;
  /**
   * 'triage' (server default) — open first, then highest peak confidence: worst-first
   * for the Events screen. 'recent' — strictly newest-opened first, for anything that
   * renders a chronological episode list. This is not cosmetic: with a LIMIT the two
   * orders return DIFFERENT frames, so a timeline must ask for 'recent' explicitly.
   */
  sort?: 'triage' | 'recent';
}

export const getEvents = (q: CpmEventsQuery = {}, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  if (q.loopId) params.set('loopId', q.loopId);
  if (q.openOnly !== undefined) params.set('openOnly', String(q.openOnly));
  if (q.includeShelved) params.set('includeShelved', 'true');
  if (q.from) params.set('from', q.from);
  if (q.limit) params.set('limit', String(q.limit));
  if (q.sort) params.set('sort', q.sort);
  return apiJson<{ count: number; openOnly: boolean; sort: string; events: CpmEventFrame[] }>(
    `${BASE}/events?${params.toString()}`, { signal });
};

export const acknowledgeEvent = (id: number, note?: string) =>
  apiJson<{ id: number; ackState: string }>(`${BASE}/events/${id}/acknowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: note ?? null }),
  });

export const shelveEvent = (id: number, until: string, note?: string) =>
  apiJson<{ id: number; ackState: string; shelveUntil: string }>(
    `${BASE}/events/${id}/shelve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ until, note: note ?? null }),
    });

// ── Fleet (U1/U3) ───────────────────────────────────────────────────────────

export interface CpmFleetSummary {
  site: string | null;
  windowKind: string;
  loops: { total: number; monitored: number; withPeerLinks: number; withVp: number };
  diagnoses: { diagnosis: string; count: number }[];
  capability: {
    confidenceCappedWithoutVp: number;
    loopsCappedByMissingVp: number;
    loopsWithoutDisturbanceContext: number;
  };
}

/**
 * Plant scope for the fleet endpoints (CPM-UX A5/A6). All three levels are
 * optional and narrow independently; cplm-api applies them against the
 * registry's denormalised site/area/unit columns and echoes them back.
 */
export interface CpmFleetScope { site?: string; area?: string; unit?: string }

/** Adds whichever scope levels are set to a query string. */
function applyScope(params: URLSearchParams, scope?: CpmFleetScope | string): void {
  // A bare string keeps the pre-scope call sites (site-only) working.
  const s: CpmFleetScope = typeof scope === 'string' ? { site: scope } : (scope ?? {});
  if (s.site) params.set('site', s.site);
  if (s.area) params.set('area', s.area);
  if (s.unit) params.set('unit', s.unit);
}

export const getFleetSummary = (scope?: CpmFleetScope | string, windowKind = '24h') => {
  const params = new URLSearchParams({ windowKind });
  applyScope(params, scope);
  return apiJson<CpmFleetSummary>(`${BASE}/fleet/summary?${params.toString()}`);
};

// ── Pipeline (U11, U1 runtime panel) ────────────────────────────────────────

/**
 * 'platform' covers the jobs that are required but belong to neither the alarm nor
 * the CPLM pipeline (analysis execution, alarm KPI, alarm state export). They were
 * previously absent from the server's required list and therefore surfaced under
 * `unexpectedJobs` while running normally.
 */
export type CpmJobRole = 'alarm' | 'cplm' | 'platform';

export interface CpmPipelineJob {
  name: string;
  role: CpmJobRole;
  state: string;
  running: boolean;
}

export interface CpmPipelineStatus {
  jobManagerReachable: boolean;
  jobManagerUrl: string;
  allRequiredRunning: boolean;
  cplmRunning: boolean;
  alarmRunning: boolean;
  jobs: CpmPipelineJob[];
  unexpectedJobs: string[];
}

export const getPipelineStatus = () =>
  apiJson<CpmPipelineStatus>(`${BASE}/pipeline-status`);

// ── Fleet rankings & heatmap (U1/U3) ────────────────────────────────────────

export interface CpmRankedLoop {
  rank: number;
  loopId: string;
  displayName: string;
  site: string;
  area: string | null;
  unit: string | null;
  loopType: string;
  criticality: string;
  windowEnd: string | null;
  diagnosis: string;
  severity: string | null;
  confidence: number | null;
  metrics: {
    effortRatio: number | null;
    triangularity: number | null;
    horchOddness: number | null;
    acfPeriodS: number | null;
    /**
     * Share of samples inside the acceptable error band, as a **0..1 FRACTION**
     * despite the `Pct` name (the column is `good_error_pct`; verified range in
     * stored data is 0..1, mean ~0.88). Multiply by 100 before display.
     * Treating it as an already-scaled percent renders every healthy loop as
     * ~1% and, against the usual 80/50 thresholds, permanently red.
     */
    goodErrorPct: number | null;
    mae: number | null;
  };
  observabilityFlags: string[];
  /** v2.5 (1E.2): fusion v2 leading hypothesis (STICTION | OSCILLATION_TUNING | …); null on pre-v2.5 rows. */
  leadingHypothesis: string | null;
}

/**
 * `orderBy` decides which loops the LIMIT keeps, so it must be sent to the server
 * rather than applied to the returned page — re-sorting 50 rows that were selected
 * by confidence cannot surface the fleet's worst-controlled loop.
 */
export type CpmRankingOrder = 'confidence' | 'error' | 'mae' | 'effort';
/** v2.5 (1H.6): server-side fleet health filters — the server decides, the page never re-filters a LIMITed page. */
export type CpmHealthFilter = 'missing-binding' | 'stale-collection' | 'active-affected';

export const getFleetRankings = (
  scope?: CpmFleetScope | string, windowKind = '24h', limit = 50, orderBy: CpmRankingOrder = 'confidence',
  health?: CpmHealthFilter,
) => {
  const params = new URLSearchParams({ windowKind, limit: String(limit), orderBy });
  if (health) params.set('health', health);
  applyScope(params, scope);
  return apiJson<{
    site: string | null; windowKind: string; orderBy: string;
    count: number; loops: CpmRankedLoop[];
  }>(`${BASE}/fleet/rankings?${params.toString()}`);
};

export interface CpmHeatmapLoop {
  loopId: string;
  displayName: string;
  loopType: string;
  windowEnd: string | null;
  diagnosis: string;
  confidence: number | null;
  gates: Record<string, string>;
}

/**
 * CHG-025: the matrix pages and searches client-side over this payload, so ask for the
 * server's whole allowance (it clamps at 2,000). `total` is the number of monitored loops
 * in scope; `truncated` says the payload was cut — the matrix must then say so instead of
 * answering "no loops match" for a loop that exists.
 */
export const getFleetHeatmap = (scope?: CpmFleetScope | string, windowKind = '24h', limit = 2000) => {
  const params = new URLSearchParams({ windowKind, limit: String(limit) });
  applyScope(params, scope);
  return apiJson<{
    site: string | null; windowKind: string; gateKeys: string[];
    count: number; total: number; truncated: boolean; loops: CpmHeatmapLoop[];
  }>(`${BASE}/fleet/heatmap?${params.toString()}`);
};

// ── Calculations catalogue (U3 drawer, U9) ──────────────────────────────────

export interface CpmGateDefinition {
  key: string;
  name: string;
  tier: string;
  question: string;
  observedInResults: boolean;
}

export interface CpmCalculations {
  calculationVersion: string | null;
  dynamicsProfileVersion: string | null;
  engine: string;
  gates: CpmGateDefinition[];
  families: { key: string; label: string; primaryGates: string[] }[];
  bands: { band: string; maxConfidence: number }[];
  note: string;
}

export const getCalculations = () =>
  apiJson<CpmCalculations>(`${BASE}/calculations`);

// ── Raw cursor read (U7/U8): stable paging for evidence replay ──────────────

export const getRawCursor = (
  series: string, start: Date, end: Date, maxCount = 2000,
  cursor?: number, measurements = 'pv,sp,op,mode', signal?: AbortSignal,
) => {
  const params = new URLSearchParams({
    series,
    start: start.toISOString(),
    end: end.toISOString(),
    maxCount: String(maxCount),
    measurements,
  });
  if (cursor != null) params.set('cursor', String(cursor));
  return apiJson<{
    series: string; count: number; cursor: number | null;
    nextCursor: number | null; hasMore: boolean; points: CpmTrendPoint[];
  }>(`/api/hist/raw/cursor?${params.toString()}`, { signal });
};

// ── Recompute (A8, U8) ──────────────────────────────────────────────────────

export const recomputeLoop = (loopId: string) =>
  apiJson<{ loopId: string; replayId: string; jobId: string; statusUrl: string }>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/recompute`, { method: 'POST' });

export const getReplayStatus = (replayId: string, jobId: string) =>
  apiJson<{ replayId: string; jobId: string; state: string; finished: boolean; succeeded: boolean }>(
    `${BASE}/replays/${encodeURIComponent(replayId)}?jobId=${encodeURIComponent(jobId)}`);

// ── Pipeline metrics (DG-1 proxy, U7/U11) ───────────────────────────────────

export interface CpmJobMetrics {
  name: string;
  jid: string;
  state: string;
  role: CpmJobRole;
  startTime: string | null;
  uptimeSec: number | null;
  checkpoint: {
    completed: number;
    failed: number;
    lastDurationMs: number | null;
    lastSizeBytes: number | null;
    lastCompletedAgeSec: number | null;
  } | null;
}

export const getPipelineMetrics = () =>
  apiJson<{
    jobManagerReachable: boolean;
    collectedAt: string;
    jobs: CpmJobMetrics[];
    unavailable: string[];
  }>(`${BASE}/pipeline-metrics`);
