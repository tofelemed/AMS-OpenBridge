/**
 * CHG-168 (owner review, the approved sample, badge 9): What do I do about it? One actions row: Edit configuration, Retire /
 * Restore, Re-project links & republish evidence (the long label stays word for word: the server's peer-links advice names it),
 * each disabled one saying why; the receipt of the last action under them (CHG-098: what, by whom and when, or why it failed).
 */
import React from 'react';
import type { CpmLoop } from '../../../api/cpmApi';
import { useRepublishEvidence } from '../../../hooks/useCpm';
import { ActionReceipt, byNow, receiptDone, receiptFailed, useReceiptUser, type Receipt } from '../ActionReceipt';
import ReasonedButton from '../ReasonedButton';

const NEEDS_MANAGE = 'Needs the cpm.manage permission';
const RESTORE_FIRST = 'Restore the loop first';

export const LoopActions: React.FC<{
  loop: CpmLoop;
  canManage: boolean;
  receipt: Receipt | null;
  onReceipt: (r: Receipt) => void;
  onEdit: () => void;
  onRetire: (mode: 'retire' | 'restore') => void;
}> = ({ loop, canManage, receipt, onReceipt, onEdit, onRetire }) => {
  const republish = useRepublishEvidence();
  const user = useReceiptUser();
  const retired = !loop.isActive;
  return (
    <div className="cpm-events-panel__sect">
      <div className="cpm-inspector__actions cpm-reg-actions">
        <ReasonedButton variant="raised" disabled={!canManage || retired} reason={canManage ? RESTORE_FIRST : NEEDS_MANAGE} onClick={onEdit}>
          Edit configuration
        </ReasonedButton>
        <ReasonedButton variant="normal" disabled={!canManage} reason={NEEDS_MANAGE} onClick={() => onRetire(retired ? 'restore' : 'retire')}>
          {retired ? 'Restore' : 'Retire'}
        </ReasonedButton>
        <ReasonedButton
          variant="normal"
          disabled={!canManage || republish.isPending}
          reason={canManage ? null : NEEDS_MANAGE}
          onClick={() => republish.mutate(loop.loopId, {
            // CHG-098 (SME review 2 #27): what was republished, by whom and when, or why it failed, stays on screen
            onSuccess: r => onReceipt(receiptDone(`Republished ${loop.loopId} ${byNow(user)}: ${r.links} link(s) live on the broadcast${
              typeof r.signalAssets === 'number' ? `, ${r.signalAssets} signal asset(s) projected into the UNS` : ''}.`, loop.loopId)),
            onError: err => onReceipt(receiptFailed(`Republishing ${loop.loopId}`, err, loop.loopId)),
          })}
        >
          {republish.isPending ? 'Republishing…' : 'Re-project links & republish evidence'}
        </ReasonedButton>
      </div>
      <ActionReceipt receipt={receipt} />
    </div>
  );
};

export default LoopActions;
