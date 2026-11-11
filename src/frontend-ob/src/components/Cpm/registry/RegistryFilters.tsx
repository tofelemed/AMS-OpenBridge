/**
 * CHG-168 (owner review, answer 1): the list's one filter row, inside the list card and 32 px high. Search first (it matches the
 * tag, service, site, area, unit and type), then ONE dropdown that merged Show retired and the three configuration-limit counts,
 * then Export CSV (owner answer 3c). "Configuration limits unavailable" with Retry sits beside the dropdown when the fleet
 * summary cannot be read; the limit options then carry no number.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { RegistryView, ViewCounts } from './registryView';
import { viewOptions } from './registryView';

export const RegistryFilters: React.FC<{
  search: string;
  onSearch: (v: string) => void;
  view: RegistryView;
  onView: (v: RegistryView) => void;
  counts: ViewCounts;
  /** The fleet summary failed: its error state, beside the dropdown. */
  limitsError?: { retry: () => void } | null;
  onExport: () => void;
}> = ({ search, onSearch, view, onView, counts, limitsError, onExport }) => (
  <div className="cpm-compact cpm-reg-filters" role="group" aria-label="Loop filters">
    <input className="cpm-input" type="search" aria-label="Find loop" placeholder="Loop, service, unit or type"
      value={search} onChange={e => onSearch(e.target.value)} />
    <select className="cpm-select" aria-label="Loops shown" value={view} onChange={e => onView(e.target.value as RegistryView)}>
      {viewOptions(counts).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {limitsError && (
      <span className="cpm-reg-filters__error" role="status">
        <span className="cpm-field__error">Configuration limits unavailable</span>
        <ObcButton variant="flat" onClick={limitsError.retry}>Retry</ObcButton>
      </span>
    )}
    <ObcButton variant="normal" onClick={onExport}>Export CSV</ObcButton>
  </div>
);

export default RegistryFilters;
