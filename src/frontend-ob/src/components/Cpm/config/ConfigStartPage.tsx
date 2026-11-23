/**
 * The Gate Configuration start page (/cpm/config): one loop search, four places to start, the plant-wide notice, the changes
 * in progress and what runs now. Old links (?loop=&view=&bundle=) are replaced by their new page before anything is read. The
 * header's site decides which plant the cards and the notice speak about; with several plants and none chosen, "Whole plant" asks
 * which. Every link keeps the header's plant scope (`scoped`).
 */
import React, { useMemo, useRef, useState } from 'react';
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
import { useRegions, useRegionActions, useStaleLoops } from './useConfigRegions';
import { ConfigHowToRead } from './ConfigHowToRead';
import { changePath, legacyTarget, loopPath, plantPath, regionsBatchPath, regionsPath, scoped, typePath } from './configRoutes';
import { NEEDS } from './lifecycle';
import { versionLabel } from './levelWords';
import { changesInProgress, runningNow } from './startPageData';
import { StartCards, ChoiceDialog, type CardSpec } from './StartCards';
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
  const [choice, setChoice] = useState<'type' | 'plant' | null>(null);
  const [updating, setUpdating] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
  const regions = useRegions(site, canRead);
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
  const regionsBad = !!site && (regions.isLoading || regions.isError);

  const active = useMemo(() => bundles.filter(b => b.state === 'ACTIVE_VERIFIED'), [bundles]);
  const changes = useMemo(() => changesInProgress(bundles), [bundles]);
  const running = useMemo(() => runningNow(bundles, effective.data?.loops ?? []), [bundles, effective.data]);
  const byId = useMemo(() => new Map(loopList.map(l => [l.loopId, l])), [loopList]);
  const types = useMemo(() => [...new Set((effective.data?.loops ?? []).map(l => l.profileId).filter(Boolean))].sort(), [effective.data]);

  if (!canRead) return <div className="cpm-screen"><EmptyState title="Gate Configuration" copy="You don't have access to Gate Configuration." /></div>;

  const own = active.filter(b => b.scopeKind === 'LOOP' && !b.inherits).length;
  const profiles = active.filter(b => b.scopeKind === 'PROFILE');
  const plants = active.filter(b => b.scopeKind === 'SITE');
  const withRegion = (regions.data?.loops ?? []).filter(l => l.regionMin != null && l.regionMax != null).length;
  const staleCount = stale.data?.count ?? 0;

  const cards: CardSpec[] = [
    { id: 'loop', title: 'One loop', hint: 'Values and operating region of a single loop.', action: 'Find a loop',
      now: bundlesBad ? '—' : own === 0 ? 'None with own settings' : `${own} with own settings`,
      onAction: () => searchRef.current?.querySelector('input')?.focus() },
    { id: 'type', title: 'A loop type', hint: 'Values shared by every loop of one type.', action: 'Choose a type',
      now: bundlesBad ? '—' : profiles.length === 0 ? 'Factory settings' : profiles.length === 1 ? `${codeLabel(profiles[0].scopeRef)} · v${profiles[0].version}` : `${profiles.length} types with own settings`,
      onAction: () => setChoice('type') },
    { id: 'plant', title: 'Whole plant', hint: 'Values every loop in the plant starts from.', action: 'Open',
      now: bundlesBad ? '—' : plants.length === 0 ? 'Factory settings' : plants.length === 1 ? versionLabel(plants[0]) : `${plants.length} plants with own settings`,
      onAction: () => (site ? go(plantPath(site)) : setChoice('plant')) },
    { id: 'regions', title: 'Operating regions', hint: 'The range each loop is expected to work in.', action: 'Edit regions',
      now: !site ? 'Choose a plant' : regionsBad ? '—' : plural(withRegion, 'loop has a region', 'loops have a region'),
      onAction: () => go(regionsPath()) },
  ];

  const update = (note: string) => restack.mutate({ note }, {
    onSuccess: r => { setUpdating(false); go(regionsBatchPath(r.batchId)); },
  });

  return (
    <div className="cpm-screen cpm-config-workspace">
      <WorkspaceHeader eyebrow="Set up" title="Gate Configuration" copy=""
        actions={<>
          <div ref={searchRef}>
            <LoopCombobox loops={loopList.filter(l => scope.matches(l))} loopId={undefined} loop={undefined} onSelect={id => go(loopPath(id))}
              isLoading={loopsQ.isLoading} isError={loopsQ.isError} retry={() => void loopsQ.refetch()} />
          </div>
          <ObcButton variant="normal" onClick={() => setGuide(true)}>How to read</ObcButton>
        </>} />
      <StartCards cards={cards} />
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
      {choice === 'type' && <ChoiceDialog title="Choose a type" options={types.map(t => ({ value: t, label: codeLabel(t) }))}
        onPick={t => go(typePath(t))} onClose={() => setChoice(null)} />}
      {choice === 'plant' && <ChoiceDialog title="Choose a plant" options={sites.map(s => ({ value: s, label: s }))}
        onPick={s => go(plantPath(s))} onClose={() => setChoice(null)} />}
      {updating && <RestackDialog count={staleCount} pending={restack.isPending} onCancel={() => setUpdating(false)} onUpdate={update}
        error={restack.isError ? (restack.error instanceof Error ? restack.error.message : String(restack.error)) : null} />}
      <ConfigHowToRead open={guide} onClose={() => setGuide(false)} />
    </div>
  );
};

export default ConfigStartPage;
