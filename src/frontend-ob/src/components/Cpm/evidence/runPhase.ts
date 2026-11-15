/**
 * CHG-188 (owner review 10.2, 15): the progress a run dialog shows (Evaluate a window, Reconstruct evidence). Only the states
 * the status APIs report: Queued and Running while the run is in flight, with the time since the click; Done, after which the
 * dialog closes by itself; Failed, with the reason and Retry. No percent: no API reports one. Pure (unit-tested).
 */
import type { EvidenceManifest } from '../../../api/cpm/evidence';

/** STARTING = the request is sent and no state is reported yet (the spinner and the time, no word). */
export type RunStep = 'IDLE' | 'STARTING' | 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
/** keepWaiting: the time limit passed and the job may still finish, so waiting again is offered before a second job. */
export interface RunPhase { step: RunStep; reason?: string; keepWaiting?: true }

export const IDLE: RunPhase = { step: 'IDLE' };

/** How long "Done" stays on screen before the dialog closes by itself. */
export const DONE_CLOSE_MS = 1200;

/** A reconstruction lands in ~20 s at the plant; one not settled after this is reported, with Keep waiting and Retry. */
export const RECONSTRUCT_TIMEOUT_MS = 5 * 60_000;

/** CHG-193 (final review M3): the page stops reading the manifest and the run state this long after the click. */
export const RECONSTRUCT_POLL_CAP_MS = 30 * 60_000;

export const inFlight = (p: RunPhase): boolean => p.step === 'STARTING' || p.step === 'QUEUED' || p.step === 'RUNNING';

/** "0:07", "1:30", "12:05": the time since the click, a duration (not a clock time). */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const JOB_ENDED_BADLY: ReadonlySet<string> = new Set(['FAILED', 'CANCELED', 'SUBMIT_FAILED']);

export interface ReconstructionInput {
  /** The request is in flight: cplm-api hands the job to Flink before it answers, so this is already Running. */
  pending: boolean;
  /** The request was refused. */
  error?: unknown;
  /** The accepted run, for the method run on screen. */
  analysisRunId?: string;
  /** The run's state (GET /analysis-runs/{id}). */
  runState?: { state: string; error?: string | null };
  manifest?: EvidenceManifest;
  /** When Reconstruct was clicked. */
  startedAt?: number | null;
  /** CHG-193: when the current wait began (the click, or the last Keep waiting); the time limit counts from here. */
  waitFrom?: number | null;
  nowMs: number;
}

/**
 * Running from the click until the manifest lists the rebuild with a final readiness, then Done. Failed: the request refused,
 * the job failed or was cancelled, the rebuild failed or produced nothing, or no result within RECONSTRUCT_TIMEOUT_MS of the
 * current wait (Keep waiting offered), or within RECONSTRUCT_POLL_CAP_MS of the click (the page stops asking).
 */
export function reconstructionPhase(i: ReconstructionInput): RunPhase {
  if (i.error) return { step: 'FAILED', reason: `Reconstruction refused: ${i.error instanceof Error ? i.error.message : String(i.error)}` };
  if (i.pending) return { step: 'RUNNING' };
  if (!i.analysisRunId) return IDLE;
  const r = i.manifest?.reconstructions?.find(x => x.analysisRunId === i.analysisRunId);
  if (r && r.readiness !== 'PENDING') {
    if (r.readiness === 'FAILED') return { step: 'FAILED', reason: r.artifacts.length > 0 ? 'A rebuilt chart failed verification.' : 'The reconstruction failed.' };
    if (r.readiness === 'NONE') return { step: 'FAILED', reason: r.state === 'UNTRACKED' ? 'Its outcome was not recorded.' : 'It produced no evidence for this run.' };
    return { step: 'DONE' };
  }
  const job = i.runState;
  if (job && JOB_ENDED_BADLY.has(job.state)) {
    const why = job.error ? `: ${job.error}` : '.';
    return { step: 'FAILED', reason: job.state === 'CANCELED' ? 'The reconstruction job was cancelled.' : `The reconstruction job failed${why}` };
  }
  if (i.startedAt != null && i.nowMs - i.startedAt >= RECONSTRUCT_POLL_CAP_MS) {
    return { step: 'FAILED', reason: 'No result after 30 minutes. It may still finish; open this window again later to see it.' };
  }
  const waitFrom = i.waitFrom ?? i.startedAt;
  if (waitFrom != null && i.nowMs - waitFrom > RECONSTRUCT_TIMEOUT_MS) {
    return { step: 'FAILED', reason: 'No result after 5 minutes. It may still finish; this page lists it when it arrives.', keepWaiting: true };
  }
  return { step: 'RUNNING' };
}
