/** State, order and find. Every one is a request parameter, so the list and the counts agree. */
import React from 'react';
import type { CpmEventPage } from '../../../api/cpm/eventPage';
import { EVENT_FILTERS, type EventFilterKey } from '../../../components/Cpm/events/shelfState';
import { InputChip } from '../../../ui/forms/InputChip';
import { TextInput } from '../../../ui/forms/TextInput';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { Toggletip } from '../../../ui/Toggletip';
import type { EpisodeSort } from './useEpisodeList';

const ORDER_OPTIONS = [{ value: 'triage', label: 'Triage' }, { value: 'recent', label: 'Newest' }] as const;

export const EpisodeFilters: React.FC<{
  filter: EventFilterKey;
  onFilter: (next: EventFilterKey) => void;
  /** Absent until the server answers. A missing count shows no number, never 0. */
  counts?: CpmEventPage['counts'];
  sort: EpisodeSort;
  onSort: (next: EpisodeSort) => void;
  search: string;
  onSearch: (next: string) => void;
  loop: string;
  onClearLoop: () => void;
}> = ({ filter, onFilter, counts, sort, onSort, search, onSearch, loop, onClearLoop }) => (
  <div className="episodes__filters">
    <SegmentedControl
      label="State"
      ignoreReselect
      wrap
      value={filter}
      options={EVENT_FILTERS.map(f => ({
        value: f.key,
        label: <>{f.label}{counts?.[f.key] != null && <span className="episodes__count"> {counts[f.key]}</span>}</>,
      }))}
      onChange={onFilter}
    />
    <div className="episodes__filter-row">
      <div className="ui-field">
        <span className="ui-field__label episodes__order-label">
          Order
          <Toggletip label="Triage order" variant="info">Open first, highest evidence score first.</Toggletip>
        </span>
        <SegmentedControl label="Order" ignoreReselect value={sort} options={ORDER_OPTIONS} onChange={onSort} />
      </div>
      <div className="episodes__find">
        <TextInput label="Find" placeholder="Loop, family or diagnosis" clearable value={search} onChange={onSearch} />
      </div>
      {loop && <InputChip label={`Loop ${loop}`} onRemove={onClearLoop} />}
    </div>
  </div>
);
