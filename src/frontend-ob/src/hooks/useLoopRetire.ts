/** CHG-146: retire and restore a loop. Both refresh the registry list, the loop and its readiness. */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { restoreLoop, retireLoop, type LoopRetireResult } from '../api/cpm/loopRetire';

// The same keys useCpm.ts holds for the loop list, one loop and its readiness; fleet reads refresh on their own poll.
const refresh = (qc: QueryClient, r: LoopRetireResult) => {
  void qc.invalidateQueries({ queryKey: ['cpm', 'loops'] });
  void qc.invalidateQueries({ queryKey: ['cpm', 'loop', r.loopId] });
  void qc.invalidateQueries({ queryKey: ['cpm', 'readiness', r.loopId] });
};

export function useRetireLoop() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: retireLoop, onSuccess: (r) => refresh(qc, r) });
}

export function useRestoreLoop() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: restoreLoop, onSuccess: (r) => refresh(qc, r) });
}
