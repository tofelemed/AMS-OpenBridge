'use client';

/**
 * CPLM Phase 7 — U11 Pipeline health (/cpm/pipeline).
 * Replaces the fabricated SystemMonitor (hardcoded job names, invented
 * latencies, a dead /health/pipeline endpoint) with what the runtime actually
 * reports: required-job states from pipeline-status, checkpoint statistics
 * from the DG-1 metrics proxy, an E2E verification that really round-trips a
 * recompute, and a delivery-path strip aged from real result timestamps.
 * Metrics Flink does not expose here (latency, backpressure, watermark lag)
 * are stated as unavailable — never estimated.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KpiTile, KvRow, PanelHead, TonePill, WorkspaceHeader, cpmChartColors,
} from './shared';
import {
  useCpmLoops, useCpmPipelineStatus, useFleetRankings, usePipelineMetrics, useRecompute,
} from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import { useObcTheme } from '../../hooks/useObcTheme';

const fmtUptime = (sec: number | null | undefined) => {
  if (sec == null) return '—';
  const d = Math.floor(sec / 86400); const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const fmtBytes = (n: number | null | undefined) => {
  if (n == null) return '—';
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
};

/** One telemetry sample accumulated client-side while the page is open. */
interface TelemetrySample { t: number; ckptAgeSec: number | null; ckptDurMs: number | null }

export const CpmPipeline: React.FC = () => {
  const hasPermission = useAuthStore(s => s.hasPermission);
  const canManage = hasPermission('cpm.manage');

  const status = useCpmPipelineStatus();
  const metrics = usePipelineMetrics();
  const rankings = useFleetRankings();
  const loopsQuery = useCpmLoops();

  const jobs = useMemo(() => metrics.data?.jobs ?? [], [metrics.data]);
  const statusJobs = status.data?.jobs ?? [];
  const runningCount = statusJobs.filter(j => j.running).length;

  const ckptCompleted = jobs.reduce((a, j) => a + (j.checkpoint?.completed ?? 0), 0);
  const ckptFailed = jobs.reduce((a, j) => a + (j.checkpoint?.failed ?? 0), 0);
  const ckptSuccessPct = ckptCompleted + ckptFailed > 0
    ? (100 * ckptCompleted) / (ckptCompleted + ckptFailed) : null;
  const managedState = jobs.reduce((a, j) => a + (j.checkpoint?.lastSizeBytes ?? 0), 0);

  // Last real result delivery: newest fused window end across the fleet.
  const lastVerdictEnd = useMemo(() => {
    const ends = (rankings.data?.loops ?? [])
      .map(l => l.windowEnd).filter((x): x is string => x != null)
      .map(x => new Date(x).getTime());
    return ends.length ? Math.max(...ends) : null;
  }, [rankings.data]);
  const lastVerdictAgeMin = lastVerdictEnd != null
    ? Math.round((Date.now() - lastVerdictEnd) / 60_000) : null;

  // Telemetry accumulated only while this page is open — we have no server-side
  // metrics history, and pretending otherwise is how SystemMonitor lied.
  const [telemetry, setTelemetry] = useState<TelemetrySample[]>([]);
  const lastCollectedRef = useRef<string | null>(null);
  useEffect(() => {
    const d = metrics.data;
    if (!d || d.collectedAt === lastCollectedRef.current) return;
    lastCollectedRef.current = d.collectedAt;
    const cplm = d.jobs.filter(j => j.role === 'cplm' && j.checkpoint);
    const age = cplm.length
      ? Math.max(...cplm.map(j => j.checkpoint!.lastCompletedAgeSec ?? 0)) : null;
    const dur = cplm.length
      ? Math.max(...cplm.map(j => j.checkpoint!.lastDurationMs ?? 0)) : null;
    setTelemetry(prev => [...prev.slice(-119), { t: new Date(d.collectedAt).getTime(), ckptAgeSec: age, ckptDurMs: dur }]);
  }, [metrics.data]);

  const obcTheme = useObcTheme(); // C: re-derive chart colors on theme switch
  const telemetryOption = useMemo(() => {
    const { good, amber, grey } = cpmChartColors();
    return {
      animation: false,
      grid: { left: 48, right: 48, top: 24, bottom: 24 },
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: grey }, top: 0 },
      xAxis: { type: 'time', axisLabel: { color: grey } },
      yAxis: [
        { type: 'value', name: 'ckpt age (s)', axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
        { type: 'value', name: 'ckpt dur (ms)', axisLabel: { color: grey }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Max checkpoint age', type: 'line', symbol: 'none',
          lineStyle: { color: good, width: 2 }, data: telemetry.map(s => [s.t, s.ckptAgeSec]) },
        { name: 'Max checkpoint duration', type: 'line', symbol: 'none', yAxisIndex: 1,
          lineStyle: { color: amber, width: 1.5 }, data: telemetry.map(s => [s.t, s.ckptDurMs]) },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- obcTheme is a recompute trigger: chart colors are read from CSS vars that change with the theme.
  }, [telemetry, obcTheme]);

  // E2E verification: a real recompute round-trip on a reference loop.
  const refLoop = loopsQuery.data?.loops.find(l => l.monitoringEnabled) ?? loopsQuery.data?.loops[0];
  const { submit, status: replayStatus, reset } = useRecompute(refLoop?.loopId);
  const [e2eStartedAt, setE2eStartedAt] = useState<number | null>(null);
  const e2eBusy = submit.isPending || (replayStatus != null && !replayStatus.finished);

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Runtime internals"
        title="Pipeline health"
        copy="The Flink/Kafka runtime that produces every verdict. This view is read-only; job lifecycle is owned by the supervisor."
        actions={status.data && (
          <TonePill tone={status.data.allRequiredRunning ? 'good' : 'bad'}>
            {runningCount}/{statusJobs.length} REQUIRED JOBS RUNNING
          </TonePill>
        )}
      />

      <div className="cpm-kpi-row">
        <KpiTile caption="Required jobs" tone={status.data?.allRequiredRunning ? 'good' : 'bad'}
          value={status.data ? `${runningCount}/${statusJobs.length}` : '…'}
          sub={status.data?.jobManagerReachable ? 'JobManager reachable' : 'JobManager unreachable'} />
        <KpiTile caption="Checkpoint success" tone={ckptSuccessPct != null && ckptSuccessPct >= 99 ? 'good' : 'warn'}
          value={ckptSuccessPct != null ? `${ckptSuccessPct.toFixed(1)}%` : '—'}
          sub={`${ckptCompleted.toLocaleString()} ok · ${ckptFailed} failed (since job start)`} />
        <KpiTile caption="Managed state" tone="muted"
          value={managedState > 0 ? fmtBytes(managedState) : '—'}
          sub="sum of last completed checkpoints" />
        <KpiTile caption="Watermark lag" tone="muted" value="—"
          sub="not exposed by the metrics proxy" />
        <KpiTile caption="Kafka consumer lag" tone="muted" value="—"
          sub="not exposed by the metrics proxy" />
      </div>

      <section className="cpm-surface">
        <PanelHead eyebrow="Required jobs" title="One row per supervised job"
          right={<span className="cpm-copy">
            Latency / backpressure / parallelism are not exposed by the proxy — shown as “—”, not estimated.
          </span>} />
        {metrics.isLoading && <EmptyState title="Reading Flink metrics…" />}
        {!metrics.isLoading && jobs.length === 0 && (
          <EmptyState title="No job metrics"
            copy={metrics.data?.jobManagerReachable === false
              ? 'The Flink JobManager did not answer.' : 'No required jobs matched the overview.'} />
        )}
        {jobs.length > 0 && (
          <div className="cpm-matrix-scroll">
            <table className="cpm-matrix">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Job</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Uptime</th>
                  <th>Ckpts ok/failed</th>
                  <th>Last ckpt age</th>
                  <th>Last ckpt duration</th>
                  <th>State size</th>
                  <th>Latency</th>
                  <th>Backpressure</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.jid}>
                    <td style={{ textAlign: 'left' }}><strong>{j.name.replace('AMS - ', '')}</strong></td>
                    <td><TonePill tone="muted">{j.role.toUpperCase()}</TonePill></td>
                    <td><TonePill tone={j.state === 'RUNNING' ? 'good' : 'bad'}>{j.state}</TonePill></td>
                    <td>{fmtUptime(j.uptimeSec)}</td>
                    <td>{j.checkpoint ? `${j.checkpoint.completed} / ${j.checkpoint.failed}` : '—'}</td>
                    <td>{j.checkpoint?.lastCompletedAgeSec != null ? `${j.checkpoint.lastCompletedAgeSec}s` : '—'}</td>
                    <td>{j.checkpoint?.lastDurationMs != null ? `${j.checkpoint.lastDurationMs}ms` : '—'}</td>
                    <td>{fmtBytes(j.checkpoint?.lastSizeBytes)}</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead eyebrow="Runtime telemetry" title="Checkpoint behaviour while this page is open"
            right={<span className="cpm-copy">{telemetry.length} sample(s) · 20 s cadence</span>} />
          <p className="cpm-copy">
            There is no server-side history for these metrics; the chart accumulates live
            snapshots from the moment this page opened — it does not pretend to know the past.
          </p>
          {telemetry.length < 2
            ? <EmptyState title="Collecting…" copy="Two or more polls are needed before a line makes sense." />
            : <ReactECharts option={telemetryOption} style={{ height: 220 }} notMerge />}
        </section>

        <section className="cpm-surface">
          <PanelHead eyebrow="End-to-end verification" title="Prove the pipeline with a real round trip"
            right={replayStatus && (
              <TonePill tone={replayStatus.finished ? (replayStatus.succeeded ? 'good' : 'bad') : 'warn'}>
                {replayStatus.finished ? (replayStatus.succeeded ? 'VERIFIED' : `FAILED (${replayStatus.state})`) : replayStatus.state}
              </TonePill>
            )} />
          <p className="cpm-copy">
            Submits an A8 recompute on <strong>{refLoop?.loopId ?? '—'}</strong> and waits for the
            batch verdict: historian read → normalize → gates → fused result in Postgres.
            {!canManage && ' Requires the cpm.manage permission.'}
          </p>
          <div className="cpm-filter-row">
            <ObcButton variant="raised" disabled={!refLoop || !canManage || e2eBusy}
              onClick={() => { reset(); setE2eStartedAt(Date.now()); submit.mutate(); }}>
              {e2eBusy ? 'Verifying…' : 'Run E2E verification'}
            </ObcButton>
            {submit.isError && (
              <span className="cpm-field__error">
                Failed to start: {(submit.error as Error)?.message ?? 'unknown'}
              </span>
            )}
          </div>
          {replayStatus?.finished && e2eStartedAt != null && (
            <KvRow label="Round trip">
              {replayStatus.succeeded ? 'Completed' : 'Failed'} in{' '}
              {Math.round((Date.now() - e2eStartedAt) / 1000)}s · replay {replayStatus.replayId}
            </KvRow>
          )}

          <PanelHead eyebrow="Result delivery path" title="Where a sample becomes a verdict" />
          <div className="cpm-lineage">
            <div className="cpm-lineage__node">
              <span className="cpm-eyebrow">Source</span><span>DCS / edge → Kafka</span>
            </div>
            <span className="cpm-lineage__arrow">→</span>
            <div className="cpm-lineage__node">
              <span className="cpm-eyebrow">Compute</span>
              <span>Flink · {jobs.filter(j => j.role === 'cplm' && j.state === 'RUNNING').length} CPLM job(s) running</span>
            </div>
            <span className="cpm-lineage__arrow">→</span>
            <div className="cpm-lineage__node">
              <span className="cpm-eyebrow">Store</span><span>Postgres + IoTDB</span>
            </div>
            <span className="cpm-lineage__arrow">→</span>
            <div className="cpm-lineage__node">
              <span className="cpm-eyebrow">Last fused verdict</span>
              <span>{lastVerdictAgeMin != null
                ? `window ended ${lastVerdictAgeMin < 120 ? `${lastVerdictAgeMin} min` : `${Math.round(lastVerdictAgeMin / 60)} h`} ago`
                : 'none stored yet'}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CpmPipeline;
