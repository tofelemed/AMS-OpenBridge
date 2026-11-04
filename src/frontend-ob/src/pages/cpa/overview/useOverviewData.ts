/**
 * Reads only Overview needs. The KPI list is the same server list the old drill-down read, with an
 * `enabled` flag, so the default view does not ask for a list it does not show.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { backgroundPoll } from '../../../api/apiFetch';
import { getFleetKpiLoops, type FleetKpiKey, type FleetKpiLoops, type FleetKpiRow, type FleetKpiScope } from '../../../api/cpm/fleetKpis';

const scopeKey = (s: FleetKpiScope) => [s.site ?? '', s.area ?? '', s.unit ?? '', s.windowKind ?? ''].join('|');

export interface KpiListQuery extends FleetKpiScope {
  kpi: FleetKpiKey;
  reason?: string | null;
  q?: string;
  page: number;
  pageSize: number;
  asOf?: string | null;
}

export function useKpiList(q: KpiListQuery, enabled: boolean) {
  const queryKey = ['cpm', 'fleet', 'kpi-loops', q.kpi, q.reason ?? '', q.q ?? '', q.page, q.pageSize, scopeKey(q), q.asOf ?? 'now'];
  return useQuery({
    queryKey,
    queryFn: ({ signal }) => getFleetKpiLoops(q, signal),
    // Rows stay on screen across a page turn or a search, never across a change of list: last
    // filter's rows under this filter's heading would read as this filter's result.
    placeholderData: (previous, prior) => {
      const same = prior && [3, 4, 7, 8, 9].every(i => prior.queryKey[i] === queryKey[i]);
      return same ? previous : undefined;
    },
    enabled,
  });
}

/** The server gives no figure for this filter, so its count is the list total (M-007). */
export function useOutOfModeCount(scope: FleetKpiScope): number | null {
  const list = useKpiList({ kpi: 'out-of-mode', page: 1, pageSize: 1, ...scope }, true);
  return list.data?.total ?? null;
}

const PAGE_SIZE = 200; // the server's clamp
const MAX_PAGES = 10;

export interface FleetRows { rows: FleetKpiRow[]; truncated: boolean }

/** Every monitored loop, one page after another, up to 2,000. `truncated` says when it stopped short. */
export async function walkFleetRows(fetchPage: (page: number) => Promise<FleetKpiLoops>): Promise<FleetRows> {
  const rows: FleetKpiRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const part = await fetchPage(page);
    rows.push(...part.rows);
    if (rows.length >= part.matched || part.rows.length === 0) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export function newestWindowEnd(rows: FleetKpiRow[]): number | null {
  let newest: number | null = null;
  for (const r of rows) {
    const end = r.windowEnd ? Date.parse(r.windowEnd) : NaN;
    if (Number.isFinite(end) && (newest == null || end > newest)) newest = end;
  }
  return newest;
}

/**
 * One classification of every monitored loop. It supplies the newest window end, which no fleet
 * read reports, the coverage of a queue row, which the queue does not carry, and a selected loop
 * that is on no page of the table. Cheap on the server: paging reads one cached classification.
 */
export function useFleetRows(scope: FleetKpiScope) {
  const query = useQuery({
    queryKey: ['cpm', 'fleet', 'kpi-index', scopeKey(scope)],
    queryFn: backgroundPoll(({ signal }: { signal: AbortSignal }) =>
      walkFleetRows(page => getFleetKpiLoops({ kpi: 'all', page, pageSize: PAGE_SIZE, ...scope }, signal))),
    refetchInterval: 60_000,
  });
  const rows = query.data?.rows;
  const byLoop = useMemo(() => new Map((rows ?? []).map(r => [r.loopId.toLowerCase(), r])), [rows]);
  const newest = useMemo(() => newestWindowEnd(rows ?? []), [rows]);
  return { byLoop, newest, loading: query.isLoading };
}
