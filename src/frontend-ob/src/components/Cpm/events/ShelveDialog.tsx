'use client';

/**
 * Shelve management for one episode (CHG-032). `POST /events/{id}/shelve` needs a future expiry inside the site limit and a
 * reason; on an active shelf the call is an update (the history says so). The expiry is stated before it is sent and every
 * refusal is explained in place. CHG-167 (owner review, answer 1): a dialog opened from Shelve… / Update shelf… (it was a
 * panel under the buttons): titled parts For and Reason in aligned columns, the expiry line, Cancel · Shelve. Its sentence
 * stays word for word.
 */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { fromSiteInput, toSiteInput } from '../../../cpa/siteTime';
import { ReasonedButton } from '../ReasonedButton';
import { presetsWithin, shelfCountdown, shelfState } from './shelfState';
import { stamp, zoneTag } from './eventTime';

export interface ShelveDialogProps {
  event: CpmEventFrame;
  canManage: boolean;
  pending: boolean;
  error: unknown;
  /** Site limit, hours (events read `shelvePolicy.maxHours`; 168 when the API predates it). */
  maxHours: number;
  onShelve: (untilIso: string, reason: string) => void;
  onClose: () => void;
}

const MIN_REASON = 3;
const NEEDS = 'Needs the cpm.manage permission';
const when = (ms: number) => `${stamp(ms)} ${zoneTag(ms)}`;

const Body: React.FC<ShelveDialogProps> = ({ event, canManage, pending, error, maxHours, onShelve, onClose }) => {
  const now = Date.now();
  const active = shelfState(event, now) === 'ACTIVE';
  const presets = presetsWithin(maxHours);
  const [choice, setChoice] = useState<string>(() => String(presets.find(p => p.hours === 8)?.hours ?? presets[0]?.hours ?? 'custom'));
  const [custom, setCustom] = useState(() => toSiteInput(now + Math.min(24, maxHours) * 3_600_000));
  const [reason, setReason] = useState(active ? (event.shelve_reason ?? '') : '');

  const until = useMemo(() => {
    if (choice === 'custom') {
      const t = fromSiteInput(custom);
      return Number.isFinite(t) ? t : NaN;
    }
    return now + Number(choice) * 3_600_000;
  }, [choice, custom, now]);
  const limit = now + maxHours * 3_600_000;
  const invalid = !Number.isFinite(until) ? 'Enter a date and time.'
    : until <= now ? 'The expiry must be in the future.'
      : until > limit ? `The site limit is ${maxHours} h (until ${when(limit)}).`
        : reason.trim().length < MIN_REASON ? 'A reason is required.'
          : null;
  const title = active ? 'Update shelf' : 'Shelve';

  return (
    <Dialog open onClose={onClose} title={title} size="wide"
      footer={<>
        <ObcButton variant="flat" disabled={pending} onClick={onClose}>Cancel</ObcButton>
        <ReasonedButton variant="raised" disabled={!canManage || pending || !!invalid} reason={!canManage ? NEEDS : null}
          title={!canManage ? NEEDS : invalid ?? (active ? 'Replace the current expiry and reason' : 'Shelve until the stated expiry')}
          onClick={() => { if (!invalid) onShelve(new Date(until).toISOString(), reason.trim()); }}>
          {pending ? 'Saving…' : title}
        </ReasonedButton>
      </>}>
      <p className="cpm-copy">
        {active
          ? `This episode is shelved (${shelfCountdown(event.shelve_until, now)}). A new expiry and reason replace the current ones; the history keeps both.`
          : 'A shelf always expires; the episode returns to the queue afterwards with the acknowledgement it has. Shelving does not review it.'}
      </p>
      <div className="cpm-events-form">
        <span className="cpm-events-form__label">For</span>
        <div className="cpm-events-form__value">
          <SegmentedControl label="Shelve for" ignoreReselect value={choice} onChange={setChoice}
            options={[...presets.map(p => ({ value: String(p.hours), label: p.label })), { value: 'custom', label: 'Until…' }]} />
        </div>
        {choice === 'custom' && (
          <label className="cpm-events-form__row">
            <span className="cpm-events-form__label">Until</span>
            <input className="cpm-input" type="datetime-local" value={custom} onChange={e => setCustom(e.target.value)} />
          </label>
        )}
        <label className="cpm-events-form__row">
          <span className="cpm-events-form__label">Reason</span>
          <input className="cpm-input" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="maintenance planned · known disturbance · awaiting VP mapping" />
        </label>
      </div>
      <p className="cpm-copy" role="status">
        {invalid ?? `Shelved until ${when(until)} · ${shelfCountdown(new Date(until).toISOString(), now)}`}
      </p>
      {error != null && (
        <p className="cpm-field__error" role="alert">{error instanceof Error ? error.message : 'The shelve failed.'}</p>
      )}
    </Dialog>
  );
};

/** On the page body, so the panel's own box (or its drawer) never clips it. */
export const ShelveDialog: React.FC<ShelveDialogProps & { open: boolean }> = ({ open, ...props }) =>
  (open ? createPortal(<Body {...props} />, document.body) : null);

export default ShelveDialog;
