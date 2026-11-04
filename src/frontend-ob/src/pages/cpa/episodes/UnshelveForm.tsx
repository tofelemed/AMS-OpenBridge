/**
 * Unshelve confirmation (CHG-032). Ends an active or expired shelf. The episode keeps the
 * acknowledgement it has, so the form says which queue it lands in.
 */
import React, { useState } from 'react';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { isAcknowledged, shelfCountdown, shelfState } from '../../../components/Cpm/events/shelfState';
import { Button } from '../../../ui/Button';
import { TextInput } from '../../../ui/forms/TextInput';
import { ActionPanel, refusal } from './ActionPanel';

export const UnshelveForm: React.FC<{
  event: CpmEventFrame;
  pending: boolean;
  error: unknown;
  onUnshelve: (reason: string | undefined) => void;
  onClose: () => void;
}> = ({ event, pending, error, onUnshelve, onClose }) => {
  const now = Date.now();
  const [reason, setReason] = useState('');
  const lands = isAcknowledged(event) ? 'stays acknowledged' : 'returns to the Unacknowledged queue';

  return (
    <ActionPanel label="Unshelve this episode">
      <p className="episode__text">
        {shelfState(event, now) === 'ACTIVE'
          ? `The shelf (${shelfCountdown(event.shelve_until, now)}) ends now and the episode ${lands}.`
          : `The shelf already expired. Unshelving clears the returned-from-shelf flag and the episode ${lands}.`}
      </p>
      <TextInput label="Reason (optional)" placeholder="Disturbance cleared" value={reason} onChange={setReason} />
      <div className="episode__form-actions">
        <Button variant="accent" disabled={pending} onClick={() => onUnshelve(reason.trim() || undefined)}>
          {pending ? 'Unshelving…' : 'Unshelve'}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
      </div>
      {error != null && <p className="ui-field__error" role="alert">{refusal(error, 'The unshelve failed.')}</p>}
    </ActionPanel>
  );
};
