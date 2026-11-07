/**
 * CHG-140: one way to read ONE evaluated window, for every evidence page. The window is named by its END, an instant:
 * `2026-10-05T12:30:00Z` and `2026-10-05T12:30:00.000Z` are the same window. The row is read by `from` and `to` = that
 * end, so a window older than the newest 100 is reached the same way as the newest. A window the service does not hold
 * is `notFound`, never replaced by the newest one: a link to a window opens it or says it cannot.
 * With no end named, the newest window opens.
 */
import { useQuery } from '@tanstack/react-query';
import { getGateHistory, getWindowSummaries, type CpmGateMatrix } from '../../../api/cpm/gates';

export const instantMs = (v: string | number | null | undefined): number =>
  typeof v === 'number' ? v : v ? Date.parse(v) : NaN;

export const sameInstant = (a: string | number | null | undefined, b: string | number | null | undefined): boolean => {
  const x = instantMs(a);
  return Number.isFinite(x) && x === instantMs(b);
};

/** A re-run of a window (REPLAY / SHADOW / EVALUATE) carries the id of the run that wrote it. */
export const isRerun = (r: CpmGateMatrix): boolean => !!r.metadata?.replayId;

/** The original outranks a re-run with the same end. */
export function preferOriginal(rows: CpmGateMatrix[]): CpmGateMatrix | undefined {
  return rows.find(r => !isRerun(r)) ?? rows[0];
}

/** The row for `endMs`, or the newest window's row for `null`; undefined when nothing matches. */
export function pickWindow(rows: CpmGateMatrix[], endMs: number | null): CpmGateMatrix | undefined {
  if (endMs == null) {
    const newest = Math.max(...rows.map(r => instantMs(r.windowEnd)).filter(Number.isFinite));
    return Number.isFinite(newest) ? preferOriginal(rows.filter(r => instantMs(r.windowEnd) === newest)) : undefined;
  }
  return preferOriginal(rows.filter(r => instantMs(r.windowEnd) === endMs));
}

export interface WindowAt {
  row: CpmGateMatrix | undefined;
  /** The row is a re-run: no original is stored for this end. */
  rerun: boolean;
  /** An end was named and the service holds no result for it. */
  notFound: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export function useWindowAt(loop: string | undefined, kind: string, end: string | null): WindowAt {
  const endMs = end ? instantMs(end) : null;
  const badEnd = end != null && !Number.isFinite(endMs);
  const iso = endMs != null && Number.isFinite(endMs) ? new Date(endMs).toISOString() : undefined;
  const q = useQuery({
    queryKey: ['cpm', 'window-at', loop ?? '', kind, iso ?? 'newest'],
    // a named window reads ANY purpose, so a re-run is reachable; the newest is the live result
    queryFn: ({ signal }) => getGateHistory(loop!, kind, iso, iso, iso ? 10 : 20, signal, true, iso ? 'ANY' : 'LIVE'),
    enabled: !!loop && !badEnd,
    staleTime: 60_000,
  });
  const row = badEnd ? undefined : pickWindow(q.data?.windows ?? [], endMs);
  return {
    row, rerun: !!row && isRerun(row),
    notFound: badEnd || (end != null && !q.isLoading && !q.isError && !!q.data && !row),
    isLoading: !badEnd && !!loop && q.isLoading, isError: q.isError, error: q.error, refetch: () => { void q.refetch(); },
  };
}

/** The end of the window just before `end` (the "previous" a comparison needs), from the summaries list; null when none is stored. */
export function usePreviousEnd(loop: string | undefined, kind: string, end: string | null | undefined) {
  const endMs = end ? instantMs(end) : NaN;
  const q = useQuery({
    queryKey: ['cpm', 'previous-end', loop ?? '', kind, Number.isFinite(endMs) ? endMs : ''],
    // limit 3: the window itself may or may not come back, depending on whether `to` is inclusive
    queryFn: ({ signal }) => getWindowSummaries(loop!, kind, { to: new Date(endMs).toISOString(), limit: 3 }, signal),
    enabled: !!loop && Number.isFinite(endMs),
    staleTime: 60_000,
  });
  const older = (q.data?.windows ?? []).map(w => w.windowEnd).filter(e => instantMs(e) < endMs).sort((a, b) => instantMs(b) - instantMs(a))[0];
  return { end: older ?? null, isLoading: q.isLoading, isError: q.isError };
}
