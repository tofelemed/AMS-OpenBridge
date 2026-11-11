/**
 * CHG-167 (owner review, the approved sample): the episode list's one filter row, inside the list card. Search first (loop,
 * EVT number, family or diagnosis), then the dropdowns, each named by its options (the names are for screen readers only):
 * the state with each state's count (the only place a count stays), All severities, Triage / Newest; the loop chip from a link,
 * with its ×. Every filter is asked of the server by the page.
 */
import React from 'react';
import { InputChip } from '../../../ui/forms/InputChip';
import type { CpmEventPage } from '../../../api/cpm/eventPage';
import { EVENT_FILTERS, SEVERITY_FILTERS, type EventFilterKey } from './shelfState';

export type EventSort = 'triage' | 'recent';
const SORT_OPTIONS: ReadonlyArray<{ value: EventSort; label: string }> = [{ value: 'triage', label: 'Triage' }, { value: 'recent', label: 'Newest' }];

export const EpisodeFilters: React.FC<{
  search: string; onSearch: (v: string) => void;
  filter: EventFilterKey; onFilter: (f: EventFilterKey) => void;
  /** The server's count of every state under the same loop, scope and search; absent until the first page arrives. */
  counts?: CpmEventPage['counts'];
  severity: string | undefined; onSeverity: (s: string | undefined) => void;
  sort: EventSort; onSort: (s: EventSort) => void;
  loop: string | undefined; onClearLoop: () => void;
}> = ({ search, onSearch, filter, onFilter, counts, severity, onSeverity, sort, onSort, loop, onClearLoop }) => (
  <div className="cpm-events-filters">
    <input className="cpm-input" type="search" aria-label="Find" placeholder="Loop, EVT, family or diagnosis"
      value={search} onChange={e => onSearch(e.target.value)} />
    <select className="cpm-select" aria-label="Event state" value={filter} onChange={e => onFilter(e.target.value as EventFilterKey)}>
      {EVENT_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}{counts ? ` ${counts[f.key] ?? 0}` : ''}</option>)}
    </select>
    <select className="cpm-select" aria-label="Severity" value={severity ?? ''} onChange={e => onSeverity(e.target.value || undefined)}>
      <option value="">All severities</option>
      {SEVERITY_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
    <select className="cpm-select" aria-label="Order" value={sort} onChange={e => onSort(e.target.value as EventSort)}>
      {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {loop && <InputChip label={`Loop ${loop}`} onRemove={onClearLoop} />}
  </div>
);

export default EpisodeFilters;
