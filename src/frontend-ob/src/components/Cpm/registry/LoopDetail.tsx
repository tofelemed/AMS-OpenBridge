'use client';

/**
 * Loop Detail (Task 24, `/cpm/registry?loop=X`): one loop on a page of its own. Facts, signal mapping, readiness
 * as the named fields still missing, the loop model, and the actions: Edit configuration, Retire (Restore once
 * retired), Open loop, Evidence, Effective rules and Re-project. A retired loop keeps its history links; its
 * open episode is left as it is and marked (UI-131).
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Toggletip } from '../../../ui/Toggletip';
import { useAuthStore } from '../../../store/authStore';
import { useCpmEvents, useCpmLoops, useCpmReadiness, useRepublishEvidence } from '../../../hooks/useCpm';
import type { LoopRetireResult } from '../../../api/cpm/loopRetire';
import { EmptyState, KvRow, PanelHead, QueryError, TonePill, WorkspaceHeader, fmtDateTime } from '../shared';
import { adminHref, configHref, evidenceHref, explorerHref } from '../cpaHref';
import { ActionReceipt, byNow, receiptDone, receiptFailed, useReceiptUser, type Receipt } from '../ActionReceipt';
import AddLoopWizard from '../AddLoopWizard';
import ReasonedButton from '../ReasonedButton';
import { CodeLabel } from '../CodeLabel';
import { flagsForLoop, inputContextOf } from '../optionalInputs';
import { modelLabel, stateOf } from '../registryShared';
import { RetireLoopDialog } from './RetireLoopDialog';
import { SignalMapping } from './SignalMapping';
import { factsOf, missingFields, plantPath } from './loopDetailFacts';

const NEEDS_MANAGE = 'Needs the cpm.manage permission';
const RESTORE_FIRST = 'Restore the loop first';

export const LoopDetail: React.FC<{ loopId: string; onBack: () => void }> = ({ loopId, onBack }) => {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useCpmLoops();
  const loops = data?.loops ?? [];
  const stored = loops.find(l => l.loopId.toLowerCase() === loopId.toLowerCase());
  // After Retire or Restore the page follows the answer at once, until the list refetch agrees with it.
  const [asked, setAsked] = useState<boolean | null>(null);
  useEffect(() => { if (asked !== null && stored?.isActive === asked) setAsked(null); }, [asked, stored?.isActive]);
  const loop = stored && asked !== null ? { ...stored, isActive: asked } : stored;
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));
  const canReadConfig = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const canSeeTree = useAuthStore(s => s.hasPermission('asset.view'));
  const readiness = useCpmReadiness(loop?.loopId);
  const retired = !!loop && !loop.isActive;
  const episodes = useCpmEvents({ loopId: loop?.loopId, openOnly: true, includeShelved: true, limit: 1, sort: 'recent' }, 30_000, retired);
  const republish = useRepublishEvidence();
  const user = useReceiptUser();
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'retire' | 'restore' | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const back = <div><ObcButton variant="flat" onClick={onBack}>‹ Loop Registry</ObcButton></div>;
  if (!loop) {
    return (
      <>
        {back}
        <section className="cpm-surface">
          {isLoading && <EmptyState title="Loading loop…" />}
          {isError && <QueryError title="Registry unavailable" error={error} retry={() => void refetch()} />}
          {!isLoading && !isError && <EmptyState title={`No loop ${loopId}`} copy="It was renamed, removed or never onboarded." />}
        </section>
      </>
    );
  }

  const st = stateOf(loop);
  const flags = flagsForLoop(loop.observabilityFlags, inputContextOf(loop));
  const missing = missingFields(readiness.data);
  const open = episodes.data?.events?.[0];
  const m = loop.model;

  const done = (r: LoopRetireResult) => {
    setDialog(null);
    if (r.changed) setAsked(!r.retired);
    setReceipt(receiptDone(r.changed
      ? `${r.retired ? 'Retired' : 'Restored'} ${r.loopId} ${byNow(user)}.`
      : (r.note ?? `${r.loopId} was already ${r.retired ? 'retired' : 'active'}; nothing changed.`), loop.loopId));
  };

  return (
    <>
      {back}
      <WorkspaceHeader
        title={loop.loopId}
        actions={(
          <>
            <ReasonedButton variant="normal" disabled={!canManage || retired} reason={canManage ? RESTORE_FIRST : NEEDS_MANAGE} onClick={() => setEditing(true)}>Edit configuration</ReasonedButton>
            <ReasonedButton variant="normal" disabled={!canManage} reason={NEEDS_MANAGE} onClick={() => setDialog(retired ? 'restore' : 'retire')}>
              {retired ? 'Restore' : 'Retire'}
            </ReasonedButton>
          </>
        )}
      />
      <ActionReceipt receipt={receipt?.key === loop.loopId ? receipt : null} />
      <div className="cpm-loop-model__links">
        <ObcButton variant="flat" onClick={() => navigate(explorerHref(loop.loopId))}>Open loop →</ObcButton>
        <ObcButton variant="flat" onClick={() => navigate(evidenceHref(loop.loopId))}>Evidence →</ObcButton>
        {canReadConfig && <ObcButton variant="flat" onClick={() => navigate(configHref({ loop: loop.loopId }))}>Effective rules ↗</ObcButton>}
      </div>

      <section className="cpm-surface" aria-label="Loop facts">
        <PanelHead title="Facts" right={<TonePill tone={retired ? 'muted' : st.tone}>{retired ? 'Retired' : st.label}</TonePill>} />
        {factsOf(loop).map(([label, value]) => <KvRow key={label} label={label}>{value}</KvRow>)}
        <KvRow label="Plant path">
          {plantPath(loop)}
          {canSeeTree && (
            <ObcButton variant="flat" onClick={() => navigate(`${adminHref('plant-model')}?search=${encodeURIComponent(loop.loopId.toLowerCase())}`)}>
              Plant tree ↗
            </ObcButton>
          )}
        </KvRow>
        <KvRow label="Observability">
          {flags.length > 0
            ? flags.map(f => <TonePill key={f} tone="warn"><CodeLabel code={f} /></TonePill>)
            : <TonePill tone="good">CLEAR</TonePill>}
        </KvRow>
        {retired && open && (
          <KvRow label="Open episode">
            {`${open.family} since ${fmtDateTime(open.opened_at)} `}<TonePill tone="muted">Loop retired</TonePill>
          </KvRow>
        )}
        {retired && episodes.isError && (
          <KvRow label="Open episode">
            The open episode could not be read{' '}
            <ObcButton variant="flat" onClick={() => void episodes.refetch?.()}>Retry</ObcButton>
          </KvRow>
        )}
      </section>

      <SignalMapping loop={loop} />

      <section className="cpm-surface" aria-label="Readiness">
        <PanelHead title="Readiness" />
        {readiness.isError && <QueryError title="Readiness unavailable" error={readiness.error} retry={() => void readiness.refetch()} />}
        {missing.length === 0 && !readiness.isError && <p className="cpm-copy">{readiness.isLoading ? 'Checking readiness…' : 'Nothing missing'}</p>}
        {missing.map(c => <KvRow key={c.id} label={c.label}>{c.message ?? 'Missing'}</KvRow>)}
      </section>

      <section className="cpm-surface" aria-label="Loop model">
        <PanelHead title="Loop model" />
        <KvRow label="Model">
          {modelLabel(loop)}{' '}
          {m && (
            <Toggletip variant="how-to" label="How the model was set">
              <p>{m.classificationSource === 'EXPLICIT' ? 'Declared by a person in the registry.' : 'Set from the loop type; declare it in the registry to make it explicit.'}</p>
            </Toggletip>
          )}
        </KvRow>
        {m && <KvRow label="Objective / topology / command">{m.objectiveType} · {m.topology} · {m.commandPath}</KvRow>}
        <div className="cpm-loop-model__links">
          <ReasonedButton
            variant="normal"
            disabled={!canManage || republish.isPending}
            reason={canManage ? null : NEEDS_MANAGE}
            onClick={() => republish.mutate(loop.loopId, {
              // CHG-098 (SME review 2 #27): what was republished, by whom and when, or why it failed, stays on screen
              onSuccess: r => setReceipt(receiptDone(`Republished ${loop.loopId} ${byNow(user)}: ${r.links} link(s) live on the broadcast${
                typeof r.signalAssets === 'number' ? `, ${r.signalAssets} signal asset(s) projected into the UNS` : ''}.`, loop.loopId)),
              onError: err => setReceipt(receiptFailed(`Republishing ${loop.loopId}`, err, loop.loopId)),
            })}
          >
            {republish.isPending ? 'Republishing…' : 'Re-project links & republish evidence'}
          </ReasonedButton>
        </div>
      </section>

      {editing && <AddLoopWizard existing={loops} editLoop={loop} onClose={() => setEditing(false)} />}
      {dialog && <RetireLoopDialog loop={loop} mode={dialog} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
};

export default LoopDetail;
