/**
 * CHG-063: react-query hooks for the server-paged Loop Events list. Keys sit under ['cpm', 'events'] so an
 * acknowledge / shelve invalidation (useCpm.ts) refreshes the page and the looked-up episode too.
 */
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError, backgroundPoll } from '../../../api/apiFetch';
import { getEvent, getEventPage, type CpmEventPageQuery } from '../../../api/cpm/eventPage';

export function useEventPage(q: CpmEventPageQuery, refetchMs = 30_000) {
  return useQuery({
    queryKey: ['cpm', 'events', 'page', q] as const,
    queryFn: backgroundPoll(({ signal }) => getEventPage(q, signal)),
    refetchInterval: refetchMs,
    // the previous page stays on screen while the next one loads — no flash of "Loading…" on every page turn
    placeholderData: keepPreviousData,
  });
}

/** One episode by id — used only when a deep-linked episode is not on the current page. A 404 is final. */
export function useEventById(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['cpm', 'events', 'byId', id] as const,
    queryFn: ({ signal }) => getEvent(id as number, signal),
    enabled: enabled && id !== null,
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
}

/** The value after it has stopped changing for `ms` — search typing becomes one request, not one per key. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
