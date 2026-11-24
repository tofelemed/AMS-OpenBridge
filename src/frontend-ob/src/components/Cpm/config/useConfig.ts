/**
 * v2.5 Task 3D.1: the configuration workspace's data hooks. The catalogue is the build's (stable
 * for the session); a bundle is re-read after every server-owned step so what renders is what the
 * server recorded, never an optimistic state; a deployment polls while it is in flight.
 * CHG-220 (Gate Configuration check): gap 6 - when a version's deployment ends (verified, partially acknowledged, failed) the
 * version, its level lists and the effective views are read again, so Activate and the state change without a reload. Minor -
 * a saved edit's answer (with its new ETag) replaces the cached version at once, so a second edit right after is not stale.
 * Gap 7 - a shadow run or an edit reads the comparison again; a rollback re-reads every version and deployment.
 */
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../api/apiFetch';
import {
  approveDraft, createDeployment, createDraft, getBundle, getConfigCatalogue, getDeployment, getEffectiveConfig, getEffectiveSummary, listBundles, listBundleSummaries, listDeployments,
  patchDraft, rollbackDeployment, shadowDraft, validateDraft, type Bundle, type Deployment, type PatchOp, type ScopeKind,
} from '../../../api/cpm/config';

const IN_FLIGHT = new Set(['SCHEDULED', 'PREPARING', 'PREPARED', 'APPLYING', 'PROBING']);

export const useConfigCatalogue = () => useQuery({ queryKey: ['cpm', 'config', 'catalogue'], queryFn: ({ signal }) => getConfigCatalogue(signal), staleTime: 300_000 });

export const useEffectiveConfig = (loopId: string | undefined, at?: string) => useQuery({
  queryKey: ['cpm', 'config', 'effective', loopId ?? '', at ?? ''],
  queryFn: ({ signal }) => getEffectiveConfig(loopId!, at, signal),
  enabled: !!loopId,
  staleTime: 30_000,
});

/** 2026-09-18: the overview's fleet read - what every loop in scope runs under; only while the overview is open. */
export const useEffectiveSummary = (scope: { site?: string; area?: string; unit?: string }, enabled = true) => useQuery({
  queryKey: ['cpm', 'config', 'effective-summary', scope.site ?? '', scope.area ?? '', scope.unit ?? ''],
  queryFn: ({ signal }) => getEffectiveSummary(scope, signal),
  enabled,
  staleTime: 30_000,
});

/** Summary rows of a level's bundles (no content); the level views and the overview list read these. */
export const useBundleSummaries = (site: string | undefined, scopeKind?: ScopeKind, scopeRef?: string, enabled = true) => useQuery({
  queryKey: ['cpm', 'config', 'bundle-summaries', site ?? '', scopeKind ?? '', scopeRef ?? ''],
  queryFn: ({ signal }) => listBundleSummaries(site!, { scopeKind, scopeRef }, signal),
  enabled: !!site && enabled,
  staleTime: 15_000,
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
  // a version that does not exist is not worth retrying: the page says "Change not found" at once
  retry: (failures: number, error: unknown) => !(error instanceof ApiError && error.status === 404) && failures < 2,
});

export const useDeployments = (bundleId: string | undefined) => {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['cpm', 'config', 'deployments', bundleId ?? ''],
    queryFn: ({ signal }) => listDeployments({ bundleId, limit: 20 }, signal),
    enabled: !!bundleId,
    refetchInterval: query => ((query.state.data?.deployments ?? []).some(d => IN_FLIGHT.has(d.state)) ? 5_000 : false),
  });
  const moving = (q.data?.deployments ?? []).some(d => IN_FLIGHT.has(d.state));
  const wasMoving = useRef(moving);
  useEffect(() => {
    if (wasMoving.current && !moving && bundleId) {
      for (const key of ['bundle', 'bundles', 'bundle-summaries', 'effective', 'effective-summary']) {
        void qc.invalidateQueries({ queryKey: key === 'bundle' ? ['cpm', 'config', 'bundle', bundleId] : ['cpm', 'config', key] });
      }
    }
    wasMoving.current = moving;
  }, [moving, bundleId, qc]);
  return q;
};

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
    void qc.invalidateQueries({ queryKey: ['cpm', 'config', 'bundle-summaries', site ?? ''] });
    void qc.invalidateQueries({ queryKey: ['cpm', 'config', 'effective-summary'] });
    if (bundleId) void qc.invalidateQueries({ queryKey: ['cpm', 'config', 'bundle', bundleId] });
    if (bundleId) void qc.invalidateQueries({ queryKey: ['cpm', 'config', 'deployments', bundleId] });
    void qc.invalidateQueries({ queryKey: ['cpm', 'config', 'effective'] });
  };
  const create = useMutation({ mutationFn: (req: { site: string; scopeKind: ScopeKind; scopeRef?: string | null; parentBundleId?: string | null; note?: string }) => createDraft(req), onSettled: () => settle() });
  const shadowOf = (id: string) => void qc.invalidateQueries({ queryKey: ['cpm', 'config', 'shadow', id] });
  const patch = useMutation({
    mutationFn: (a: { id: string; etag: string; ops: PatchOp[] }) => patchDraft(a.id, a.etag, a.ops),
    // the answer carries the new ETag: cache it before the re-read, keeping the approvals the edit answer leaves out; the engine-way
    // values it leaves out are dropped, not kept from before the edit (Check reads the own resolution until the re-read)
    onSuccess: (saved, a) => qc.setQueryData<Bundle>(['cpm', 'config', 'bundle', a.id], old => (old ? { ...old, ...saved, effective: saved.effective } : saved)),
    onSettled: (_d, _e, a) => { settle(a.id); shadowOf(a.id); },
  });
  const validate = useMutation({ mutationFn: (id: string) => validateDraft(id), onSettled: (_d, _e, id) => settle(id) });
  const shadow = useMutation({ mutationFn: (a: { id: string; loopId?: string; hours?: number }) => shadowDraft(a.id, { loopId: a.loopId, hours: a.hours }), onSettled: (_d, _e, a) => { settle(a.id); shadowOf(a.id); } });
  const approve = useMutation({ mutationFn: (a: { id: string; note?: string; validityHours?: number }) => approveDraft(a.id, { note: a.note, validityHours: a.validityHours }), onSettled: (_d, _e, a) => settle(a.id) });
  const deploy = useMutation({ mutationFn: (a: { bundleId: string; scheduledFor?: string | null }) => createDeployment(a), onSettled: (_d, _e, a) => settle(a.bundleId) });
  const rollback = useMutation({
    mutationFn: (id: string) => rollbackDeployment(id),
    // the rollback deploys another version: every version and deployment read may have changed
    onSettled: () => { settle(); for (const key of ['bundle', 'deployments']) void qc.invalidateQueries({ queryKey: ['cpm', 'config', key] }); },
  });
  return { create, patch, validate, shadow, approve, deploy, rollback };
}
