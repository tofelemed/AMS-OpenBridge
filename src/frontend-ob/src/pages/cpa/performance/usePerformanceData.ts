/**
 * Every read the page makes while nothing is selected. The fleet figures, the matrix and the ranking
 * are separate requests, so one can fail while the others stand (G06 partial). Health filters are
 * applied by the server: the ranking is limited, and filtering it here would rank a subset.
 */
import { useMemo } from 'react';
import type { CpmHealthFilter, CpmHeatmapLoop } from '../../../api/cpmApi';
import { buildTierGroups, latestWindowEnd } from '../../../components/Cpm/gateStatus';
import { useFleetKpis } from '../../../components/Cpm/kpi/useFleetKpis';
import { effectiveInputFlags } from '../../../components/Cpm/inputLimits';
import { inputContextOf } from '../../../components/Cpm/optionalInputs';
import { useCpmLoops, useCpmResolutions, useFleetHeatmap, useFleetRankings, useFleetSummary } from '../../../hooks/useCpm';
import { RANK_LIMIT, type SortKey } from './performanceModel';

const NO_LOOPS: CpmHeatmapLoop[] = [];
const FALLBACK_KINDS = ['12h', '24h'];

export function usePerformanceData(
  scope: { site?: string; area?: string; unit?: string }, kind: string, sort: SortKey, health: CpmHealthFilter | undefined,
) {
  const resolutions = useCpmResolutions();
  const summary = useFleetSummary(scope, kind);
  const kpis = useFleetKpis({ ...scope, windowKind: kind });
  const heatmap = useFleetHeatmap(scope, kind, health);
  const rankings = useFleetRankings(scope, kind, sort, RANK_LIMIT, true, health);
  const registry = useCpmLoops();

  const loops = heatmap.data?.loops ?? NO_LOOPS;
  const tierGroups = useMemo(() => buildTierGroups(heatmap.data?.gateKeys ?? []), [heatmap.data?.gateKeys]);
  const gateKeys = useMemo(() => tierGroups.flatMap(g => g.keys), [tierGroups]);
  const ranked = rankings.data?.loops;
  const rankOf = useMemo(() => new Map((ranked ?? []).map(l => [l.loopId.toLowerCase(), l])), [ranked]);

  /** The loop's effective input flags: a pass judged without one reads "OK on available data". */
  const inputFlagsOf = useMemo(() => {
    const byId = new Map((registry.data?.loops ?? []).map(l => [l.loopId.toLowerCase(), l]));
    const flagsById = new Map(loops.map(r => [r.loopId.toLowerCase(), r.observabilityFlags ?? []]));
    return (loopId: string) => {
      const id = loopId.toLowerCase();
      return effectiveInputFlags(flagsById.get(id), inputContextOf(byId.get(id)));
    };
  }, [registry.data, loops]);

  return {
    kinds: resolutions.data?.fusion.firesOn ?? FALLBACK_KINDS,
    summary,
    kpis,
    heatmap,
    rankings,
    loops,
    tierGroups,
    gateKeys,
    ranked,
    rankOf,
    inputFlagsOf,
    newestWindow: latestWindowEnd(loops),
    /** Monitored loops in scope, which the matrix payload may fall short of. */
    total: heatmap.data?.total ?? summary.data?.loops.total ?? null,
  };
}

export type PerformanceData = ReturnType<typeof usePerformanceData>;
