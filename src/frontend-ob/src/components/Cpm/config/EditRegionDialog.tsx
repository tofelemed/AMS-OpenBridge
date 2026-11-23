/**
 * The operating region of one loop (Gate Configuration journey, task 9; approved look data-screen="region"): the region drawn
 * inside the loop's PV range, Minimum / Maximum, "Now ... · PV range ...", a Reason, Cancel / Save. Same rules as the many-loop
 * dialog: a value past the PV range is named, a value that does not parse blocks Save, a refused row keeps the dialog open.
 */
import React, { useId, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { Toggletip } from '../../../ui/Toggletip';
import type { LoopRegion } from '../../../api/cpm/configRegions';
import { useRegionActions, useRegions } from './useConfigRegions';
import { QueryError } from '../shared';
import { changedRows, draftOf, numberText, outsideRange, parseDraft, rangeText, type RegionDraft } from './regionEdit';
import { errorText } from './lifecycle';

export interface EditRegionDialogProps {
  open: boolean;
  site: string;
  loop: LoopRegion;
  onClose: () => void;
  onSaved: (batchId: string) => void;
}

const HELP = 'The PV range where this loop is normally run. Windows spent mostly outside it are not judged.';

/** The region inside the PV range, drawn with tokens; nothing while either is missing or the draft does not parse. */
const RegionBar: React.FC<{ lo: number; hi: number; min: number; max: number }> = ({ lo, hi, min, max }) => {
  const at = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const a = at(min), b = at(max);
  return (
    <div className="cpm-region-bar" aria-hidden="true">
      <div className="cpm-region-bar__track"><span className="cpm-region-bar__region" style={{ left: `${a}%`, width: `${Math.max(0, b - a)}%` }} /></div>
      <span className="cpm-region-bar__tick cpm-region-bar__tick--start" style={{ left: 0 }}>{numberText(lo)}</span>
      <span className="cpm-region-bar__tick" style={{ left: `${a}%` }}>{numberText(min)}</span>
      <span className="cpm-region-bar__tick" style={{ left: `${b}%` }}>{numberText(max)}</span>
      <span className="cpm-region-bar__tick cpm-region-bar__tick--end" style={{ left: '100%' }}>{numberText(hi)}</span>
    </div>
  );
};

const Body: React.FC<Omit<EditRegionDialogProps, 'open'>> = ({ site, loop, onClose, onSaved }) => {
  const { save } = useRegionActions(site);
  const idBase = useId();
  const [draft, setDraft] = useState<RegionDraft>(() => draftOf(loop));
  const [reason, setReason] = useState('');
  const [refused, setRefused] = useState<string | null>(null);
  const p = parseDraft(draft);
  const { changes } = changedRows([loop], { [loop.loopId]: draft });
  const outside = outsideRange(loop, p.pvMin, p.pvMax);
  const set = (key: keyof RegionDraft, value: string) => { setDraft(d => ({ ...d, [key]: value })); setRefused(null); };
  const send = () => save.mutate({ regions: changes, note: reason.trim() }, {
    onSuccess: r => {
      const row = r.rows.find(x => x.error);
      if (r.drafts !== 0) onSaved(r.batchId); else setRefused(row?.error ?? 'Nothing was saved');
    },
  });
  const ready = changes.length > 0 && !p.error && reason.trim() !== '' && !save.isPending;
  const barOk = loop.pvRangeMin != null && loop.pvRangeMax != null && p.pvMin != null && p.pvMax != null && !p.error;
  const row = p.error ?? refused ?? outside;
  const failing = !!row;
  const problem = (k: 'min' | 'max') => (k === 'max' ? row : null);

  return (
    <Dialog open title={`Operating region · ${loop.loopId}`} onClose={onClose}
      footer={<>
        <ObcButton variant="flat" onClick={onClose}>Cancel</ObcButton>
        <ObcButton variant="raised" disabled={!ready} onClick={send}>{save.isPending ? 'Saving…' : 'Save'}</ObcButton>
      </>}>
      <div className="cpm-title-row">
        <span className="cpm-howto__title">Region inside the PV range</span>
        <Toggletip variant="how-to" label="Operating region"><p>{HELP}</p></Toggletip>
      </div>
      {barOk && <RegionBar lo={loop.pvRangeMin!} hi={loop.pvRangeMax!} min={p.pvMin!} max={p.pvMax!} />}
      <div className="cpm-region-pair">
        {(['min', 'max'] as const).map(k => (
          <div key={k} className="cpm-field">
            <label className="cpm-howto__title" htmlFor={`${idBase}-${k}`}>{k === 'min' ? 'Minimum' : 'Maximum'}</label>
            <input id={`${idBase}-${k}`} className="cpm-input" inputMode="decimal" value={draft[k]} aria-invalid={failing ? 'true' : undefined} aria-describedby={failing ? `${idBase}-err` : undefined}
              onChange={e => set(k, e.target.value)} />
            {problem(k) && <span id={`${idBase}-err`} className="cpm-field__error" role="alert">{problem(k)}</span>}
          </div>
        ))}
      </div>
      <p className="cpm-copy">Now {rangeText(loop.regionMin, loop.regionMax) || '—'} · PV range {rangeText(loop.pvRangeMin, loop.pvRangeMax) || '—'}</p>
      <label className="cpm-field">
        <span className="cpm-howto__title">Reason</span>
        <textarea className="cpm-textarea" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
      </label>
      {save.isError && <p className="cpm-field__error" role="alert">{errorText(save.error)}</p>}
    </Dialog>
  );
};

export const EditRegionDialog: React.FC<EditRegionDialogProps> = ({ open, ...rest }) => (open ? <Body {...rest} /> : null);

export default EditRegionDialog;

/** The dialog of a loop page: waits for the regions read, shows its error with Retry, or says the loop has no region data. */
export const EditRegionHost: React.FC<{ site: string; loopId: string; onClose: () => void; onSaved: (batchId: string) => void }> = ({ site, loopId, onClose, onSaved }) => {
  const q = useRegions(site);
  const loop = q.data?.loops.find(l => l.loopId === loopId);
  if (loop) return <EditRegionDialog open site={site} loop={loop} onClose={onClose} onSaved={onSaved} />;
  return (
    <Dialog open title={`Operating region · ${loopId}`} onClose={onClose} footer={<ObcButton variant="flat" onClick={onClose}>Cancel</ObcButton>}>
      {q.isError ? <QueryError error={q.error} retry={() => void q.refetch()} />
        : q.isLoading ? <p className="cpm-copy" role="status">Loading…</p>
        : <p className="cpm-copy">This loop has no region data.</p>}
    </Dialog>
  );
};
