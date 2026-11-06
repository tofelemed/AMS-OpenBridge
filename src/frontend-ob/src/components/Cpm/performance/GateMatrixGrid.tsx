'use client';

/**
 * The gate matrix: one ARIA grid, one tab stop, arrow-key navigation (cpa-ui-fix-plan Phase 2, CHG-135).
 *
 * The head carries gate codes only, under their tier headings; a code's name is its tooltip and the gate's dialog
 * says the rest. Each row ends in its result as a one-line link to Investigation. The loop cell is a native button on
 * purpose: the roving tabindex moves focus with `element.focus()`, and `obc-button` keeps its <button> in a shadow root
 * without delegatesFocus, so it can neither take that focus nor give up its own tab stop.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { serviceName } from '../loopName';
import type { CpmHeatmapLoop } from '../../../api/cpmApi';
import { gateMark, gateName } from '../gateStatus';
import { diagnosisLabel } from '../vocabulary';
import { investigationHref } from '../cpaHref';

const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

export const GateMatrixGrid: React.FC<{
  rows: CpmHeatmapLoop[];
  /** Position of the first row in the whole list, for aria-rowindex. */
  start: number;
  total: number;
  orderedGateKeys: string[];
  tierGroups: { label: string; keys: string[] }[];
  selectedLoopId: string | null;
  windowKind: string;
  /** Changes when the rows change, so the cursor goes back to the first cell. */
  resetKey: string;
  onSelectLoop: (loopId: string) => void;
  onOpenLoop: (loopId: string) => void;
  onOpenGate: (loopId: string, gate: string) => void;
  inputFlagsOf?: (loopId: string) => string[];
}> = ({
  rows, start, total, orderedGateKeys, tierGroups, selectedLoopId, windowKind, resetKey,
  onSelectLoop, onOpenLoop, onOpenGate, inputFlagsOf,
}) => {
  const navigate = useNavigate();
  const gridRef = React.useRef<HTMLTableElement>(null);
  const [cursor, setCursor] = React.useState({ r: 0, c: 0 });
  const movedByKey = React.useRef(false);
  const colCount = orderedGateKeys.length + 1; // column 0 is the loop cell

  React.useEffect(() => { setCursor({ r: 0, c: 0 }); }, [resetKey]);

  React.useEffect(() => {
    if (!movedByKey.current) return;
    movedByKey.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-r="${cursor.r}"][data-c="${cursor.c}"]`)?.focus();
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (!NAV_KEYS.includes(e.key)) return;
    e.preventDefault();
    movedByKey.current = true;
    setCursor(cur => {
      let { r, c } = cur;
      if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
      if (e.key === 'ArrowRight') c = Math.min(colCount - 1, c + 1);
      if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
      if (e.key === 'ArrowDown') r = Math.min(rows.length - 1, r + 1);
      if (e.key === 'Home') c = 0;
      if (e.key === 'End') c = colCount - 1;
      return { r, c };
    });
  };

  const tabIndexOf = (r: number, c: number) => (r === cursor.r && c === cursor.c ? 0 : -1);

  return (
    <div className="cpm-matrix-scroll cpm-matrix-scroll--list">
      <table ref={gridRef} className="cpm-matrix" role="grid" aria-label="Gates by loop" aria-rowcount={total + 2}>
        <thead>
          <tr aria-rowindex={1}>
            <th rowSpan={2} scope="col" className="cpm-matrix__loop">Loop</th>
            {tierGroups.map(g => (
              <th key={g.label} colSpan={g.keys.length} scope="colgroup" className="cpm-matrix__tier">{g.label}</th>
            ))}
            <th rowSpan={2} scope="col" className="cpm-matrix__result">Result</th>
          </tr>
          <tr aria-rowindex={2}>
            {orderedGateKeys.map(k => (
              <th key={k} scope="col" className="cpm-matrix__gate"><abbr title={gateName(k)}>{k}</abbr></th>
            ))}
          </tr>
        </thead>
        <tbody onKeyDown={onKeyDown}>
          {rows.map((row, r) => {
            const selected = selectedLoopId?.toLowerCase() === row.loopId.toLowerCase();
            return (
              <tr key={row.loopId} aria-rowindex={start + r + 3} aria-selected={selected}
                className={selected ? 'cpm-matrix__row--selected' : undefined}>
                <th scope="row" className="cpm-matrix__loop">
                  <button type="button" className="cpm-matrix__loop-btn" data-r={r} data-c={0} tabIndex={tabIndexOf(r, 0)}
                    title="Open in the Loop Explorer"
                    aria-label={`Open ${row.loopId}, ${row.displayName}, in the Loop Explorer`}
                    onFocus={() => setCursor({ r, c: 0 })} onClick={() => onOpenLoop(row.loopId)}>
                    <strong>{row.loopId}</strong>
                    <span className="cpm-event-row__sub">{serviceName(row)}</span>
                  </button>
                </th>
                {orderedGateKeys.map((k, gi) => {
                  const g = gateMark(row.gates[k], k, inputFlagsOf?.(row.loopId));
                  const c = gi + 1;
                  return (
                    <td key={k} role="gridcell" className="cpm-matrix__cell-td">
                      <button type="button" className={`cpm-matrix__cell cpm-matrix__cell--${g.tone}`}
                        data-r={r} data-c={c} tabIndex={tabIndexOf(r, c)}
                        aria-label={`${row.loopId}, gate ${k} ${gateName(k)}: ${g.label}`}
                        title={`${k} ${gateName(k)}: ${g.word}`}
                        onFocus={() => setCursor({ r, c })}
                        onClick={() => { onSelectLoop(row.loopId); onOpenGate(row.loopId, k); }}>
                        <span aria-hidden data-mark={g.meaning}>{g.glyph}</span>
                      </button>
                    </td>
                  );
                })}
                <td role="gridcell" className="cpm-matrix__result cpm-matrix__result-link">
                  <ObcButton variant="flat" title={`Review ${row.loopId} in Investigation`}
                    onClick={() => navigate(investigationHref(row.loopId, { kind: windowKind }))}>
                    {diagnosisLabel(row.diagnosis)}
                  </ObcButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default GateMatrixGrid;
