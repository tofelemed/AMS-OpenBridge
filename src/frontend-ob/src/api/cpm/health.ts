/**
 * api/cpm/health — v2.5 Task 1H.6: a loop's Instrumental (NAMUR NE107) transmitter health as
 * served by cplm-api (GET /loops/{id}/instrument-health, …/history). The browser renders what
 * Flink decided; nothing here re-derives eligibility.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE as BASE } from './base';

export type HealthEligibility = 'ELIGIBLE' | 'LIMITED' | 'INELIGIBLE' | 'UNKNOWN' | 'NOT_CONFIGURED';
export type Ne107Flag = 'F' | 'C' | 'S' | 'M';

export interface HealthDiagnostic {
  diagnosticId: string;
  nativeCode: string | null;
  message: string | null;
  flags: string[];
  affectedVariableIds: string[];
  measurementImpact: string | null;
  firstObservedAt: string | null;
  cause: string | null;
  remedy: string | null;
  sourceRecordRef: string | null;
}

export interface RoleHealth {
  role: string;
  eligibility: HealthEligibility;
  descriptiveEligibility: HealthEligibility;
  reason: string;
  deviceId: string | null;
  bindingId: string | null;
  activeFlags: string[];
  collectionState: string;
  measurementImpact: string;
  healthStateId: string | null;
  intervalFrom: string | null;
  intervalTo: string | null;
  intervalRevision: number;
  lastObservedAt: string | null;
  lastVerifiedAt: string | null;
  observedAgeS: number | null;
  verifiedAgeS: number | null;
  nativeStatus: string | null;
  activeDiagnostics: number;
  diagnostics: HealthDiagnostic[];
  interpretationVersion: number | null;
}

export interface LoopInstrumentHealth {
  loopId: string;
  at: string;
  roles: RoleHealth[];
  sourceState: string | null;
  sourceSince: string | null;
}

export interface HealthHistoryRow {
  role: string;
  deviceId: string;
  bindingId: string;
  from: string;
  to: string | null;
  eligibility: HealthEligibility;
  descriptiveEligibility: HealthEligibility;
  reason: string;
  healthStateId: string;
  activeFlags: string[];
  collectionState: string;
  measurementImpact: string;
  revision: number;
  emittedAt: string;
}

export interface HealthHistory {
  loopId: string;
  from: string;
  to: string;
  count: number;
  intervals: HealthHistoryRow[];
}

export const getInstrumentHealth = (loopId: string, at?: Date, signal?: AbortSignal) => {
  const q = at ? `?at=${encodeURIComponent(at.toISOString())}` : '';
  return apiJson<LoopInstrumentHealth>(`${BASE}/loops/${encodeURIComponent(loopId)}/instrument-health${q}`, { signal });
};

export const getInstrumentHealthHistory = (
  loopId: string, from: Date, to: Date, limit = 200, signal?: AbortSignal,
) => {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), limit: String(limit) });
  return apiJson<HealthHistory>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/instrument-health/history?${params.toString()}`, { signal });
};
