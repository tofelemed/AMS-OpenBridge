/**
 * v2.5 Task 3D.1 (spec §5.7): the Gate Configuration workspace. Rewritten 2026-09-18: the page opens like
 * every loop page (the loop band at the top, the plant scope in the header), lands on an overview of what
 * every loop runs under, and reads one loop through three views - Effective (the resolved configuration, on demand),
 * Bundles (the loop's LOOP / PROFILE / SITE levels with their versions) and Editor (one bundle with its
 * lifecycle). Route /cpm/config?site&area&unit&loop=&view=effective|bundles|editor&bundle=&gate=&tab=.
 * Every value on this screen is the server's record; the browser edits requested changes only.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { useQueries } from '@tanstack/react-query';
import { Tabs, tabPanelProps, type TabOption } from '../../../ui/Tabs';
import { EmptyState, QueryError } from '../shared';
import { useCpmScope } from '../plantScope';
import { LoopBand } from '../context/LoopBand';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';
import { listBundleSummaries } from '../../../api/cpm/config';
import { useBundleSummaries, useConfigActions, useConfigCatalogue, useEffectiveConfig, useEffectiveSummary } from './useConfig';
import { ConfigOverview } from './ConfigOverview';
import { TechnicalDetails } from '../../../ui/TechnicalDetails';
import { explorerHref } from '../cpaHref';
import { GateRolePolicy } from './GateRolePolicy';
import { CatalogueNote, ConfigPageHeader, LoopConfigHeader, buildDetails } from './LoopConfigHeader';
import { EffectiveView } from './EffectiveView';
import { BundlesView } from './BundlesView';
import { EditorView, TABS, type ConfigTab } from './EditorView';

export type ConfigView = 'effective' | 'bundles' | 'editor';
const VIEWS: ConfigView[] = ['effective', 'bundles', 'editor'];

export const GateConfigurationWorkspace: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [workersSignal, setWorkersSignal] = useState(0);
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
    setParams(p => {
      for (const [k, v] of Object.entries(changes)) {
        if (v == null) p.delete(k); else p.set(k, v);
      }
      return p;
    }, { replace });
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
    <LoopBand loopId={loopId}
      onLoop={id => go({ loop: id, view: 'effective', bundle: null, gate: null, tab: null })}
      end={loopId ? <ObcButton variant="flat" onClick={() => navigate(explorerHref(loopId))}>Open loop ↗</ObcButton> : undefined} />
  );
  const openWorkers = () => {
    if (view !== 'effective') go({ view: 'effective' });
    setWorkersSignal(n => n + 1);
    window.setTimeout(() => document.getElementById('config-workers')?.scrollIntoView?.({ block: 'nearest' }), 0);
  };
  const rolePolicy = <section className="cpm-surface" aria-label="Gate role policy"><GateRolePolicy /></section>;

  if (view === 'overview' || (view === 'editor' && !loopId)) {
    return (
      <div className="cpm-screen cpm-config-workspace">
        <ConfigPageHeader copy="What each loop runs under, the bundles in progress, and the editor for one of them." />
        {toolbar}
        <CatalogueNote catalogue={catalogue.data} />
        {catalogue.isError && <QueryError error={catalogue.error} retry={() => void catalogue.refetch()} />}
        {view === 'editor' && bundleId ? (
          <EditorView bundleId={bundleId} gate={gate} tab={tab} perms={perms} loopId={undefined} siteLoopCount={undefined}
            onGate={g => go({ gate: g })} onTab={t => go({ tab: t === 'properties' ? null : t })} onBack={() => go({ view: null, bundle: null, gate: null, tab: null })} />
        ) : (
          <ConfigOverview loops={summary.data?.loops ?? []} loopsLoading={summary.isLoading} loopsError={summary.isError ? summary.error : null}
            bundles={inProgress} bundlesLoading={progress.some(q => q.isLoading)} bundlesError={progress.find(q => q.isError)?.error ?? null}
            onRetry={() => { void summary.refetch(); progress.forEach(q => void q.refetch()); }} />
        )}
        {view !== 'editor' && <TechnicalDetails items={buildDetails(catalogue.data)} />}
        {view !== 'editor' && rolePolicy}
      </div>
    );
  }

  const tabs: Array<TabOption<ConfigView>> = [
    { value: 'effective', label: 'Effective' },
    { value: 'bundles', label: 'Bundles' },
    ...(bundleId ? [{ value: 'editor' as const, label: 'Editor' }] : []),
  ];
  const catalogueMap = catalogue.data ? new Map(catalogue.data.properties.map(p => [p.property, p])) : undefined;

  return (
    <div className="cpm-screen cpm-config-workspace">
      <LoopConfigHeader loopId={loopId!} eff={eff.data} loading={eff.isLoading} catalogue={catalogue.data} onOpenWorkers={openWorkers} band={toolbar} />
      {catalogue.isError && <QueryError title="Catalogue unavailable" error={catalogue.error} retry={() => void catalogue.refetch()} />}
      {eff.isError && <QueryError title="Effective configuration unavailable" error={eff.error} retry={() => void eff.refetch()} />}
      <div className="cpm-tabs">
        <Tabs idBase="config-view" label="Views" options={tabs} value={view} onChange={id => { if (id !== view) go({ view: id }); }} />
      </div>
      <div {...tabPanelProps('config-view', view)}>
      {view === 'effective' && (eff.data
        ? <section className="cpm-surface"><EffectiveView eff={eff.data} catalogue={catalogueMap} openWorkersSignal={workersSignal} /></section>
        : !eff.isError && <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading the effective configuration…</span></div>)}
      {view === 'bundles' && (
        <BundlesView activeBundleId={eff.data?.bundle?.bundleId} canDraft={perms.draft} creating={actions.create.isPending} createError={actions.create.isError ? actions.create.error : null} onDraftOpen={actions.create.reset}
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
      {view !== 'editor' && rolePolicy}
      </div>
    </div>
  );
};

export default GateConfigurationWorkspace;
