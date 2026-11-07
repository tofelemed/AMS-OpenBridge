/**
 * CHG-140: Replay reads its window through `useWindowAt` / `useEvidenceWindows`, which the shared re-run hook does not
 * invalidate. When a re-run finishes, refresh them so the new result appears without a reload.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useRefreshOnRerun(finished: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!finished) return;
    void qc.invalidateQueries({ queryKey: ['cpm', 'window-at'] });
    void qc.invalidateQueries({ queryKey: ['cpm', 'window-summaries'] });
  }, [finished, qc]);
}
