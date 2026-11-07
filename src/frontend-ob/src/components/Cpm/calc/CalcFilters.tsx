/**
 * Task 20: the Calculations filters. Find calculation, Gate and Gate result stay ours (dropdowns); the category toggle is
 * the reference's way in. The Gate list holds only the gates of the chosen category. The count is of this list, not of
 * the whole page: "n shown / 19 available".
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import type { CalcCategory } from '../calcCatalogue';

export type CategoryChoice = 'All' | CalcCategory;
const TOGGLE: CategoryChoice[] = ['All', 'Control error', 'Actuator', 'Data & mode', 'Oscillation', 'Decision'];

export const CalcFilters: React.FC<{
  search: string; onSearch: (v: string) => void;
  gate: string; gates: string[]; onGate: (g: string) => void;
  result: string; results: string[]; onResult: (r: string) => void;
  category: CategoryChoice; onCategory: (c: CategoryChoice) => void;
  shown: number; available: number;
  filtered: boolean; onClear: () => void;
}> = ({ search, onSearch, gate, gates, onGate, result, results, onResult, category, onCategory, shown, available, filtered, onClear }) => (
  <div className="cpm-toolbar cpm-master-detail__bar">
    <label className="cpm-field">
      <span className="cpm-field__label">Find calculation</span>
      <input className="cpm-input" type="search" placeholder="Name, ID or unit" value={search} onChange={e => onSearch(e.target.value)} />
    </label>
    <label className="cpm-field">
      <span className="cpm-field__label">Gate</span>
      <select className="cpm-select" value={gate} onChange={e => onGate(e.target.value)}>
        {gates.map(g => <option key={g} value={g}>{g === 'all' ? 'All gates' : g}</option>)}
      </select>
    </label>
    <label className="cpm-field">
      <span className="cpm-field__label">Gate result</span>
      <select className="cpm-select" value={result} onChange={e => onResult(e.target.value)}>
        <option value="all">All results</option>
        {results.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </label>
    <SegmentedControl<CategoryChoice> label="Category" ignoreReselect wrap value={category} onChange={onCategory}
      options={TOGGLE.map(c => ({ value: c, label: c }))} />
    <span className="cpm-filter-count">{shown} shown / {available} available</span>
    {filtered && <ObcButton variant="flat" onClick={onClear}>Clear filters</ObcButton>}
  </div>
);

export default CalcFilters;
