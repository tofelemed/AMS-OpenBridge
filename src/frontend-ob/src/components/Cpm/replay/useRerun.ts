/**
 * Task 18: Re-run this window. Sends the open window (its kind and exact end) through the same Evaluate request as the
 * Workbench and polls the run with the Workbench's settle rules. A repeat request returns the run already made while its
 * evidence is held, flagged `cached`. The window changing starts over: a run never carries to another window.
 * The run id survives a failed poll, so a run in flight is never resubmitted. Automatic polling stops after a client time
 * limit; "Check again" reads the run once more and starts the limit over.
 */
import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getEvaluation, postEvaluation, type EvaluationKind, type EvaluationRun } from '../../../api/cpm/evaluation';
import { evaluationRefusal, evaluationSettled, evaluationStatus, openableVerdict } from '../evidence/evaluationState';

const POLL_MS = 1500;
/** How long a run is polled automatically before the page says it is still running. */
export const RERUN_LIMIT_MS = 5 * 60_000;

export function useRerun(loopId: string | undefined, windowKey: string, limitMs: number = RERUN_LIMIT_MS) {
  const [runId, setRunId] = useState<string | undefined>();
  const [expired, setExpired] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => { setRunId(undefined); }, [loopId, windowKey]);
  // the time limit starts with each run and each "Check again"
  useEffect(() => {
    setExpired(false);
    if (!runId) return undefined;
    const t = setTimeout(() => setExpired(true), limitMs);
    return () => clearTimeout(t);
  }, [runId, round, limitMs]);

  const start = useMutation({
    mutationFn: (a: { kind: EvaluationKind; endMs: number }) => postEvaluation(loopId!, a.kind, a.endMs),
    onSuccess: r => setRunId(r.analysisRunId),
  });
  const poll = useQuery({
    queryKey: ['cpm', 'evaluation', runId ?? ''],
    queryFn: ({ signal }) => getEvaluation(runId!, signal),
    enabled: !!runId,
    retry: false,
    refetchInterval: q => (expired || evaluationSettled(q.state.data, Date.now()) ? false : POLL_MS),
  });

  const posted: EvaluationRun | undefined = start.data?.analysisRunId === runId ? start.data : undefined;
  const run = poll.data?.analysisRunId === runId ? poll.data : posted;
  const settled = evaluationSettled(run, Date.now());
  const verdictRunId = openableVerdict(run);
  const refetch = poll.refetch;
  const checkAgain = useCallback(() => { setRound(n => n + 1); void refetch(); }, [refetch]);
  return {
    submit: (kind: EvaluationKind, endMs: number) => { setRunId(undefined); start.reset(); start.mutate({ kind, endMs }); },
    checkAgain,
    run,
    status: evaluationStatus(run),
    refusal: evaluationRefusal(start.error),
    /** The run's state could not be read; the run may still finish. */
    unreadable: !!runId && poll.isError,
    /** The client stopped polling a run that has not settled. */
    stillRunning: !!runId && expired && !settled,
    cached: !!posted?.cached || !!run?.cached,
    /** Finished AND its verdict row is stored: the only state with something to open. */
    verdictRunId,
    /** The job ended but no verdict row is stored (yet). */
    noResult: settled && run?.state === 'FINISHED' && !verdictRunId,
    busy: start.isPending || (!!runId && !settled),
    started: start.isPending || !!runId,
  };
}
