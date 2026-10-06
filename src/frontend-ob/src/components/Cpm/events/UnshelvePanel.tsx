'use client';

/**
 * Unshelve confirmation (CHG-032), loaded lazily from the event detail.
 * `POST /events/{id}/unshelve` ends an active or expired shelf; the episode
 * keeps the acknowledgement it has, so the panel says which queue it lands in.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { isAcknowledged, shelfCountdown, shelfState } from './shelfState';
import { ReasonedButton } from '../ReasonedButton';

export interface UnshelvePanelProps {
  event: CpmEventFrame;
  canManage: boolean;
  pending: boolean;
  error: unknown;
  onUnshelve: (reason: string | undefined) => void;
  onClose: () => void;
}

export const UnshelvePanel: React.FC<UnshelvePanelProps> = ({ event, canManage, pending, error, onUnshelve, onClose }) => {
  const now = Date.now();
  const shelf = shelfState(event, now);
  const [reason, setReason] = useState('');
  const lands = isAcknowledged(event) ? 'stays acknowledged' : 'returns to the Unacknowledged queue';

  return (
    <div className="cpm-shelve" role="group" aria-label="Unshelve this episode">
      <p className="cpm-copy">
        {shelf === 'ACTIVE'
          ? `The shelf (${shelfCountdown(event.shelve_until, now)}) ends now and the episode ${lands}.`
          : `The shelf already expired; unshelving clears the returned-from-shelf flag and the episode ${lands}.`}
      </p>
      <label className="cpm-field" style={{ marginTop: 8, minWidth: 0 }}>
        <span className="cpm-field__label">Reason (optional)</span>
        <input className="cpm-input" value={reason} onChange={e => setReason(e.target.value)}
          placeholder="valve overhauled · disturbance cleared · shelved by mistake" />
      </label>
      <div className="cpm-filter-row">
        <ReasonedButton variant="raised" disabled={!canManage || pending} reason={!canManage ? 'Needs the cpm.manage permission' : null}
          title={!canManage ? 'Needs the cpm.manage permission' : 'End the shelf now'}
          onClick={() => onUnshelve(reason.trim() || undefined)}>
          {pending ? 'Unshelving…' : 'Unshelve'}
        </ReasonedButton>
        <ObcButton variant="flat" disabled={pending} onClick={onClose}>Cancel</ObcButton>
      </div>
      {error != null && (
        <p className="cpm-field__error" role="alert">{error instanceof Error ? error.message : 'The unshelve failed.'}</p>
      )}
    </div>
  );
};

export default UnshelvePanel;
