/**
 * CHG-102 Phase 5c: the pure part of "Evaluate a window" - the requested window, and what to tell the engineer about a
 * run's state or a refusal, in plain words (tested).
 */
import { ApiError } from '../../../api/apiFetch';
import { EVALUATION_KIND_MS, floorTo15Min, type EvaluationKind, type EvaluationRun } from '../../../api/cpm/evaluation';
import { fromSiteInput } from '../../../cpa/siteTime';

export const EVALUATION_TERMINAL: ReadonlySet<string> = new Set(['FINISHED', 'FAILED']);

/** How long a FINISHED run is still polled for its verdict row (the result topic can trail the status topic). */
export const VERDICT_WAIT_MS = 60_000;

/** True once the run needs no more polling: FAILED, or FINISHED with its verdict stored (or waited for long enough). */
export function evaluationSettled(run: EvaluationRun | undefined, nowMs: number): boolean {
  if (!run || !EVALUATION_TERMINAL.has(run.state)) return false;
  if (run.state === 'FAILED') return true;
  if ((run.gateResults ?? 0) > 0) return true;
  const done = run.finishedAt ? Date.parse(run.finishedAt) : NaN;
  return Number.isFinite(done) && nowMs - done > VERDICT_WAIT_MS;
}

/** The fused run to open: only once the run is FINISHED and its verdict row is stored. */
export const openableVerdict = (run: EvaluationRun | undefined): string | undefined =>
  run?.state === 'FINISHED' && (run.gateResults ?? 0) > 0 ? run.verdictMethodRunId ?? undefined : undefined;

/** The window end the API will use: the picked site date-time (or now), on the 15-min grid, never in the future. */
export function requestedEnd(input: string, nowMs: number): number {
  const picked = input ? fromSiteInput(input) : NaN;
  const end = Number.isFinite(picked) ? Math.min(picked, nowMs) : nowMs;
  return floorTo15Min(end);
}

export const requestedStart = (endMs: number, kind: EvaluationKind) => endMs - EVALUATION_KIND_MS[kind];

export type EvaluationTone = 'muted' | 'warn' | 'good' | 'bad';

const FAILURES: [RegExp, string][] = [
  [/^NO_HISTORIAN_DATA/, 'The historian holds no samples for this loop in that window.'],
  [/^HISTORIAN_UNAVAILABLE/, 'The historian did not answer. Try again in a minute.'],
  [/^TOO_MANY_ROWS/, 'The window holds more samples than one evaluation reads. Pick a shorter window.'],
  [/^REQUEST_EXPIRED/, 'The evaluation job picked the request up too late (it was busy or restarting). Evaluate again.'],
  [/^NO_RESPONSE_FROM_EVALUATION_JOB/, 'The evaluation job did not answer. It may not be running - ask an administrator to check the "CPLM On-Demand Evaluation" Flink job.'],
  [/^UNSUPPORTED_MODE/, 'The evaluation job does not support this request. The job and the server versions differ.'],
];

/** One line for a run's state; the reason in plain words when it failed. */
export function evaluationStatus(run: EvaluationRun | undefined): { tone: EvaluationTone; text: string } | null {
  if (!run) return null;
  switch (run.state) {
    case 'QUEUED': return { tone: 'muted', text: 'Queued for the evaluation job…' };
    case 'RUNNING': return { tone: 'warn', text: 'Evaluating from the historian…' };
    case 'FINISHED': {
      const samples = run.samples != null ? `${run.samples.toLocaleString()} samples` : null;
      const secs = run.elapsedMs != null ? `${(run.elapsedMs / 1000).toFixed(1)} s` : null;
      const detail = [samples, secs].filter(Boolean).join(', ');
      return { tone: 'good', text: run.cached ? 'Evaluated earlier - the stored result is shown.' : `Evaluated${detail ? ` (${detail})` : ''}.` };
    }
    case 'FAILED': {
      const e = run.error ?? '';
      const hit = FAILURES.find(([re]) => re.test(e));
      return { tone: 'bad', text: hit ? hit[1] : `The evaluation failed${e ? `: ${e}` : '.'}` };
    }
    default: return { tone: 'muted', text: run.state };
  }
}

const REFUSALS: Record<string, string> = {
  INVALID_WINDOW: 'That window cannot be evaluated: it ends in the future or starts before the historian\'s retention.',
  TOO_MANY_EVALUATIONS_IN_FLIGHT: 'You already have 3 evaluations running. Wait for one to finish.',
  ON_DEMAND_DISABLED: 'On-demand evaluation is turned off on this server.',
  SITE_OUT_OF_SCOPE: 'This loop is outside your plant scope.',
  ANALYSIS_RUN_SUBMIT_FAILED: 'The request could not be handed to the evaluation job (Kafka). Try again.',
};

/** A refused POST in plain words. */
export function evaluationRefusal(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    const code = error.detail ?? '';
    return REFUSALS[code] ?? (error.status === 403 ? 'You are not allowed to start an evaluation.' : `The evaluation could not start: ${error.message}`);
  }
  return `The evaluation could not start: ${error instanceof Error ? error.message : String(error)}`;
}
