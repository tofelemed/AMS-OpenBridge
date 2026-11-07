/**
 * CHG-140: a window can hold its original result and re-runs of it (same end). The original is listed first and is what
 * opens; each re-run is labelled and chosen with `?rerun=`. Nothing shows when the window has a single result.
 */
import React from 'react';
import type { CpmGateMatrix } from '../../../api/cpm/gates';

const idOf = (r: CpmGateMatrix) => r.metadata?.replayId ?? '';

export const WindowResultSelect: React.FC<{
  row: CpmGateMatrix; others: CpmGateMatrix[]; onChange: (replayId: string) => void;
}> = ({ row, others, onChange }) => {
  if (others.length === 0) return null;
  const all = [row, ...others];
  const rows = [...all.filter(r => !idOf(r)), ...all.filter(r => idOf(r))];
  return (
    <select className="cpm-select" aria-label="Result of this window" value={idOf(row)} onChange={e => onChange(e.target.value)}>
      {rows.map(r => <option key={idOf(r) || 'original'} value={idOf(r)}>{idOf(r) ? `Re-run ${idOf(r)}` : 'Original result'}</option>)}
    </select>
  );
};
