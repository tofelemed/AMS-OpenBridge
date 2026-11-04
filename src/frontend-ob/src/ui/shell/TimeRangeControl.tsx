/**
 * The global time range and the one header statement of the site zone (RD3, RD5, SPEC §2.2).
 * It filters time-based lists and trends. A verdict never changes with it.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import { ObiTime } from '@oicl/openbridge-webcomponents-react/icons/icon-time';
import { isoToZoneInput, siteDateTime, zoneInputToIso } from '../../cpa/siteTime';
import { RANGE_OPTIONS, useCpaContext, type CpaRange, type RangeKey } from '../../cpa/useCpaContext';
import { Popover } from '../Popover';
import { SegmentedControl } from '../SegmentedControl';

const SEGMENTS = RANGE_OPTIONS.map(o => ({ value: o.key, label: o.label }));

const presetLabel = (key: RangeKey) => `Last ${RANGE_OPTIONS.find(o => o.key === key)?.label ?? key}`;

export function rangeSummary(range: CpaRange, zoneId: string): string {
  if (range.key !== 'custom') return presetLabel(range.key);
  return `${siteDateTime(range.from, zoneId)} to ${siteDateTime(range.to, zoneId)}`;
}

const CustomRange: React.FC<{ range: CpaRange; zoneId: string; onApply: (r: CpaRange) => void }> = ({ range, zoneId, onApply }) => {
  const [from, setFrom] = useState(() => isoToZoneInput(range.from, zoneId));
  const [to, setTo] = useState(() => isoToZoneInput(range.to, zoneId));
  const [error, setError] = useState('');

  const apply = () => {
    const a = zoneInputToIso(from, zoneId);
    const b = zoneInputToIso(to, zoneId);
    if (!a || !b) { setError('Enter a start and an end.'); return; }
    if (a >= b) { setError('The start must be before the end.'); return; }
    setError('');
    onApply({ key: 'custom', from: a, to: b });
  };

  return (
    <div className="shell-form">
      <label className="ui-field">
        <span className="ui-field__label">From</span>
        <input className="ui-input" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} />
      </label>
      <label className="ui-field">
        <span className="ui-field__label">To</span>
        <input className="ui-input" type="datetime-local" value={to} onChange={e => setTo(e.target.value)} />
      </label>
      {error && <p className="ui-field__error" role="alert">{error}</p>}
      <ObcButton variant="raised" onClick={apply}>Apply</ObcButton>
    </div>
  );
};

export const TimeRangeControl: React.FC<{ compact: boolean }> = ({ compact }) => {
  const { range, setRange, zone } = useCpaContext();
  const [choice, setChoice] = useState<RangeKey | null>(null);
  const shown = choice ?? range.key;
  const summary = rangeSummary(range, zone.id);

  const pick = (key: RangeKey, close: () => void) => {
    if (key === 'custom') { setChoice('custom'); return; }
    setChoice(null);
    setRange({ key, from: null, to: null });
    close();
  };

  return (
    <Popover
      label="Time range"
      trigger={t => (
        <button
          type="button"
          className={`ui-control shell-trigger shell-trigger--range${compact ? ' ui-control--icon' : ''}`}
          aria-label={`Time range: ${summary}. Times in ${zone.abbr}`}
          {...t}
        >
          <span className="ui-icon"><ObiTime /></span>
          {!compact && <span className="shell-trigger__text">{summary}</span>}
          {!compact && <span className="shell-trigger__zone">Times in {zone.abbr}</span>}
          {!compact && <span className="ui-icon ui-icon--small"><ObiChevronDownGoogle /></span>}
        </button>
      )}
    >
      {close => (
        <div className="shell-range">
          <SegmentedControl label="Range" options={SEGMENTS} value={shown} onChange={k => pick(k, close)} />
          {shown === 'custom' && (
            <CustomRange
              range={range}
              zoneId={zone.id}
              onApply={r => { setChoice(null); setRange(r); close(); }}
            />
          )}
          <p className="ui-meta">Times in {zone.abbr} ({zone.id})</p>
        </div>
      )}
    </Popover>
  );
};
