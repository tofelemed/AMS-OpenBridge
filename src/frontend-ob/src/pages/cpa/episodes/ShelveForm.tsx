/**
 * Shelve or update a shelf (CHG-032). A shelf needs a future expiry inside the site limit and a
 * reason. The expiry is stated before it is sent, in the site zone (RD5), and a refusal stays beside
 * the inputs that can correct it.
 */
import React, { useId, useState } from 'react';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { presetsWithin, shelfCountdown, shelfState } from '../../../components/Cpm/events/shelfState';
import { isoToZoneInput, siteDateTime, zoneAbbr, zoneInputToIso } from '../../../cpa/siteTime';
import { Button } from '../../../ui/Button';
import { Select } from '../../../ui/forms/Select';
import { TextInput } from '../../../ui/forms/TextInput';
import { ActionPanel, refusal } from './ActionPanel';

const HOUR = 3_600_000;
const MIN_REASON = 3;
const CUSTOM = 'custom';

/** The first thing stopping this shelf, or null when it can be sent. */
export function shelveProblem(until: number, now: number, maxHours: number, reason: string, tz: string): string | null {
  if (!Number.isFinite(until)) return 'Enter a date and time.';
  if (until <= now) return 'The expiry must be in the future.';
  const limit = now + maxHours * HOUR;
  if (until > limit) return `The site limit is ${maxHours} h (until ${siteDateTime(limit, tz)}).`;
  if (reason.trim().length < MIN_REASON) return 'A reason is required.';
  return null;
}

export const ShelveForm: React.FC<{
  event: CpmEventFrame;
  zoneId: string;
  /** Site limit, hours. */
  maxHours: number;
  pending: boolean;
  error: unknown;
  onShelve: (untilIso: string, reason: string) => void;
  onClose: () => void;
}> = ({ event, zoneId, maxHours, pending, error, onShelve, onClose }) => {
  const untilId = useId();
  const now = Date.now();
  const active = shelfState(event, now) === 'ACTIVE';
  const presets = presetsWithin(maxHours);
  const [choice, setChoice] = useState(() => String(presets.find(p => p.hours === 8)?.hours ?? presets[0]?.hours ?? CUSTOM));
  const [custom, setCustom] = useState(() => isoToZoneInput(new Date(now + Math.min(24, maxHours) * HOUR).toISOString(), zoneId));
  const [reason, setReason] = useState(active ? event.shelve_reason ?? '' : '');

  const customIso = choice === CUSTOM ? zoneInputToIso(custom, zoneId) : null;
  const until = choice === CUSTOM ? (customIso ? Date.parse(customIso) : NaN) : now + Number(choice) * HOUR;
  const problem = shelveProblem(until, now, maxHours, reason, zoneId);

  return (
    <ActionPanel label="Shelve this episode">
      <p className="episode__text">
        {active
          ? `Shelved, ${shelfCountdown(event.shelve_until, now)}. A new expiry and reason replace the current ones. The history keeps both.`
          : 'A shelf always expires, and the episode then returns to the queue. Shelving does not review it.'}
      </p>
      <Select
        label="Shelve for"
        value={choice}
        onChange={setChoice}
        options={[...presets.map(p => ({ value: String(p.hours), label: p.label })), { value: CUSTOM, label: 'Until a set time' }]}
      />
      {choice === CUSTOM && (
        <div className="ui-field">
          <label className="ui-field__label" htmlFor={untilId}>Until ({zoneAbbr(zoneId)})</label>
          <input id={untilId} className="ui-input" type="datetime-local" value={custom} onChange={e => setCustom(e.target.value)} />
        </div>
      )}
      <TextInput label="Reason (required)" placeholder="Maintenance planned" value={reason} onChange={setReason} />
      {!problem && (
        <p className="ui-meta" role="status">
          Shelved until {siteDateTime(until, zoneId)} ({shelfCountdown(new Date(until).toISOString(), now)}).
        </p>
      )}
      <div className="episode__form-actions">
        <Button
          variant="accent"
          disabled={pending || !!problem}
          reason={problem ?? undefined}
          onClick={() => { if (!problem) onShelve(new Date(until).toISOString(), reason.trim()); }}
        >
          {pending ? 'Saving…' : active ? 'Update shelf' : 'Shelve'}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
      </div>
      {error != null && <p className="ui-field__error" role="alert">{refusal(error, 'The shelve failed.')}</p>}
    </ActionPanel>
  );
};
