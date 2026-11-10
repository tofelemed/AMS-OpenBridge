/**
 * CHG-160 (owner review): the Windows step: the loop's recent windows, and the open window against the one before it. It
 * was the Compare windows dialog (CHG-141); it reads the previous window only while this step is open. A window picked
 * here opens on every step.
 */
import React from 'react';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { EvidenceWindows } from '../evidence/useEvidenceWindows';
import { usePreviousEnd, useWindowAt } from '../evidence/useWindowAt';
import { comparisonOf } from './comparisonNote';
import { WindowBrowser } from './WindowBrowser';

export const WindowsStep: React.FC<{
  loopId: string;
  matrix: CpmGateMatrix;
  windowKind: string;
  list: EvidenceWindows;
  onWindow: (end: string) => void;
}> = ({ loopId, matrix, windowKind, list, onWindow }) => {
  // The PREVIOUS window is the next older one in the same list, read at its own end; never the current window against itself.
  const prevEnd = usePreviousEnd(loopId, windowKind, matrix.windowEnd);
  const prevRow = useWindowAt(prevEnd.end ? loopId : undefined, windowKind, prevEnd.end);
  return (
    <WindowBrowser windows={list.options} hasMore={list.hasMore} isLoadingMore={list.isLoadingMore} loadMore={list.loadMore}
      matrix={matrix} previous={prevRow.row} comparison={comparisonOf(prevEnd, prevRow)} windowKind={windowKind} onWindow={onWindow} />
  );
};

export default WindowsStep;
