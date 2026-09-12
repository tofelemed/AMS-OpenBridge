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

const BASE = '/api/v1/cpm';

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

// ── Gates & KPIs (U1/U3/U5/U8) ──────────────────────────────────────────────

export interface CpmGateCell {
  key: string;
  name: string;
  tier: 'short' | 'long' | 'fusion';
  status: string;
  reason: string | null;
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
  metadata: {
    schemaVersion: number | null;
    calculationVersion: string | null;
    dynamicsProfileVersion: string | null;
    dynamicsClass: string | null;
    profileSource: string | null;
    calculationSource: string | null;
    replayId: string | null;
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
}

/**
 * `orderBy` decides which loops the LIMIT keeps, so it must be sent to the server
 * rather than applied to the returned page — re-sorting 50 rows that were selected
 * by confidence cannot surface the fleet's worst-controlled loop.
 */
export type CpmRankingOrder = 'confidence' | 'error' | 'mae' | 'effort';

export const getFleetRankings = (
  scope?: CpmFleetScope | string, windowKind = '24h', limit = 50, orderBy: CpmRankingOrder = 'confidence',
) => {
  const params = new URLSearchParams({ windowKind, limit: String(limit), orderBy });
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

export const getFleetHeatmap = (scope?: CpmFleetScope | string, windowKind = '24h', limit = 100) => {
  const params = new URLSearchParams({ windowKind, limit: String(limit) });
  applyScope(params, scope);
  return apiJson<{ site: string | null; windowKind: string; gateKeys: string[]; count: number; loops: CpmHeatmapLoop[] }>(
    `${BASE}/fleet/heatmap?${params.toString()}`);
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

// ── Historian trend (envelope) ──────────────────────────────────────────────

export interface CpmTrendPoint {
  ts: number;
  [measurement: string]: number | string | null;
}

/** One measurement's last stored value, with the instant it was recorded. */
export interface CpmLastValue { value: number | string | null; ts: number }

/**
 * Last known value per measurement, from IoTDB, with NO time bound.
 *
 * The trend endpoint can only answer about its window, so a signal that did not
 * move inside it — a setpoint held for a month, a loop parked in AUT — reads as
 * null there and the card renders "—" for a value that is perfectly well known.
 * The live plane cannot cover it either: it is report-by-exception behind a TTL.
 * `ts` comes back per measurement so the UI can show age rather than implying the
 * value is live.
 */
export const getLastValues = (
  series: string, measurements = 'pv,sp,op,mode', signal?: AbortSignal,
) => {
  const params = new URLSearchParams({ series, measurements });
  return apiJson<{ series: string; values: Record<string, CpmLastValue> }>(
    `/api/hist/last?${params.toString()}`, { signal });
};

/** envelope=true adds <m>_min/<m>_max/<m>_avg columns so oscillation renders truthfully. */
export const getTrend = (
  series: string, start: Date, end: Date, width = 300,
  measurements = 'pv,sp,op', envelope = true, signal?: AbortSignal,
) => {
  const params = new URLSearchParams({
    series,
    start: start.toISOString(),
    end: end.toISOString(),
    width: String(width),
    measurements,
    envelope: String(envelope),
  });
  return apiJson<{ series: string; envelope: boolean; points: CpmTrendPoint[] }>(
    `/api/hist/trend?${params.toString()}`, { signal });
};

// ── KPI stream (U2/U9): short/long feature rows carry the raw metric values ──

export interface CpmKpiRow {
  window_start: string | null;
  window_end: string | null;
  sample_count: number | null;
  created_at: string;
  /**
   * P1-9/P1-10 qualification flags ride along as booleans: `sufficient_data`
   * (short rows — false means the engine DECLINED the window and zeroed
   * mae/rmse/iae; those zeros must never render as perfect control) and
   * `long_metrics_qualified` (long rows — false means the metrics were computed
   * on a window that failed G0).
   *
   * Short rows also carry the per-window gate verdicts (`gate0_status` …
   * `gate4_status`, `gate2r_status` — PASS/WARN/FAIL/EXCLUDED/STRONG/PENDING):
   * fusion never fires on short windows, so these are the only gate evidence
   * that exists at 1m…60m.
   */
  [metric: string]: number | string | boolean | null;
}

export interface CpmKpiPage {
  loopId: string;
  resolution: string;
  tier: 'short' | 'long';
  count: number;
  /** Keyset cursor: pass as `before` to fetch the next (older) page; null at the end. */
  nextBefore: string | null;
  samples: CpmKpiRow[];
}

export const getKpis = (
  loopId: string, resolution = '24h', from?: string, to?: string, limit = 50, signal?: AbortSignal,
  before?: string,
) => {
  const params = new URLSearchParams({ resolution, limit: String(limit) });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (before) params.set('before', before);
  return apiJson<CpmKpiPage>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/kpis?${params.toString()}`, { signal });
};

// ── Resolutions catalogue (U7): windows the engine actually emits ───────────

/**
 * The deployed window contract, served by the API so no screen hardcodes it.
 * `assigner` is 'tumbling' | 'sliding' | 'rolling-buffer' — the long tier is a
 * KeyedProcessFunction over a retained buffer, not a Flink window assigner.
 */
export interface CpmWindowSpec {
  kind: string;
  tier: 'short' | 'long';
  assigner: string;
  sizeMs: number;
  slideMs: number | null;
  allowedLatenessMs: number | null;
  cadenceMs: number | null;
  /** Slices below this sample count are not emitted at all. */
  minSamples: number | null;
  feeds: string;
  overlapping: boolean;
}

export interface CpmResolutions {
  shortWindows: string[];
  longWindows: string[];
  windows: CpmWindowSpec[];
  fusion: { firesOn: string[]; produces: string; note: string };
  gates: { key: string; name: string; tier: string }[];
  note: string;
}

export const getResolutions = () =>
  apiJson<CpmResolutions>(`${BASE}/resolutions`);

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
