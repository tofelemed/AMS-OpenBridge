'use client';

/**
 * Fleet gate summary — the entry point to the calculation pathway.
 *
 * The list answers "why is THIS loop failing"; it cannot answer "where is the FLEET failing" without scanning every row.
 * One tile per gate, under its tier: the count of loops that gate is holding back and its code. Tone comes from
 * `gateFailureCounts` (failed, else needs attention). A click filters the list to exactly those loops (`?fg=`). The failed
 * and attention split is in the tile's name, not on it.
 */
import React from 'react';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import { GateTierRow } from './blocks/GateTierRow';
import { gateFailureCounts, gateName } from './gateStatus';

export const GateRollup: React.FC<{
  loops: CpmHeatmapLoop[];
  gateKeys: string[];
  activeGate: string | null;
  onSelectGate: (gate: string | null) => void;
}> = ({ loops, gateKeys, activeGate, onSelectGate }) => {
  const byKey = React.useMemo(
    () => new Map(gateFailureCounts(loops, gateKeys).map(c => [c.key, c])), [loops, gateKeys]);

  if (![...byKey.values()].some(c => c.total > 0)) {
    return <p className="cpm-copy cpm-rollup__none">No gate is holding back any loop in scope for this window.</p>;
  }

  return (
    <div role="group" aria-label="Loops held back, by gate">
      <GateTierRow gates={gateKeys} tile={key => {
        const c = byKey.get(key) ?? { key, warn: 0, bad: 0, total: 0 };
        const active = activeGate === key;
        const tone = c.bad > 0 ? 'bad' : c.warn > 0 ? 'warn' : 'none';
        return (
          <button
            type="button"
            className={`cpm-gate-count cpm-gate-count--${tone}${active ? ' cpm-gate-count--active' : ''}`}
            aria-pressed={active}
            disabled={c.total === 0}
            title={c.total === 0 ? `${key} ${gateName(key)}: no loop is held back here, so there is nothing to filter` : `${key} ${gateName(key)}`}
            onClick={() => onSelectGate(active ? null : key)}
            aria-label={
              c.total === 0
                ? `${key} ${gateName(key)}: no loops held back`
                : `${c.total} ${key} ${gateName(key)}: ${c.bad} failed, ${c.warn} need attention. `
                  + `${active ? 'Showing' : 'Show'} only these loops in the list.`
            }
          >
            <span className="cpm-gate-count__n" aria-hidden>{c.total === 0 ? '·' : c.total}</span>
            <span className="cpm-gate-count__code" aria-hidden>{key}</span>
          </button>
        );
      }} />
    </div>
  );
};

export default GateRollup;
