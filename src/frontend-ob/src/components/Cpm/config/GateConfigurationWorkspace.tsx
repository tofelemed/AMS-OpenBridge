/**
 * v2.5 Task 3D.1 (spec §5.7): the Gate Configuration workspace. Rewritten 2026-09-18: the page opens like
 * every CPM page (scope filter + loop search at the top), lands on an overview of what every loop runs
 * under, and reads one loop through three views - Effective (the resolved configuration, on demand),
 * Bundles (the loop's LOOP / PROFILE / SITE levels with their versions) and Editor (one bundle with its
 * lifecycle). Route /cpm/config?site&area&unit&loop=&view=effective|bundles|editor&bundle=&gate=&tab=.
 * Every value on this screen is the server's record; the browser edits requested changes only.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ObcTabRow } from '@oicl/openbridge-webcomponents-react/components/tab-row/tab-row';
import { EmptyState, QueryError, WorkspaceHeader } from '../shared';
import { LoopCombobox } from '../LoopCombobox';
import { PlantScopeFilter, useCpmScope } from '../plantScope';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';
import { listBundleSummaries, type ScopeKind } from '../../../api/cpm/config';
import { useBundleSummaries, useConfigActions, useConfigCatalogue, useEffectiveConfig, useEffectiveSummary } from './useConfig';
import { ConfigOverview } from './ConfigOverview';
import { LoopConfigHeader } from './LoopConfigHeader';
import { EffectiveView } from './EffectiveView';
import { BundlesView } from './BundlesView';
import { EditorView, TABS, type ConfigTab } from './EditorView';

export type ConfigView = 'effective' | 'bundles' | 'editor';
const VIEWS: ConfigView[] = ['effective', 'bundles', 'editor'];

/** Links from other pages (Governance's approval queue) keep their shape; a bundle opens the editor, a LOOP scope names the loop. */
export const configHref = (q: { site?: string; scope?: ScopeKind; ref?: string; bundle?: string; gate?: string; tab?: ConfigTab; loop?: string; view?: ConfigView }) => {
  const p = new URLSearchParams();
  const loop = q.loop ?? (q.scope === 'LOOP' ? q.ref : undefined);
  if (loop) p.set('loop', loop);
  const view = q.view ?? (q.bundle ? 'editor' : loop ? 'effective' : undefined);
  if (view) p.set('view', view);
  if (q.bundle) p.set('bundle', q.bundle);
  if (q.gate) p.set('gate', q.gate);
  if (q.tab && q.tab !== 'properties') p.set('tab', q.tab);
  const s = p.toString();
  return `/cpm/config${s ? `?${s}` : ''}`;
};

export const GateConfigurationWorkspace: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const scope = useCpmScope();
  const loops = useCpmLoops();
  const loopList = useMemo(() => loops.data?.loops ?? [], [loops.data]);
  const loopId = params.get('loop')?.trim() || undefined;
  const loop = loopList.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const bundleId = params.get('bundle') || undefined;
  const viewParam = params.get('view') as ConfigView | null;
  const view: ConfigView | 'overview' = bundleId && viewParam === 'editor' ? 'editor' : loopId ? (viewParam && VIEWS.includes(viewParam) && viewParam !== 'editor' ? viewParam : 'effective') : 'overview';
  const gate = params.get('gate') || 'G0';
  const tab: ConfigTab = TABS.includes(params.get('tab') as ConfigTab) ? (params.get('tab') as ConfigTab) : 'properties';

  const perms = {
    read: useAuthStore(s => s.hasPermission('cpm.config.read')), draft: useAuthStore(s => s.hasPermission('cpm.config.draft')),
    validate: useAuthStore(s => s.hasPermission('cpm.config.validate')), shadow: useAuthStore(s => s.hasPermission('cpm.config.shadow')),
    approve: useAuthStore(s => s.hasPermission('cpm.config.approve')), activate: useAuthStore(s => s.hasPermission('cpm.config.activate')),
    rollback: useAuthStore(s => s.hasPermission('cpm.config.rollback')),
  };

  // the automatic landing replaces the URL; every user navigation pushes (the back button retraces views)
  useEffect(() => { if (loopId && !viewParam) setParams(p => { p.set('view', 'effective'); return p; }, { replace: true }); }, [loopId, viewParam, setParams]);
  const go = useCallback((changes: Record<string, string | null>, replace = false) => {
    setParams(p => { for (const [k, v] of Object.entries(changes)) { if (v == null) p.delete(k); else p.set(k, v); } return p; }, { replace });
  }, [setParams]);

  const catalogue = useConfigCatalogue();
  const eff = useEffectiveConfig(loopId);
  const site = loop?.site ?? eff.data?.site;
  const profileId = eff.data?.profileId;
  const onBundles = view === 'bundles';
  const loopLevel = useBundleSummaries(site, 'LOOP', loopId, onBundles);
  const profileLevel = useBundleSummaries(site, 'PROFILE', profileId, onBundles && !!profileId);
  const siteLevel = useBundleSummaries(site, 'SITE', undefined, onBundles);
  const actions = useConfigActions(site);
  useEffect(() => { const id = actions.create.data?.bundleId; if (id && id !== bundleId) go({ view: 'editor', bundle: id, gate: null, tab: null }); }, [actions.create.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // the overview: what every loop in scope runs under, and the bundles in progress of the site(s) in scope
  const onOverview = view === 'overview';
  const summary = useEffectiveSummary(scope.params, onOverview);
  const overviewSites = useMemo(() => scope.params.site ? [scope.params.site] : [...new Set(loopList.map(l => l.site).filter(Boolean))].sort(), [scope.params.site, loopList]);
  const progress = useQueries({
    queries: overviewSites.map(s => ({ queryKey: ['cpm', 'config', 'bundle-summaries', s, '', ''], queryFn: ({ signal }: { signal?: AbortSignal }) => listBundleSummaries(s, {}, signal), enabled: onOverview, staleTime: 15_000 })),
  });
  const inProgress = useMemo(() => progress.flatMap(q => q.data?.bundles ?? []), [progress]);

  if (!perms.read) return <div className="cpm-screen"><EmptyState title="Gate configuration" copy="Reading the governed configuration needs cpm.config.read." /></div>;

  const toolbar = (
    <section className="cpm-surface cpm-evidence-toolbar">
      <PlantScopeFilter scope={scope} />
      <div className="cpm-toolbar">
        <LoopCombobox scope={scope} loops={loopList} value={loopId ?? ''}
          onChange={id => go({ loop: id, view: 'effective', bundle: null, gate: null, tab: null })}
          onClear={() => go({ loop: null, view: null, bundle: null, gate: null, tab: null })} />
      </div>
    </section>
  );
  const catalogueLine = catalogue.data ? `${catalogue.data.count} properties · ${catalogue.data.workers.length} worker(s) announced${catalogue.data.workers.some(w => !w.catalogueMatches) ? ' · a worker runs ANOTHER catalogue' : ''}` : '';

  if (view === 'overview' || (view === 'editor' && !loopId)) {
    return (
      <div className="cpm-screen cpm-config-workspace">
        <WorkspaceHeader page="/cpm/config" title="Gate configuration" copy={`What each loop runs under, the bundles in progress, and the editor for one of them. ${catalogueLine}`} />
        {toolbar}
        {catalogue.isError && <QueryError error={catalogue.error} retry={() => void catalogue.refetch()} />}
        {view === 'editor' && bundleId ? (
          <EditorView bundleId={bundleId} gate={gate} tab={tab} perms={perms} loopId={undefined} siteLoopCount={undefined}
            onGate={g => go({ gate: g })} onTab={t => go({ tab: t === 'properties' ? null : t })} onBack={() => go({ view: null, bundle: null, gate: null, tab: null })} />
        ) : (
          <ConfigOverview loops={summary.data?.loops ?? []} loopsLoading={summary.isLoading} loopsError={summary.isError ? summary.error : null}
            bundles={inProgress} bundlesLoading={progress.some(q => q.isLoading)} bundlesError={progress.find(q => q.isError)?.error ?? null}
            onRetry={() => { void summary.refetch(); progress.forEach(q => void q.refetch()); }} />
        )}
      </div>
    );
  }

  const tabs = [
    { id: 'effective', title: 'Effective', hasLeadingIcon: false, hasTrailingIcon: false },
    { id: 'bundles', title: 'Bundles', hasLeadingIcon: false, hasTrailingIcon: false },
    ...(bundleId ? [{ id: 'editor', title: 'Editor', hasLeadingIcon: false, hasTrailingIcon: false }] : []),
  ];
  const catalogueMap = catalogue.data ? new Map(catalogue.data.properties.map(p => [p.property, p])) : undefined;

  return (
    <div className="cpm-screen cpm-config-workspace">
      <LoopConfigHeader loopId={loopId!} displayName={loop?.displayName} eff={eff.data} loading={eff.isLoading} catalogueHash={catalogue.data?.catalogueHash} />
      {toolbar}
      {eff.isError && <QueryError title="Effective configuration unavailable" error={eff.error} retry={() => void eff.refetch()} />}
      <div className="cpm-tabs">
        <ObcTabRow hug tabs={tabs} selectedTabId={view}
          onTabSelected={(e: CustomEvent<{ id: string }>) => { const id = e.detail.id as ConfigView; if (VIEWS.includes(id) && id !== view) go({ view: id }); }} />
      </div>
      {view === 'effective' && (eff.data
        ? <section className="cpm-surface"><EffectiveView eff={eff.data} catalogue={catalogueMap} /></section>
        : !eff.isError && <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading the effective configuration…</span></div>)}
      {view === 'bundles' && (
        <BundlesView activeBundleId={eff.data?.bundle?.bundleId} canDraft={perms.draft} creating={actions.create.isPending} createError={actions.create.isError ? actions.create.error : null}
          levels={{
            LOOP: { ref: loopId!, bundles: loopLevel.data?.bundles ?? [], loading: loopLevel.isLoading, error: loopLevel.isError ? loopLevel.error : null, retry: () => void loopLevel.refetch() },
            PROFILE: { ref: profileId ?? '…', bundles: profileLevel.data?.bundles ?? [], loading: profileLevel.isLoading || (!profileId && eff.isLoading), error: profileLevel.isError ? profileLevel.error : null, retry: () => void profileLevel.refetch() },
            SITE: { ref: site ?? '…', bundles: siteLevel.data?.bundles ?? [], loading: siteLevel.isLoading, error: siteLevel.isError ? siteLevel.error : null, retry: () => void siteLevel.refetch() },
          }}
          onOpen={id => go({ view: 'editor', bundle: id, gate: null, tab: null })}
          onCreate={a => { if (site) actions.create.mutate({ site, scopeKind: a.scopeKind, scopeRef: a.scopeRef, parentBundleId: a.parentBundleId, note: a.note }); }} />
      )}
      {view === 'editor' && bundleId && (
        <EditorView bundleId={bundleId} gate={gate} tab={tab} perms={perms} loopId={loopId} siteLoopCount={loopList.filter(l => l.site === site).length}
          onGate={g => go({ gate: g })} onTab={t => go({ tab: t === 'properties' ? null : t })} onBack={() => go({ view: 'bundles', bundle: null, gate: null, tab: null })} />
      )}
    </div>
  );
};

export default GateConfigurationWorkspace;
