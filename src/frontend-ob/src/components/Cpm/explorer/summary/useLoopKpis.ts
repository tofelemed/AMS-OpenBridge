/** One loop's KPI summary. The band and the KPI cards read the same query key, so they share one fetch. */
import { useQuery } from '@tanstack/react-query';
import { getLoopKpis } from '../../../../api/cpm/loopKpis';

export const useLoopKpis = (loopId: string, windowKind: string) => useQuery({
  queryKey: ['cpm', 'loop-kpis', loopId, windowKind],
  queryFn: ({ signal }) => getLoopKpis(loopId, windowKind, signal),
  refetchInterval: 5 * 60_000,
});
