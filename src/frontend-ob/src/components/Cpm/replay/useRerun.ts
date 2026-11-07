/**
 * Task 18: Re-run this window. Sends the open window (its kind and exact end) through the same Evaluate request as the
 * Workbench and polls the run with the Workbench's settle rules. A repeat request returns the run already made while its
 * evidence is held, flagged `cached`. The page's window changing starts over: a run never carries to another window.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getEvaluation, postEvaluation, type EvaluationKind, type EvaluationRun } from '../../../api/cpm/evaluation';
import { evaluationRefusal, evaluationSettled, evaluationStatus } from '../evidence/evaluationState';

const POLL_MS = 1500;

/** A re-run's row is keyed by the first 12 hex characters of its run id (`?rerun=`). */
export const replayIdOf = (analysisRunId: string): string => analysisRunId.replace(/-/g, '').slice(0, 12);

export function useRerun(loopId: string | undefined, windowKey: string) {
  const [runId, setRunId] = useState<string | undefined>();
  useEffect(() => { setRunId(undefined); }, [loopId, windowKey]);

  const start = useMutation({
    mutationFn: (a: { kind: EvaluationKind; endMs: number }) => postEvaluation(loopId!, a.kind, a.endMs),
    onSuccess: r => setRunId(r.analysisRunId),
  });
  const poll = useQuery({
    queryKey: ['cpm', 'evaluation', runId ?? ''],
    queryFn: ({ signal }) => getEvaluation(runId!, signal),
    enabled: !!runId,
    refetchInterval: q => (evaluationSettled(q.state.data, Date.now()) ? false : POLL_MS),
  });

  const posted: EvaluationRun | undefined = start.data?.analysisRunId === runId ? start.data : undefined;
  const run = poll.data?.analysisRunId === runId ? poll.data : posted;
  const settled = evaluationSettled(run, Date.now());
  const finished = settled && run?.state === 'FINISHED';
  return {
    submit: (kind: EvaluationKind, endMs: number) => { setRunId(undefined); start.reset(); start.mutate({ kind, endMs }); },
    run,
    status: evaluationStatus(run),
    refusal: evaluationRefusal(start.error),
    unreadable: poll.error != null,
    cached: !!posted?.cached || !!run?.cached,
    finished,
    busy: start.isPending || (!!runId && !settled && !poll.error),
    started: start.isPending || !!runId,
  };
}
