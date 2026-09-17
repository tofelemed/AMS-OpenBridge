/**
 * v2.5 Task 3D.1 (spec §5.7): the Gate Configuration workspace. Route
 * /cpm/config?site=&scope=SITE|PROFILE|LOOP&ref=&bundle=&gate=. Navigation: scope → bundle
 * version → gate → properties → effective values → diff / impact → shadow → review / activation →
 * deployment status. Every state and every value on this screen is the server's record; the
 * browser only edits requested changes and renders what came back.
 * 2026-09-17 audit F18: the centre is a property TABLE per gate (one editor open at a time) with
 * Diff & impact and Shadow as tabs; the right column is the lifecycle (steps, actions in order with
 * their blocking reason) and the deployments as a timeline with the ACK matrix folded.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcTabRow } from '@oicl/openbridge-webcomponents-react/components/tab-row/tab-row';
import { EmptyState, KvRow, PanelHead, QueryError, TonePill, WorkspaceHeader, fmtDateTime } from '../shared';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';
import type { Bundle, CatalogueEntry, PatchOp, ScopeKind } from '../../../api/cpm/config';
import { useBundle, useBundles, useConfigActions, useConfigCatalogue, useDeployments } from './useConfig';
import { PropertyTable } from './PropertyTable';
import { DiffImpactPanel } from './DiffImpactPanel';
import { ShadowComparison } from './ShadowComparison';
import { LifecyclePanel } from './LifecyclePanel';
import { DeploymentStatus } from './DeploymentStatus';
import { EffectiveConfigDrawer } from './EffectiveConfigDrawer';
import { bundleStateTone, shortHash } from './configSupport';

export type ConfigTab = 'properties' | 'diff' | 'shadow';
const TABS: ConfigTab[] = ['properties', 'diff', 'shadow'];
const TAB_TITLE: Record<ConfigTab, string> = { properties: 'Properties', diff: 'Diff & impact', shadow: 'Shadow' };

export const configHref = (q: { site?: string; scope?: ScopeKind; ref?: string; bundle?: string; gate?: string; tab?: ConfigTab }) => {
  const p = new URLSearchParams();
  if (q.site) p.set('site', q.site);
  if (q.scope) p.set('scope', q.scope);
  if (q.ref) p.set('ref', q.ref);
  if (q.bundle) p.set('bundle', q.bundle);
  if (q.gate) p.set('gate', q.gate);
  if (q.tab && q.tab !== 'properties') p.set('tab', q.tab);
  const s = p.toString();
  return `/cpm/config${s ? `?${s}` : ''}`;
};

const GATES = ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];
const EDITABLE_STATES = new Set(['DRAFT', 'VALIDATED', 'SHADOW_EVALUATED', 'REJECTED']);

export const GateConfigurationWorkspace: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const loops = useCpmLoops();
  const sites = useMemo(() => [...new Set((loops.data?.loops ?? []).map(l => l.site).filter(Boolean))].sort(), [loops.data]);
  const site = params.get('site') || sites[0] || '';
  const scope = ((params.get('scope') || 'LOOP').toUpperCase() as ScopeKind);
  const ref = params.get('ref') || '';
  const bundleId = params.get('bundle') || undefined;
  const gate = params.get('gate') || 'G0';
  const tabParam = params.get('tab');
  const tab: ConfigTab = TABS.includes(tabParam as ConfigTab) ? (tabParam as ConfigTab) : 'properties';
  const go = (q: Partial<{ site: string; scope: ScopeKind; ref: string; bundle: string; gate: string; tab: ConfigTab }>) =>
    navigate(configHref({ site, scope, ref, bundle: bundleId, gate, tab, ...q }));

  const perms = {
    read: useAuthStore(s => s.hasPermission('cpm.config.read')), draft: useAuthStore(s => s.hasPermission('cpm.config.draft')),
    validate: useAuthStore(s => s.hasPermission('cpm.config.validate')), shadow: useAuthStore(s => s.hasPermission('cpm.config.shadow')),
    approve: useAuthStore(s => s.hasPermission('cpm.config.approve')), activate: useAuthStore(s => s.hasPermission('cpm.config.activate')),
    rollback: useAuthStore(s => s.hasPermission('cpm.config.rollback')),
  };
  const catalogue = useConfigCatalogue();
  const byProperty = useMemo(() => new Map((catalogue.data?.properties ?? []).map(p => [p.property, p] as [string, CatalogueEntry])), [catalogue.data]);
  const bundles = useBundles(site || undefined, scope, ref || undefined);
  const bundle = useBundle(bundleId);
  const parent = useBundle(bundle.data?.parentBundleId ?? undefined);
  const deployments = useDeployments(bundleId);
  const actions = useConfigActions(site || undefined);
  const [note, setNote] = useState('');
  const [showEffective, setShowEffective] = useState(false);

  // after a create, follow the new draft
  useEffect(() => { if (actions.create.data?.bundleId && actions.create.data.bundleId !== bundleId) go({ bundle: actions.create.data.bundleId }); }, [actions.create.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const b: Bundle | undefined = bundle.data;
  const editable = !!b && EDITABLE_STATES.has(b.state) && perms.draft;
  const gateProps = useMemo(() => (catalogue.data?.properties ?? []).filter(p => p.gate === gate), [catalogue.data, gate]);
  const onOp = (op: PatchOp) => { if (b) actions.patch.mutate({ id: b.bundleId, etag: b.etag, ops: [op] }); };
  const loopIdOfScope = scope === 'LOOP' ? ref : undefined;
  const siteLoopCount = (loops.data?.loops ?? []).filter(l => l.site === site).length;
  const deploymentList = deployments.data?.deployments ?? [];
  const verifiedActivation = deploymentList.find(d => d.state === 'ACTIVE_VERIFIED' && d.kind === 'ACTIVATE');
  const invalidCount = b?.validation?.errors.length ?? 0;
  const tabs = useMemo(() => TABS.map(t => ({ id: t, title: t === 'properties' && invalidCount ? `${TAB_TITLE[t]} · ${invalidCount} invalid` : TAB_TITLE[t], hasLeadingIcon: false, hasTrailingIcon: false })), [invalidCount]);

  if (!perms.read) return <div className="cpm-screen"><EmptyState title="Gate configuration" copy="Reading the governed configuration needs cpm.config.read." /></div>;

  return (
    <div className="cpm-screen cpm-config-workspace">
      <WorkspaceHeader eyebrow="Loop performance" title="Gate configuration"
        copy={`Catalogue ${catalogue.data ? shortHash(catalogue.data.catalogueHash, 12) : '…'} · ${catalogue.data?.count ?? 0} properties · ${catalogue.data?.workers.length ?? 0} worker(s) announced${catalogue.data && catalogue.data.workers.some(w => !w.catalogueMatches) ? ' · a worker runs ANOTHER catalogue' : ''}`}
        actions={loopIdOfScope ? <ObcButton variant="flat" onClick={() => setShowEffective(v => !v)}>{showEffective ? 'Hide effective' : 'Show effective'}</ObcButton> : undefined} />
      {catalogue.isError && <QueryError error={catalogue.error} retry={() => void catalogue.refetch()} />}
      <div className="cpm-config-columns">
        <aside className="cpm-config-nav">
          <section className="cpm-surface">
            <PanelHead eyebrow="Scope" title="Site → scope → reference" />
            <label className="cpm-field"><span className="cpm-field__label">Site</span>
              <select className="cpm-select" value={site} onChange={e => go({ site: e.target.value, bundle: '' })}>{sites.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
            <label className="cpm-field"><span className="cpm-field__label">Scope</span>
              <select className="cpm-select" value={scope} onChange={e => go({ scope: e.target.value as ScopeKind, ref: '', bundle: '' })}>
                <option value="SITE">SITE - every loop without a more specific bundle</option>
                <option value="PROFILE">PROFILE - one class pack</option>
                <option value="LOOP">LOOP - one loop</option>
              </select></label>
            {scope === 'PROFILE' && (
              <label className="cpm-field"><span className="cpm-field__label">Profile</span>
                <select className="cpm-select" value={ref} onChange={e => go({ ref: e.target.value, bundle: '' })}><option value="">choose…</option>{(catalogue.data?.profileIds ?? []).map(p => <option key={p} value={p}>{p}</option>)}</select></label>
            )}
            {scope === 'LOOP' && (
              <label className="cpm-field"><span className="cpm-field__label">Loop</span>
                <select className="cpm-select" value={ref} onChange={e => go({ ref: e.target.value, bundle: '' })}><option value="">choose…</option>{(loops.data?.loops ?? []).filter(l => l.site === site).map(l => <option key={l.loopId} value={l.loopId}>{l.loopId} · {l.displayName}</option>)}</select></label>
            )}
            <PanelHead eyebrow="Bundles" title={`${bundles.data?.bundles.length ?? 0} version(s)`} />
            {bundles.isError && <QueryError error={bundles.error} retry={() => void bundles.refetch()} />}
            <ul className="cpm-config-bundles">
              {(bundles.data?.bundles ?? []).map(x => (
                <li key={x.bundleId}>
                  <button type="button" className={`cpm-config-bundle${x.bundleId === bundleId ? ' cpm-config-bundle--selected' : ''}`} onClick={() => go({ bundle: x.bundleId })}>
                    <span className="cpm-mono">v{x.version} · {shortHash(x.contentHash, 8)}</span>
                    <TonePill tone={bundleStateTone(x.state)}>{x.state}</TonePill>
                    <span className="cpm-copy">{x.changeClass} · {fmtDateTime(x.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {perms.draft && (scope === 'SITE' || ref) && (
              <div className="cpm-config-inline">
                <input className="cpm-input" value={note} onChange={e => setNote(e.target.value)} placeholder="draft note" />
                <ObcButton variant="raised" disabled={actions.create.isPending} onClick={() => actions.create.mutate({ site, scopeKind: scope, scopeRef: scope === 'SITE' ? site : ref, parentBundleId: b?.bundleId ?? bundles.data?.bundles[0]?.bundleId ?? null, note: note || undefined })}>
                  {actions.create.isPending ? 'Creating…' : b || bundles.data?.bundles.length ? 'New version' : 'New draft'}
                </ObcButton>
                {actions.create.isError && <span className="cpm-field__error" role="alert">{actions.create.error instanceof Error ? actions.create.error.message : String(actions.create.error)}</span>}
              </div>
            )}
          </section>
          {showEffective && loopIdOfScope && <EffectiveConfigDrawer loopId={loopIdOfScope} onClose={() => setShowEffective(false)} />}
        </aside>

        <main className="cpm-config-centre">
          {!b && <EmptyState title="No bundle selected" copy="Choose a scope and a bundle version on the left, or create a draft. A draft starts from the parent version - the factory layer and the class pack for a first draft." />}
          {bundle.isError && <QueryError error={bundle.error} retry={() => void bundle.refetch()} />}
          {b && (
            <section className="cpm-surface">
              <PanelHead eyebrow={`${b.scopeKind}${b.scopeRef ? ` ${b.scopeRef}` : ''} · v${b.version}`} title={tab === 'properties' ? `Properties · ${gate}` : TAB_TITLE[tab]}
                right={<TonePill tone={bundleStateTone(b.state)}>{b.state}</TonePill>} />
              <KvRow label="hash / etag"><span className="cpm-mono">{shortHash(b.contentHash, 16)} · {b.etag}</span></KvRow>
              {!editable && perms.draft && <p className="cpm-copy">This version is {b.state}: create a new version to change it.</p>}
              {actions.patch.isError && <p className="cpm-field__error" role="alert">{actions.patch.error instanceof Error ? actions.patch.error.message : String(actions.patch.error)}</p>}
              <div className="cpm-tabs">
                {/* `hug`: obc-tab-item is 240px wide by default; three would demand 720px of a column that can be narrower */}
                <ObcTabRow hug tabs={tabs} selectedTabId={tab}
                  onTabSelected={(e: CustomEvent<{ id: string }>) => { if (TABS.includes(e.detail.id as ConfigTab)) go({ tab: e.detail.id as ConfigTab }); }} />
              </div>
              {tab === 'properties' && (
                <>
                  <div className="cpm-config-gates" role="tablist" aria-label="Gate">
                    {GATES.map(g => <button key={g} type="button" role="tab" aria-selected={g === gate} className={`cpm-config-gate${g === gate ? ' cpm-config-gate--selected' : ''}`} onClick={() => go({ gate: g })}>{g}</button>)}
                  </div>
                  <PropertyTable entries={gateProps} bundle={b} editable={editable} pending={actions.patch.isPending} onOp={onOp} />
                </>
              )}
              {tab === 'diff' && <DiffImpactPanel bundle={b} parent={parent.data} catalogue={byProperty} siteLoopCount={siteLoopCount} />}
              {tab === 'shadow' && (
                <ShadowComparison bundle={b} defaultLoopId={loopIdOfScope} canShadow={perms.shadow} pending={actions.shadow.isPending} error={actions.shadow.error}
                  onStart={a => actions.shadow.mutate({ id: b.bundleId, ...a })} />
              )}
            </section>
          )}
        </main>

        <aside className="cpm-config-side">
          {b && (
            <LifecyclePanel bundle={b} perms={{ validate: perms.validate, shadow: perms.shadow, approve: perms.approve, activate: perms.activate, rollback: perms.rollback }}
              pending={{ validate: actions.validate.isPending, approve: actions.approve.isPending, deploy: actions.deploy.isPending, rollback: actions.rollback.isPending }}
              errors={{ validate: actions.validate.error, approve: actions.approve.error, deploy: actions.deploy.error, rollback: actions.rollback.error }}
              hasVerifiedActivation={!!verifiedActivation}
              onValidate={() => actions.validate.mutate(b.bundleId)} onShadow={() => go({ tab: 'shadow' })}
              onApprove={a => actions.approve.mutate({ id: b.bundleId, ...a })}
              onDeploy={a => actions.deploy.mutate({ bundleId: b.bundleId, ...a })}
              onRollback={() => { if (verifiedActivation) actions.rollback.mutate(verifiedActivation.deploymentId); }} />
          )}
          {deployments.isError && <QueryError error={deployments.error} retry={() => void deployments.refetch()} />}
          {b && deploymentList.length > 0 && (
            <>
              <PanelHead eyebrow="Deployments" title={`${deploymentList.length} of this version, newest first`} />
              <ol className="cpm-config-deployments" aria-label="Deployments">
                {deploymentList.map(d => (
                  <DeploymentStatus key={d.deploymentId} deployment={d} canRollback={perms.rollback} rollbackPending={actions.rollback.isPending} onRollback={id => actions.rollback.mutate(id)} />
                ))}
              </ol>
            </>
          )}
        </aside>
      </div>
    </div>
  );
};

export default GateConfigurationWorkspace;
