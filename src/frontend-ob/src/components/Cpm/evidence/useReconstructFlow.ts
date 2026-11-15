/**
 * CHG-188 (owner review 15): Reconstruct evidence in the workbench, from the click to the rebuilt charts. The dialog asks
 * first, then shows the run: Running from the click (cplm-api hands the job to Flink before it answers) until the manifest
 * lists the rebuild with a final readiness, then Done; 1.2 s later it closes by itself and the rebuilt charts show. A refusal,
 * a failed job, a rebuild with nothing in it, or no result in 5 minutes stays open with the reason and Retry.
 * Closing the dialog mid-run leaves the run going: the manifest keeps being polled, the page says the request was accepted
 * and lists the rebuild when it arrives, and the head's button reopens the progress.
 * CHG-099: a reconstruction is stored beside the retained proof, so the manifest poll stops when THAT reconstruction settles,
 * and only for the run it was asked for (navigating to another window drops it).
 * CHG-193 (final review M2-M4): after the 5-minute limit Keep waiting starts the wait again (the shown time still counts from
 * the click), so a second job is not the default; 30 minutes after the click the manifest and run-state reads stop. The
 * rebuilt view is switched to when Done is reached, so closing the dialog inside the Done delay no longer drops the switch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import { TERMINAL_RUN_STATES, reconstructionSettled, viewAfterRebuild } from './evidenceBasis';
import { RECONSTRUCT_POLL_CAP_MS, inFlight, reconstructionPhase } from './runPhase';
import { useAnalysisRunState, useEvidenceManifest, useReconstruct } from './useEvidence';
import { useAfterDone, useDeadline, useTick } from './useRunClock';

/** Manifest and run-state poll interval while a reconstruction is pending (plant: artifacts land in ~20 s). */
export const RECONSTRUCTION_POLL_MS = 10_000;

export function useReconstructFlow(methodRunId: string | undefined, onView: (analysisRunId: string) => void) {
  const reconstruct = useReconstruct(methodRunId);
  const [open, setOpen] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [waitFrom, setWaitFrom] = useState<number | null>(null);
  const pendingRun = reconstruct.isSuccess && reconstruct.data.reconstructs === methodRunId ? reconstruct.data.analysisRunId : undefined;
  const pastCap = useDeadline(startedAt, RECONSTRUCT_POLL_CAP_MS);
  const pollMs = pendingRun && !pastCap ? RECONSTRUCTION_POLL_MS : undefined;
  const runState = useAnalysisRunState(pendingRun, pollMs);
  const settled = useCallback((m: EvidenceManifest) => reconstructionSettled(m, pendingRun), [pendingRun]);
  const rawManifest = useEvidenceManifest(methodRunId, pollMs, pendingRun ? settled : undefined);
  const phase = reconstructionPhase({
    pending: reconstruct.isPending, error: reconstruct.error, analysisRunId: pendingRun, runState: runState.data,
    manifest: rawManifest.data, startedAt, waitFrom, nowMs: Date.now(),
  });
  const busy = inFlight(phase);
  useTick(busy);
  // the job ended: read the manifest now, not at the next poll, so Done follows the job by seconds
  const jobEnded = !!runState.data && TERMINAL_RUN_STATES.has(runState.data.state);
  useEffect(() => { if (jobEnded) void rawManifest.refetch(); }, [jobEnded]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Done seen while the dialog is open: switch to the rebuilt view now, and close the dialog after the delay
  const done = phase.step === 'DONE';
  const switched = useRef<string | undefined>();
  useEffect(() => {
    if (!done || !open || !pendingRun || switched.current === pendingRun) return;
    switched.current = pendingRun;
    const v = viewAfterRebuild(rawManifest.data, pendingRun);
    if (v) onView(v);
  }, [done, open, pendingRun]);   // eslint-disable-line react-hooks/exhaustive-deps
  useAfterDone(done && open, () => setOpen(false));

  return {
    rawManifest,
    /** The accepted reconstruction of the run on screen, while known. */
    pendingRun,
    runState,
    phase,
    startedAt,
    open,
    /** The request was accepted and the run is still going while the dialog is closed: the page says so. */
    runningUnseen: reconstruct.isSuccess && busy && !open,
    /** The refusal, for the page once the dialog is closed. */
    refusal: reconstruct.isError ? (reconstruct.error as Error).message : undefined,
    /** The head's button: a run in flight reopens its progress, otherwise the dialog asks first. */
    ask: () => { if (!busy) { reconstruct.reset(); setStartedAt(null); setWaitFrom(null); } setOpen(true); },
    /** Reconstruct, and Retry. */
    confirm: () => { const now = Date.now(); setStartedAt(now); setWaitFrom(now); reconstruct.mutate(); },
    /** After the time limit: wait again, with no new request. */
    keepWaiting: () => setWaitFrom(Date.now()),
    close: () => setOpen(false),
  };
}
