/**
 * CHG-082 / KPI Phase 2: the Overview KPIs and their drill-down (cplm-api `GET /fleet/kpis`, `GET /fleet/kpis/loops`).
 * Rules, formulas and evidence: kpi_calculation_logic/KPI-LOGIC.md. Every count here is the length of its drill-down list.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';
import type { CpmFleetScope } from '../cpmApi';

export type FleetKpiKey =
  | 'all' | 'assessed' | 'acceptable' | 'no-fault-limited' | 'finding' | 'symptom' | 'oscillating' | 'valve' | 'effort'
  | 'normal-mode' | 'out-of-mode' | 'manual-mode' | 'saturated' | 'not-assessable' | 'stale' | 'never-evaluated';

/** CHG-089: a fleet scope plus the fused window the KPIs are counted on (12h default, 24h on request). */
export type FleetKpiScope = CpmFleetScope & { windowKind?: string };

export interface FleetKpiBasis {
  windowKind: string;
  /** CHG-089: the windows the server accepts (12h, 24h). */
  windows?: string[];
  freshSeconds: number;
  normalModeMin: number;
  /** CHG-089: "in manual mode" = MANUAL ≥ this share of the window. */
  manualModeMin?: number;
  saturationMax: number;
  g0CompletenessMin: number;
  g0BadQualityMax: number;
  findingBands: string[];
  symptomBands: string[];
  noFaultCodes: string[];
  reference: string;
}

export interface FleetKpiFigure {
  key: FleetKpiKey;
  label: string;
  count: number;
  denominator: number;
  denominatorLabel: string;
  rule: string;
}

export interface FleetKpis {
  basis: FleetKpiBasis;
  computedAt: string;
  monitored: number;
  states: { assessed: number; notAssessable: number; stale: number; neverEvaluated: number };
  notAssessableByReason: Array<{ reason: string; count: number }>;
  assessed: { acceptable: number; noFaultLimited: number; finding: number; symptomOnly: number; unrecognised: number };
  kpis: FleetKpiFigure[];
  /** CHG-093 (SME review 2 #10/#11): the Performance headline over every assessed loop in scope; absent on an older cplm-api. */
  performance?: FleetPerformance;
  /** The same classification as it stood 24 h earlier (the change shown on each card); absent on an older cplm-api. */
  previous?: { asOf: string; monitored: number; kpis: Array<{ key: FleetKpiKey; count: number; denominator: number }> };
}

/** CHG-093: fleet performance figures with their basis — every assessed loop, the exclusions counted, error as % of PV span. */
export interface FleetPerformance {
  monitored: number;
  assessed: number;
  excluded: { notAssessable: number; stale: number; neverEvaluated: number };
  goodError: { meanPct: number | null; medianPct: number | null; counted: number; notMeasured: number };
  errorOfSpan: { medianPct: number | null; counted: number; noSpan: number; notMeasured: number };
  periodic: { count: number; of: number };
}

export interface FleetKpiDeciding {
  label: string;
  value: number | null;
  threshold: number | null;
  unit: 'fraction' | 'score' | 'seconds' | '';
  comparator: string;
  measured: boolean;
}

export interface FleetKpiRow {
  loopId: string;
  displayName?: string | null;
  site?: string | null;
  area?: string | null;
  unit?: string | null;
  loopType?: string | null;
  criticality?: string | null;
  state: 'Assessed' | 'NotAssessable' | 'Stale' | 'NeverEvaluated';
  reason?: string | null;
  outcome: string;
  diagnosis?: string | null;
  band?: string | null;
  family?: string | null;
  evidenceScore?: number | null;
  windowKind: string;
  windowEnd?: string | null;
  ageSeconds?: number | null;
  deciding: FleetKpiDeciding;
  /** CHG-093 (SME review 2 #12): the performance criteria a no-fault loop misses; empty when acceptable. */
  limitedBy?: string[];
  inputs: {
    autoPct?: number | null; manualPct?: number | null; saturationPct?: number | null; limitSource?: string | null;
    satLimitDwellS?: number | null; completeness?: number | null; badQualityPct?: number | null; sampleCount?: number | null;
    expectedSampleCount?: number | null; maxGapS?: number | null; gate0Reason?: string | null; periodS?: number | null;
    periodStatus?: string | null; acfRegularity?: number | null; effortRatio?: number | null; travelPerDay?: number | null;
    reversalsPerHour?: number | null; g14State?: string | null;
    g3Status?: string | null; g4Status?: string | null; goodErrorPct?: number | null; errorPctOfSpan?: number | null;
  };
  lastVerdict?: { diagnosis: string; windowEnd?: string | null } | null;
}

export interface FleetKpiLoops {
  kpi: FleetKpiKey;
  reason?: string | null;
  basis: FleetKpiBasis;
  computedAt: string;
  figure?: FleetKpiFigure | null;
  /** Every loop behind the KPI in this scope (= the tile's count); `matched` after the search. */
  total: number;
  matched: number;
  page: number;
  pageSize: number;
  rows: FleetKpiRow[];
}

const scoped = (scope?: FleetKpiScope) => {
  const p = new URLSearchParams();
  if (scope?.site) p.set('site', scope.site);
  if (scope?.area) p.set('area', scope.area);
  if (scope?.unit) p.set('unit', scope.unit);
  if (scope?.windowKind) p.set('windowKind', scope.windowKind);   // CHG-089 (server default 12h)
  return p;
};

export const getFleetKpis = (scope?: FleetKpiScope, signal?: AbortSignal) => {
  const p = scoped(scope);
  return apiJson<FleetKpis>(`${CPM_BASE}/fleet/kpis${p.size ? `?${p}` : ''}`, { signal });
};

export const getFleetKpiLoops = (
  q: { kpi: FleetKpiKey; reason?: string | null; q?: string; page?: number; pageSize?: number; asOf?: string | null } & FleetKpiScope,
  signal?: AbortSignal,
) => {
  const p = scoped(q);
  p.set('kpi', q.kpi);
  if (q.reason) p.set('reason', q.reason);
  if (q.q) p.set('q', q.q);
  if (q.asOf) p.set('asOf', q.asOf);   // a trend day: the loops that day's point counted
  p.set('page', String(q.page ?? 1));
  p.set('pageSize', String(q.pageSize ?? 50));
  return apiJson<FleetKpiLoops>(`${CPM_BASE}/fleet/kpis/loops?${p}`, { signal });
};

/** KPI Phase 5: one point per day — every figure as it stood at the same time of day (same rules, rows of that instant). */
export interface FleetKpiTrendPoint {
  asOf: string;
  /** Today's point = the cards' live snapshot; its list is the live list (no asOf). */
  isNow?: boolean;
  monitored: number;
  assessed: number;
  kpis: Array<{ key: FleetKpiKey; count: number; denominator: number }>;
}

export interface FleetKpiTrend { basis: FleetKpiBasis; days: number; anchor: string; points: FleetKpiTrendPoint[] }

export const getFleetKpiTrend = (scope?: FleetKpiScope, days = 14, signal?: AbortSignal) => {
  const p = scoped(scope);
  p.set('days', String(days));
  return apiJson<FleetKpiTrend>(`${CPM_BASE}/fleet/kpis/trend?${p}`, { signal });
};
