/**
 * CHG-082 / KPI Phase 2: the Overview KPIs and their drill-down (cplm-api `GET /fleet/kpis`, `GET /fleet/kpis/loops`).
 * Rules, formulas and evidence: kpi_calculation_logic/KPI-LOGIC.md. Every count here is the length of its drill-down list.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';
import type { CpmFleetScope } from '../cpmApi';

export type FleetKpiKey =
  | 'all' | 'assessed' | 'acceptable' | 'no-fault-limited' | 'finding' | 'symptom' | 'oscillating' | 'valve' | 'effort'
  | 'normal-mode' | 'out-of-mode' | 'saturated' | 'not-assessable' | 'stale' | 'never-evaluated';

export interface FleetKpiBasis {
  windowKind: string;
  freshSeconds: number;
  normalModeMin: number;
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
  inputs: {
    autoPct?: number | null; manualPct?: number | null; saturationPct?: number | null; limitSource?: string | null;
    satLimitDwellS?: number | null; completeness?: number | null; badQualityPct?: number | null; sampleCount?: number | null;
    expectedSampleCount?: number | null; maxGapS?: number | null; gate0Reason?: string | null; periodS?: number | null;
    periodStatus?: string | null; acfRegularity?: number | null; effortRatio?: number | null; travelPerDay?: number | null;
    reversalsPerHour?: number | null; g14State?: string | null;
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

const scoped = (scope?: CpmFleetScope) => {
  const p = new URLSearchParams();
  if (scope?.site) p.set('site', scope.site);
  if (scope?.area) p.set('area', scope.area);
  if (scope?.unit) p.set('unit', scope.unit);
  return p;
};

export const getFleetKpis = (scope?: CpmFleetScope, signal?: AbortSignal) => {
  const p = scoped(scope);
  return apiJson<FleetKpis>(`${CPM_BASE}/fleet/kpis${p.size ? `?${p}` : ''}`, { signal });
};

export const getFleetKpiLoops = (
  q: { kpi: FleetKpiKey; reason?: string | null; q?: string; page?: number; pageSize?: number } & CpmFleetScope,
  signal?: AbortSignal,
) => {
  const p = scoped(q);
  p.set('kpi', q.kpi);
  if (q.reason) p.set('reason', q.reason);
  if (q.q) p.set('q', q.q);
  p.set('page', String(q.page ?? 1));
  p.set('pageSize', String(q.pageSize ?? 50));
  return apiJson<FleetKpiLoops>(`${CPM_BASE}/fleet/kpis/loops?${p}`, { signal });
};
