'use client';

/**
 * CPLM Phase 7 — U11 Pipeline health (/cpm/pipeline).
 * Every required job is a row (a job the engine does not list reads MISSING), a job opens a read-only dialog,
 * and the end-to-end verification really round-trips a recompute on a reference loop. What the metrics proxy does
 * not carry reads "Not exposed", never an estimate. Build and engine identifiers sit under Technical details.
 */
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { EmptyState, PanelHead, QueryError, TonePill, WorkspaceHeader } from './shared';
import {
  useCpmLoops, useCpmPipelineStatus, useFleetRankings, usePipelineMetrics, useRecompute,
} from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import { Toggletip } from '../../ui/Toggletip';
import { TechnicalDetails } from '../../ui/TechnicalDetails';
import { JobDialog, jobLabel } from './pipeline/JobDialog';
import { TelemetryCard } from './pipeline/TelemetryCard';
import { VerificationCard } from './pipeline/VerificationCard';
import { PipelineTiles, JOBS_ID } from './pipeline/PipelineTiles';
import { NOT_EXPOSED, fmtAge, fmtUptime, mergeJobs, type JobRow } from './pipeline/mergeJobs';

export const CpmPipeline: React.FC = () => {
  const canManage = useAuthStore(s => s.hasPermission)('cpm.manage');

  const status = useCpmPipelineStatus();
  const metrics = usePipelineMetrics();
  // PH1: 200 = server max. "Last fused verdict" scans windowEnd across this page — the default top-50
  // confidence slice could miss the fleet's newest window and overstate staleness.
  const rankings = useFleetRankings(undefined, '12h', 'confidence', 200);   // CHG-089: 12h default
  const loopsQuery = useCpmLoops();

  const rows = useMemo(() => mergeJobs(metrics.data?.jobs ?? [], status.data?.jobs ?? []), [metrics.data, status.data]);
  const [open, setOpen] = useState<string | null>(null);
  const openRow: JobRow | undefined = rows.find(r => r.name === open);

  const lastVerdictEnd = useMemo(() => {
    const ends = (rankings.data?.loops ?? [])
      .map(l => l.windowEnd).filter((x): x is string => x != null).map(x => new Date(x).getTime());
    return ends.length ? Math.max(...ends) : null;
  }, [rankings.data]);
  const lastVerdictAgeMin = lastVerdictEnd != null ? Math.round((Date.now() - lastVerdictEnd) / 60_000) : null;

  // E2E verification: a real recompute round-trip. The reference loop is the SUBJECT of the round trip, the
  // first monitoring-enabled loop unless the setup dialog picks another.
  const [chosen, setChosen] = useState<string | undefined>();
  const refLoop = loopsQuery.data?.loops.find(l => l.monitoringEnabled) ?? loopsQuery.data?.loops[0];
  const loopId = chosen ?? refLoop?.loopId;
  const { submit, status: replayStatus, analysisRunId, reset } = useRecompute(loopId);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // PH2: elapsed is FROZEN when the replay finishes, so a finished round trip never reads like a running one.
  const [elapsedS, setElapsedS] = useState<number | null>(null);
  useEffect(() => {
    if (replayStatus?.finished && startedAt != null && elapsedS == null) setElapsedS(Math.round((Date.now() - startedAt) / 1000));
  }, [replayStatus?.finished, startedAt, elapsedS]);
  // The run may still be going while its state cannot be read, so the start stays blocked until it reports finished.
  const busy = submit.isPending || (submit.isSuccess && !replayStatus?.finished);
  const qc = useQueryClient();
  const [runLoop, setRunLoop] = useState<string | null>(null);

  return (
    <div className="cpm-screen">
      <WorkspaceHeader eyebrow="System" title="Pipeline Health"
        copy="The Flink/Kafka runtime that produces every verdict. This view is read-only; job lifecycle is owned by the supervisor." />

      <PipelineTiles rows={rows} statusLoaded={!!status.data} statusError={status.isError}
        engineAnswering={status.data?.jobManagerReachable} allRequiredRunning={status.data?.allRequiredRunning} />

      <section id={JOBS_ID} tabIndex={-1} className="cpm-surface">
        <PanelHead title="Observed jobs"
          help={<Toggletip variant="how-to" label="What this table leaves out">
            <p>Latency, backpressure and parallelism are not exposed by the proxy and are not estimated. A required job the engine does not list reads MISSING.</p>
          </Toggletip>} />
        {metrics.isLoading && <EmptyState title="Reading the analysis engine's job metrics…" />}
        {/* A failed read is stated as a failure, never as an empty list. */}
        {metrics.isError && <QueryError title="Analysis engine metrics unavailable" error={metrics.error} retry={() => void metrics.refetch()} />}
        {!metrics.isLoading && !metrics.isError && rows.length === 0 && (
          <EmptyState title={metrics.data?.jobManagerReachable === false ? 'The analysis engine did not answer' : 'No job metrics'}
            copy={metrics.data?.jobManagerReachable === false
              ? 'Its job list could not be read, so no job can be shown and new verdicts may be late. Retry; if it stays down, ask the system administrator to check the analysis engine.'
              : 'None of the required analysis jobs is listed yet — they may still be starting. Retry in a minute.'}
            action={{ label: 'Retry', onClick: () => void metrics.refetch() }} />
        )}
        {rows.length > 0 && (
          <div className="cpm-matrix-scroll">
            <table className="cpm-matrix">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Job</th><th>State</th><th>Uptime</th><th>Checkpoint age</th><th>OK / failed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name}>
                    <td style={{ textAlign: 'left' }}>
                      <button type="button" className="cpm-pipeline-open" onClick={() => setOpen(r.name)}>{jobLabel(r.name)}</button>
                      {!r.required && <span className="cpm-copy"> Not on the required list</span>}
                    </td>
                    <td><TonePill tone={r.running ? 'good' : 'bad'}>{r.state}</TonePill></td>
                    <td>{fmtUptime(r.uptimeSec)}</td>
                    <td>{fmtAge(r.checkpoint?.lastCompletedAgeSec)}</td>
                    <td>{r.checkpoint ? `${r.checkpoint.completed} / ${r.checkpoint.failed}` : NOT_EXPOSED}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {status.data && <TechnicalDetails items={[
          { label: 'JobManager address', value: status.data.jobManagerUrl },
          { label: 'JobManager answering', value: status.data.jobManagerReachable ? 'Yes' : 'No', mono: false },
          { label: 'Jobs the engine runs that are not required', value: status.data.unexpectedJobs.join(', ') || 'None', mono: false },
        ]} />}
      </section>

      <div className="cpm-grid-2">
        <TelemetryCard metrics={metrics.data} lastVerdictAgeMin={lastVerdictAgeMin} />
        <VerificationCard loopId={loopId} runLoopId={runLoop} started={submit.isSuccess}
          onRecheck={() => void qc.invalidateQueries({ queryKey: ['cpm', 'replay-status'] })} onLoop={setChosen} canManage={canManage} busy={busy}
          error={submit.isError ? ((submit.error as Error)?.message ?? 'unknown') : null}
          status={replayStatus} analysisRunId={analysisRunId} elapsedS={elapsedS}
          onRun={() => { reset(); setRunLoop(loopId ?? null); setStartedAt(Date.now()); setElapsedS(null); submit.mutate(); }} />
      </div>
      {openRow && <JobDialog job={openRow} onClose={() => setOpen(null)} />}
    </div>
  );
};

export default CpmPipeline;
