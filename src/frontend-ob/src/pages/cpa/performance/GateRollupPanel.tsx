/**
 * SPEC §5.2 gate roll-up: one column per gate, height and count being the loops that gate holds back,
 * grouped by tier. A column is a real toggle that filters the table. Marks and tones come from the
 * gate vocabulary, so a column says the same thing as the cells it filters.
 */
import React, { useMemo } from 'react';
import type { CpmHeatmapLoop } from '../../../api/cpmApi';
import { gateName } from '../../../components/Cpm/gateStatus';
import { DataState } from '../../../ui/DataState';
import { Toggletip } from '../../../ui/Toggletip';
import { useGridFocus } from '../../../ui/useGridFocus';
import { rollupColumns, type RollupColumn } from './performanceModel';

export interface TierGroup { label: string; keys: string[] }

const columnLabel = (c: RollupColumn, active: boolean) => {
  const name = `${gateName(c.key)} · ${c.key}`;
  if (c.total === 0) return `${name}: no loops held back`;
  const parts = c.parts.map(p => `${p.count} ${p.word}`).join(', ');
  return `${name}: ${c.total} held back, ${parts}. ${active ? 'Filtering the table.' : 'Filter the table.'}`;
};

const Column: React.FC<{
  column: RollupColumn;
  peak: number;
  active: boolean;
  onToggle: () => void;
  cell: { 'data-r': number; 'data-c': number; tabIndex: 0 | -1 };
}> = ({ column, peak, active, onToggle, cell }) => (
  <button
    type="button"
    className="perf-rollup__column"
    {...cell}
    aria-pressed={active}
    aria-disabled={column.total === 0 || undefined}
    data-active={active || undefined}
    onClick={() => { if (column.total > 0) onToggle(); }}
  >
    <span className="ui-sr">{columnLabel(column, active)}</span>
    <span className="perf-rollup__track" aria-hidden="true">
      <span className="perf-rollup__bar" style={{ height: `${(column.total / peak) * 100}%` }}>
        {column.parts.map(p => <span key={p.meaning} className="perf-rollup__seg" data-tone={p.tone} style={{ flexGrow: p.count }} />)}
      </span>
    </span>
    <span className="perf-rollup__count" aria-hidden="true">{column.total}</span>
    <span className="perf-rollup__parts" aria-hidden="true">
      {column.parts.map(p => <span key={p.meaning}>{p.glyph}{p.count}</span>)}
    </span>
    <span className="perf-rollup__name" aria-hidden="true">{gateName(column.key)}</span>
    <span className="perf-rollup__code" aria-hidden="true">{column.key}</span>
  </button>
);

export const GateRollupPanel: React.FC<{
  loops: CpmHeatmapLoop[];
  tierGroups: TierGroup[];
  activeGate: string | null;
  onSelectGate: (gate: string | null) => void;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}> = ({ loops, tierGroups, activeGate, onSelectGate, loading, error, onRetry }) => {
  const keys = useMemo(() => tierGroups.flatMap(g => g.keys), [tierGroups]);
  const columns = useMemo(() => rollupColumns(loops, keys), [loops, keys]);
  const byKey = useMemo(() => new Map(columns.map(c => [c.key, c])), [columns]);
  const focus = useGridFocus<HTMLDivElement>(1, keys.length);
  const peak = Math.max(1, ...columns.map(c => c.total));
  const anyHeld = columns.some(c => c.total > 0);
  const example = byKey.get(activeGate ?? '') ?? [...columns].sort((a, b) => b.total - a.total)[0];

  const body = (() => {
    if (error) return <DataState kind="unavailable" reason="The gate results could not be read." onRetry={onRetry} />;
    if (loading) return <DataState kind="loading" label="Loading the gate roll-up" rows={2} />;
    if (loops.length === 0) return <p className="ui-meta">No loops to roll up.</p>;
    if (!anyHeld) return <p className="ui-meta">No gate is holding back any loop in scope for this window.</p>;
    return (
      <div className="perf-rollup" role="toolbar" aria-label="Loops held back, by gate" {...focus.containerProps}>
        {tierGroups.map(group => (
          <div key={group.label} className="perf-rollup__tier" style={{ '--perf-tier-columns': group.keys.length } as React.CSSProperties}>
            <span className="perf-rollup__tier-label">{group.label}</span>
            <div className="perf-rollup__columns">
              {group.keys.map(key => {
                const column = byKey.get(key);
                if (!column) return null;
                return (
                  <Column
                    key={key}
                    column={column}
                    peak={peak}
                    active={activeGate === key}
                    onToggle={() => onSelectGate(activeGate === key ? null : key)}
                    cell={focus.cellProps(0, keys.indexOf(key), keys.length)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  })();

  return (
    <section className="perf-panel" aria-labelledby="perf-rollup-title">
      <h2 id="perf-rollup-title" className="perf-panel__title">
        Loops held back by gate
        {example && (
          <Toggletip
            metric="M-041"
            label="Loops held back"
            values={{ key: example.key, name: gateName(example.key), bad: example.bad, warn: example.warn }}
          />
        )}
      </h2>
      {body}
    </section>
  );
};
