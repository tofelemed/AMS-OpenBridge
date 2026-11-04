/**
 * The ledger's state. Filter, order, loop and the selected episode live in the URL; state, loop,
 * plant scope, search and page are all request parameters (CHG-063), so counts describe every matching
 * episode and not a fetched page. The paged endpoint takes no time range, so none is sent.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../api/apiFetch';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { isEventFilterKey, type EventFilterKey } from '../../../components/Cpm/events/shelfState';
import { useDebounced, useEventById, useEventPage } from '../../../components/Cpm/events/useEventPage';
import { useCpaContext } from '../../../cpa/useCpaContext';

export const PAGE_SIZE = 20;

export type EpisodeSort = 'triage' | 'recent';

export type EpisodeSelection =
  | { state: 'none' }
  | { state: 'loading' }
  | { state: 'missing'; id: string }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'ready'; event: CpmEventFrame; offPage: boolean };

export function useEpisodeList() {
  const { scope, loop } = useCpaContext();
  const [params, setParams] = useSearchParams();

  const filterParam = params.get('filter');
  const filter: EventFilterKey = isEventFilterKey(filterParam) ? filterParam : 'all';
  const sort: EpisodeSort = params.get('sort') === 'recent' ? 'recent' : 'triage';
  const selectedParam = params.get('event');

  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());

  // The page belongs to one view: a changed filter starts at page 1 with no request for the old page.
  const view = [filter, sort, loop, q, scope.site, scope.area, scope.unit].join('|');
  const [paged, setPaged] = useState({ view, page: 1 });
  const page = paged.view === view ? paged.page : 1;
  const setPage = useCallback((next: number) => setPaged({ view, page: next }), [view]);

  const list = useEventPage({
    state: filter, loopId: loop || undefined, q: q || undefined, ...scope.params, sort, page, pageSize: PAGE_SIZE,
  });
  const data = list.data;
  const events = data?.events ?? [];

  // A write can empty the last page.
  useEffect(() => {
    if (data && page > data.pageCount) setPage(data.pageCount);
  }, [data, page, setPage]);

  const selectedId = selectedParam && /^\d+$/.test(selectedParam) ? Number(selectedParam) : null;
  const onPage = selectedId !== null ? events.find(e => e.id === selectedId) : undefined;
  const lookup = useEventById(selectedId, !onPage && (!!data || list.isError));
  const resolved = onPage ?? lookup.data;

  // A write can move the episode off this filter. The inspector stays on it while the lookup runs.
  const held = useRef<CpmEventFrame | null>(null);
  useEffect(() => { if (resolved) held.current = resolved; }, [resolved]);
  const event = resolved ?? (held.current?.id === selectedId ? held.current : null);

  const selection: EpisodeSelection = (() => {
    if (!selectedParam) return { state: 'none' };
    if (selectedId === null) return { state: 'missing', id: selectedParam };
    if (event) return { state: 'ready', event, offPage: !onPage };
    if (lookup.error instanceof ApiError && lookup.error.status === 404) return { state: 'missing', id: selectedParam };
    if (lookup.error) return { state: 'error', error: lookup.error, retry: () => void lookup.refetch() };
    return { state: 'loading' };
  })();

  // `replace`: picking a row or a filter is in-page work, not a page visit.
  const edit = useCallback((change: (p: URLSearchParams) => void) => {
    setParams(p => { change(p); return p; }, { replace: true });
  }, [setParams]);

  const setFilter = useCallback((next: EventFilterKey) => edit(p => p.set('filter', next)), [edit]);
  const setSort = useCallback((next: EpisodeSort) => edit(p => {
    if (next === 'triage') p.delete('sort'); else p.set('sort', next);
  }), [edit]);
  const clearLoop = useCallback(() => edit(p => p.delete('loop')), [edit]);
  const select = useCallback((id: number) => edit(p => p.set('event', String(id))), [edit]);
  const clearSelection = useCallback(() => edit(p => p.delete('event')), [edit]);
  const resetFilters = useCallback(() => {
    setSearch('');
    edit(p => { p.delete('filter'); p.delete('loop'); });
  }, [edit]);

  return {
    filter, sort, loop, search, setSearch, q, page, setPage, list, events, data, selection,
    /** A narrowing this page can undo. Plant scope belongs to the header. */
    narrowed: filter !== 'all' || !!q || !!loop,
    setFilter, setSort, clearLoop, select, clearSelection, resetFilters,
  };
}
