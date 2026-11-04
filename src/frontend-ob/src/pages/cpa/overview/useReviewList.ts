/**
 * The review table's rows. Needing review is the server's priority queue, which has no paging or
 * search, so both happen here over the whole queue. Every other filter is the server's KPI list,
 * paged and searched there. It has no sort parameter, so headings sort only a list that fits one
 * page: re-sorting one page of many would rank that page alone.
 */
import { useCallback, useMemo, useState } from 'react';
import type { FleetKpiLoops, FleetKpiRow, FleetKpiScope } from '../../../api/cpm/fleetKpis';
import type { CpmRankedLoop } from '../../../api/cpmApi';
import { useDebounced } from '../../../components/Cpm/events/useEventPage';
import type { SortState } from '../../../ui/DataTable';
import { NEEDING, type ReviewKey } from './reviewFilters';
import { fromKpi, fromRanked, nextSort, searchRows, sortRows, type ReviewRow } from './reviewRows';
import { useKpiList } from './useOverviewData';

export const REVIEW_PAGE_SIZE = 25;

export interface ReviewListInput {
  review: ReviewKey;
  reason: string | null;
  day: string | null;
  scope: FleetKpiScope;
  windowKind: string;
  queue: CpmRankedLoop[];
  queueLoading: boolean;
  queueError: unknown;
  retryQueue: () => void;
  fleet: Map<string, FleetKpiRow>;
}

export interface ReviewList {
  rows: ReviewRow[];
  loading: boolean;
  error: unknown;
  retry: () => void;
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  /** Rows behind the current filter and search. */
  matched: number;
  total: number;
  search: string;
  setSearch: (text: string) => void;
  /** The search actually applied, after the typing has stopped. */
  searching: boolean;
  sort: SortState;
  onSort: (key: string) => void;
  resetSort: () => void;
  sortable: boolean;
  served: FleetKpiLoops | undefined;
}

const pagesOf = (count: number) => Math.max(1, Math.ceil(count / REVIEW_PAGE_SIZE));

export function useReviewList(input: ReviewListInput): ReviewList {
  const { review, reason, day, scope, windowKind, queue, queueLoading, queueError, retryQueue, fleet } = input;
  const [search, setSearchText] = useState('');
  const query = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(null);

  // Page and sort belong to one list. Set during render, so the old page is never asked of the new list.
  const listKey = [review, reason, day, scope.site, scope.area, scope.unit, windowKind].join('|');
  const [seenKey, setSeenKey] = useState(listKey);
  if (seenKey !== listKey) {
    setSeenKey(listKey);
    setPage(1);
    setSort(null);
  }

  const isQueue = review === NEEDING;
  const list = useKpiList({
    kpi: isQueue ? 'all' : review, reason, q: query || undefined, page, pageSize: REVIEW_PAGE_SIZE, asOf: day, ...scope,
  }, !isQueue);

  const rankOf = useMemo(() => new Map(queue.map(r => [r.loopId.toLowerCase(), r])), [queue]);

  const queueRows = useMemo(() => {
    if (!isQueue) return [];
    const rows = queue.map(r => fromRanked(r, fleet.get(r.loopId.toLowerCase()) ?? null, windowKind));
    return sortRows(searchRows(rows, query), sort);
  }, [isQueue, queue, fleet, windowKind, query, sort]);

  const served = isQueue ? undefined : list.data;
  const pagedByServer = !isQueue && (served?.matched ?? 0) > REVIEW_PAGE_SIZE;
  const kpiRows = useMemo(() => {
    const rows = (served?.rows ?? []).map(k => fromKpi(k, rankOf.get(k.loopId.toLowerCase()) ?? null));
    return pagedByServer ? rows : sortRows(rows, sort);
  }, [served, rankOf, pagedByServer, sort]);

  const setSearch = useCallback((text: string) => {
    setSearchText(text);
    setPage(1);
  }, []);
  const onSort = useCallback((key: string) => setSort(s => nextSort(s, key)), []);
  const resetSort = useCallback(() => setSort(null), []);
  const retryList = list.refetch;
  const retry = useCallback(() => { if (isQueue) retryQueue(); else void retryList(); }, [isQueue, retryQueue, retryList]);

  const start = (page - 1) * REVIEW_PAGE_SIZE;
  const matched = isQueue ? queueRows.length : served?.matched ?? 0;
  return {
    rows: isQueue ? queueRows.slice(start, start + REVIEW_PAGE_SIZE) : kpiRows,
    loading: isQueue ? queueLoading : list.isLoading,
    error: isQueue ? queueError : list.error,
    retry,
    page,
    pageCount: pagesOf(matched),
    setPage,
    matched,
    total: isQueue ? queue.length : served?.total ?? 0,
    search,
    setSearch,
    searching: !!query,
    sort,
    onSort,
    resetSort,
    sortable: !pagedByServer,
    served,
  };
}
