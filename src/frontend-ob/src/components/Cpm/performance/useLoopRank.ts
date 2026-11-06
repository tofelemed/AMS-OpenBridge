/**
 * The server's ranking for the two sorts that cannot be worked out from the list's own rows (control error and
 * priority). It is fetched only while one of them is chosen, up to RANKING_LIMIT loops, with the page's health filter.
 */
import { useMemo } from 'react';
import type { CpmFleetScope, CpmHealthFilter } from '../../../api/cpmApi';
import { useFleetRankings } from '../../../hooks/useCpm';
import { RANKING_LIMIT, type LoopSort } from './loopSort';

export function useLoopRank(
  scope: CpmFleetScope | string | undefined, windowKind: string, sort: LoopSort, health?: CpmHealthFilter,
): ReadonlyMap<string, number> | undefined {
  const ranked = sort === 'error' || sort === 'priority';
  const q = useFleetRankings(scope, windowKind, sort === 'priority' ? 'priority' : 'error', RANKING_LIMIT, ranked, health);
  return useMemo(
    () => (ranked && q.data ? new Map(q.data.loops.map((l, i) => [l.loopId.toLowerCase(), i] as const)) : undefined),
    [ranked, q.data]);
}
