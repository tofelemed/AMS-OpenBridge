/**
 * The loop, loop-type and plant pages of Gate Configuration (/cpm/config/loops/:loopId, /types/:profileId, /plant/:site).
 * One head (back link, title, lead, pills, buttons) and one card with tabs: Values in use, Operating region (loops only), Versions.
 * Pills name the version that governs and, when there is one, the version in progress (a link to its change page).
 * Change settings opens StartChangeDialog, Edit region opens EditRegionDialog and, for a loop with settings of its own, Use plant-wide settings
 * opens UsePlantWideDialog; each is mounted only while open and its open state lives here. Every link keeps the header's plant
 * scope (`scoped`); a missing permission is said once, under the primary button.
 */
import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError, TonePill } from '../shared';
import { Tabs, tabPanelProps } from '../../../ui/Tabs';
import { useCpmScope } from '../plantScope';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';
import { locationLabel } from '../vocabulary';
import { explorerHref } from '../cpaHref';
import { ReasonedButton } from '../ReasonedButton';
import type { BundleSummary, CatalogueEntry, EffectiveConfig, ScopeKind } from '../../../api/cpm/config';
import { useBundle, useBundleSummaries, useConfigCatalogue, useEffectiveConfig, useEffectiveSummary } from './useConfig';
import { CONFIG_BASE, changePath, regionsBatchPath, scoped } from './configRoutes';
import { IN_PROGRESS } from './changeStates';
import { NEEDS } from './lifecycle';
import { scopeTitle, versionLabel } from './levelWords';
import { realName } from './loopNames';
import { SubPageHead } from './SubPageHead';
import { ValuesInUse } from './ValuesInUse';
import { VersionsTab } from './VersionsTab';
import { RegionTab } from './RegionTab';
import { StartChangeDialog } from './StartChangeDialog';
import { EditRegionHost } from './EditRegionDialog';
import { UsePlantWideDialog } from './UsePlantWideDialog';

type Tab = 'values' | 'region' | 'versions';
const TAB_TITLE: Record<Tab, string> = { values: 'Values in use', region: 'Operating region', versions: 'Versions' };
const PROGRESS_WORD: Record<string, string> = {
  SHADOW_EVALUATED: 'waiting for approval', APPROVED: 'ready to deploy', SCHEDULED: 'deploying', PREPARED: 'deploying', REJECTED: 'sent back',
  PARTIALLY_ACKNOWLEDGED: 'partly deployed', ACTIVATION_FAILED: 'deploy failed',
};
/** "v13 waiting for approval" and the like: the words of a version that is on its way. */
const progressWord = (state: string): string => PROGRESS_WORD[state] ?? 'in progress';

const Skeleton: React.FC = () => (
  <div className="cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading…</span></div>
);

interface Governing { bundleId: string; scopeKind: ScopeKind; version: number }

const Frame: React.FC<{
  kind: ScopeKind; scopeRef: string | null; site: string; title: string; lead?: string; loopId?: string; profileId?: string;
  governing: Governing | null; values: React.ReactNode;
}> = ({ kind, scopeRef, site, title, lead, loopId, profileId, governing, values }) => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const go = (path: string) => navigate(scoped(path, params));
  const canDraft = useAuthStore(s => s.hasPermission('cpm.config.draft'));
  // the three buttons share one reason: it is said once, under Change settings; the others keep it on hover
  const why = canDraft ? null : NEEDS.draft;
  const [regionDialogOpen, setRegionDialogOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [plantOpen, setPlantOpen] = useState(false);
  const fleet = useEffectiveSummary({ site }, startOpen);   // the loop counts of the dialog: read only when it opens
  const counts = useMemo(() => {
    const loops = fleet.data?.loops;
    return { type: loops && profileId ? loops.filter(l => l.profileId === profileId).length : undefined, plant: loops?.length };
  }, [fleet.data, profileId]);
  const summaries = useBundleSummaries(site, kind, scopeRef ?? undefined);
  const mine = useMemo(() => (summaries.data?.bundles ?? []).filter(b => b.scopeKind === kind && (b.scopeRef ?? null) === scopeRef), [summaries.data, kind, scopeRef]);

  const tabs: Tab[] = kind === 'LOOP' ? ['values', 'region', 'versions'] : ['values', 'versions'];
  const asked = params.get('tab') as Tab | null;
  const tab: Tab = asked && tabs.includes(asked) ? asked : 'values';
  const setQuery = (key: string, value: string, replace = false) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace });
  };

  const inherits = !!governing && mine.find(b => b.bundleId === governing.bundleId)?.inherits;
  const governingText = !governing ? 'Factory settings' : inherits ? 'Uses the plant-wide settings' : versionLabel(governing);
  // the loop has settings of its own: its governing version is a LOOP version that is not a marker for the plant-wide settings
  const ownSettings = !!loopId && governing?.scopeKind === 'LOOP' && !inherits;
  const onItsWay: BundleSummary | undefined = [...mine].filter(b => IN_PROGRESS.has(b.state)).sort((a, b) => b.version - a.version)[0];

  return (
    <div className="cpm-screen cpm-config-workspace" data-dialog={regionDialogOpen ? 'region' : startOpen ? 'start' : undefined}>
      <SubPageHead backHref={scoped(CONFIG_BASE, params)} backLabel="Gate Configuration" title={title} lead={lead}
        pills={<>
          <TonePill tone="muted">{governingText}</TonePill>
          {onItsWay && <Link className="cpm-pill cpm-pill--warn" to={scoped(changePath(onItsWay.bundleId), params)}>v{onItsWay.version} {progressWord(onItsWay.state)}</Link>}
        </>}
        actions={<>
          {loopId && <ObcButton className="ui-link" variant="normal" onClick={() => navigate(explorerHref(loopId))}>Open loop ↗</ObcButton>}
          {loopId && <ReasonedButton disabled={!canDraft} title={why ?? undefined} onClick={() => setRegionDialogOpen(true)}>Edit region</ReasonedButton>}
          {ownSettings && <ReasonedButton disabled={!canDraft} title={why ?? undefined} onClick={() => setPlantOpen(true)}>Use plant-wide settings</ReasonedButton>}
          <ReasonedButton variant="raised" disabled={!canDraft} reason={why} onClick={() => setStartOpen(true)}>Change settings</ReasonedButton>
        </>} />
      <section className="cpm-surface cpm-config-card">
        <Tabs idBase="config-scope" label="Settings" options={tabs.map(t => ({ value: t, label: TAB_TITLE[t] }))} value={tab} onChange={t => setQuery('tab', t)} />
        <div {...tabPanelProps('config-scope', tab)}>
          {tab === 'values' && values}
          {tab === 'region' && loopId && <RegionTab site={site} loopId={loopId} />}
          {tab === 'versions' && (
            <VersionsTab site={site} kind={kind} scopeRef={scopeRef} activeBundleId={governing?.bundleId} runsText={governingText}
              onOpen={id => go(changePath(id))} />
          )}
        </div>
      </section>
      {regionDialogOpen && loopId && (
        <EditRegionHost site={site} loopId={loopId} onClose={() => setRegionDialogOpen(false)}
          onSaved={id => go(regionsBatchPath(id))} />
      )}
      {plantOpen && loopId && (
        <UsePlantWideDialog open site={site} loopIds={[loopId]} onClose={() => setPlantOpen(false)}
          onDone={id => go(regionsBatchPath(id))} />
      )}
      {startOpen && <StartChangeDialog open site={site} loopId={loopId} profileId={profileId} counts={counts} onClose={() => setStartOpen(false)} />}
    </div>
  );
};

const BackOnly: React.FC<{ title?: string; copy?: string; children?: React.ReactNode }> = ({ title, copy, children }) => {
  const [params] = useSearchParams();
  return (
    <div className="cpm-screen cpm-config-workspace">
      <div className="cpm-reg-detail-head"><Link className="cpm-reg-back" to={scoped(CONFIG_BASE, params)}><span aria-hidden>{'‹ '}</span>Gate Configuration</Link></div>
      {title && <EmptyState title={title} copy={copy} level={2} />}
      {children}
    </div>
  );
};

const useGate = (): [string | null, (g: string) => void] => {
  const [params, setParams] = useSearchParams();
  return [params.get('gate'), g => { const n = new URLSearchParams(params); n.set('gate', g); setParams(n, { replace: true }); }];
};

const byProperty = (entries: CatalogueEntry[] | undefined) => new Map((entries ?? []).map(e => [e.property, e]));

const LoopScope: React.FC<{ loopId: string }> = ({ loopId }) => {
  const loopsQ = useCpmLoops();
  const effQ = useEffectiveConfig(loopId);
  const catQ = useConfigCatalogue();
  const [gate, onGate] = useGate();
  const catalogue = useMemo(() => byProperty(catQ.data?.properties), [catQ.data]);
  const loop = loopsQ.data?.loops.find(l => l.loopId === loopId);
  if (loopsQ.isError) return <BackOnly><QueryError error={loopsQ.error} retry={() => void loopsQ.refetch()} /></BackOnly>;
  if (loopsQ.isLoading) return <div className="cpm-screen"><Skeleton /></div>;
  if (!loop) return <BackOnly title={`No loop ${loopId}`} />;
  const eff = effQ.data;
  const values = effQ.isError ? <QueryError error={effQ.error} retry={() => void effQ.refetch()} />
    : eff ? <ValuesInUse eff={eff} catalogue={catalogue} gate={gate} onGate={onGate} /> : <Skeleton />;
  return (
    <Frame kind="LOOP" scopeRef={loopId} site={eff?.site ?? loop.site} title={loopId} loopId={loopId} profileId={eff?.profileId}
      lead={[realName(loop), locationLabel(loop.unit)].filter(Boolean).join(' · ')}
      governing={eff?.bundle ? { bundleId: eff.bundle.bundleId, scopeKind: eff.bundle.scopeKind, version: eff.bundle.version } : null}
      values={values} />
  );
};

/** The newest active version of one level (a marker for the plant-wide settings is not one). */
const activeAt = (bundles: BundleSummary[] | undefined, kind: ScopeKind, scopeRef: string | null) => (bundles ?? [])
  .filter(b => b.state === 'ACTIVE_VERIFIED' && !b.inherits && b.scopeKind === kind && (b.scopeRef ?? null) === scopeRef).sort((a, b) => b.version - a.version)[0];

/**
 * A loop type or the whole plant: the active version of that level; a type without one runs the plant's active version (final
 * review I5: its pill and Values in use say so, From "Plant"); else the factory defaults.
 */
const LevelScope: React.FC<{ kind: 'PROFILE' | 'SITE'; scopeRef: string | null; site: string }> = ({ kind, scopeRef, site }) => {
  const summaries = useBundleSummaries(site, kind, scopeRef ?? undefined);
  const catQ = useConfigCatalogue();
  const [gate, onGate] = useGate();
  const own = useMemo(() => activeAt(summaries.data?.bundles, kind, scopeRef), [summaries.data, kind, scopeRef]);
  const needPlant = kind === 'PROFILE' && summaries.isSuccess && !own;
  const plantQ = useBundleSummaries(site, 'SITE', undefined, needPlant);
  const plant = useMemo(() => (needPlant ? activeAt(plantQ.data?.bundles, 'SITE', null) : undefined), [needPlant, plantQ.data]);
  const active = own ?? plant;
  const bundleQ = useBundle(active?.bundleId);
  const catalogue = useMemo(() => byProperty(catQ.data?.properties), [catQ.data]);
  const factory = useMemo<Pick<EffectiveConfig, 'properties' | 'sources'>>(() => ({
    properties: Object.fromEntries([...catalogue.values()].map(e => [e.property, e.default])),
    sources: Object.fromEntries([...catalogue.keys()].map(k => [k, 'FACTORY'])),
  }), [catalogue]);
  const title = kind === 'SITE' ? 'Whole plant' : scopeTitle('PROFILE', scopeRef ?? '');
  const bad = summaries.isError ? summaries : needPlant && plantQ.isError ? plantQ : active && bundleQ.isError ? bundleQ : catQ.isError && !active ? catQ : undefined;
  const values = bad ? <QueryError error={bad.error} retry={() => void bad.refetch()} />
    : summaries.isLoading || (needPlant && plantQ.isLoading) || (active && bundleQ.isLoading) || (!active && catQ.isLoading) ? <Skeleton />
    : <ValuesInUse eff={active && bundleQ.data ? bundleQ.data.resolved : factory} catalogue={catalogue} gate={gate} onGate={onGate} />;
  return (
    <Frame kind={kind} scopeRef={scopeRef} site={site} title={title} values={values} profileId={kind === 'PROFILE' ? scopeRef ?? undefined : undefined}
      governing={active ? { bundleId: active.bundleId, scopeKind: active.scopeKind, version: active.version } : null} />
  );
};

const TypeScope: React.FC<{ profileId: string }> = ({ profileId }) => {
  const scope = useCpmScope();
  const loopsQ = useCpmLoops();
  const sites = useMemo(() => [...new Set((loopsQ.data?.loops ?? []).map(l => l.site).filter(Boolean))], [loopsQ.data]);
  const site = scope.params.site || (sites.length === 1 ? sites[0] : '');
  if (loopsQ.isError) return <BackOnly><QueryError error={loopsQ.error} retry={() => void loopsQ.refetch()} /></BackOnly>;
  if (!site) return loopsQ.isLoading ? <div className="cpm-screen"><Skeleton /></div> : <BackOnly title="Choose a plant in the header" />;
  return <LevelScope kind="PROFILE" scopeRef={profileId} site={site} />;
};

export const ConfigScopePage: React.FC<{ kind: ScopeKind }> = ({ kind }) => {
  const { loopId = '', profileId = '', site = '' } = useParams();
  if (kind === 'LOOP') return <LoopScope key={loopId} loopId={loopId} />;
  if (kind === 'PROFILE') return <TypeScope key={profileId} profileId={profileId} />;
  return <LevelScope kind="SITE" scopeRef={null} site={site} />;
};

export default ConfigScopePage;
