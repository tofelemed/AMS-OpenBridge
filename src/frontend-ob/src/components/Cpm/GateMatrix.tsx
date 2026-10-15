'use client';

/**
 * Gate status matrix (U3) — the drill-down half of the calculation pathway.
 *
 * Rebuilt for fleet scale. Three things changed and each fixes a defect that
 * only appears past a couple of dozen loops:
 *
 * 1. It no longer defaults to every loop. At 54 demo loops, 51 rows were solid
 *    em-dashes (no verdict yet) — 867 cells that said nothing. The segmented
 *    filter defaults to "Needs attention"; "Not evaluated" stays one click away
 *    because "why has my loop not been judged?" is a real question.
 * 2. Headers stick. A glyph-only grid whose G0..G15 labels have scrolled away is
 *    unreadable — you cannot tell G7 from G9. The tier row, the gate row, the
 *    loop column and the result column all pin.
 * 3. It is a real ARIA grid with one tab stop and arrow-key navigation. The old
 *    markup nested 17 buttons inside a row that was itself role="button" — both
 *    invalid and an 18-stop tab detour per row.
 *
 * 2026-09-20 (cpa-ui-fix-plan Phase 2): the loop cell is a ROUTE to the loop hub
 * (Explorer › Summary); selection stays with the gate cells, which also open the
 * evidence panel. The cell remains a native button on purpose: the grid's roving
 * tabindex moves focus with `element.focus()`, and `obc-button` renders its
 * <button> inside a shadow root without delegatesFocus, so it can neither take
 * that focus nor give up its own tab stop — 25 rows would become 25 extra stops.
 *
 * CHG-098 (SME review 2 #24): this grid is now the ADVANCED view. The default is "Checks behind the result"
 * (GateMatrixChecks) — per loop, only the gates that move its result, by name. Both share this toolbar, row set
 * and pager; the view rides the URL (`?view=matrix`) so a link opens the view it was copied from.
 */
import React from 'react';
import { ObcFilterChip } from '@oicl/openbridge-webcomponents-react/components/filter-chip/filter-chip';
import { ObcPagination } from '@oicl/openbridge-webcomponents-react/components/pagination/pagination';
import { ObcTextInputField } from '@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field';
import { ObcToggleButtonGroup } from '@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group';
import { ObcToggleButtonOption } from '@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import { useDebounce } from '../../hooks/useDebounce';
import { EmptyState } from './shared';
import {
  ROW_FILTERS, filterCounts, filterRows, gateName, glyphFor, isRowFilter, matrixViewOf, type MatrixView, type RowFilter,
} from './gateStatus';
import { GateLegend } from './GateLegend';
import { GateMatrixChecks, ResultCell } from './GateMatrixChecks';

const PAGE_SIZE = 25;
const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
/** CHG-098 (SME review 2 #24): the readable view first; the full matrix is the advanced one. */
const VIEWS: { value: MatrixView; label: string }[] = [
  { value: 'checks', label: 'Checks behind the result' },
  { value: 'matrix', label: 'Full G0–G15 matrix' },
];

/** Shareable part of the filter — the free-text box stays local (see below). */
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
  /** Fleet total from the summary endpoint, so the footer can name the shortfall. */
  fleetTotal?: number | null;
  /** CHG-066: the loop's effective input flags — a pass judged without one of its inputs reads "OK on available data". */
  inputFlagsOf?: (loopId: string) => string[];
  /** CHG-098: "checks" (default, readable) or "matrix" (the full G0–G15 grid). */
  view?: MatrixView;
  onViewChange?: (view: MatrixView) => void;
}

export const GateMatrix: React.FC<GateMatrixProps> = ({
  loops, orderedGateKeys, tierGroups, filter, onFilterChange,
  page, onPageChange, selectedLoopId, onSelectLoop, onOpenLoop, onOpenGate, fleetTotal, inputFlagsOf,
  view = 'checks', onViewChange,
}) => {
  // The text box is deliberately NOT in the URL: it churns one history entry per
  // keystroke and nobody shares "loops matching FIC-0". Mode and gate are, because
  // "show me everything failing G1" is exactly the link an engineer pastes.
  const [qDraft, setQDraft] = React.useState('');
  const q = useDebounce(qDraft, 250);
  const effective = React.useMemo(() => ({ ...filter, q }), [filter, q]);

  const counts = React.useMemo(
    () => filterCounts(loops, orderedGateKeys), [loops, orderedGateKeys]);
  const rows = React.useMemo(
    () => filterRows(loops, orderedGateKeys, effective), [loops, orderedGateKeys, effective]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  React.useEffect(() => {
    if (safePage !== page) onPageChange(safePage);
  }, [safePage, page, onPageChange]);

  const start = (safePage - 1) * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  // ── Roving tabindex: the whole grid is ONE tab stop; arrows move the cursor.
  const gridRef = React.useRef<HTMLTableElement>(null);
  const [cursor, setCursor] = React.useState({ r: 0, c: 0 });
  const movedByKey = React.useRef(false);
  const colCount = orderedGateKeys.length + 1; // column 0 is the loop cell

  React.useEffect(() => {
    setCursor({ r: 0, c: 0 });
  }, [safePage, filter.mode, filter.gate, q]);

  React.useEffect(() => {
    if (!movedByKey.current) return;
    movedByKey.current = false;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-r="${cursor.r}"][data-c="${cursor.c}"]`)
      ?.focus();
  }, [cursor]);

  const onGridKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (!NAV_KEYS.includes(e.key)) return;
    e.preventDefault();
    movedByKey.current = true;
    setCursor(cur => {
      let { r, c } = cur;
      if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
      if (e.key === 'ArrowRight') c = Math.min(colCount - 1, c + 1);
      if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
      if (e.key === 'ArrowDown') r = Math.min(visible.length - 1, r + 1);
      if (e.key === 'Home') c = 0;
      if (e.key === 'End') c = colCount - 1;
      return { r, c };
    });
  };

  const tabIndexOf = (r: number, c: number) => (r === cursor.r && c === cursor.c ? 0 : -1);

  const showing = rows.length === 0
    ? '0'
    : `${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)}`;

  return (
    <>
      <div className="cpm-matrix-toolbar">
        {/* CHG-098: the view switch; the same first-emit guard as the row filter below (only a known view is written) */}
        {onViewChange && (
          <ObcToggleButtonGroup
            value={view}
            onValue={(e: CustomEvent<{ value: string }>) => {
              const v = e.detail.value;
              if (v === 'checks' || v === 'matrix') onViewChange(matrixViewOf(v));
            }}
          >
            {VIEWS.map(v => (
              <ObcToggleButtonOption key={v.value} value={v.value}>{v.label}</ObcToggleButtonOption>
            ))}
          </ObcToggleButtonGroup>
        )}

        {/* Guard the payload: obc-toggle-button-group runs willUpdate before its
            slot is assigned, so its very first `value` event can carry '' and
            would otherwise write an empty mode into the URL. */}
        <ObcToggleButtonGroup
          value={filter.mode}
          onValue={(e: CustomEvent<{ value: string }>) => {
            if (isRowFilter(e.detail.value)) onFilterChange({ mode: e.detail.value });
          }}
        >
          {ROW_FILTERS.map(f => (
            <ObcToggleButtonOption key={f.value} value={f.value}>
              {f.label} {counts[f.value]}
            </ObcToggleButtonOption>
          ))}
        </ObcToggleButtonGroup>

        {filter.gate && (
          <ObcFilterChip
            label={`Failing ${filter.gate}`}
            checked
            showIcon
            onChipToggle={() => onFilterChange({ gate: null })}
          />
        )}

        <div className="cpm-matrix-toolbar__search">
          {/* `label` (not a host aria-label) is what names the field: the
              component wraps its input in a <label>, so the label prop is the
              only thing that reaches assistive tech — and a visible label beats
              a placeholder-only field regardless. */}
          <ObcTextInputField
            value={qDraft}
            label="Filter"
            placeholder="loop id or description"
            hasClearButton
            onInput={(e: Event) =>
              setQDraft((e.target as unknown as { value: string }).value ?? '')}
          />
        </div>

        <span className="cpm-matrix-toolbar__count" aria-live="polite">
          Showing {showing} of {rows.length}
          {fleetTotal != null && fleetTotal > loops.length
            ? ` · matrix serves the first ${loops.length} of ${fleetTotal} loops in scope`
            : ''}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={filter.mode === 'attention' ? 'No loop needs attention' : 'No loops match'}
          copy={
            q && fleetTotal != null && fleetTotal > loops.length
              ? `No match among the ${loops.length} loops loaded — the matrix serves the first ${loops.length} of ${fleetTotal} in scope, so this loop may be beyond them. Narrow the plant scope.`
              : filter.gate || q
                ? 'Clear the gate or text filter to widen the view.'
                : filter.mode === 'attention'
                  ? 'Every evaluated loop passed its gates in this window.'
                  : undefined
          }
          action={
            filter.gate || q || filter.mode !== 'all'
              ? {
                label: 'Show all loops',
                onClick: () => { setQDraft(''); onFilterChange({ mode: 'all', gate: null }); },
              }
              : undefined
          }
        />
      ) : (
        <>
          <GateLegend />
          {view === 'checks' ? (
            <GateMatrixChecks rows={visible} orderedGateKeys={orderedGateKeys} selectedLoopId={selectedLoopId}
              onSelectLoop={onSelectLoop} onOpenLoop={onOpenLoop} onOpenGate={onOpenGate} inputFlagsOf={inputFlagsOf} />
          ) : (
          <div className="cpm-matrix-scroll">
            <table
              ref={gridRef}
              className="cpm-matrix"
              role="grid"
              aria-label="Gate status by loop"
              aria-rowcount={rows.length + 2}
            >
              <thead>
                <tr aria-rowindex={1}>
                  <th rowSpan={2} scope="col" className="cpm-matrix__loop">Loop</th>
                  {tierGroups.map(g => (
                    <th key={g.label} colSpan={g.keys.length} scope="colgroup"
                      className="cpm-matrix__tier">{g.label}</th>
                  ))}
                  <th rowSpan={2} scope="col" className="cpm-matrix__result">Result</th>
                </tr>
                <tr aria-rowindex={2}>
                  {/* CHG-098: code + readable name; below 1000 px the name folds into the abbr tooltip */}
                  {orderedGateKeys.map(k => (
                    <th key={k} scope="col" className="cpm-matrix__gate">
                      <abbr title={gateName(k)}>{k}</abbr>
                      <span className="cpm-matrix__gate-name">{gateName(k)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody onKeyDown={onGridKeyDown}>
                {visible.map((row, r) => {
                  const selected = selectedLoopId?.toLowerCase() === row.loopId.toLowerCase();
                  return (
                    <tr
                      key={row.loopId}
                      aria-rowindex={start + r + 3}
                      aria-selected={selected}
                      className={selected ? 'cpm-matrix__row--selected' : undefined}
                    >
                      <th scope="row" className="cpm-matrix__loop">
                        <button
                          type="button"
                          className="cpm-matrix__loop-btn"
                          data-r={r}
                          data-c={0}
                          tabIndex={tabIndexOf(r, 0)}
                          title="Open in the Loop Explorer"
                          aria-label={`Open ${row.loopId}, ${row.displayName}, in the Loop Explorer`}
                          onFocus={() => setCursor({ r, c: 0 })}
                          onClick={() => onOpenLoop(row.loopId)}
                        >
                          <strong>{row.loopId} ›</strong>
                          <span className="cpm-event-row__sub">{row.displayName}</span>
                        </button>
                      </th>
                      {orderedGateKeys.map((k, gi) => {
                        const g = glyphFor(row.gates[k], k, inputFlagsOf?.(row.loopId));
                        const c = gi + 1;
                        return (
                          <td key={k} role="gridcell" className="cpm-matrix__cell-td">
                            <button
                              type="button"
                              className={`cpm-matrix__cell cpm-matrix__cell--${g.tone}`}
                              data-r={r}
                              data-c={c}
                              tabIndex={tabIndexOf(r, c)}
                              aria-label={`${row.loopId}, gate ${k} ${gateName(k)}: ${g.label}`}
                              title={`${k} ${gateName(k)}: ${g.word}`}
                              onFocus={() => setCursor({ r, c })}
                              onClick={() => { onSelectLoop(row.loopId); onOpenGate(row.loopId, k); }}
                            >
                              <span aria-hidden data-mark={g.meaning}>{g.glyph}</span>
                            </button>
                          </td>
                        );
                      })}
                      <td role="gridcell" className="cpm-matrix__result">
                        <ResultCell row={row} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {pageCount > 1 && (
            <div className="cpm-matrix-pager">
              <ObcPagination
                pages={pageCount}
                currentPage={safePage}
                onValue={(e: CustomEvent<{ value: number }>) => onPageChange(e.detail.value)}
              />
            </div>
          )}
        </>
      )}
    </>
  );
};

export default GateMatrix;
