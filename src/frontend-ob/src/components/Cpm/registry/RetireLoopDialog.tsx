'use client';

/**
 * Retire or restore a loop (CHG-146). Retire keeps the loop's history and can be undone by Restore; it needs a
 * reason (at most 500 characters, as the server refuses more). A failed call stays in the dialog with the typed
 * reason, so nothing has to be written again.
 */
import React, { useId, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import type { CpmLoop } from '../../../api/cpmApi';
import type { LoopRetireResult } from '../../../api/cpm/loopRetire';
import { useRestoreLoop, useRetireLoop } from '../../../hooks/useLoopRetire';
import { reasonOf } from '../ActionReceipt';

export const REASON_LIMIT = 500;

export const RetireLoopDialog: React.FC<{
  loop: CpmLoop;
  mode: 'retire' | 'restore';
  onClose: () => void;
  onDone: (result: LoopRetireResult) => void;
}> = ({ loop, mode, onClose, onDone }) => {
  const id = useId();
  const retire = useRetireLoop();
  const restore = useRestoreLoop();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isRetire = mode === 'retire';
  const pending = retire.isPending || restore.isPending;
  const trimmed = reason.trim();
  const callbacks = { onSuccess: onDone, onError: (e: unknown) => setError(reasonOf(e)) };

  const confirm = () => {
    setError(null);
    if (isRetire) retire.mutate({ loopId: loop.loopId, reason: trimmed }, callbacks);
    else restore.mutate({ loopId: loop.loopId, reason: trimmed || undefined }, callbacks);
  };

  return (
    <Dialog
      open
      onClose={() => { if (!pending) onClose(); }}
      title={`${isRetire ? 'Retire' : 'Restore'} ${loop.loopId}`}
      description={isRetire
        ? 'The loop stops being monitored. Its history stays, and Restore brings it back.'
        : 'The loop is monitored again as it was before it was retired.'}
      footer={(
        <>
          <ObcButton variant="flat" disabled={pending} onClick={onClose}>Cancel</ObcButton>
          <ObcButton variant="raised" disabled={pending || (isRetire && trimmed === '')} onClick={confirm}>
            {isRetire ? 'Retire loop' : 'Restore loop'}
          </ObcButton>
        </>
      )}
    >
      <div className="cpm-field">
        <label className="cpm-field__label" htmlFor={id}>Reason ({isRetire ? 'required' : 'optional'})</label>
        <textarea id={id} className="cpm-textarea" rows={3} maxLength={REASON_LIMIT} value={reason}
          onChange={e => setReason(e.target.value)} />
        <span className="cpm-copy">{reason.length} / {REASON_LIMIT}</span>
        {error && <p className="cpm-field__error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
};

export default RetireLoopDialog;
