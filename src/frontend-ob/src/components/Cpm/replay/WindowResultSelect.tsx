/**
 * CHG-140: a window can hold its original result and re-runs of it (same end). The original is listed first and is what
 * opens; each re-run is labelled and chosen with `?rerun=`. Nothing shows when the window has a single result.
 * CHG-184 (owner review item 0): a re-run is named without its id - "Re-run", or "Re-run 1", "Re-run 2" … in the order they
 * were computed when there are several. The id stays the option's value (the address needs it).
 */
import React from 'react';
import type { CpmGateMatrix } from '../../../api/cpm/gates';

const idOf = (r: CpmGateMatrix) => r.metadata?.replayId ?? '';
const computed = (r: CpmGateMatrix) => r.metadata?.computedAt ?? '';

export const WindowResultSelect: React.FC<{
  row: CpmGateMatrix; others: CpmGateMatrix[]; onChange: (replayId: string) => void;
}> = ({ row, others, onChange }) => {
  if (others.length === 0) return null;
  const all = [row, ...others];
  const reruns = all.filter(r => idOf(r)).sort((a, b) => computed(a).localeCompare(computed(b)) || idOf(a).localeCompare(idOf(b)));
  const label = (i: number) => (reruns.length > 1 ? `Re-run ${i + 1}` : 'Re-run');
  return (
    <select className="cpm-select" aria-label="Result of this window" value={idOf(row)} onChange={e => onChange(e.target.value)}>
      {all.some(r => !idOf(r)) && <option value="">Original result</option>}
      {reruns.map((r, i) => <option key={idOf(r)} value={idOf(r)}>{label(i)}</option>)}
    </select>
  );
};
