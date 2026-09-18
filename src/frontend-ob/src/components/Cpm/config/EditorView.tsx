/**
 * The editor of one bundle (2026-09-17 audit F18, extracted from the shell on 2026-09-18): the property
 * table per gate with one editor open, Diff & impact and Shadow as tabs, the lifecycle column (steps,
 * actions in order with their reason, approvals) and the deployments timeline. Two columns; the shell
 * owns the URL (bundle, gate, tab) and the loop context.
 */
import React, { useEffect, useMemo } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcTabRow } from '@oicl/openbridge-webcomponents-react/components/tab-row/tab-row';
import { EmptyState, KvRow, PanelHead, QueryError, TonePill } from '../shared';
import type { CatalogueEntry, PatchOp } from '../../../api/cpm/config';
import { useBundle, useConfigActions, useConfigCatalogue, useDeployments } from './useConfig';
import { PropertyTable } from './PropertyTable';
import { DiffImpactPanel } from './DiffImpactPanel';
import { ShadowComparison } from './ShadowComparison';
import { LifecyclePanel } from './LifecyclePanel';
import { DeploymentStatus } from './DeploymentStatus';
import { bundleStateTone, shortHash } from './configSupport';

export type ConfigTab = 'properties' | 'diff' | 'shadow';
export const TABS: ConfigTab[] = ['properties', 'diff', 'shadow'];
const TAB_TITLE: Record<ConfigTab, string> = { properties: 'Properties', diff: 'Diff & impact', shadow: 'Shadow' };
export const GATES = ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];
const EDITABLE_STATES = new Set(['DRAFT', 'VALIDATED', 'SHADOW_EVALUATED', 'REJECTED']);

export interface ConfigPerms { draft: boolean; validate: boolean; shadow: boolean; approve: boolean; activate: boolean; rollback: boolean }

export interface EditorViewProps {
  bundleId: string;
  gate: string;
  tab: ConfigTab;
  perms: ConfigPerms;
  /** The loop the shell is on (a LOOP bundle's loop, else the loop chosen for a shadow run). */
  loopId: string | undefined;
  siteLoopCount: number | undefined;
  onGate: (gate: string) => void;
  onTab: (tab: ConfigTab) => void;
  onBack: () => void;
  /** After a create the shell follows the new draft: the editor reports the site of its bundle for the actions. */
  onSiteKnown?: (site: string) => void;
}

export const EditorView: React.FC<EditorViewProps> = ({ bundleId, gate, tab, perms, loopId, siteLoopCount, onGate, onTab, onBack, onSiteKnown }) => {
  const catalogue = useConfigCatalogue();
  const byProperty = useMemo(() => new Map((catalogue.data?.properties ?? []).map(p => [p.property, p] as [string, CatalogueEntry])), [catalogue.data]);
  const bundle = useBundle(bundleId);
  const b = bundle.data;
  const parent = useBundle(b?.parentBundleId ?? undefined);
  const deployments = useDeployments(bundleId);
  const actions = useConfigActions(b?.site);
  useEffect(() => { if (b?.site && onSiteKnown) onSiteKnown(b.site); }, [b?.site, onSiteKnown]);

  const editable = !!b && EDITABLE_STATES.has(b.state) && perms.draft;
  const gateProps = useMemo(() => (catalogue.data?.properties ?? []).filter(p => p.gate === gate), [catalogue.data, gate]);
  const onOp = (op: PatchOp) => { if (b) actions.patch.mutate({ id: b.bundleId, etag: b.etag, ops: [op] }); };
  const deploymentList = deployments.data?.deployments ?? [];
  const verifiedActivation = deploymentList.find(d => d.state === 'ACTIVE_VERIFIED' && d.kind === 'ACTIVATE');
  const invalidCount = b?.validation?.errors.length ?? 0;
  const tabs = useMemo(() => TABS.map(t => ({ id: t, title: t === 'properties' && invalidCount ? `${TAB_TITLE[t]} · ${invalidCount} invalid` : TAB_TITLE[t], hasLeadingIcon: false, hasTrailingIcon: false })), [invalidCount]);

  if (bundle.isLoading && !b) return <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading the bundle…</span></div>;
  if (bundle.isError) return <QueryError error={bundle.error} retry={() => void bundle.refetch()} />;
  if (!b) return <EmptyState title="Bundle not found" copy="The bundle in the address does not exist (any more). Go back to the levels." action={{ label: '‹ Bundles', onClick: onBack }} />;

  return (
    <div className="cpm-config-columns">
      <main className="cpm-config-centre">
        {catalogue.isError && <QueryError error={catalogue.error} retry={() => void catalogue.refetch()} />}
        <section className="cpm-surface">
          <PanelHead eyebrow={`${b.scopeKind}${b.scopeRef ? ` ${b.scopeRef}` : ` ${b.site}`} · v${b.version}`} title={tab === 'properties' ? `Properties · ${gate}` : TAB_TITLE[tab]}
            right={<span className="cpm-config-inline"><TonePill tone={bundleStateTone(b.state)}>{b.state}</TonePill><ObcButton variant="flat" onClick={onBack}>‹ Bundles</ObcButton></span>} />
          <KvRow label="hash / etag"><span className="cpm-mono">{shortHash(b.contentHash, 16)} · {b.etag}</span></KvRow>
          {!editable && perms.draft && <p className="cpm-copy">This version is {b.state}: create a new version to change it.</p>}
          {actions.patch.isError && <p className="cpm-field__error" role="alert">{actions.patch.error instanceof Error ? actions.patch.error.message : String(actions.patch.error)}</p>}
          <div className="cpm-tabs">
            {/* `hug`: obc-tab-item is 240px wide by default; three would demand 720px of a column that can be narrower */}
            <ObcTabRow hug tabs={tabs} selectedTabId={tab}
              onTabSelected={(e: CustomEvent<{ id: string }>) => { if (TABS.includes(e.detail.id as ConfigTab)) onTab(e.detail.id as ConfigTab); }} />
          </div>
          {tab === 'properties' && (
            <>
              <div className="cpm-config-gates" role="tablist" aria-label="Gate">
                {GATES.map(g => <button key={g} type="button" role="tab" aria-selected={g === gate} className={`cpm-config-gate${g === gate ? ' cpm-config-gate--selected' : ''}`} onClick={() => onGate(g)}>{g}</button>)}
              </div>
              <PropertyTable entries={gateProps} bundle={b} editable={editable} pending={actions.patch.isPending} onOp={onOp} />
            </>
          )}
          {tab === 'diff' && <DiffImpactPanel bundle={b} parent={parent.data} catalogue={byProperty} siteLoopCount={siteLoopCount} />}
          {tab === 'shadow' && (
            <ShadowComparison bundle={b} defaultLoopId={loopId} canShadow={perms.shadow} pending={actions.shadow.isPending} error={actions.shadow.error}
              onStart={a => actions.shadow.mutate({ id: b.bundleId, ...a })} />
          )}
        </section>
      </main>

      <aside className="cpm-config-side">
        <LifecyclePanel bundle={b} perms={{ validate: perms.validate, shadow: perms.shadow, approve: perms.approve, activate: perms.activate, rollback: perms.rollback }}
          pending={{ validate: actions.validate.isPending, approve: actions.approve.isPending, deploy: actions.deploy.isPending, rollback: actions.rollback.isPending }}
          errors={{ validate: actions.validate.error, approve: actions.approve.error, deploy: actions.deploy.error, rollback: actions.rollback.error }}
          hasVerifiedActivation={!!verifiedActivation}
          onValidate={() => actions.validate.mutate(b.bundleId)} onShadow={() => onTab('shadow')}
          onApprove={a => actions.approve.mutate({ id: b.bundleId, ...a })}
          onDeploy={a => actions.deploy.mutate({ bundleId: b.bundleId, ...a })}
          onRollback={() => { if (verifiedActivation) actions.rollback.mutate(verifiedActivation.deploymentId); }} />
        {deployments.isError && <QueryError error={deployments.error} retry={() => void deployments.refetch()} />}
        {deploymentList.length > 0 && (
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
  );
};
