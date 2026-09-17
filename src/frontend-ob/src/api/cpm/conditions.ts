/**
 * 2026-09-17 audit F22: the fast G10 limit-dwell / G11 freeze conditions the Condition Engine
 * detects within a minute (spec v6 R11). GET /conditions lists them fleet-wide, open first;
 * GET /loops/{id}/conditions per loop. Persisted verbatim by cplm-api; nothing is computed here.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';

export interface CpmCondition {
  loopId: string;
  displayName: string | null;
  site: string | null;
  gate: string;
  kind: string;                 // LIMIT_LOW | LIMIT_HIGH | FREEZE
  state: string;                // OPEN | UPDATE | CLOSED
  startMs: number;
  lastMs: number;
  endMs: number | null;
  durationS: number;
  closeReason: string;
  evidence: Record<string, unknown>;
  updatedAt: string;
}

export interface CpmConditionScope { site?: string; area?: string; unit?: string }

export const getConditions = (scope: CpmConditionScope = {}, openOnly = false, limit = 200, signal?: AbortSignal) => {
  const params = new URLSearchParams({ openOnly: String(openOnly), limit: String(limit) });
  if (scope.site) params.set('site', scope.site);
  if (scope.area) params.set('area', scope.area);
  if (scope.unit) params.set('unit', scope.unit);
  return apiJson<{ count: number; openOnly: boolean; conditions: CpmCondition[] }>(`${CPM_BASE}/conditions?${params.toString()}`, { signal });
};
