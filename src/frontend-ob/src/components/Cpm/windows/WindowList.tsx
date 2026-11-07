/**
 * Task 19: the windows of one profile, newest first. A row is the window's time of day (the date is said once, in a
 * section head), its samples over nominal with the ratio, and its count check. A declined window stays in the count check.
 * The bar above holds the sample-count filter, "n matching / m loaded" and Previous / Next.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmKpiRow } from '../../../api/cpmApi';
import { TonePill } from '../shared';
import { clockOf, dayOf } from '../windowLabel';
import { isDeclined } from './WindowResults';
import { countCheck, fmtCount, nominalOf } from './windowMath';

export type CountFilter = 'all' | 'matches' | 'over' | 'under' | 'declined';

const FILTERS: { value: CountFilter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'matches', label: 'Matches' }, { value: 'over', label: 'Over nominal' },
  { value: 'under', label: 'Under nominal' }, { value: 'declined', label: 'Declined' },
];

/** Where a row sits for the sample-count filter. A row with no nominal is only in All. */
export function countFilterOf(row: CpmKpiRow, tier: 'short' | 'long'): Exclude<CountFilter, 'all'> | null {
  if (isDeclined(row, tier)) return 'declined';
  const nominal = nominalOf(row);
  if (!nominal || typeof row.sample_count !== 'number') return null;
  const { diff } = countCheck(row.sample_count, nominal.value);
  return diff === 0 ? 'matches' : diff > 0 ? 'over' : 'under';
}

export const WindowListBar: React.FC<{
  filter: CountFilter; onFilter: (f: CountFilter) => void;
  matching: number; loaded: number;
  hasNewer: boolean; hasOlder: boolean; onPrevious: () => void; onNext: () => void;
}> = ({ filter, onFilter, matching, loaded, hasNewer, hasOlder, onPrevious, onNext }) => (
  <div className="cpm-toolbar cpm-master-detail__bar">
    <label className="cpm-field">
      <span className="cpm-field__label">Sample count</span>
      <select className="cpm-select" value={filter} onChange={e => onFilter(e.target.value as CountFilter)}>
        {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
    </label>
    <span className="cpm-filter-count">{matching} matching / {loaded} loaded</span>
    <ObcButton variant="flat" disabled={!hasNewer} onClick={onPrevious}>Previous</ObcButton>
    <ObcButton variant="flat" disabled={!hasOlder} onClick={onNext}>Next</ObcButton>
  </div>
);

const COLUMNS = 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)';

export const WindowList: React.FC<{
  rows: CpmKpiRow[]; selectedEnd: string | null; tier: 'short' | 'long'; timeZone: string;
  onSelect: (windowEnd: string) => void;
}> = ({ rows, selectedEnd, tier, timeZone, onSelect }) => {
  let day = '';
  return (
    <div className="cpm-master-detail__list" role="list">
      <div className="cpm-event-head" style={{ gridTemplateColumns: COLUMNS }}>
        <span>Window</span><span>Samples / nominal</span><span>Count check</span>
      </div>
      {rows.map(r => {
        const heading = dayOf(r.window_end, timeZone);
        const newDay = heading !== day;
        day = heading;
        const declined = isDeclined(r, tier);
        const nominal = nominalOf(r);
        const received = typeof r.sample_count === 'number' ? r.sample_count : null;
        const check = received != null && nominal ? countCheck(received, nominal.value) : null;
        const selected = r.window_end != null && r.window_end === selectedEnd;
        const pick = () => { if (r.window_end) onSelect(r.window_end); };
        return (
          <React.Fragment key={r.window_end ?? r.created_at}>
            {newDay && <div className="cpm-master-detail__section" role="presentation">{heading}</div>}
            <div role="listitem">
              <div className={`cpm-event-row${selected ? ' cpm-event-row--selected' : ''}`} style={{ gridTemplateColumns: COLUMNS }}
                tabIndex={0} aria-current={selected ? 'true' : undefined}
                onClick={pick}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}>
                <span className="cpm-event-row__title">{clockOf(r.window_start, timeZone)} {'→'} {clockOf(r.window_end, timeZone)}</span>
                <span>
                  <span className="cpm-mono">{nominal ? `${fmtCount(received)} / ${fmtCount(nominal.value)}` : fmtCount(received)}</span>
                  {check && <div className="cpm-event-row__sub">{(check.ratio * 100).toFixed(0)}%</div>}
                </span>
                {declined
                  ? <TonePill tone="bad">Declined</TonePill>
                  : check ? <TonePill tone={check.tone}>{check.label}</TonePill> : <TonePill tone="muted">Not reported</TonePill>}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default WindowList;
