/**
 * One change to the settings, /cpm/config/changes/:bundleId (Gate Configuration journey, Task 8). Back link to the level it
 * changes, the version as the title, one lead line, one state pill, then a card with the five-step bar (`?step=`), the step's body
 * and Back / Next. The data wiring and every action are those of the bundle editor this page replaced: the same permissions, the
 * same server refusals; Next and Back only move between steps. Every link keeps the header's plant scope (`scoped`).
 */
import React, { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError, TonePill } from '../shared';
import { ApiError } from '../../../api/apiFetch';
import type { Bundle, PatchOp } from '../../../api/cpm/config';
import { useAuthStore } from '../../../store/authStore';
import { stamp } from '../events/eventTime';
import { useBundle, useConfigActions, useConfigCatalogue, useDeployments, useEffectiveSummary } from './useConfig';
import { PropertiesTab } from './PropertiesTab';
import { DiffImpactPanel } from './DiffImpactPanel';
import { ShadowComparison } from './ShadowComparison';
import { ApprovalTab, currentApproval } from './ApprovalTab';
import { DeploymentsTab } from './DeploymentsTab';
import { StepBar } from './StepBar';
import { SubPageHead } from './SubPageHead';
import { editableState, frozenLine, frozenSentence, lifecycleActions, type LifecycleAction } from './lifecycle';
import { APPROVAL_BINDS, APPROVE_RULE, CONTROL_AUTHORITY } from '../governance/GovernanceHowToRead';
import { bundleApproveRule } from './approvalRules';
import { diffProperties, resolveBelow } from './configSupport';
import { bundleStateWord, editableChanges, plainNote } from './configWords';
import { scopeTitle, stateWord, stepMarks, versionLabel } from './levelWords';
import { CONFIG_BASE, loopPath, plantPath, scoped, typePath, type ChangeStep } from './configRoutes';
import { CHANGE_STEPS as ORDER, SETTLED } from './changeStates';

const TRY_HELP = "Runs this change on the loop's recent data and compares the results with what ran. Nothing on the plant changes.";
/** The approval rules in Governance's words (one source); only the 72 h is said here, as Governance does not say it. */
const APPROVE_HELP = <><p>{APPROVE_RULE}</p><p>{CONTROL_AUTHORITY}</p><p>{APPROVAL_BINDS}</p><p>Approval lasts 72 h.</p></>;

/** Where the back link goes and what it says. */
function backOf(b: Bundle): { href: string; label: string } {
  if (b.scopeKind === 'LOOP') return { href: loopPath(b.scopeRef ?? ''), label: b.scopeRef ?? '' };
  if (b.scopeKind === 'REGIME') { const loop = (b.scopeRef ?? '').split('@')[0]; return { href: loopPath(loop), label: loop }; }
  if (b.scopeKind === 'PROFILE') return { href: typePath(b.scopeRef ?? ''), label: scopeTitle('PROFILE', b.scopeRef ?? '') };
  return { href: plantPath(b.site), label: scopeTitle('SITE', b.site) };
}

const Skeleton: React.FC = () => (
  <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading…</span></div>
);

export const ConfigChangePage: React.FC = () => {
  const { bundleId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [gate, setGate] = useState('G0');
  const perms = {
    draft: useAuthStore(s => s.hasPermission('cpm.config.draft')), validate: useAuthStore(s => s.hasPermission('cpm.config.validate')),
    shadow: useAuthStore(s => s.hasPermission('cpm.config.shadow')), approve: useAuthStore(s => s.hasPermission('cpm.config.approve')),
    activate: useAuthStore(s => s.hasPermission('cpm.config.activate')), rollback: useAuthStore(s => s.hasPermission('cpm.config.rollback')),
  };
  const viewer = useAuthStore(s => s.user);
  const catalogue = useConfigCatalogue();
  const entries = useMemo(() => catalogue.data?.properties ?? [], [catalogue.data]);
  const bundle = useBundle(bundleId);
  const b = bundle.data;
  const parent = useBundle(b?.parentBundleId ?? undefined);
  const deployments = useDeployments(bundleId);
  const actions = useConfigActions(b?.site);
  const requested = params.get('step');
  // Edit is done exactly when Check lists a change (the same editable-filtered list); null = the catalogue is still loading
  const changes = !b ? [] : editableChanges(diffProperties(parent.data?.resolved.properties ?? resolveBelow(b.layers, b.scopeKind), b.resolved.properties), catalogue.data ? entries : null);
  const marks = stepMarks(b?.state ?? 'DRAFT', changes.length > 0);
  // a marker for the plant-wide settings has nothing to edit, check or try: those steps carry no mark
  if (b?.inherits) {
    marks.edit = null; marks.check = null; marks.try = null;
    if (marks.approve !== 'done' && marks.approve !== 'current' && marks.deploy !== 'current') marks.approve = 'current';
  }
  const fallback: ChangeStep = b && SETTLED.has(b.state) ? 'deploy' : ORDER.find(s => marks[s] === 'current') ?? 'edit';
  const step = ORDER.includes(requested as ChangeStep) ? (requested as ChangeStep) : fallback;
  const fleet = useEffectiveSummary({ site: b?.site }, (step === 'check' || step === 'approve') && !!b && b.scopeKind !== 'LOOP');
  const deploymentList = deployments.data?.deployments ?? [];
  const running = deploymentList.find(d => d.active);
  // the version a rollback brings back, read only on the Deploy step and only when the target names its bundle
  const previous = useBundle(step === 'deploy' ? running?.rollbackTarget?.bundleId : undefined);

  if (bundle.isLoading && !b) return <div className="cpm-screen"><Skeleton /></div>;
  if (bundle.isError && !(bundle.error instanceof ApiError && bundle.error.status === 404)) {
    return <div className="cpm-screen"><QueryError error={bundle.error} retry={() => void bundle.refetch()} /></div>;
  }
  if (!b) {
    return <div className="cpm-screen"><section className="cpm-surface"><EmptyState level={2} title="Change not found" next={[{ label: 'Gate Configuration', to: scoped(CONFIG_BASE, params) }]} /></section></div>;
  }

  // a step is one query key: the header's plant scope stays
  const go = (s: ChangeStep) => setParams(p => { const n = new URLSearchParams(p); n.set('step', s); return n; });
  const at = ORDER.indexOf(step);

  const { expired } = currentApproval(b);
  // a marker for the plant-wide settings (CHG-223) has no content of its own: the server refuses its edits
  const editable = editableState(b.state, expired) && perms.draft && !b.inherits;
  const frozen = editableState(b.state, expired) ? null : frozenSentence(b.state);
  const [validate, , approve, deploy, rollback] = lifecycleActions(b, perms, expired, { running: !!running, target: running?.rollbackTarget ?? null, loading: deployments.isLoading }, bundleApproveRule(b, viewer));
  // the frozen reason is said once, under the step bar; a disabled action with that reason says nothing more under itself
  const reasonOf = (a: LifecycleAction) => (a.enabled || a.reason === frozen ? null : a.reason);
  const onOp = (op: PatchOp) => actions.patch.mutate({ id: b.bundleId, etag: b.etag, ops: [op] });
  const loopCount = b.scopeKind === 'PROFILE' ? fleet.data?.loops.filter(l => l.profileId === b.scopeRef).length : fleet.data?.count;
  const appliesTo = b.scopeKind === 'LOOP' || b.scopeKind === 'REGIME' ? b.scopeRef ?? undefined
    : `${scopeTitle(b.scopeKind, b.scopeKind === 'SITE' ? b.site : b.scopeRef ?? '')}${loopCount != null ? ` · ${loopCount} ${loopCount === 1 ? 'loop' : 'loops'}` : ''}`;
  const back = backOf(b);
  const backHref = scoped(back.href, params);
  const lead = [plainNote(b.note), b.createdBy, stamp(b.createdAt)].filter(Boolean).join(' · ');
  const word = bundleStateWord(b.state);

  return (
    <div className="cpm-screen cpm-config-onebundle">
      <SubPageHead backHref={backHref} backLabel={back.label} title={b.inherits ? `Uses the plant-wide settings v${b.version}` : versionLabel(b)} lead={lead}
        pills={<TonePill tone={word.tone} glyph={word.glyph}>{stateWord(b.state)}</TonePill>} />
      {catalogue.isError && <QueryError title="Catalogue unavailable" error={catalogue.error} retry={() => void catalogue.refetch()} />}
      <section className="cpm-surface cpm-config-change" aria-label="Steps of this change">
        <StepBar current={step} marks={marks} onStep={go} help={{ try: TRY_HELP, approve: APPROVE_HELP }} />
        {frozen && <p className="cpm-config-frozen">{frozenLine(b.state)}</p>}
        {step === 'edit' && actions.patch.isError && <p className="cpm-field__error" role="alert">{actions.patch.error instanceof Error ? actions.patch.error.message : String(actions.patch.error)}</p>}
        <div className="cpm-config-change__body">
          {step === 'edit' && (
            <PropertiesTab bundle={b} entries={entries} gate={gate} onGate={setGate} editable={editable} pending={actions.patch.isPending} onOp={onOp} />
          )}
          {step === 'check' && (
            <DiffImpactPanel bundle={b} parent={parent.data} loopCount={loopCount} entries={catalogue.data ? entries : null}
              validate={{ enabled: validate.enabled, reason: reasonOf(validate), busy: actions.validate.isPending, error: actions.validate.error, onValidate: () => actions.validate.mutate(b.bundleId) }} />
          )}
          {step === 'try' && (
            <ShadowComparison bundle={b} defaultLoopId={b.scopeKind === 'LOOP' ? b.scopeRef ?? undefined : undefined} canShadow={perms.shadow} pending={actions.shadow.isPending} error={actions.shadow.error}
              onStart={a => actions.shadow.mutate({ id: b.bundleId, ...a })} />
          )}
          {step === 'approve' && (
            <ApprovalTab bundle={b} changes={changes} appliesTo={appliesTo} action={approve} reason={reasonOf(approve)} busy={actions.approve.isPending} error={actions.approve.error}
              onApprove={a => actions.approve.mutate({ id: b.bundleId, ...a })} />
          )}
          {step === 'deploy' && (
            <DeploymentsTab bundle={b} previous={previous.data} deployments={deploymentList} deploymentsLoading={deployments.isLoading} deploymentsError={deployments.isError ? deployments.error : null} retryDeployments={() => void deployments.refetch()}
              activate={deploy} rollback={rollback} reasons={{ activate: reasonOf(deploy), rollback: reasonOf(rollback) }}
              busy={{ deploy: actions.deploy.isPending, rollback: actions.rollback.isPending }} errors={{ deploy: actions.deploy.error, rollback: actions.rollback.error }}
              verifiedActivation={running?.rollbackTarget ? running : undefined}
              onDeploy={a => actions.deploy.mutate({ bundleId: b.bundleId, ...a })} onRollback={id => actions.rollback.mutate(id)} />
          )}
        </div>
        <div className="cpm-config-change__foot">
          <span>{at > 0 && <ObcButton variant="normal" onClick={() => go(ORDER[at - 1])}>{'‹ Back'}</ObcButton>}</span>
          <span>{at < ORDER.length - 1 && <ObcButton variant="raised" onClick={() => go(ORDER[at + 1])}>Next</ObcButton>}</span>
        </div>
      </section>
    </div>
  );
};

export default ConfigChangePage;
