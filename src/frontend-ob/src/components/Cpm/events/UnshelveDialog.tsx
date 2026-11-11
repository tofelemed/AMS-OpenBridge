'use client';

/**
 * Unshelve confirmation (CHG-032). `POST /events/{id}/unshelve` ends an active or expired shelf; the episode keeps the
 * acknowledgement it has, so the dialog says which queue it lands in. CHG-167 (owner review, answer 1): a dialog opened from
 * Unshelve… (it was a panel under the buttons), Reason in an aligned column, Cancel · Unshelve. Both sentences stay word for
 * word, the one for an expired shelf included (owner answer 5).
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { ReasonedButton } from '../ReasonedButton';
import { isAcknowledged, shelfCountdown, shelfState } from './shelfState';

export interface UnshelveDialogProps {
  event: CpmEventFrame;
  canManage: boolean;
  pending: boolean;
  error: unknown;
  onUnshelve: (reason: string | undefined) => void;
  onClose: () => void;
}

const NEEDS = 'Needs the cpm.manage permission';

const Body: React.FC<UnshelveDialogProps> = ({ event, canManage, pending, error, onUnshelve, onClose }) => {
  const now = Date.now();
  const shelf = shelfState(event, now);
  const [reason, setReason] = useState('');
  const lands = isAcknowledged(event) ? 'stays acknowledged' : 'returns to the Unacknowledged queue';

  return (
    <Dialog open onClose={onClose} title="Unshelve" size="wide"
      footer={<>
        <ObcButton variant="flat" disabled={pending} onClick={onClose}>Cancel</ObcButton>
        <ReasonedButton variant="raised" disabled={!canManage || pending} reason={!canManage ? NEEDS : null}
          title={!canManage ? NEEDS : 'End the shelf now'} onClick={() => onUnshelve(reason.trim() || undefined)}>
          {pending ? 'Unshelving…' : 'Unshelve'}
        </ReasonedButton>
      </>}>
      <p className="cpm-copy">
        {shelf === 'ACTIVE'
          ? `The shelf (${shelfCountdown(event.shelve_until, now)}) ends now and the episode ${lands}.`
          : `The shelf already expired; unshelving clears the returned-from-shelf flag and the episode ${lands}.`}
      </p>
      <div className="cpm-events-form">
        <label className="cpm-events-form__row">
          <span className="cpm-events-form__label">Reason</span>
          <input className="cpm-input" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Optional: valve overhauled · disturbance cleared · shelved by mistake" />
        </label>
      </div>
      {error != null && (
        <p className="cpm-field__error" role="alert">{error instanceof Error ? error.message : 'The unshelve failed.'}</p>
      )}
    </Dialog>
  );
};

/** On the page body, so the panel's own box (or its drawer) never clips it. */
export const UnshelveDialog: React.FC<UnshelveDialogProps & { open: boolean }> = ({ open, ...props }) =>
  (open ? createPortal(<Body {...props} />, document.body) : null);

export default UnshelveDialog;
