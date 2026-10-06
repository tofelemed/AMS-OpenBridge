'use client';

/**
 * Shelve management for one episode (CHG-032), loaded lazily from the event detail.
 * `POST /events/{id}/shelve` needs a future expiry inside the site limit and a
 * reason; on an active shelf the call is an update (the history says so). The
 * expiry is stated before it is sent and every refusal is explained in place.
 */
import React, { useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcToggleButtonGroup } from '@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group';
import { ObcToggleButtonOption } from '@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { fmtDateTime } from '../shared';
import { presetsWithin, shelfCountdown, shelfState } from './shelfState';
import { ReasonedButton } from '../ReasonedButton';

export interface ShelvePanelProps {
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

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const ShelvePanel: React.FC<ShelvePanelProps> = ({ event, canManage, pending, error, maxHours, onShelve, onClose }) => {
  const now = Date.now();
  const active = shelfState(event, now) === 'ACTIVE';
  const presets = presetsWithin(maxHours);
  const [choice, setChoice] = useState<string>(() => String(presets.find(p => p.hours === 8)?.hours ?? presets[0]?.hours ?? 'custom'));
  const [custom, setCustom] = useState(() => toLocalInput(now + Math.min(24, maxHours) * 3_600_000));
  const [reason, setReason] = useState(active ? (event.shelve_reason ?? '') : '');

  const until = useMemo(() => {
    if (choice === 'custom') {
      const t = Date.parse(custom);
      return Number.isFinite(t) ? t : NaN;
    }
    return now + Number(choice) * 3_600_000;
  }, [choice, custom, now]);
  const limit = now + maxHours * 3_600_000;
  const invalid = !Number.isFinite(until) ? 'Enter a date and time.'
    : until <= now ? 'The expiry must be in the future.'
      : until > limit ? `The site limit is ${maxHours} h (until ${fmtDateTime(limit)}).`
        : reason.trim().length < MIN_REASON ? 'A reason is required.'
          : null;

  return (
    <div className="cpm-shelve" role="group" aria-label="Shelve this episode">
      <p className="cpm-copy">
        {active
          ? `This episode is shelved (${shelfCountdown(event.shelve_until, now)}). A new expiry and reason replace the current ones; the history keeps both.`
          : 'A shelf always expires; the episode returns to the queue afterwards with the acknowledgement it has. Shelving does not review it.'}
      </p>
      <div className="cpm-filter-row">
        <ObcToggleButtonGroup value={choice} aria-label="Shelve for"
          onValue={(e: CustomEvent<{ value: string }>) => { if (e.detail.value) setChoice(e.detail.value); }}>
          {presets.map(p => <ObcToggleButtonOption key={p.hours} value={String(p.hours)}>{p.label}</ObcToggleButtonOption>)}
          <ObcToggleButtonOption value="custom">Until…</ObcToggleButtonOption>
        </ObcToggleButtonGroup>
        {choice === 'custom' && (
          <label className="cpm-field cpm-field--compact">
            <span className="cpm-field__label">Until</span>
            <input className="cpm-input" type="datetime-local" value={custom} onChange={e => setCustom(e.target.value)} />
          </label>
        )}
      </div>
      <label className="cpm-field" style={{ marginTop: 8, minWidth: 0 }}>
        <span className="cpm-field__label">Reason (required)</span>
        <input className="cpm-input" value={reason} onChange={e => setReason(e.target.value)}
          placeholder="maintenance planned · known disturbance · awaiting VP mapping" />
      </label>
      <p className="cpm-copy" role="status">
        {invalid ?? `Shelved until ${fmtDateTime(until)} (${shelfCountdown(new Date(until).toISOString(), now)}).`}
      </p>
      <div className="cpm-filter-row">
        <ReasonedButton variant="raised" disabled={!canManage || pending || !!invalid} reason={!canManage ? 'Needs the cpm.manage permission' : null}
          title={!canManage ? 'Needs the cpm.manage permission' : invalid ?? (active ? 'Replace the current expiry and reason' : 'Shelve until the stated expiry')}
          onClick={() => { if (!invalid) onShelve(new Date(until).toISOString(), reason.trim()); }}>
          {pending ? 'Saving…' : active ? 'Update shelf' : 'Shelve'}
        </ReasonedButton>
        <ObcButton variant="flat" disabled={pending} onClick={onClose}>Cancel</ObcButton>
      </div>
      {error != null && (
        <p className="cpm-field__error" role="alert">{error instanceof Error ? error.message : 'The shelve failed.'}</p>
      )}
    </div>
  );
};

export default ShelvePanel;
