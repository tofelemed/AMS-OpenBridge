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
}

export interface CpmTagMapEntry {
  signalRole: string;
  unsPath: string;
  sourceSystem?: string | null;
  sourceTag?: string | null;
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

export const deleteLoop = (loopId: string) =>
  apiJson<{ loopId: string; deleted: boolean }>(
    `${BASE}/loops/${encodeURIComponent(loopId)}`, { method: 'DELETE' });

export const republishEvidence = (loopId: string) =>
  apiJson<{ loopId: string; republished: boolean; projected: number; links: number }>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/republish-evidence`, { method: 'POST' });

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
}

export const getEvents = (q: CpmEventsQuery = {}) => {
  const params = new URLSearchParams();
  if (q.loopId) params.set('loopId', q.loopId);
  if (q.openOnly !== undefined) params.set('openOnly', String(q.openOnly));
  if (q.includeShelved) params.set('includeShelved', 'true');
  if (q.from) params.set('from', q.from);
  if (q.limit) params.set('limit', String(q.limit));
  return apiJson<{ count: number; openOnly: boolean; events: CpmEventFrame[] }>(
    `${BASE}/events?${params.toString()}`);
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

export const getLatestGates = (loopId: string, windowKind = '24h') =>
  apiJson<CpmGateMatrix>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/gates/latest?windowKind=${windowKind}`);

export const getGateHistory = (
  loopId: string, windowKind = '24h', from?: string, to?: string, limit = 100,
) => {
  const params = new URLSearchParams({ windowKind, limit: String(limit) });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return apiJson<{ loopId: string; windowKind: string; count: number; windows: CpmGateMatrix[] }>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/gates?${params.toString()}`);
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

export const getFleetSummary = (site?: string, windowKind = '24h') => {
  const params = new URLSearchParams({ windowKind });
  if (site) params.set('site', site);
  return apiJson<CpmFleetSummary>(`${BASE}/fleet/summary?${params.toString()}`);
};

// ── Pipeline (U11, U1 runtime panel) ────────────────────────────────────────

export interface CpmPipelineJob {
  name: string;
  role: 'alarm' | 'cplm';
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
    goodErrorPct: number | null;
    mae: number | null;
  };
  observabilityFlags: string[];
}

export const getFleetRankings = (site?: string, windowKind = '24h', limit = 50) => {
  const params = new URLSearchParams({ windowKind, limit: String(limit) });
  if (site) params.set('site', site);
  return apiJson<{ site: string | null; windowKind: string; count: number; loops: CpmRankedLoop[] }>(
    `${BASE}/fleet/rankings?${params.toString()}`);
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

export const getFleetHeatmap = (site?: string, windowKind = '24h', limit = 100) => {
  const params = new URLSearchParams({ windowKind, limit: String(limit) });
  if (site) params.set('site', site);
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

/** envelope=true adds <m>_min/<m>_max/<m>_avg columns so oscillation renders truthfully. */
export const getTrend = (
  series: string, start: Date, end: Date, width = 300,
  measurements = 'pv,sp,op', envelope = true,
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
    `/api/hist/trend?${params.toString()}`);
};

// ── KPI stream (U2/U9): short/long feature rows carry the raw metric values ──

export interface CpmKpiRow {
  window_start: string | null;
  window_end: string | null;
  sample_count: number | null;
  created_at: string;
  [metric: string]: number | string | null;
}

export const getKpis = (
  loopId: string, resolution = '24h', from?: string, to?: string, limit = 50,
) => {
  const params = new URLSearchParams({ resolution, limit: String(limit) });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return apiJson<{ loopId: string; resolution: string; tier: 'short' | 'long'; count: number; samples: CpmKpiRow[] }>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/kpis?${params.toString()}`);
};
