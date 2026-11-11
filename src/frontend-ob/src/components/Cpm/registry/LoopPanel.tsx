'use client';

/**
 * Loop Registry › the selected loop (`?loop=X`). Task 24 made it a page of its own under the list's header; CHG-168 (owner review,
 * the approved sample docs/theme/redesign/samples/loop-registry-proposal.html and the answers of 11 Nov) puts it in the panel
 * beside the list, a drawer below 1280 px (the shared Inspector, as on Calculations and Loop Events). The heading is the tag,
 * the service under it and the state badge in the list's word (✓ Active, ! Degraded, ○ Not monitored, ⊘ Retired); rows: plant
 * path, type, criticality, gate profile, model (a retired loop's open episode marked, UI-131); Readiness; Signals; the actions;
 * Record details (a dialog) · Workbench ↗ · Effective rules ↗ · Plant tree ↗; the foot's Loop Explorer →.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Inspector } from '../../../ui/Inspector';
import { useAuthStore } from '../../../store/authStore';
import { useCpmEvents, useCpmLoops, useCpmReadiness } from '../../../hooks/useCpm';
import type { LoopRetireResult } from '../../../api/cpm/loopRetire';
import { EmptyState, KvRow, QueryError, TonePill, fmtDateTime } from '../shared';
import { adminHref, configHref, evidenceHref, explorerHref } from '../cpaHref';
import { usePlantTreeAccess } from '../access';
import { byNow, receiptDone, useReceiptUser, type Receipt } from '../ActionReceipt';
import AddLoopWizard from '../AddLoopWizard';
import { serviceName } from '../loopName';
import { stateOf } from '../registryShared';
import { RetireLoopDialog } from './RetireLoopDialog';
import { SignalMapping } from './SignalMapping';
import { LoopReadiness } from './LoopReadiness';
import { LoopActions } from './LoopActions';
import { LoopRecordDialog } from './LoopRecordDialog';
import { panelRows, recordRows } from './loopPanelFacts';

export const LoopPanel: React.FC<{ loopId: string; open: boolean; onClose: () => void }> = ({ loopId, open, onClose }) => {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useCpmLoops();
  const loops = data?.loops ?? [];
  const stored = loops.find(l => l.loopId.toLowerCase() === loopId.toLowerCase());
  // After Retire or Restore the panel follows the answer at once, until the list refetch agrees with it.
  const [asked, setAsked] = useState<boolean | null>(null);
  useEffect(() => { if (asked !== null && stored?.isActive === asked) setAsked(null); }, [asked, stored?.isActive]);
  const loop = stored && asked !== null ? { ...stored, isActive: asked } : stored;
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));
  const canReadConfig = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const canSeeTree = usePlantTreeAccess();
  const readiness = useCpmReadiness(loop?.loopId);
  const retired = !!loop && !loop.isActive;
  // A retired loop's open episode is read once: nothing new opens on it, so there is no interval (0 = no polling).
  const episodes = useCpmEvents({ loopId: loop?.loopId, openOnly: true, includeShelved: true, limit: 1, sort: 'recent' }, 0, retired);
  const user = useReceiptUser();
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'retire' | 'restore' | null>(null);
  const [record, setRecord] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  if (!loop) {
    return (
      <Inspector title={isLoading || isError ? loopId : `No loop ${loopId}`} open={open} onClose={onClose}>
        {isLoading && <EmptyState title="Loading loop…" />}
        {isError && <QueryError title="Registry unavailable" error={error} retry={() => void refetch()} />}
        {!isLoading && !isError && <p className="cpm-copy">It was renamed, removed or never onboarded.</p>}
      </Inspector>
    );
  }

  const st = stateOf(loop);
  const openEpisode = episodes.data?.events?.[0];
  const done = (r: LoopRetireResult) => {
    setDialog(null);
    if (r.changed) setAsked(!r.retired);
    setReceipt(receiptDone(r.changed
      ? `${r.retired ? 'Retired' : 'Restored'} ${r.loopId} ${byNow(user)}.`
      : (r.note ?? `${r.loopId} was already ${r.retired ? 'retired' : 'active'}; nothing changed.`), loop.loopId));
  };

  return (
    <>
      <Inspector title={loop.loopId} open={open} onClose={onClose}
        meta={<TonePill tone={st.tone} glyph={st.glyph}>{st.label}</TonePill>}
        primaryAction={
          <div className="cpm-reg-foot">
            <ObcButton variant="raised" onClick={() => navigate(explorerHref(loop.loopId))}>Loop Explorer {'→'}</ObcButton>
          </div>
        }>
        <p className="cpm-reg-panel__service">{serviceName(loop) || loop.displayName}</p>
        {panelRows(loop).map(([label, value]) => <KvRow key={label} label={label}>{value}</KvRow>)}
        {retired && openEpisode && (
          <KvRow label="Open episode">
            {`${openEpisode.family} since ${fmtDateTime(openEpisode.opened_at)} `}<TonePill tone="muted">Loop retired</TonePill>
          </KvRow>
        )}
        {retired && episodes.isError && (
          <KvRow label="Open episode">
            The open episode could not be read{' '}
            <ObcButton variant="flat" onClick={() => void episodes.refetch?.()}>Retry</ObcButton>
          </KvRow>
        )}
        <LoopReadiness loop={loop} readiness={readiness} />
        <SignalMapping loop={loop} readiness={readiness.data} />
        <LoopActions loop={loop} canManage={canManage} receipt={receipt?.key === loop.loopId ? receipt : null} onReceipt={setReceipt}
          onEdit={() => setEditing(true)} onRetire={setDialog} />
        <div className="cpm-events-links">
          <ObcButton variant="flat" onClick={() => setRecord(true)}>Record details</ObcButton>
          <ObcButton variant="flat" onClick={() => navigate(evidenceHref(loop.loopId))}>Workbench {'↗'}</ObcButton>
          {canReadConfig && <ObcButton variant="flat" onClick={() => navigate(configHref({ loop: loop.loopId }))}>Effective rules {'↗'}</ObcButton>}
          {canSeeTree && (
            <ObcButton variant="flat" onClick={() => navigate(`${adminHref('plant-model')}?search=${encodeURIComponent(loop.loopId.toLowerCase())}`)}>
              Plant tree {'↗'}
            </ObcButton>
          )}
        </div>
      </Inspector>
      <LoopRecordDialog open={record} onClose={() => setRecord(false)} rows={recordRows(loop)} />
      {editing && <AddLoopWizard existing={loops} editLoop={loop} onClose={() => setEditing(false)} />}
      {dialog && <RetireLoopDialog loop={loop} mode={dialog} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
};

export default LoopPanel;
