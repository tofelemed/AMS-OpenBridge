'use client';

/**
 * The Performance list (U3): one set of rows, two views. Findings (default) names the checks behind each
 * result; the gate matrix shows all 17 gates as marks. The Findings / Gate matrix toggle rides the URL
 * (`?view=matrix`), so a link opens the view it was copied from.
 *
 * This component owns what both views share: the toolbar's filters, the sort, the 15-row page and the empty states.
 * It no longer defaults to every loop: "Needs attention" is the first row set, because at fleet scale most rows have
 * no verdict yet. "Not evaluated" stays one choice away, since "why has my loop not been judged?" is a real question.
 * A gate cell opens the gate's dialog; the page owns that dialog and the selected-loop band (`band`, above the table).
 */
import React from 'react';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import { Pagination } from '../../ui/forms/Pagination';
import { useDebounce } from '../../hooks/useDebounce';
import { EmptyState } from './shared';
import { filterCounts, filterRows, type MatrixView, type RowFilter } from './gateStatus';
import { GateMatrixChecks } from './GateMatrixChecks';
import { GateLegend } from './GateLegend';
import { GateMatrixGrid } from './performance/GateMatrixGrid';
import { MatrixToolbar } from './performance/MatrixToolbar';
import { sortLoops, type LoopSort } from './performance/loopSort';
import { BAND_WORD, bandOf, type DiagnosisBandKey } from './vocabulary';

const PAGE_SIZE = 15;

/** Shareable part of the filter; the free-text box stays local (see below). */
export interface MatrixScope { mode: RowFilter; gate: string | null }

export interface GateMatrixProps {
  loops: CpmHeatmapLoop[];
  orderedGateKeys: string[];
  tierGroups: { label: string; keys: string[] }[];
  filter: MatrixScope;
  onFilterChange: (next: Partial<MatrixScope>) => void;
  page: number;
  onPageChange: (page: number) => void;
  selectedLoopId: string | null;
  onSelectLoop: (loopId: string) => void;
  /** The loop cell: open the loop hub (a route, push). */
  onOpenLoop: (loopId: string) => void;
  onOpenGate: (loopId: string, gate: string) => void;
  windowKind: string;
  /** Fleet total from the summary endpoint, so the footer can name the shortfall. */
  fleetTotal?: number | null;
  /** CHG-066: the loop's effective input flags; a pass judged without one of its inputs reads "Pass on available data". */
  inputFlagsOf?: (loopId: string) => string[];
  view?: MatrixView;
  onViewChange: (view: MatrixView) => void;
  sort: LoopSort;
  onSortChange: (sort: LoopSort) => void;
  /** The server's ranking, for the control error and priority sorts. */
  rank?: ReadonlyMap<string, number>;
  /** CHG-131: a filter of the page's own, in the same row. */
  toolbarStart?: React.ReactNode;
  /** The selected-loop band, above the table. */
  band?: React.ReactNode;
}

export const GateMatrix: React.FC<GateMatrixProps> = ({
  loops, orderedGateKeys, tierGroups, filter, onFilterChange, page, onPageChange, selectedLoopId, onSelectLoop,
  onOpenLoop, onOpenGate, windowKind, fleetTotal, inputFlagsOf, view = 'checks', onViewChange, sort, onSortChange, rank,
  toolbarStart, band,
}) => {
  // The text box and the result filter are deliberately NOT in the URL: the box churns one history entry per keystroke
  // and nobody shares "loops matching FIC-0". Mode and gate are, because "show me everything failing G1" is the link
  // an engineer pastes.
  const [qDraft, setQDraft] = React.useState('');
  const q = useDebounce(qDraft, 250);
  const [result, setResult] = React.useState<DiagnosisBandKey | ''>('');
  const effective = React.useMemo(() => ({ ...filter, q }), [filter, q]);

  const counts = React.useMemo(() => filterCounts(loops, orderedGateKeys), [loops, orderedGateKeys]);
  const bands = React.useMemo(() => {
    const present = new Set(loops.map(l => bandOf(l.diagnosis)));
    return (Object.keys(BAND_WORD) as DiagnosisBandKey[]).filter(b => present.has(b));
  }, [loops]);
  const rows = React.useMemo(() => {
    const filtered = filterRows(loops, orderedGateKeys, effective).filter(r => !result || bandOf(r.diagnosis) === result);
    return sortLoops(filtered, sort, rank);
  }, [loops, orderedGateKeys, effective, result, sort, rank]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  React.useEffect(() => {
    if (safePage !== page) onPageChange(safePage);
  }, [safePage, page, onPageChange]);

  const start = (safePage - 1) * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);
  const showing = rows.length === 0 ? '0' : `${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)}`;
  const count = `Showing ${showing} of ${rows.length}${fleetTotal != null && fleetTotal > loops.length
    ? ` · matrix serves the first ${loops.length} of ${fleetTotal} loops in scope` : ''}`;

  const back = () => onPageChange(1);   // a new row set invalidates the page number
  const showAll = () => { setQDraft(''); setResult(''); onFilterChange({ mode: 'all', gate: null }); };

  return (
    <>
      <MatrixToolbar view={view} onViewChange={onViewChange} mode={filter.mode} counts={counts}
        onModeChange={mode => { onFilterChange({ mode }); }}
        bands={bands} band={result} onBandChange={b => { setResult(b); back(); }}
        conditionFilter={toolbarStart} gate={filter.gate} onClearGate={() => onFilterChange({ gate: null })}
        query={qDraft} onQueryChange={v => { setQDraft(v); back(); }}
        sort={sort} onSortChange={onSortChange} count={count} />

      {band}

      {rows.length === 0 ? (
        <EmptyState
          title={filter.mode === 'attention' ? 'No loop needs attention' : 'No loops match'}
          copy={
            q && fleetTotal != null && fleetTotal > loops.length
              ? `No match among the ${loops.length} loops loaded — the matrix serves the first ${loops.length} of ${fleetTotal} in scope, so this loop may be beyond them. Narrow the plant scope.`
              : filter.gate || q || result
                ? 'Clear the gate, result or text filter to widen the view.'
                : filter.mode === 'attention'
                  ? 'Every evaluated loop passed its gates in this window.'
                  : undefined
          }
          action={filter.gate || q || result || filter.mode !== 'all' ? { label: 'Show all loops', onClick: showAll } : undefined}
        />
      ) : (
        <>
          {view === 'checks' ? (
            <GateMatrixChecks rows={visible} orderedGateKeys={orderedGateKeys} selectedLoopId={selectedLoopId} windowKind={windowKind}
              onSelectLoop={onSelectLoop} onOpenLoop={onOpenLoop} onOpenGate={onOpenGate} inputFlagsOf={inputFlagsOf} />
          ) : (
            <>
              <GateLegend compact />
              <GateMatrixGrid rows={visible} start={start} total={rows.length} orderedGateKeys={orderedGateKeys} tierGroups={tierGroups}
                selectedLoopId={selectedLoopId} windowKind={windowKind}
                resetKey={`${safePage}|${filter.mode}|${filter.gate}|${q}|${result}|${sort}`}
                onSelectLoop={onSelectLoop} onOpenLoop={onOpenLoop} onOpenGate={onOpenGate} inputFlagsOf={inputFlagsOf} />
            </>
          )}

          {pageCount > 1 && (
            <div className="cpm-matrix-pager">
              <Pagination page={safePage} pageCount={pageCount} onChange={onPageChange} />
            </div>
          )}
        </>
      )}
    </>
  );
};

export default GateMatrix;
