/**
 * The Gate Configuration start page (/cpm/config): one filter bar (loop search, loop type, plant, operating regions), the plant-wide notice, the changes
 * in progress and what runs now. Old links (?loop=&view=&bundle=) are replaced by their new page before anything is read. The
 * header's site decides which plant the notice speaks about. Every link keeps the header's plant scope (`scoped`).
 */
import React, { useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { useQueries } from '@tanstack/react-query';
import { EmptyState, QueryError, WorkspaceHeader } from '../shared';
import { useCpmScope } from '../plantScope';
import { LoopCombobox } from '../context/LoopCombobox';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';
import { listBundleSummaries } from '../../../api/cpm/config';
import { codeLabel } from '../vocabulary';
import { ReasonedButton } from '../ReasonedButton';
import { useEffectiveSummary } from './useConfig';
import { useRegionActions, useStaleLoops } from './useConfigRegions';
import { ConfigHowToRead } from './ConfigHowToRead';
import { changePath, legacyTarget, loopContextPath, plantPath, regionsBatchPath, regionsPath, scoped, typePath } from './configRoutes';
import { NEEDS } from './lifecycle';
import { changesInProgress, runningNow } from './startPageData';
import { StartBar } from './StartBar';
import { useSiteName } from '../governance/useConfigNames';
import { ChangesTable, RunningTable } from './StartTables';
import { RestackDialog } from './RestackDialog';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** An old Gate Configuration link (it names its page in the query) is replaced at once; the start page and its reads never run. */
export const ConfigStartPage: React.FC = () => {
  const [params] = useSearchParams();
  const legacy = legacyTarget(params);
  return legacy ? <Navigate to={scoped(legacy, params)} replace /> : <StartPage />;
};

const StartPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const go = (path: string) => navigate(scoped(path, params));
  const scope = useCpmScope();
  const loopsQ = useCpmLoops();
  const loopList = useMemo(() => loopsQ.data?.loops ?? [], [loopsQ.data]);
  const canRead = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const canDraft = useAuthStore(s => s.hasPermission('cpm.config.draft'));
  const [guide, setGuide] = useState(false);
  const [updating, setUpdating] = useState(false);
  const siteName = useSiteName();

  const sites = useMemo(() => [...new Set(loopList.map(l => l.site).filter(Boolean))].sort(), [loopList]);
  const site = scope.params.site || (sites.length === 1 ? sites[0] : undefined);
  const summarySites = useMemo(() => scope.params.site ? [scope.params.site] : sites, [scope.params.site, sites]);

  const summaries = useQueries({
    queries: summarySites.map(s => ({
      queryKey: ['cpm', 'config', 'bundle-summaries', s, '', ''],
      queryFn: ({ signal }: { signal?: AbortSignal }) => listBundleSummaries(s, {}, signal),
      enabled: canRead, staleTime: 15_000,
    })),
  });
  const bundles = useMemo(() => summaries.flatMap(q => q.data?.bundles ?? []), [summaries]);
  const effective = useEffectiveSummary(scope.params, canRead);
  const stale = useStaleLoops(site, canRead);
  const restack = useRegionActions(site).restack;

  // a read that is pending or failed must not read as "nothing here"
  const failed = <T extends { isError: boolean; error: unknown; refetch: () => unknown }>(q: T) => q.isError ? q : undefined;
  const bundleFail = summaries.map(failed).find(Boolean);
  const bundlesLoading = loopsQ.isLoading || summaries.some(q => q.isLoading);
  const bundlesBad = bundlesLoading || !!bundleFail || loopsQ.isError;
  const bundlesError = bundleFail?.error ?? loopsQ.error;
  const retryBundles = () => { void loopsQ.refetch(); summaries.forEach(q => void q.refetch()); };
  const runningLoading = bundlesLoading || effective.isLoading;
  const runningError = bundleFail ? bundleFail : effective.isError ? effective : loopsQ.isError ? loopsQ : undefined;

  const changes = useMemo(() => changesInProgress(bundles), [bundles]);
  const running = useMemo(() => runningNow(bundles, effective.data?.loops ?? []), [bundles, effective.data]);
  const byId = useMemo(() => new Map(loopList.map(l => [l.loopId, l])), [loopList]);
  const typeOptions = useMemo(() => [...new Set((effective.data?.loops ?? []).map(l => l.profileId).filter(Boolean))]
    .map(t => ({ value: t, label: codeLabel(t) })).sort((x, y) => x.label.localeCompare(y.label)), [effective.data]);
  // the header's plant, when one is chosen, is the only plant offered
  const plantOptions = useMemo(() => summarySites.map(s => ({ value: s, label: siteName(s) })), [summarySites, siteName]);
  // the loop carried from the last page shows in the search; choosing a loop makes it the carried one
  const contextLoop = params.get('loop') || undefined;

  if (!canRead) return <div className="cpm-screen"><EmptyState title="Gate Configuration" copy="You don't have access to Gate Configuration." /></div>;

  const staleCount = stale.data?.count ?? 0;

  const update = (note: string) => restack.mutate({ note }, {
    onSuccess: r => { setUpdating(false); go(regionsBatchPath(r.batchId)); },
  });

  return (
    <div className="cpm-screen cpm-config-workspace">
      <WorkspaceHeader eyebrow="Set up" title="Gate Configuration" copy=""
        actions={<ObcButton variant="normal" onClick={() => setGuide(true)}>How to read</ObcButton>} />
      {effective.isError && <QueryError title="Loop types unavailable" error={effective.error} retry={() => void effective.refetch()} />}
      <StartBar
        search={<LoopCombobox loops={loopList.filter(l => scope.matches(l))} loopId={contextLoop} loop={contextLoop ? byId.get(contextLoop) : undefined}
          onSelect={id => go(loopContextPath(id))}
          isLoading={loopsQ.isLoading} isError={loopsQ.isError} retry={() => void loopsQ.refetch()} />}
        types={typeOptions} typesLoading={effective.isLoading} plants={plantOptions}
        onType={t => go(typePath(t))} onPlant={s => go(plantPath(s))} onRegions={() => go(regionsPath())} />
      {staleCount > 0 && (
        <div className="cpm-surface cpm-config-notice" role="status">
          <p>{plural(staleCount, "loop doesn't", "loops don't")} have the latest plant settings yet</p>
          <ReasonedButton disabled={!canDraft} reason={NEEDS.draft} onClick={() => setUpdating(true)}>Update them</ReasonedButton>
        </div>
      )}
      <h2 className="cpm-config-section">Changes in progress{!bundlesBad && <small>{changes.length}</small>}</h2>
      <section className="cpm-surface" aria-label="Changes in progress" aria-busy={bundlesLoading}>
        {bundlesLoading ? <p className="cpm-copy">Loading…</p>
          : bundlesBad ? <QueryError title="Changes unavailable" error={bundlesError} retry={retryBundles} />
          : changes.length > 0 ? <ChangesTable rows={changes} onContinue={(id, step) => go(changePath(id, step))} />
          : <p className="cpm-copy">Nothing in progress.</p>}
      </section>
      <h2 className="cpm-config-section">Running now</h2>
      <section className="cpm-surface" aria-label="Running now" aria-busy={runningLoading}>
        {runningLoading ? <p className="cpm-copy">Loading…</p>
          : runningError ? <QueryError title="Running settings unavailable" error={runningError.error} retry={() => { retryBundles(); void effective.refetch(); }} />
          : running.length > 0 ? <RunningTable rows={running} loops={byId} />
          : <p className="cpm-copy">Every loop runs on factory settings.</p>}
      </section>
      {updating && <RestackDialog count={staleCount} pending={restack.isPending} onCancel={() => setUpdating(false)} onUpdate={update}
        error={restack.isError ? (restack.error instanceof Error ? restack.error.message : String(restack.error)) : null} />}
      <ConfigHowToRead open={guide} onClose={() => setGuide(false)} />
    </div>
  );
};

export default ConfigStartPage;
