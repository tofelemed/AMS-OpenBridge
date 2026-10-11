/**
 * CHG-082 / KPI Phase 2: react-query hooks for the Overview KPIs and their drill-down. Polled like the other fleet reads
 * (the server classifies once per scope behind its 15 s fleet cache). CHG-089: the window (12h / 24h) is part of the
 * scope and of every query key, so the two pictures are fetched and cached apart.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { backgroundPoll } from '../../../api/apiFetch';
import { getFleetKpiLoops, getFleetKpiTrend, getFleetKpis, type FleetKpiKey, type FleetKpiScope } from '../../../api/cpm/fleetKpis';

const scopeKey = (s?: FleetKpiScope) => [s?.site ?? '', s?.area ?? '', s?.unit ?? '', s?.windowKind ?? ''].join('|');

export function useFleetKpis(scope?: FleetKpiScope) {
  return useQuery({
    queryKey: ['cpm', 'fleet', 'kpis', scopeKey(scope)],
    queryFn: backgroundPoll(({ signal }: { signal: AbortSignal }) => getFleetKpis(scope, signal)),
    refetchInterval: 60_000,
  });
}

export function useFleetKpiLoops(
  q: { kpi: FleetKpiKey; reason?: string | null; q?: string; page: number; pageSize: number; asOf?: string | null } & FleetKpiScope,
) {
  return useQuery({
    queryKey: ['cpm', 'fleet', 'kpi-loops', q.kpi, q.reason ?? '', q.q ?? '', q.page, q.pageSize, scopeKey(q), q.asOf ?? 'now'],
    queryFn: ({ signal }) => getFleetKpiLoops(q, signal),
    placeholderData: keepPreviousData,
  });
}

/** KPI Phase 5: the last `days` days, one classification per day (cached on the server between 15-min evaluations). */
export function useFleetKpiTrend(scope?: FleetKpiScope, days = 14) {
  return useQuery({
    queryKey: ['cpm', 'fleet', 'kpi-trend', scopeKey(scope), days],
    queryFn: ({ signal }) => getFleetKpiTrend(scope, days, signal),
    staleTime: 5 * 60_000,
  });
}
