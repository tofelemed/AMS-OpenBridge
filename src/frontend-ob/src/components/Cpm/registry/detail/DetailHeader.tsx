/**
 * CHG-201 (owner-approved mockup, 15 Nov 2026): the Loop detail page's head. "‹ All loops" back to the list it was opened from,
 * the eyebrow "Set up · Loop Registry", the tag as the title, the description under it (without the tag), the state pill
 * (Monitoring on / Monitoring off / Retired) and the readiness pill. The actions keep today's permissions (CHG-168 LoopActions):
 * Resend to analysis (the old "Re-project links & republish evidence", renamed, with its ?), Retire loop / Restore loop, and Edit
 * loop, the one primary, waiting for a restore on a retired loop. The receipt of the last action sits under them (CHG-098).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { CpmLoop } from '../../../../api/cpmApi';
import { Toggletip } from '../../../../ui/Toggletip';
import { useRepublishEvidence } from '../../../../hooks/useCpm';
import { ActionReceipt, byNow, receiptDone, receiptFailed, useReceiptUser, type Receipt } from '../../ActionReceipt';
import ReasonedButton from '../../ReasonedButton';
import { describeLoop } from '../loopFacts';
import { readinessPill } from '../readinessRules';
import { WordPill, type PillWord } from '../WordPill';

const NEEDS_MANAGE = 'Needs the cpm.manage permission';
const RESTORE_FIRST = 'Restore the loop first';

const statePill = (loop: CpmLoop): PillWord => {
  if (!loop.isActive) return { label: 'Retired', tone: 'muted', glyph: '⊘' };
  return loop.monitoringEnabled ? { label: 'Monitoring on', tone: 'plain' } : { label: 'Monitoring off', tone: 'muted', glyph: '○' };
};

/** "‹ All loops", to the list at the address the page was opened from. */
export const BackToList: React.FC<{ href: string }> = ({ href }) => (
  <Link className="cpm-reg-back" to={href}><span aria-hidden>{'‹ '}</span>All loops</Link>
);

export const DetailHeader: React.FC<{
  loop: CpmLoop;
  listHref: string;
  missing: number;
  canManage: boolean;
  receipt: Receipt | null;
  onReceipt: (r: Receipt) => void;
  onEdit: () => void;
  onRetire: (mode: 'retire' | 'restore') => void;
}> = ({ loop, listHref, missing, canManage, receipt, onReceipt, onEdit, onRetire }) => {
  const republish = useRepublishEvidence();
  const user = useReceiptUser();
  const retired = !loop.isActive;
  const text = describeLoop(loop);
  const resend = () => republish.mutate(loop.loopId, {
    onSuccess: () => onReceipt(receiptDone(`Sent ${loop.loopId} to the analysis again ${byNow(user)}.`, loop.loopId)),
    onError: err => onReceipt(receiptFailed(`Sending ${loop.loopId} to the analysis`, err, loop.loopId)),
  });
  return (
    <div className="cpm-reg-detail-head">
      <BackToList href={listHref} />
      <header className="cpm-workspace-header">
        <div className="cpm-reg-detail-head__id">
          <span className="cpm-eyebrow">Set up · Loop Registry</span>
          <h1 className="cpm-title">{loop.loopId}</h1>
          {text && <p className="cpm-reg-detail-head__lead">{text}</p>}
          <div className="cpm-reg-detail-head__pills">
            <WordPill word={statePill(loop)} />
            {!retired && <WordPill word={readinessPill(missing)} />}
          </div>
        </div>
        <div className="cpm-workspace-header__actions cpm-reg-detail-head__actions">
          <span className="cpm-reg-resend">
            <ReasonedButton variant="normal" disabled={!canManage || republish.isPending} reason={canManage ? null : NEEDS_MANAGE} onClick={resend}>
              {republish.isPending ? 'Sending…' : 'Resend to analysis'}
            </ReasonedButton>
            <Toggletip variant="how-to" label="About resending"><p>Sends this loop’s settings to the analysis again, after a change.</p></Toggletip>
          </span>
          <ReasonedButton variant="normal" disabled={!canManage} reason={NEEDS_MANAGE} onClick={() => onRetire(retired ? 'restore' : 'retire')}>
            {retired ? 'Restore loop' : 'Retire loop'}
          </ReasonedButton>
          <ReasonedButton variant="raised" disabled={!canManage || retired} reason={canManage ? RESTORE_FIRST : NEEDS_MANAGE} onClick={onEdit}>
            Edit loop
          </ReasonedButton>
        </div>
      </header>
      <ActionReceipt receipt={receipt?.key === loop.loopId ? receipt : null} />
    </div>
  );
};

export default DetailHeader;
