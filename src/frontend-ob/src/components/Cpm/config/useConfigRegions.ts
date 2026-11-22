/**
 * CHG-219: the per-loop settings view's data. Reads only while the view is open; a batch is re-read every few seconds while one of
 * its rows is still deploying, so each row follows its deployment until it is active.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approveBatch, deployBatch, getBatch, getRegions, getStaleLoops, postRegions, restackLoops, type Batch, type RegionChange } from '../../../api/cpm/configRegions';

// before the workers' answer settles it: the deployment record's states, and the bundle's own right after Deploy
const MOVING_DEPLOYMENT = new Set(['SCHEDULED', 'PREPARING', 'PREPARED', 'APPLYING', 'APPLIED', 'PROBING']);
const MOVING_BUNDLE = new Set(['SCHEDULED', 'PREPARED']);
/** True while any row still waits for its deployment to finish. */
export const batchMoving = (b: Batch | undefined) =>
  !!b?.rows.some(r => (r.deploymentState != null ? MOVING_DEPLOYMENT.has(r.deploymentState) : MOVING_BUNDLE.has(r.state)));

export const useRegions = (site: string | undefined, enabled = true) => useQuery({
  queryKey: ['cpm', 'config', 'regions', site ?? ''],
  queryFn: ({ signal }) => getRegions(site!, signal),
  enabled: enabled && !!site,
  staleTime: 15_000,
});

export const useStaleLoops = (site: string | undefined, enabled = true) => useQuery({
  queryKey: ['cpm', 'config', 'stale-loops', site ?? ''],
  queryFn: ({ signal }) => getStaleLoops(site!, signal),
  enabled: enabled && !!site,
  staleTime: 30_000,
});

export const useBatch = (batchId: string | undefined, site: string | undefined) => useQuery({
  queryKey: ['cpm', 'config', 'batch', batchId ?? '', site ?? ''],
  queryFn: ({ signal }) => getBatch(batchId!, site!, signal),
  enabled: !!batchId && !!site,
  refetchInterval: query => (batchMoving(query.state.data) ? 4_000 : false),
});

export function useRegionActions(site: string | undefined) {
  const qc = useQueryClient();
  const settle = () => {
    for (const key of ['regions', 'stale-loops', 'batch', 'bundle-summaries', 'effective', 'effective-summary']) void qc.invalidateQueries({ queryKey: ['cpm', 'config', key] });
  };
  return {
    save: useMutation({ mutationFn: (a: { regions: RegionChange[]; note: string }) => postRegions(a.regions, a.note), onSettled: settle }),
    restack: useMutation({ mutationFn: (a: { note: string; loopIds?: string[] }) => restackLoops(site!, a.note, a.loopIds), onSettled: settle }),
    approve: useMutation({ mutationFn: (a: { batchId: string; note: string }) => approveBatch(a.batchId, site!, a.note), onSettled: settle }),
    deploy: useMutation({ mutationFn: (batchId: string) => deployBatch(batchId, site!), onSettled: settle }),
  };
}
