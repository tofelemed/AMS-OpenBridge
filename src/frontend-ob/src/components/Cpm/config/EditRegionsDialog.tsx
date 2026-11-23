/**
 * Operating regions for many loops (Gate Configuration journey, task 9; approved look data-screen="regions"): one row per
 * selected loop - Loop, PV range, Now, Minimum, Maximum - a Reason, Cancel / Save. Save sends the changed rows as one batch.
 * A value past the PV range is named under its input; a value that does not parse blocks Save; a row the server refuses keeps
 * its reason under the row and the dialog open.
 */
import React, { useId, useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import type { LoopRegion } from '../../../api/cpm/configRegions';
import { useRegionActions } from './useConfigRegions';
import { changedRows, draftOf, outsideRange, parseDraft, rangeText, type RegionDraft } from './regionEdit';
import { errorText } from './lifecycle';

export interface EditRegionsDialogProps {
  open: boolean;
  site: string;
  loops: LoopRegion[];
  onClose: () => void;
  /** The batch was made; `notSaved` names the loops the server left out of it. */
  onSaved: (batchId: string, notSaved?: Record<string, string>) => void;
}

const Body: React.FC<Omit<EditRegionsDialogProps, 'open'>> = ({ site, loops, onClose, onSaved }) => {
  const { save } = useRegionActions(site);
  const idBase = useId();
  const [drafts, setDrafts] = useState<Record<string, RegionDraft>>(() => Object.fromEntries(loops.map(l => [l.loopId, draftOf(l)])));
  const [reason, setReason] = useState('');
  const [refused, setRefused] = useState<Record<string, string>>({});
  const { changes, errors } = useMemo(() => changedRows(loops, drafts), [loops, drafts]);
  const set = (id: string, key: keyof RegionDraft, value: string) => {
    setDrafts(d => ({ ...d, [id]: { ...d[id], [key]: value } }));
    setRefused(r => { const { [id]: _gone, ...rest } = r; return rest; });
  };
  const send = () => save.mutate({ regions: changes, note: reason.trim() }, {
    onSuccess: r => {
      const notSaved = Object.fromEntries(r.rows.filter(x => x.error).map(x => [x.loopId, x.error!]));
      if (r.drafts !== 0) onSaved(r.batchId, notSaved); else setRefused(notSaved);
    },
  });
  const ready = changes.length > 0 && Object.keys(errors).length === 0 && reason.trim() !== '' && !save.isPending;

  return (
    <Dialog open size="wide" title={`Operating regions · ${loops.length} ${loops.length === 1 ? 'loop' : 'loops'}`} onClose={onClose}
      footer={<>
        <ObcButton variant="flat" onClick={onClose}>Cancel</ObcButton>
        <ObcButton variant="raised" disabled={!ready} onClick={send}>{save.isPending ? 'Saving…' : 'Save'}</ObcButton>
      </>}>
      <table className="cpm-table cpm-config-rows cpm-region-rows cpm-region-rows--edit">
        <thead><tr><th>Loop</th><th>PV range</th><th>Now</th><th>Minimum</th><th>Maximum</th></tr></thead>
        <tbody>
          {loops.map(l => {
            const d = drafts[l.loopId];
            const p = parseDraft(d);
            const problem = errors[l.loopId] ?? refused[l.loopId] ?? outsideRange(l, p.pvMin, p.pvMax);
            return (
              <tr key={l.loopId}>
                <td><strong>{l.loopId}</strong></td>
                <td className="cpm-num">{rangeText(l.pvRangeMin, l.pvRangeMax) || '—'}</td>
                <td className="cpm-num">{rangeText(l.regionMin, l.regionMax) || '—'}</td>
                {(['min', 'max'] as const).map(k => (
                  <td key={k}>
                    <input className="cpm-input cpm-region-cell" inputMode="decimal" aria-label={`${l.loopId} ${k === 'min' ? 'Minimum' : 'Maximum'}`}
                      aria-invalid={problem ? 'true' : undefined} aria-describedby={problem ? `${idBase}-${l.loopId}` : undefined} value={d[k]} onChange={e => set(l.loopId, k, e.target.value)} />
                    {k === 'max' && problem && <div id={`${idBase}-${l.loopId}`} className="cpm-field__error" role="alert">{problem}</div>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <label className="cpm-field">
        <span className="cpm-howto__title">Reason</span>
        <textarea className="cpm-textarea" rows={2} value={reason} onChange={e => setReason(e.target.value)} />
      </label>
      {save.isError && <p className="cpm-field__error" role="alert">{errorText(save.error)}</p>}
    </Dialog>
  );
};

export const EditRegionsDialog: React.FC<EditRegionsDialogProps> = ({ open, ...rest }) => (open ? <Body {...rest} /> : null);

export default EditRegionsDialog;
