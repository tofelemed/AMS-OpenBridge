/**
 * The Performance list's one toolbar row: Needs attention, Any result, Any condition, search, sort, and the
 * Findings / Gate matrix toggle at the end. It holds no state of its own; GateMatrix owns the rows these steer.
 */
import React from 'react';
import { FilterChip } from '../../../ui/forms/FilterChip';
import { TextInput } from '../../../ui/forms/TextInput';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { ROW_FILTERS, type MatrixView, type RowFilter } from '../gateStatus';
import { BAND_WORD, type DiagnosisBandKey } from '../vocabulary';
import { LOOP_SORTS, type LoopSort } from './loopSort';

const VIEWS: ReadonlyArray<{ value: MatrixView; label: string }> = [
  { value: 'checks', label: 'Findings' },
  { value: 'matrix', label: 'Gate matrix' },
];

export const MatrixToolbar: React.FC<{
  view: MatrixView;
  onViewChange: (v: MatrixView) => void;
  mode: RowFilter;
  counts: Record<RowFilter, number>;
  onModeChange: (m: RowFilter) => void;
  /** Result bands present in the loops, in display order. */
  bands: DiagnosisBandKey[];
  band: DiagnosisBandKey | '';
  onBandChange: (b: DiagnosisBandKey | '') => void;
  /** The page's own condition filter, in the same row. */
  conditionFilter?: React.ReactNode;
  gate: string | null;
  onClearGate: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  sort: LoopSort;
  onSortChange: (s: LoopSort) => void;
  count: string;
}> = ({
  view, onViewChange, mode, counts, onModeChange, bands, band, onBandChange, conditionFilter,
  gate, onClearGate, query, onQueryChange, sort, onSortChange, count,
}) => (
  <div className="cpm-matrix-toolbar">
    <select className="cpm-select" aria-label="Row filter" value={mode} onChange={e => onModeChange(e.target.value as RowFilter)}>
      {ROW_FILTERS.map(f => <option key={f.value} value={f.value}>{`${f.label} ${counts[f.value]}`}</option>)}
    </select>
    <select className="cpm-select" aria-label="Result" value={band} onChange={e => onBandChange(e.target.value as DiagnosisBandKey | '')}>
      <option value="">Any result</option>
      {bands.map(b => <option key={b} value={b}>{BAND_WORD[b]}</option>)}
    </select>
    {conditionFilter}
    {gate && <FilterChip label={`Failing ${gate}`} selected onToggle={onClearGate} />}
    <div className="cpm-matrix-toolbar__search">
      <TextInput label="Filter" placeholder="loop id or description" clearable value={query} onChange={onQueryChange} />
    </div>
    <select className="cpm-select" aria-label="Sort" value={sort} onChange={e => onSortChange(e.target.value as LoopSort)}>
      {LOOP_SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
    <span className="cpm-matrix-toolbar__count" aria-live="polite">{count}</span>
    <SegmentedControl label="Performance list view" options={VIEWS} value={view} onChange={onViewChange} ignoreReselect />
  </div>
);

export default MatrixToolbar;
