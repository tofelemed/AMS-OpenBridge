/**
 * The two views of the primary table. Both keep one tab stop: position 0 of a row is the link to the
 * loop, and the gates follow. A cell is a native button, so the roving focus can move to it and Enter
 * selects it. Glyph, word and spoken label all come from `gateMark`: none is written here.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { CpmHeatmapLoop, CpmRankedLoop } from '../../../api/cpmApi';
import { cpaHref } from '../../../components/Cpm/cpaHref';
import { gateMark, gateName, resultGates } from '../../../components/Cpm/gateStatus';
import { staleVerdictLine } from '../../../components/Cpm/verdictAge';
import type { Column } from '../../../ui/DataTable';
import { GateBadge } from '../../../ui/GateBadge';
import { StatusBadge } from '../../../ui/StatusBadge';
import { Toggletip } from '../../../ui/Toggletip';
import type { GridCellProps, GridFocus } from '../../../ui/useGridFocus';
import { rankValue, sameLoop, verdictBadge, type SortKey } from './performanceModel';
import type { TierGroup } from './GateRollupPanel';

export interface Selection { loopId: string; gate: string }

export interface GateColumnContext {
  search: URLSearchParams;
  kind: string;
  sort: SortKey;
  /** False until a ranking has arrived: "Not ranked" must not stand in for "still loading". */
  ranked: boolean;
  rankOf: ReadonlyMap<string, CpmRankedLoop>;
  selection: Selection | null;
  focus: GridFocus<HTMLTableSectionElement>;
  inputFlagsOf: (loopId: string) => string[];
  onSelectCell: (loopId: string, gate: string) => void;
}

const LoopLink: React.FC<{ row: CpmHeatmapLoop; ctx: GateColumnContext; cell: GridCellProps }> = ({ row, ctx, cell }) => (
  <Link
    className="perf-loop"
    to={cpaHref('/cpm/loop', ctx.search, { loop: row.loopId, tab: 'performance', window: ctx.kind })}
    {...cell}
  >
    <span className="ui-sr">Open </span>
    <span className="perf-loop__tag">{row.loopId}</span>{' '}
    <span className="perf-loop__name">{row.displayName}</span>
  </Link>
);

const isSelected = (ctx: GateColumnContext, row: CpmHeatmapLoop, gate: string) =>
  ctx.selection?.gate === gate && sameLoop(ctx.selection.loopId, row.loopId);

/** Names the cell by loop, gate and state, for a reader that cannot see the column heading. */
const cellLabel = (row: CpmHeatmapLoop, gate: string, flags: string[]) =>
  `${row.loopId}, ${gateName(gate)} · ${gate}: ${gateMark(row.gates[gate], gate, flags).label}`;

const GateCell: React.FC<{ row: CpmHeatmapLoop; gate: string; ctx: GateColumnContext; cell: GridCellProps }> = ({ row, gate, ctx, cell }) => {
  const flags = ctx.inputFlagsOf(row.loopId);
  const selected = isSelected(ctx, row, gate);
  return (
    <button
      type="button"
      className="perf-cell"
      aria-pressed={selected}
      data-selected={selected || undefined}
      onClick={() => ctx.onSelectCell(row.loopId, gate)}
      {...cell}
    >
      <span className="ui-sr">{cellLabel(row, gate, flags)}</span>
      <span aria-hidden="true"><GateBadge status={row.gates[gate]} gate={gate} inputFlags={flags} /></span>
    </button>
  );
};

const CheckChip: React.FC<{ row: CpmHeatmapLoop; gate: string; ctx: GateColumnContext; cell: GridCellProps }> = ({ row, gate, ctx, cell }) => {
  const flags = ctx.inputFlagsOf(row.loopId);
  const selected = isSelected(ctx, row, gate);
  return (
    <button
      type="button"
      className="perf-check"
      aria-pressed={selected}
      data-selected={selected || undefined}
      onClick={() => ctx.onSelectCell(row.loopId, gate)}
      {...cell}
    >
      <span className="ui-sr">{cellLabel(row, gate, flags)}</span>
      <span className="perf-check__gate" aria-hidden="true">{gateName(gate)} · <span className="perf-code">{gate}</span></span>
      <span aria-hidden="true"><GateBadge status={row.gates[gate]} gate={gate} inputFlags={flags} /></span>
    </button>
  );
};

const ResultCell: React.FC<{ row: CpmHeatmapLoop; ctx: GateColumnContext }> = ({ row, ctx }) => {
  const verdict = verdictBadge(row.diagnosis);
  const older = staleVerdictLine(row.lastVerdict);
  const value = rankValue(ctx.rankOf.get(row.loopId.toLowerCase()), ctx.sort);
  return (
    <div className="perf-result">
      <StatusBadge tone={verdict.tone} glyph={verdict.glyph}>{verdict.label}</StatusBadge>
      {ctx.ranked && <span className="ui-meta">{value ?? 'Not ranked'}</span>}
      {older && <span className="ui-meta">{older}</span>}
    </div>
  );
};

const GateHeading: React.FC<{ gate: string }> = ({ gate }) => (
  <span className="perf-gate-head">
    <span>{gateName(gate)}</span>
    <span className="perf-code">{gate}</span>
  </span>
);

const loopColumn = (ctx: GateColumnContext, rowLength: (row: CpmHeatmapLoop) => number): Column<CpmHeatmapLoop> => ({
  key: 'loop',
  header: 'Loop',
  sticky: true,
  cell: (row, r) => <LoopLink row={row} ctx={ctx} cell={ctx.focus.cellProps(r, 0, rowLength(row))} />,
});

const resultColumn = (ctx: GateColumnContext): Column<CpmHeatmapLoop> => ({
  key: 'result',
  header: (
    <span className="perf-head">
      Result
      {ctx.sort === 'error'
        ? <Toggletip metric="M-080" label="Good-error share" values={{ 'G3 status': `${gateName('G3')} · G3` }} />
        : <Toggletip metric="M-066" label="Evidence score" />}
    </span>
  ),
  cell: row => <ResultCell row={row} ctx={ctx} />,
});

/** Every gate, grouped by tier. */
export function matrixColumns(ctx: GateColumnContext, tierGroups: TierGroup[]): Array<Column<CpmHeatmapLoop>> {
  const keys = tierGroups.flatMap(g => g.keys);
  const rowLength = keys.length + 1;
  const gates = tierGroups.flatMap(group => group.keys.map((gate): Column<CpmHeatmapLoop> => ({
    key: gate,
    group: group.label,
    header: <GateHeading gate={gate} />,
    cell: (row, r) => <GateCell row={row} gate={gate} ctx={ctx} cell={ctx.focus.cellProps(r, keys.indexOf(gate) + 1, rowLength)} />,
  })));
  return [loopColumn(ctx, () => rowLength), ...gates, resultColumn(ctx)];
}

/** Per loop, only the gates that move its result, plus the decision. */
export function checksColumns(ctx: GateColumnContext, gateKeys: string[]): Array<Column<CpmHeatmapLoop>> {
  const gatesOf = (row: CpmHeatmapLoop) => resultGates(row, gateKeys, ctx.inputFlagsOf(row.loopId));
  const rowLength = (row: CpmHeatmapLoop) => gatesOf(row).length + 1;
  return [
    loopColumn(ctx, rowLength),
    {
      key: 'checks',
      header: <span className="perf-head">Checks behind the result<Toggletip metric="M-043" label="Checks behind the result" /></span>,
      cell: (row, r) => {
        const gates = gatesOf(row);
        return (
          <div className="perf-checks">
            {gates.map((gate, i) => <CheckChip key={gate} row={row} gate={gate} ctx={ctx} cell={ctx.focus.cellProps(r, i + 1, gates.length + 1)} />)}
            {gates.length === 1 && gates[0] === 'G15' && <span className="ui-meta">No other check moved this result</span>}
          </div>
        );
      },
    },
    resultColumn(ctx),
  ];
}
