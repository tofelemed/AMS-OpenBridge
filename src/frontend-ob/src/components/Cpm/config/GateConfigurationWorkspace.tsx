/**
 * v2.5 Task 3D.1 (spec §5.7): the Gate Configuration workspace. 2026-09-18: the page opens like every loop page (the loop band
 * at the top, the plant scope in the header). Every value on this screen is the server's record; the browser edits requested
 * changes only. Route /cpm/config?site&area&unit&loop=&view=effective|bundles|editor&bundle=&gate=&tab=; the automatic landing
 * replaces the address, every move pushes, Back retraces.
 * CHG-169 (owner review, the approved sample docs/theme/redesign/samples/gate-configuration-proposal.html and the owner's
 * answers of 11 Nov 2026): two views, toggled top right without counts - Effective (no loop: what every loop runs under; a loop:
 * where each of its values comes from) and Bundles (no loop: the bundles in progress; a loop: its LOOP / PROFILE / SITE versions).
 * A bundle opens under Bundles (`view=editor&bundle=`) as five tabs. No overview page, no tiles, no Technical details, no Gate
 * role policy card: How to read (a dialog) took the five ? and the card; Build details, Workers and Record details are dialogs.
 * The band holds the loop, the open bundle with its state and Record details, and Open loop ↗.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { useQueries } from '@tanstack/react-query';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { EmptyState, QueryError, WorkspaceHeader } from '../shared';
import { useCpmScope } from '../plantScope';
import { LoopBand } from '../context/LoopBand';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';
import { listBundleSummaries, type Bundle, type ConfigCatalogue } from '../../../api/cpm/config';
import { explorerHref } from '../cpaHref';
import { useBundle, useBundleSummaries, useConfigActions, useConfigCatalogue, useEffectiveConfig, useEffectiveSummary } from './useConfig';
import { EffectiveLoops } from './EffectiveLoops';
import { LoopEffective } from './LoopEffective';
import { BundlesView } from './BundlesView';
import { EditorView, TABS, type ConfigTab } from './EditorView';
import { ConfigHowToRead } from './ConfigHowToRead';
import { DetailsDialog, type DetailRow } from './DetailsDialog';
import { BundleStatePill } from './configBits';
import { stampZoned } from './configWords';

export type ConfigView = 'effective' | 'bundles' | 'editor';
type Toggle = 'effective' | 'bundles';
const TOGGLE: ReadonlyArray<{ value: Toggle; label: string }> = [{ value: 'effective', label: 'Effective' }, { value: 'bundles', label: 'Bundles' }];

/** The warning stays on screen: results from a worker on another catalogue cannot be compared. */
export const CatalogueNote: React.FC<{ catalogue: ConfigCatalogue | undefined }> = ({ catalogue }) =>
  catalogue?.workers.some(w => !w.catalogueMatches) ? <p className="cpm-field__error" role="status">a worker runs ANOTHER catalogue</p> : null;

/** Record details of the open bundle: its identifiers (short, copyable) and the who / when / note of the lifecycle column. */
export const recordRows = (b: Bundle): DetailRow[] => [
  { label: 'Content hash', copy: b.contentHash },
  { label: 'Etag', value: <span className="cpm-mono">{b.etag}</span> },
  { label: 'Created', value: `${b.createdBy} · ${stampZoned(b.createdAt)}` },
  { label: 'Updated', value: stampZoned(b.updatedAt) },
  ...(b.note ? [{ label: 'Note', value: b.note }] : []),
  { label: 'Catalogue hash', copy: b.catalogueHash },
];

export const GateConfigurationWorkspace: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [guide, setGuide] = useState(false);
  const [record, setRecord] = useState(false);
  const scope = useCpmScope();
  const loops = useCpmLoops();
  const loopList = useMemo(() => loops.data?.loops ?? [], [loops.data]);
  const loopId = params.get('loop')?.trim() || undefined;
  const loop = loopList.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const bundleId = params.get('bundle') || undefined;
  const viewParam = params.get('view');
  const view: ConfigView = bundleId && viewParam === 'editor' ? 'editor' : viewParam === 'bundles' ? 'bundles' : 'effective';
  const gate = params.get('gate');
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
  const onLevels = view === 'bundles' && !!loopId;
  const loopLevel = useBundleSummaries(site, 'LOOP', loopId, onLevels);
  const profileLevel = useBundleSummaries(site, 'PROFILE', profileId, onLevels && !!profileId);
  const siteLevel = useBundleSummaries(site, 'SITE', undefined, onLevels);
  const actions = useConfigActions(site);
  useEffect(() => { const id = actions.create.data?.bundleId; if (id && id !== bundleId) go({ view: 'editor', bundle: id, gate: null, tab: null }); }, [actions.create.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // with no loop: the fleet read only while Effective lists every loop; the bundles in progress only while Bundles lists them
  const summary = useEffectiveSummary(scope.params, view === 'effective' && !loopId);
  const onProgress = view === 'bundles' && !loopId;
  const progressSites = useMemo(() => scope.params.site ? [scope.params.site] : [...new Set(loopList.map(l => l.site).filter(Boolean))].sort(), [scope.params.site, loopList]);
  const progress = useQueries({
    queries: progressSites.map(s => ({ queryKey: ['cpm', 'config', 'bundle-summaries', s, '', ''], queryFn: ({ signal }: { signal?: AbortSignal }) => listBundleSummaries(s, {}, signal), enabled: onProgress, staleTime: 15_000 })),
  });
  const inProgress = useMemo(() => progress.flatMap(q => q.data?.bundles ?? []), [progress]);
  // the open bundle, for the band (the editor reads the same cache entry)
  const open = useBundle(view === 'editor' ? bundleId : undefined).data;

  if (!perms.read) return <div className="cpm-screen"><EmptyState title="Gate configuration" copy="Reading the governed configuration needs cpm.config.read." /></div>;

  const toggle = (v: Toggle) => {
    if (v === 'effective' && view !== 'effective') go({ view: 'effective', bundle: null, tab: null });
    if (v === 'bundles' && view === 'effective') go({ view: 'bundles', bundle: null, tab: null });
    if (v === 'bundles' && view === 'editor') go({ view: 'bundles', bundle: null, gate: null, tab: null });   // ‹ Bundles was this
  };
  const toBundles = () => go({ view: 'bundles', bundle: null, gate: null, tab: null });

  return (
    <div className="cpm-screen cpm-config-workspace">
      <WorkspaceHeader page="/cpm/config" title="Gate Configuration" copy=""
        actions={<>
          <SegmentedControl<Toggle> label="Gate Configuration view" value={view === 'editor' ? 'bundles' : view} onChange={toggle} options={TOGGLE} />
          <ObcButton variant="flat" onClick={() => setGuide(true)}>How to read</ObcButton>
        </>} />
      <LoopBand card loopId={loopId}
        onLoop={id => go({ loop: id, view: view === 'bundles' ? 'bundles' : 'effective', bundle: null, gate: null, tab: null })}
        end={loopId ? <ObcButton variant="flat" onClick={() => navigate(explorerHref(loopId))}>Open loop ↗</ObcButton> : undefined}>
        {view === 'editor' && open && (
          <span className="cpm-config-band">
            <span className="cpm-config-band__name">{open.scopeKind} v{open.version}</span>
            <BundleStatePill state={open.state} />
            <ObcButton variant="flat" onClick={() => setRecord(true)}>Record details</ObcButton>
          </span>
        )}
      </LoopBand>
      <CatalogueNote catalogue={catalogue.data} />
      {view !== 'editor' && catalogue.isError && <QueryError title="Catalogue unavailable" error={catalogue.error} retry={() => void catalogue.refetch()} />}
      {view !== 'editor' && loopId && eff.isError && <QueryError title="Effective configuration unavailable" error={eff.error} retry={() => void eff.refetch()} />}

      {view === 'effective' && !loopId && (
        <EffectiveLoops loops={summary.data?.loops ?? []} loading={summary.isLoading} error={summary.isError ? summary.error : null} onRetry={() => void summary.refetch()}
          catalogue={catalogue.data} onOpenLoop={id => go({ loop: id, view: 'effective', gate: null })} />
      )}
      {view === 'effective' && loopId && (eff.data
        ? <LoopEffective key={loopId} eff={eff.data} catalogue={catalogue.data} gate={gate} onGate={g => go({ gate: g })} />
        : !eff.isError && <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading the effective configuration…</span></div>)}
      {view === 'bundles' && loopId && (
        <BundlesView key={loopId} activeBundleId={eff.data?.bundle?.bundleId} canDraft={perms.draft} creating={actions.create.isPending}
          createError={actions.create.isError ? actions.create.error : null} onDraftOpen={actions.create.reset}
          levels={{
            LOOP: { ref: loopId, bundles: loopLevel.data?.bundles ?? [], loading: loopLevel.isLoading, error: loopLevel.isError ? loopLevel.error : null, retry: () => void loopLevel.refetch() },
            PROFILE: { ref: profileId ?? '…', bundles: profileLevel.data?.bundles ?? [], loading: profileLevel.isLoading || (!profileId && eff.isLoading), error: profileLevel.isError ? profileLevel.error : null, retry: () => void profileLevel.refetch() },
            SITE: { ref: site ?? '…', bundles: siteLevel.data?.bundles ?? [], loading: siteLevel.isLoading, error: siteLevel.isError ? siteLevel.error : null, retry: () => void siteLevel.refetch() },
          }}
          onOpen={id => go({ view: 'editor', bundle: id, gate: null, tab: null })}
          onCreate={a => { if (site) actions.create.mutate({ site, scopeKind: a.scopeKind, scopeRef: a.scopeRef, parentBundleId: a.parentBundleId, note: a.note }); }} />
      )}
      {view === 'bundles' && !loopId && (
        <BundlesView activeBundleId={undefined} canDraft={perms.draft} creating={false} createError={null}
          progress={{ bundles: inProgress, loading: progress.some(q => q.isLoading), error: progress.find(q => q.isError)?.error ?? null, retry: () => progress.forEach(q => void q.refetch()) }}
          onOpen={id => go({ view: 'editor', bundle: id, gate: null, tab: null })} onCreate={() => undefined} />
      )}
      {view === 'editor' && bundleId && (
        <EditorView key={bundleId} bundleId={bundleId} gate={gate ?? 'G0'} tab={tab} perms={perms} loopId={loopId}
          siteLoopCount={loopId ? loopList.filter(l => l.site === site).length : undefined}
          onGate={g => go({ gate: g })} onTab={t => go({ tab: t === 'properties' ? null : t })} onBack={toBundles} />
      )}

      <ConfigHowToRead open={guide} onClose={() => setGuide(false)} />
      {open && <DetailsDialog title="Record details" open={record} onClose={() => setRecord(false)} rows={recordRows(open)} />}
    </div>
  );
};

export default GateConfigurationWorkspace;
