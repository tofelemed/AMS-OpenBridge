'use client';

/**
 * CPLM Phase 7 — U11 Pipeline Health (/cpm/pipeline). CHG-170 (owner review, the approved sample
 * docs/theme/redesign/samples/pipeline-health-proposal.html and the owner's answers of 11 Nov 2026):
 *
 * - Header: the eyebrow and the title (no ?); top right Jobs | Checkpoint history (`?view=history`, no counts) and How to read
 *   (a dialog that took the four ? and the "Not exposed" rows; it corrects the "read-only" claim).
 * - Four tiles (pipeline/PipelineTiles): Required jobs, Last fused verdict (the Overview's rule, read from GET fleet/kpis
 *   newestResultAt; with Stale and Never evaluated opening the Overview's drill-downs), Checkpoint age, Checkpoints ok / failed;
 *   each selects the job behind its number.
 * - Jobs: one list grouped Alarm · CPLM · Platform, then the jobs off the required list (pipeline/JobList), beside the selected
 *   job's panel (pipeline/JobPanel; a drawer below 1280 px) with the end-to-end verification under it.
 * - Checkpoint history: the same chart as before, the CPLM jobs; readings are taken whichever view shows.
 * - The engine-down state shows when the engine does not answer (rows used to come from the supervisor's list, so it never
 *   could); a failed metrics read keeps the last numbers and says once how old they are.
 *
 * Unchanged: the reads and their intervals (status 15 s, metrics 20 s, verdict 60 s), the verification's request, payload,
 * permission (cpm.manage) and states. Job lifecycle stays with the supervisor: this page never starts or stops a job.
 */
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { EmptyState, QueryError, WorkspaceHeader } from './shared';
import { useCpmLoops, useCpmPipelineStatus, useFleetRankings, usePipelineMetrics, useRecompute } from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import { useCpmScope } from './plantScope';
import { useFleetKpis } from './kpi/useFleetKpis';
import { kpiHref } from './cpaHref';
import { serviceName } from './loopName';
import { siteZone } from '../../cpa/siteTime';
import { zoneTag } from './events/eventTime';
import { ageText, fleetFreshness, type Freshness } from './verdictFreshness';
import { PipelineTiles } from './pipeline/PipelineTiles';
import { JobList, LIST_ID } from './pipeline/JobList';
import { JobPanel } from './pipeline/JobPanel';
import { VerificationCard } from './pipeline/VerificationCard';
import { CheckpointHistory, useCheckpointSamples } from './pipeline/CheckpointHistory';
import { PipelineHowToRead } from './pipeline/PipelineHowToRead';
import { newestVerdictLoop, rankedNewestEnd } from './pipeline/defaultLoop';
import { mergeJobs } from './pipeline/mergeJobs';

type View = 'jobs' | 'history';
const VIEWS: ReadonlyArray<{ value: View; label: string }> = [
  { value: 'jobs', label: 'Jobs' },
  { value: 'history', label: 'Checkpoint history' },
];
/** The fused window the verdict tile counts on: the Overview's default. */
const KIND = '12h';

const clock = (ms: number) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: siteZone() }).format(ms);

export const CpmPipeline: React.FC = () => {
  const canManage = useAuthStore(s => s.hasPermission)('cpm.manage');
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'history' ? 'history' : 'jobs';
  const setView = (v: View) => setParams(p => { if (v === 'history') p.set('view', v); else p.delete('view'); return p; }, { replace: true });
  const [guide, setGuide] = useState(false);
  const scope = useCpmScope();
  const plant = scope.active ? scope.params : undefined;

  const status = useCpmPipelineStatus();
  const metrics = usePipelineMetrics();
  const kpis = useFleetKpis({ ...scope.params, windowKind: KIND });
  // PH1: 200 = server max - the verification's default loop (the newest verdict) and, on a cplm-api before CHG-170, the tile
  const rankings = useFleetRankings(plant, KIND, 'confidence', 200);
  const loopsQuery = useCpmLoops();
  const samples = useCheckpointSamples(metrics.data);

  const rows = useMemo(() => mergeJobs(metrics.data?.jobs ?? [], status.data?.jobs ?? [], status.data?.otherJobs ?? []),
    [metrics.data, status.data]);
  // The metrics read says whether the JobManager answered; the status read only whether it listed a job.
  const engineAnswering = metrics.data ? metrics.data.jobManagerReachable : status.data?.jobManagerReachable;
  const engineDown = metrics.data?.jobManagerReachable === false;
  const firstReadFailed = metrics.isError && !metrics.data;
  const metricsStale = metrics.isError && !!metrics.data;
  const showRows = !firstReadFailed && !engineDown && rows.length > 0;

  // The selected job: page state, the first running job until one is picked; below 1280 px a pick opens the drawer.
  const [picked, setPicked] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const required = rows.filter(r => r.required);
  const selected = required.find(r => r.name === picked) ?? required.find(r => r.running) ?? required[0];
  const toList = () => {
    if (view !== 'jobs') setView('jobs');
    window.setTimeout(() => { const el = document.getElementById(LIST_ID); el?.scrollIntoView?.({ block: 'start' }); el?.focus(); }, 0);
  };
  // With no rows on screen (engine down, a failed first read) a tile moves to the list and its message instead.
  const select = (name: string) => {
    if (!showRows) { toList(); return; }
    setPicked(name); setDrawer(true); if (view !== 'jobs') setView('jobs');
  };

  // Last fused verdict: GET fleet/kpis newestResultAt by the Overview rule; an older cplm-api keeps the ranking's newest window.
  const fresh = fleetFreshness(kpis.data);
  const oldApi = !!kpis.data && fresh === undefined;
  const freshMs = (kpis.data?.basis.freshSeconds ?? 3600) * 1000;
  const fallbackEnd = oldApi && rankings.data ? rankedNewestEnd(rankings.data.loops) : undefined;
  const freshness: Freshness | undefined = fresh ?? (fallbackEnd === undefined ? undefined
    : fallbackEnd === null ? { at: null, ageMs: null, stale: false, freshMs }
      : { at: fallbackEnd, ageMs: Date.now() - fallbackEnd, stale: Date.now() - fallbackEnd > freshMs, freshMs });
  const linkScope = { ...scope.params, windowKind: KIND };

  // E2E verification: a real recompute round-trip on the loop with the newest verdict, unless the setup dialog picks another.
  const [chosen, setChosen] = useState<string | undefined>();
  const loops = loopsQuery.data?.loops;
  const fallbackLoop = rankings.isLoading ? undefined : (loops?.find(l => l.monitoringEnabled) ?? loops?.[0])?.loopId;
  const loopId = chosen ?? (rankings.data ? newestVerdictLoop(rankings.data.loops) : undefined) ?? fallbackLoop;
  const loopReason = loopId ? null : rankings.isLoading ? 'Finding the loop with the newest verdict…'
    : loopsQuery.isLoading ? 'Reading the loops…' : 'No loop is registered yet';
  const nameOf = (id: string) => {
    const l = loops?.find(x => x.loopId.toLowerCase() === id.toLowerCase());
    return l ? serviceName(l) : '';
  };
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
  const retry = () => { void metrics.refetch(); void status.refetch(); };

  return (
    <div className="cpm-screen cpm-pipeline">
      <WorkspaceHeader eyebrow="System" title="Pipeline Health"
        actions={<>
          <SegmentedControl<View> label="Pipeline Health view" ignoreReselect value={view} onChange={setView} options={VIEWS} />
          <ObcButton variant="flat" onClick={() => setGuide(true)}>How to read</ObcButton>
        </>} />

      {metricsStale && metrics.data && (
        <div className="cpm-pipeline-stale" role="status">
          <b className="cpm-pipeline-glyph cpm-pill--warn" aria-hidden>◐</b>
          <span>{`Engine metrics could not be read · the numbers are from ${clock(Date.parse(metrics.data.collectedAt))} ${zoneTag(Date.parse(metrics.data.collectedAt))}, ${ageText(Date.now() - Date.parse(metrics.data.collectedAt))} ago`}</span>
          <ObcButton variant="flat" onClick={retry}>Retry</ObcButton>
        </div>
      )}

      <PipelineTiles rows={rows} statusLoaded={!!status.data} statusError={status.isError} engineAnswering={engineAnswering}
        numbersRead={!!metrics.data && !engineDown} onSelect={select} onList={toList}
        verdict={{
          freshness, loading: kpis.isLoading || (oldApi && rankings.isLoading),
          failed: (kpis.isError && !kpis.data) || (oldApi && rankings.isError && !rankings.data),
          stale: kpis.data?.states.stale ?? null, neverEvaluated: kpis.data?.states.neverEvaluated ?? null,
          staleHref: kpiHref('stale', linkScope), neverHref: kpiHref('never-evaluated', linkScope),
        }} />

      {view === 'jobs' ? (
        <div className="cpm-master-detail cpm-pipeline-md">
          <JobList rows={rows} selected={selected?.name ?? null} onSelect={select} showRows={showRows}
            engine={status.data ? { jobManagerUrl: status.data.jobManagerUrl, unexpectedJobs: status.data.unexpectedJobs } : undefined}
            notices={<>
              {metrics.isLoading && <EmptyState title="Reading the analysis engine's job metrics…" />}
              {/* A failed read is stated as a failure, never as an empty list. */}
              {firstReadFailed && <QueryError title="Analysis engine metrics unavailable" error={metrics.error} retry={() => void metrics.refetch()} />}
              {engineDown && (
                <EmptyState title="The analysis engine did not answer"
                  copy="Its job list could not be read, so no job can be shown and new verdicts may be late. Retry; if it stays down, ask the system administrator to check the analysis engine."
                  action={{ label: 'Retry', onClick: retry }} />
              )}
              {!metrics.isLoading && !firstReadFailed && !engineDown && rows.length === 0 && (
                <EmptyState title="No job metrics" copy="None of the required analysis jobs is listed yet — they may still be starting. Retry in a minute."
                  action={{ label: 'Retry', onClick: retry }} />
              )}
            </>} />
          <div className="cpm-pipeline-col">
            {showRows && selected && <JobPanel key={selected.name} job={selected} open={drawer} onClose={() => setDrawer(false)} />}
            <VerificationCard loopId={loopId} loopReason={loopReason} runLoopId={runLoop} nameOf={nameOf} started={submit.isSuccess}
              pending={submit.isPending}
              onRecheck={() => void qc.invalidateQueries({ queryKey: ['cpm', 'replay-status'] })} onLoop={setChosen} canManage={canManage} busy={busy}
              error={submit.isError ? ((submit.error as Error)?.message ?? 'unknown') : null}
              status={replayStatus} analysisRunId={analysisRunId} elapsedS={elapsedS}
              onRun={() => { reset(); setRunLoop(loopId ?? null); setStartedAt(Date.now()); setElapsedS(null); submit.mutate(); }} />
          </div>
        </div>
      ) : <CheckpointHistory samples={samples} />}

      <PipelineHowToRead open={guide} onClose={() => setGuide(false)}
        freshMinutes={Math.round(freshMs / 60_000)} windowKind={kpis.data?.basis.windowKind ?? KIND} />
    </div>
  );
};

export default CpmPipeline;
