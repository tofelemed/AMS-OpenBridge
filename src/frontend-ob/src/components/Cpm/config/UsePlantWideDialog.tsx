/**
 * "Use plant-wide settings" (Gate Configuration journey, task 9; CHG-223): the loops give up their own settings and use the
 * plant-wide ones. The loops are listed, a Reason is required, and the answer is one batch. A loop the server refuses keeps
 * its reason under its name and the dialog open.
 */
import React, { useId, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { useRegionActions } from './useConfigRegions';
import { errorText } from './lifecycle';

export interface UsePlantWideDialogProps {
  open: boolean;
  site: string;
  loopIds: string[];
  onClose: () => void;
  /** The batch was made; `notSaved` names the loops the server left out of it. */
  onDone: (batchId: string, notSaved?: Record<string, string>) => void;
}

const Body: React.FC<Omit<UsePlantWideDialogProps, 'open'>> = ({ site, loopIds, onClose, onDone }) => {
  const { inherit } = useRegionActions(site);
  const idBase = useId();
  const [reason, setReason] = useState('');
  const [refused, setRefused] = useState<Record<string, string>>({});
  const send = () => inherit.mutate({ loopIds, note: reason.trim() }, {
    onSuccess: r => {
      const notSaved = Object.fromEntries(r.rows.filter(x => x.error).map(x => [x.loopId, x.error!]));
      if (r.drafts !== 0) onDone(r.batchId, notSaved); else setRefused(notSaved);
    },
  });
  return (
    <Dialog open title={`Use plant-wide settings · ${loopIds.length} ${loopIds.length === 1 ? 'loop' : 'loops'}`} onClose={onClose}
      footer={<>
        <ObcButton variant="flat" onClick={onClose}>Cancel</ObcButton>
        <ObcButton variant="raised" disabled={reason.trim() === '' || inherit.isPending} onClick={send}>Use plant-wide settings</ObcButton>
      </>}>
      <ul className="cpm-region-list">
        {loopIds.map(id => (
          <li key={id}><strong>{id}</strong>{refused[id] && <div id={`${idBase}-${id}`} className="cpm-field__error" role="alert">{refused[id]}</div>}</li>
        ))}
      </ul>
      <label className="cpm-field">
        <span className="cpm-howto__title">Reason</span>
        <textarea className="cpm-textarea" rows={3} aria-describedby={loopIds.filter(id => refused[id]).map(id => `${idBase}-${id}`).join(' ') || undefined} value={reason} onChange={e => setReason(e.target.value)} />
      </label>
      {inherit.isError && <p className="cpm-field__error" role="alert">{errorText(inherit.error)}</p>}
    </Dialog>
  );
};

export const UsePlantWideDialog: React.FC<UsePlantWideDialogProps> = ({ open, ...rest }) => (open ? <Body {...rest} /> : null);

export default UsePlantWideDialog;
