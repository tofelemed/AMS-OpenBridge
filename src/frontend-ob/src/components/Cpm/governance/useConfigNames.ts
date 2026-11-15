/**
 * CHG-174 (owner answer 4): a gate-configuration event names its bundle ("FIC10302 · v7"), and a deployment reads as an
 * activation or a rollback naming its bundle, from the lists the page already reads: the bundle summaries (the Approvals tab's
 * read, one per site) and the sites' deployments (bundle and kind; the deployment list is a plain read, never the per-id GET,
 * which re-evaluates a deployment). Only with cpm.config.read, and only while such an event is on screen; without either the
 * event keeps its raw id and "Deployment scheduled". The audit record itself does not serve the bundle or the kind.
 * CHG-202 (owner, 15 Nov 2026): without them the event shows its type alone (no id). A bundle names its site by the plant
 * model's name (the header's site read, so no request of its own) and a profile in words ("PID flow · v3", not "pid_flow").
 */
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { listBundleSummaries, listDeployments, type BundleSummary } from '../../../api/cpm/config';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';
import { useSiteFilters } from '../plantLocation';
import { codeLabel } from '../vocabulary';

export const summariesKey = (site: string) => ['cpm', 'config', 'bundle-summaries', site, '', ''] as const;
const DEPLOYMENTS_READ = 200;

type SiteName = (site: string) => string;
const asIs: SiteName = site => site;

/** A scope's reference in words: a loop's tag as written, a profile or regime code as words ("pid_flow" → "PID flow"). */
export const scopeRefWords = (kind: string, ref: string): string => (kind === 'LOOP' ? ref : codeLabel(ref));

/** "FIC10302 · v7": the loop, profile or site the bundle is for (a site by its name), and its version. */
export const bundleName = (b: Pick<BundleSummary, 'scopeKind' | 'scopeRef' | 'site' | 'version'>, siteName: SiteName = asIs): string =>
  `${b.scopeKind === 'SITE' || !b.scopeRef ? siteName(b.site) : scopeRefWords(b.scopeKind, b.scopeRef)} · v${b.version}`;

/** A site by its plant-model name, from the header's site read (shared, so no request of its own); its code until that answers. */
export function useSiteName(): SiteName {
  const sites = useSiteFilters();
  return useMemo(() => {
    const byCode = new Map((sites.data ?? []).map(o => [o.segment, o.name]));
    return (site: string) => byCode.get(site) || site;
  }, [sites.data]);
}

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
  /** A site by its name (CHG-202). */
  site?: SiteName;
}

export function useConfigNames(wantBundles: boolean, wantDeployments: boolean): ConfigNames {
  const canRead = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const site = useSiteName();
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
  return useMemo(() => ({ bundle: id => bundles.get(id), deployment: id => byId.get(id), site }), [bundles, byId, site]);
}
