/**
 * CHG-082 / KPI Phase 2: react-query hooks for the Overview KPIs and their drill-down. Polled like the other fleet reads
 * (the server classifies once per scope behind its 15 s fleet cache).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { backgroundPoll } from '../../../api/apiFetch';
import { getFleetKpiLoops, getFleetKpis, type FleetKpiKey } from '../../../api/cpm/fleetKpis';
import type { CpmFleetScope } from '../../../api/cpmApi';

const scopeKey = (s?: CpmFleetScope) => [s?.site ?? '', s?.area ?? '', s?.unit ?? ''].join('|');

export function useFleetKpis(scope?: CpmFleetScope) {
  return useQuery({
    queryKey: ['cpm', 'fleet', 'kpis', scopeKey(scope)],
    queryFn: backgroundPoll(({ signal }: { signal: AbortSignal }) => getFleetKpis(scope, signal)),
    refetchInterval: 60_000,
  });
}

export function useFleetKpiLoops(
  q: { kpi: FleetKpiKey; reason?: string | null; q?: string; page: number; pageSize: number } & CpmFleetScope,
) {
  return useQuery({
    queryKey: ['cpm', 'fleet', 'kpi-loops', q.kpi, q.reason ?? '', q.q ?? '', q.page, q.pageSize, scopeKey(q)],
    queryFn: ({ signal }) => getFleetKpiLoops(q, signal),
    placeholderData: keepPreviousData,
  });
}
