/**
 * CHG-023 (P0-2) — the Performance page's attention ("bad actors") list.
 *
 * It used to be a second /fleet/rankings request (limit 12) fired beside the page's
 * own limit-50 ranking. Both asked for the confidence order, so the twelve were
 * always the first twelve of the fifty — the heaviest query on the page, doubled,
 * and repeated every 60 s. The confidence order is now a slice of the page's
 * ranking (react-query serves both hooks from the one request, same key). Only the
 * "error" order — a different server ORDER BY that cannot be derived from a
 * confidence-selected page — still costs its own request, and only while chosen.
 */
import { useMemo } from 'react';
import type { CpmFleetScope, CpmRankedLoop } from '../../api/cpmApi';
import { useFleetRankings } from '../../hooks/useCpm';
import type { RankBy } from './AttentionList';

const BAD_ACTOR_COUNT = 12;

export interface BadActorsPage { orderBy: string; count: number; loops: CpmRankedLoop[] }

export interface BadActors {
  data: BadActorsPage | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

export function useBadActors(
  scope: CpmFleetScope | string | undefined, windowKind: string, rankBy: RankBy,
): BadActors {
  // Same query key as CpmPerformance's `rankings` (confidence, 50) → one request.
  const top = useFleetRankings(scope, windowKind, 'confidence', 50);
  const byError = useFleetRankings(scope, windowKind, 'error', BAD_ACTOR_COUNT, rankBy === 'error');

  const sliced = useMemo<BadActorsPage | undefined>(() => top.data
    ? { orderBy: top.data.orderBy, count: Math.min(BAD_ACTOR_COUNT, top.data.loops.length),
        loops: top.data.loops.slice(0, BAD_ACTOR_COUNT) }
    : undefined, [top.data]);

  const src = rankBy === 'error' ? byError : top;
  return {
    data: rankBy === 'error' ? byError.data : sliced,
    isLoading: src.isLoading,
    isError: src.isError,
    error: src.error,
    refetch: src.refetch,
  };
}
