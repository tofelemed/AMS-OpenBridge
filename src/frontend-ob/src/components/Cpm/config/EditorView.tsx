/**
 * One bundle (2026-09-17 audit F18, extracted from the shell on 2026-09-18). The shell owns the URL (bundle, gate, tab) and the
 * loop context; the band above names the bundle and holds its Record details.
 * CHG-169 (owner review, the approved sample docs/theme/redesign/samples/gate-configuration-proposal.html): five tabs in
 * lifecycle order - Properties · Diff & impact · Shadow · Approval · Deployments (`?tab=`) - with ✓ done / ● current from the
 * state (they replace the six-step strip) and "Next: X →" at each foot. Each lifecycle action sits on its step's tab (Validate on
 * Diff & impact, Run shadow on Shadow, Approve on Approval, Activate and Roll back on Deployments) instead of the always-visible
 * lifecycle column; the column's "Shadow" button, which only switched tabs, went. Why a version cannot change is said once,
 * under the tabs, in the state's word; the disabled actions under it do not repeat it. A bundle the server does not know reads
 * "Bundle not found". Every action sends what the column sent, with the same permissions and the same server refusals.
 */
import React, { useEffect, useMemo } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Tabs, tabPanelProps } from '../../../ui/Tabs';
import { EmptyState, QueryError } from '../shared';
import { ApiError } from '../../../api/apiFetch';
import type { PatchOp } from '../../../api/cpm/config';
import { useBundle, useConfigActions, useConfigCatalogue, useDeployments } from './useConfig';
import { PropertiesTab } from './PropertiesTab';
import { DiffImpactPanel } from './DiffImpactPanel';
import { ShadowComparison } from './ShadowComparison';
import { ApprovalTab, currentApproval } from './ApprovalTab';
import { DeploymentsTab } from './DeploymentsTab';
import { BUNDLE_TABS, EDITABLE_STATES, frozenSentence, lifecycleActions, tabMarks, type BundleTab, type LifecycleAction } from './lifecycle';

export type ConfigTab = BundleTab;
export const TABS: ConfigTab[] = BUNDLE_TABS;
export { GATES } from './configLists';
const TAB_TITLE: Record<ConfigTab, string> = { properties: 'Properties', diff: 'Diff & impact', shadow: 'Shadow', approval: 'Approval', deployments: 'Deployments' };
const MARK = { done: ' ✓', current: ' ●' } as const;

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
  const entries = useMemo(() => catalogue.data?.properties ?? [], [catalogue.data]);
  const byProperty = useMemo(() => new Map(entries.map(p => [p.property, p])), [entries]);
  const bundle = useBundle(bundleId);
  const b = bundle.data;
  const parent = useBundle(b?.parentBundleId ?? undefined);
  const deployments = useDeployments(bundleId);
  const actions = useConfigActions(b?.site);
  useEffect(() => { if (b?.site && onSiteKnown) onSiteKnown(b.site); }, [b?.site, onSiteKnown]);

  if (bundle.isLoading && !b) return <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading the bundle…</span></div>;
  const missing = <section className="cpm-surface"><EmptyState title="Bundle not found" copy="The bundle in the address does not exist (any more). Go back to the levels." action={{ label: '‹ Bundles', onClick: onBack }} /></section>;
  if (bundle.isError) return bundle.error instanceof ApiError && bundle.error.status === 404 ? missing : <QueryError error={bundle.error} retry={() => void bundle.refetch()} />;
  if (!b) return missing;

  const editable = EDITABLE_STATES.has(b.state) && perms.draft;
  const frozen = EDITABLE_STATES.has(b.state) ? null : frozenSentence(b.state);
  const { expired } = currentApproval(b);
  const deploymentList = deployments.data?.deployments ?? [];
  const verifiedActivation = deploymentList.find(d => d.state === 'ACTIVE_VERIFIED' && d.kind === 'ACTIVATE');
  const [validate, , approve, deploy, rollback] = lifecycleActions(b, perms, expired, !!verifiedActivation);
  // the frozen reason is said once, under the tabs; a disabled action with that reason says nothing more under itself
  const reasonOf = (a: LifecycleAction) => (a.enabled || a.reason === frozen ? null : a.reason);
  const marks = tabMarks(b.state);
  const options = TABS.map(t => ({ value: t, label: `${TAB_TITLE[t]}${marks[t] ? MARK[marks[t]!] : ''}` }));
  const next = TABS[TABS.indexOf(tab) + 1];
  const foot = next && (
    <div className="cpm-config-next"><ObcButton variant="raised" onClick={() => onTab(next)}>Next: {TAB_TITLE[next]} {'→'}</ObcButton></div>
  );
  const onOp = (op: PatchOp) => actions.patch.mutate({ id: b.bundleId, etag: b.etag, ops: [op] });

  return (
    <div className="cpm-config-onebundle">
      {catalogue.isError && <QueryError title="Catalogue unavailable" error={catalogue.error} retry={() => void catalogue.refetch()} />}
      <div className="cpm-tabs-row">
        <div className="cpm-tabs"><Tabs idBase="config-editor" label="Bundle lifecycle" options={options} value={tab} onChange={onTab} /></div>
        <span className="cpm-tabs-row__end cpm-event-row__sub">✓ done · ● current</span>
      </div>
      {frozen && <p className="cpm-config-frozen">{frozen}</p>}
      {tab === 'properties' && actions.patch.isError && <p className="cpm-field__error" role="alert">{actions.patch.error instanceof Error ? actions.patch.error.message : String(actions.patch.error)}</p>}
      <div {...tabPanelProps('config-editor', tab)}>
        {tab === 'properties' && (
          <PropertiesTab bundle={b} entries={entries} gate={gate} onGate={onGate} editable={editable} pending={actions.patch.isPending} onOp={onOp} foot={foot} />
        )}
        {tab === 'diff' && (
          <section className="cpm-surface">
            <DiffImpactPanel bundle={b} parent={parent.data} catalogue={byProperty} siteLoopCount={siteLoopCount}
              validate={{ enabled: validate.enabled, reason: reasonOf(validate), busy: actions.validate.isPending, error: actions.validate.error, onValidate: () => actions.validate.mutate(b.bundleId) }} />
            {foot}
          </section>
        )}
        {tab === 'shadow' && (
          <section className="cpm-surface">
            <ShadowComparison bundle={b} defaultLoopId={loopId} canShadow={perms.shadow} pending={actions.shadow.isPending} error={actions.shadow.error}
              onStart={a => actions.shadow.mutate({ id: b.bundleId, ...a })} />
            {foot}
          </section>
        )}
        {tab === 'approval' && (
          <section className="cpm-surface">
            <ApprovalTab bundle={b} action={approve} reason={reasonOf(approve)} busy={actions.approve.isPending} error={actions.approve.error}
              onApprove={a => actions.approve.mutate({ id: b.bundleId, ...a })} />
            {foot}
          </section>
        )}
        {tab === 'deployments' && (
          <DeploymentsTab bundle={b} deployments={deploymentList} deploymentsLoading={deployments.isLoading} deploymentsError={deployments.isError ? deployments.error : null} retryDeployments={() => void deployments.refetch()}
            activate={deploy} rollback={rollback} reasons={{ activate: reasonOf(deploy), rollback: reasonOf(rollback) }}
            busy={{ deploy: actions.deploy.isPending, rollback: actions.rollback.isPending }} errors={{ deploy: actions.deploy.error, rollback: actions.rollback.error }}
            verifiedActivation={verifiedActivation}
            onDeploy={a => actions.deploy.mutate({ bundleId: b.bundleId, ...a })} onRollback={id => actions.rollback.mutate(id)} />
        )}
      </div>
    </div>
  );
};
