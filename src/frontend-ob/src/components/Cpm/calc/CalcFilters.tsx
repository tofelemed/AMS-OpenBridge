/**
 * Task 20: the Calculations filters. CHG-166 (owner review): one row in the list head, each control named by its options (the
 * names are for screen readers only): Name, ID or unit · All categories (the category toggle as a dropdown, the same six
 * choices) · All gates (each gate with its name) · All results · Clear filters. The Gate list holds only the gates of the chosen
 * category. The "n shown / 19 available" count went: the list never pages, so the rows are the count.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CalcCategory } from '../calcCatalogue';
import { gateName } from '../gateStatus';

export type CategoryChoice = 'All' | CalcCategory;
const CATEGORY_CHOICES: CategoryChoice[] = ['All', 'Control error', 'Actuator', 'Data & mode', 'Oscillation', 'Decision'];

export const CalcFilters: React.FC<{
  search: string; onSearch: (v: string) => void;
  gate: string; gates: string[]; onGate: (g: string) => void;
  result: string; results: string[]; onResult: (r: string) => void;
  category: CategoryChoice; onCategory: (c: CategoryChoice) => void;
  filtered: boolean; onClear: () => void;
}> = ({ search, onSearch, gate, gates, onGate, result, results, onResult, category, onCategory, filtered, onClear }) => (
  <div className="cpm-toolbar cpm-calc-filters">
    <input className="cpm-input" type="search" aria-label="Find calculation" placeholder="Name, ID or unit"
      value={search} onChange={e => onSearch(e.target.value)} />
    <select className="cpm-select" aria-label="Category" value={category} onChange={e => onCategory(e.target.value as CategoryChoice)}>
      {CATEGORY_CHOICES.map(c => <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>)}
    </select>
    <select className="cpm-select" aria-label="Gate" value={gate} onChange={e => onGate(e.target.value)}>
      {gates.map(g => <option key={g} value={g}>{g === 'all' ? 'All gates' : `${g} · ${gateName(g)}`}</option>)}
    </select>
    <select className="cpm-select" aria-label="Gate result" value={result} onChange={e => onResult(e.target.value)}>
      <option value="all">All results</option>
      {results.map(r => <option key={r} value={r}>{r}</option>)}
    </select>
    {filtered && <ObcButton variant="flat" onClick={onClear}>Clear filters</ObcButton>}
  </div>
);

export default CalcFilters;
