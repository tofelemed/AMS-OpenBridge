'use client';

/**
 * Fleet gate roll-up — the entry point to the calculation pathway.
 *
 * The matrix answers "why is THIS loop failing"; it cannot answer "where is the
 * FLEET failing" without scanning every row, which is unreadable past a few
 * dozen loops. This strip answers that in one glance — one bar per gate, height
 * and count = loops that gate is holding back — and clicking a bar filters the
 * matrix to exactly those loops. So the matrix becomes the drill-down it always
 * was, instead of the entry point it was being used as.
 */
import React from 'react';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import { gateFailureCounts } from './gateStatus';

const BAR_MAX_PX = 44;

export const GateRollup: React.FC<{
  loops: CpmHeatmapLoop[];
  tierGroups: { label: string; keys: string[] }[];
  activeGate: string | null;
  onSelectGate: (gate: string | null) => void;
}> = ({ loops, tierGroups, activeGate, onSelectGate }) => {
  const orderedKeys = React.useMemo(() => tierGroups.flatMap(g => g.keys), [tierGroups]);
  const counts = React.useMemo(
    () => gateFailureCounts(loops, orderedKeys), [loops, orderedKeys]);
  const byKey = React.useMemo(
    () => new Map(counts.map(c => [c.key, c])), [counts]);
  const peak = Math.max(1, ...counts.map(c => c.total));
  const anyFailing = counts.some(c => c.total > 0);

  if (!anyFailing) {
    return (
      <p className="cpm-copy cpm-rollup__none">
        No gate is holding back any loop in scope for this window.
      </p>
    );
  }

  return (
    <div className="cpm-rollup" role="group" aria-label="Loops held back, by gate">
      {tierGroups.map(group => (
        <div key={group.label} className="cpm-rollup__tier">
          <div className="cpm-rollup__bars">
            {group.keys.map(key => {
              const c = byKey.get(key) ?? { key, warn: 0, bad: 0, total: 0 };
              const active = activeGate === key;
              const px = (n: number) => Math.round((n / peak) * BAR_MAX_PX);
              return (
                <button
                  key={key}
                  type="button"
                  className={`cpm-rollup__bar${active ? ' cpm-rollup__bar--active' : ''}`}
                  aria-pressed={active}
                  disabled={c.total === 0}
                  onClick={() => onSelectGate(active ? null : key)}
                  aria-label={
                    c.total === 0
                      ? `${key}: no loops held back`
                      : `${key}: ${c.bad} failed, ${c.warn} need attention. `
                        + `${active ? 'Showing' : 'Show'} only these loops in the matrix.`
                  }
                >
                  <span className="cpm-rollup__stack" aria-hidden>
                    <span className="cpm-rollup__seg cpm-rollup__seg--warn"
                      style={{ height: `${px(c.warn)}px` }} />
                    <span className="cpm-rollup__seg cpm-rollup__seg--bad"
                      style={{ height: `${px(c.bad)}px` }} />
                  </span>
                  <span className="cpm-rollup__count" aria-hidden>
                    {c.total === 0 ? '·' : c.total}
                  </span>
                  <span className="cpm-rollup__key" aria-hidden>{key}</span>
                </button>
              );
            })}
          </div>
          <span className="cpm-rollup__tier-label">{group.label}</span>
        </div>
      ))}
    </div>
  );
};

export default GateRollup;
