/**
 * CHG-140: the fused row of a method run's window, for "Why this result". A run written by a re-run or an evaluation
 * (`identity.analysisRunId`) reads the row THAT run wrote; a live run reads the original. A pinned run whose row is not
 * stored gets no row: it is never answered with the live row, whose thresholds and flags may differ.
 */
import { useQuery } from '@tanstack/react-query';
import { getGateHistory } from '../../../api/cpm/gates';
import type { MethodRun } from '../../../api/cpm/evidence';
import { instantMs, isRerun, preferOriginal } from './useWindowAt';

export function useFusedRow(loop: string | undefined, run: MethodRun | undefined) {
  const endIso = run ? new Date(run.support.toMs).toISOString() : undefined;
  const pinned = run?.identity?.analysisRunId ?? null;
  const q = useQuery({
    queryKey: ['cpm', 'why-row', loop ?? '', run?.windowKind ?? '', endIso ?? '', pinned ?? ''],
    queryFn: ({ signal }) => getGateHistory(loop!, run!.windowKind, endIso, endIso, 10, signal, true, 'ANY'),
    enabled: !!loop && !!run && run.tier === 'fusion', staleTime: 5 * 60_000,
  });
  const atEnd = (q.data?.windows ?? []).filter(r => instantMs(r.windowEnd) === instantMs(endIso));
  const row = pinned ? atEnd.find(r => isRerun(r) && r.metadata.replayId === pinned) : preferOriginal(atEnd.filter(r => !isRerun(r)));
  return { row, isLoading: q.isLoading, isError: q.isError };
}
