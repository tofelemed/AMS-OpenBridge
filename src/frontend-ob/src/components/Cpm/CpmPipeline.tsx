'use client';

/**
 * CPLM Phase 7 — U11 Pipeline health (/cpm/pipeline).
 * Every required job is a row (a job the engine does not list reads MISSING), a job opens a read-only dialog,
 * and the end-to-end verification really round-trips a recompute on a reference loop. What the metrics proxy does
 * not carry reads "Not exposed", never an estimate. Build and engine identifiers sit under Technical details.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { EmptyState, KpiTile, PanelHead, QueryError, TonePill, WorkspaceHeader } from './shared';
import {
  useCpmLoops, useCpmPipelineStatus, useFleetRankings, usePipelineMetrics, useRecompute,
} from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import { Toggletip } from '../../ui/Toggletip';
import { TechnicalDetails } from '../../ui/TechnicalDetails';
import { JobDialog, jobLabel } from './pipeline/JobDialog';
import { TelemetryCard } from './pipeline/TelemetryCard';
import { VerificationCard } from './pipeline/VerificationCard';
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
  const runningCount = rows.filter(r => r.running).length;

  const observed = rows.filter(r => r.checkpoint);
  const ckptOk = observed.reduce((a, r) => a + r.checkpoint!.completed, 0);
  const ckptFailed = observed.reduce((a, r) => a + r.checkpoint!.failed, 0);
  const ages = observed.map(r => r.checkpoint!.lastCompletedAgeSec).filter((x): x is number => x != null);
  const oldestAge = ages.length ? Math.max(...ages) : null;

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
  const busy = submit.isPending || (replayStatus != null && !replayStatus.finished);

  const statusTone = status.isError ? 'warn' : status.data?.allRequiredRunning ? 'good' : 'bad';
  return (
    <div className="cpm-screen">
      <WorkspaceHeader title="Pipeline health"
        copy="The Flink/Kafka runtime that produces every verdict. This view is read-only; job lifecycle is owned by the supervisor." />

      <div className="cpm-kpi-row">
        {/* PH3: a failed status query must not sit at '…' forever. */}
        <KpiTile caption="Required jobs" tone={statusTone}
          value={status.isError ? '—' : status.data ? `${runningCount}/${rows.length}` : '…'}
          sub={status.isError ? 'status endpoint unreachable'
            : status.data?.jobManagerReachable ? 'analysis engine answering' : 'analysis engine not answering'} />
        <KpiTile caption="Checkpoint age" tone="muted" value={oldestAge != null ? fmtAge(oldestAge) : NOT_EXPOSED} sub="oldest last checkpoint" />
        <KpiTile caption="Checkpoints ok / failed" tone={observed.length > 0 && ckptFailed === 0 ? 'good' : 'warn'}
          value={observed.length > 0 ? `${ckptOk.toLocaleString()} / ${ckptFailed}` : NOT_EXPOSED} sub="since job start" />
      </div>

      <section className="cpm-surface">
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
        <VerificationCard loopId={loopId} onLoop={setChosen} canManage={canManage} busy={busy}
          error={submit.isError ? ((submit.error as Error)?.message ?? 'unknown') : null}
          status={replayStatus} analysisRunId={analysisRunId} elapsedS={elapsedS}
          onRun={() => { reset(); setStartedAt(Date.now()); setElapsedS(null); submit.mutate(); }} />
      </div>
      {openRow && <JobDialog job={openRow} onClose={() => setOpen(null)} />}
    </div>
  );
};

export default CpmPipeline;
