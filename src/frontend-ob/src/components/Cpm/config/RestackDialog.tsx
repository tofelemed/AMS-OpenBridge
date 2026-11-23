/** "Update <n> loops": the reason is required; Update prepares their new versions in one batch. */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';

export const RestackDialog: React.FC<{
  count: number; pending: boolean; error: string | null; onCancel: () => void; onUpdate: (reason: string) => void;
}> = ({ count, pending, error, onCancel, onUpdate }) => {
  const [reason, setReason] = useState('');
  return (
    <Dialog open title={`Update ${count} ${count === 1 ? 'loop' : 'loops'}`} onClose={onCancel}
      footer={<>
        <ObcButton variant="flat" onClick={onCancel}>Cancel</ObcButton>
        <ObcButton variant="raised" disabled={!reason.trim() || pending} onClick={() => onUpdate(reason.trim())}>{pending ? 'Updating…' : 'Update'}</ObcButton>
      </>}>
      <label className="cpm-field">
        <span className="cpm-howto__title">Reason</span>
        <textarea className="cpm-textarea" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
      </label>
      {error && <p className="cpm-field__error" role="alert">{error}</p>}
    </Dialog>
  );
};

export default RestackDialog;
