/**
 * CHG-174 (owner answer 4): a gate-configuration event names its bundle ("FIC10302 · v7"), and a deployment reads as an
 * activation or a rollback naming its bundle, from the lists the page already reads: the bundle summaries (the Approvals tab's
 * read, one per site) and the sites' deployments (bundle and kind; the deployment list is a plain read, never the per-id GET,
 * which re-evaluates a deployment). Only with cpm.config.read, and only while such an event is on screen; without either the
 * event keeps its raw id and "Deployment scheduled". The audit record itself does not serve the bundle or the kind.
 */
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { listBundleSummaries, listDeployments, type BundleSummary } from '../../../api/cpm/config';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';

export const summariesKey = (site: string) => ['cpm', 'config', 'bundle-summaries', site, '', ''] as const;
const DEPLOYMENTS_READ = 200;

/** "FIC10302 · v7": the loop, profile or site the bundle is for, and its version. */
export const bundleName = (b: Pick<BundleSummary, 'scopeKind' | 'scopeRef' | 'site' | 'version'>): string =>
  `${b.scopeKind === 'SITE' ? b.site : b.scopeRef ?? b.site} · v${b.version}`;

/** The sites the user sees, from the loop registry (as the queue read them). */
export function useVisibleSites(): string[] {
  const loops = useCpmLoops();
  return useMemo(() => [...new Set((loops.data?.loops ?? []).map(l => l.site).filter(Boolean))].sort(), [loops.data]);
}

export function useBundleSummaries(enabled: boolean) {
  const sites = useVisibleSites();
  const queries = useQueries({
    queries: sites.map(site => ({
      queryKey: summariesKey(site),
      queryFn: ({ signal }: { signal?: AbortSignal }) => listBundleSummaries(site, {}, signal),
      enabled,
      staleTime: 15_000,
    })),
  });
  return { sites, queries };
}

export interface ConfigNames {
  bundle: (id: string) => BundleSummary | undefined;
  deployment: (id: string) => { kind: string; bundleId: string } | undefined;
}

export function useConfigNames(wantBundles: boolean, wantDeployments: boolean): ConfigNames {
  const canRead = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const { sites, queries: summaries } = useBundleSummaries(canRead && (wantBundles || wantDeployments));
  const deployments = useQueries({
    queries: sites.map(site => ({
      queryKey: ['cpm', 'config', 'deployments', 'site', site, DEPLOYMENTS_READ],
      queryFn: ({ signal }: { signal?: AbortSignal }) => listDeployments({ site, limit: DEPLOYMENTS_READ }, signal),
      enabled: canRead && wantDeployments,
      staleTime: 60_000,
    })),
  });
  const bundles = useMemo(() => new Map(summaries.flatMap(q => q.data?.bundles ?? []).map(b => [b.bundleId, b])), [summaries]);
  const byId = useMemo(
    () => new Map(deployments.flatMap(q => q.data?.deployments ?? []).map(d => [d.deploymentId, { kind: d.kind, bundleId: d.bundleId }])),
    [deployments],
  );
  return useMemo(() => ({ bundle: id => bundles.get(id), deployment: id => byId.get(id) }), [bundles, byId]);
}
