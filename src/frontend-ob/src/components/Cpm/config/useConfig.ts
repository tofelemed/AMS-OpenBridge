/**
 * v2.5 Task 3D.1: the configuration workspace's data hooks. The catalogue is the build's (stable
 * for the session); a bundle is re-read after every server-owned step so what renders is what the
 * server recorded, never an optimistic state; a deployment polls while it is in flight.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveDraft, createDeployment, createDraft, getBundle, getConfigCatalogue, getDeployment, getEffectiveConfig, listBundles, listDeployments,
  patchDraft, rollbackDeployment, shadowDraft, validateDraft, type Deployment, type PatchOp, type ScopeKind,
} from '../../../api/cpm/config';

const IN_FLIGHT = new Set(['SCHEDULED', 'PREPARING', 'PREPARED', 'APPLYING', 'PROBING']);

export const useConfigCatalogue = () => useQuery({ queryKey: ['cpm', 'config', 'catalogue'], queryFn: ({ signal }) => getConfigCatalogue(signal), staleTime: 300_000 });

export const useEffectiveConfig = (loopId: string | undefined, at?: string) => useQuery({
  queryKey: ['cpm', 'config', 'effective', loopId ?? '', at ?? ''],
  queryFn: ({ signal }) => getEffectiveConfig(loopId!, at, signal),
  enabled: !!loopId,
  staleTime: 30_000,
});

export const useBundles = (site: string | undefined, scopeKind?: ScopeKind, scopeRef?: string) => useQuery({
  queryKey: ['cpm', 'config', 'bundles', site ?? '', scopeKind ?? '', scopeRef ?? ''],
  queryFn: ({ signal }) => listBundles(site!, { scopeKind, scopeRef }, signal),
  enabled: !!site,
  staleTime: 15_000,
});

export const useBundle = (id: string | undefined) => useQuery({
  queryKey: ['cpm', 'config', 'bundle', id ?? ''],
  queryFn: ({ signal }) => getBundle(id!, signal),
  enabled: !!id,
  staleTime: 10_000,
});

export const useDeployments = (bundleId: string | undefined) => useQuery({
  queryKey: ['cpm', 'config', 'deployments', bundleId ?? ''],
  queryFn: ({ signal }) => listDeployments({ bundleId, limit: 20 }, signal),
  enabled: !!bundleId,
  refetchInterval: q => ((q.state.data?.deployments ?? []).some(d => IN_FLIGHT.has(d.state)) ? 5_000 : false),
});

export const useDeployment = (id: string | undefined) => useQuery({
  queryKey: ['cpm', 'config', 'deployment', id ?? ''],
  queryFn: ({ signal }) => getDeployment(id!, signal),
  enabled: !!id,
  refetchInterval: q => (q.state.data && IN_FLIGHT.has((q.state.data as Deployment).state) ? 5_000 : false),
});

/** Every server-owned step invalidates the bundle (and its site list) so the recorded state renders. */
export function useConfigActions(site: string | undefined) {
  const qc = useQueryClient();
  const settle = (bundleId?: string) => {
    void qc.invalidateQueries({ queryKey: ['cpm', 'config', 'bundles', site ?? ''] });
    if (bundleId) void qc.invalidateQueries({ queryKey: ['cpm', 'config', 'bundle', bundleId] });
    if (bundleId) void qc.invalidateQueries({ queryKey: ['cpm', 'config', 'deployments', bundleId] });
    void qc.invalidateQueries({ queryKey: ['cpm', 'config', 'effective'] });
  };
  const create = useMutation({ mutationFn: (req: { site: string; scopeKind: ScopeKind; scopeRef?: string | null; parentBundleId?: string | null; note?: string }) => createDraft(req), onSettled: () => settle() });
  const patch = useMutation({ mutationFn: (a: { id: string; etag: string; ops: PatchOp[] }) => patchDraft(a.id, a.etag, a.ops), onSettled: (_d, _e, a) => settle(a.id) });
  const validate = useMutation({ mutationFn: (id: string) => validateDraft(id), onSettled: (_d, _e, id) => settle(id) });
  const shadow = useMutation({ mutationFn: (a: { id: string; loopId?: string; hours?: number }) => shadowDraft(a.id, { loopId: a.loopId, hours: a.hours }), onSettled: (_d, _e, a) => settle(a.id) });
  const approve = useMutation({ mutationFn: (a: { id: string; note?: string; validityHours?: number }) => approveDraft(a.id, { note: a.note, validityHours: a.validityHours }), onSettled: (_d, _e, a) => settle(a.id) });
  const deploy = useMutation({ mutationFn: (a: { bundleId: string; scheduledFor?: string | null }) => createDeployment(a), onSettled: (_d, _e, a) => settle(a.bundleId) });
  const rollback = useMutation({ mutationFn: (id: string) => rollbackDeployment(id), onSettled: () => settle() });
  return { create, patch, validate, shadow, approve, deploy, rollback };
}
