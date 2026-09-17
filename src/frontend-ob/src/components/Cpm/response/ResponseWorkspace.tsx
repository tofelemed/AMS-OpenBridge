/**
 * v2.5 Task 2E.5 (spec §2, §3.1; NR-034, NR-035): the System Response workspace. Route
 * /cpm/response?loop=&event= (or &methodRun= from the G12 evidence view). Left: the loop's events,
 * newest first (censored candidates on request). Centre: the result card, then the event's response
 * chart, residuals, candidate models, frequency response - all from the kernel's artifacts. Right: the
 * event's steps and quantities, the loop's model history with the server-owned review.
 * 2026-09-17 audit F5/F19/F20: lands like every CPM page (scope filter + loop search), every centre
 * panel keeps its height as a skeleton while it loads, the censored candidates are counted not listed.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError, WorkspaceHeader } from '../shared';
import { LoopCombobox } from '../LoopCombobox';
import { PlantScopeFilter, useCpmScope } from '../plantScope';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';
import { useEvidenceManifest, useMethodRun } from '../evidence/useEvidence';
import { useGateArtifacts } from '../evidence/useGateArtifacts';
import { siteZoneOf } from '../evidence/timezone';
import { EventList } from './EventList';
import { ResultCard } from './ResultCard';
import { EventAside } from './EventAside';
import { ResponseChart } from './ResponseChart';
import { ResidualPanel } from './ResidualPanel';
import { CandidateModelsTable } from './CandidateModelsTable';
import { BodePanel } from './BodePanel';
import { ModelHistoryBody } from './ModelHistory';
import { ModelReviewDialog } from './ModelReviewDialog';
import { useModels, useResponseEvent, useResponseEvents, useReviewModel } from './useResponse';

export const responseHref = (loopId: string, eventId?: string) => `/cpm/response?loop=${encodeURIComponent(loopId)}${eventId ? `&event=${encodeURIComponent(eventId)}` : ''}`;

export const ResponseWorkspace: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const loopId = params.get('loop')?.trim() || undefined;
  const eventParam = params.get('event')?.trim() || undefined;
  const methodRunParam = params.get('methodRun')?.trim() || undefined;

  const scope = useCpmScope();
  const loops = useCpmLoops();
  const loopList = useMemo(() => loops.data?.loops ?? [], [loops.data]);
  const loop = loopList.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const timeZone = siteZoneOf(loop);
  const canReview = useAuthStore(s => s.hasPermission('cpm.model.review'));

  // audit F20: censored candidates are most of the table; they are counted, and listed only on request
  const [showCensored, setShowCensored] = useState(false);
  const events = useResponseEvents(loopId, 'LIVE', showCensored);
  const flat = useMemo(() => events.data?.pages.flatMap(p => p.events) ?? [], [events.data]);
  const censoredCount = events.data?.pages[0]?.censoredCount ?? 0;
  // a G12 view links by method run: resolve it to its event once, then navigate to the event id
  const runLookup = useMethodRun(!eventParam && methodRunParam ? methodRunParam : undefined);
  useEffect(() => {
    const id = runLookup.data?.result?.event_id;
    if (!eventParam && loopId && typeof id === 'string' && id) navigate(responseHref(loopId, id), { replace: true });
  }, [runLookup.data, eventParam, loopId, navigate]);

  const selected: ResponseEventSummary | undefined = flat.find(e => e.eventId === eventParam);
  const detail = useResponseEvent(eventParam);
  // a deep link to a censored candidate: list it rather than leave the selection invisible
  useEffect(() => {
    if (eventParam && !selected && !showCensored && events.isSuccess && censoredCount > 0 && detail.data?.result.capture_state === 'CENSORED') setShowCensored(true);
  }, [eventParam, selected, showCensored, events.isSuccess, censoredCount, detail.data]);

  const methodRunId = selected?.methodRunId ?? (detail.data?.result.method_run_id as string | undefined);
  const manifest = useEvidenceManifest(methodRunId, 15_000);
  const arts = useGateArtifacts(manifest.data, 'G12');
  const models = useModels(loopId);
  const review = useReviewModel(loopId);
  const [reviewing, setReviewing] = useState<SystemModel | null>(null);
  useEffect(() => { if (review.isSuccess) setReviewing(null); }, [review.isSuccess]);

  const picker = (
    <section className="cpm-surface cpm-evidence-toolbar">
      {/* the combobox states the in-scope count itself; a second count beside the filter was noise */}
      <PlantScopeFilter scope={scope} />
      <div className="cpm-toolbar">
        <LoopCombobox scope={scope} loops={loopList} value={loopId ?? ''}
          onChange={id => setParams(p => { p.set('loop', id); p.delete('event'); p.delete('methodRun'); return p; })}
          onClear={() => setParams(p => { p.delete('loop'); p.delete('event'); p.delete('methodRun'); return p; })} />
      </div>
    </section>
  );

  if (!loopId) {
    return (
      <div className="cpm-screen">
        <WorkspaceHeader eyebrow="Loop performance" title="System response" copy="Pick a loop to read its response events: the model the kernel estimated from each step, the fit and its residuals, the candidate models and the loop's model history." />
        {picker}
        {loops.isError && <QueryError error={loops.error} retry={() => void loops.refetch()} />}
        <EmptyState title="Pick a loop" copy="Its response events appear on the left, newest first; select one to read the model and the evidence behind it. From the workbench, a G12 view opens here on its own event." />
      </div>
    );
  }

  const result = detail.data?.result;
  const t0Ms = selected?.t0Ms ?? (result?.window_start_ms as number | undefined) ?? 0;
  const healthExclusions = Array.isArray(result?.health_exclusions) ? (result!.health_exclusions as string[]) : [];
  const one = (k: string) => arts.byKind[k]?.[0];
  const eventLoading = !!eventParam && (detail.isLoading || (manifest.isLoading && !manifest.data));
  const decoding = arts.loading;

  return (
    <div className="cpm-screen cpm-response-workspace">
      <WorkspaceHeader eyebrow="Loop performance" title={`System response — ${loop?.displayName ?? loopId}`}
        copy={`Site zone ${timeZone}. Every event is listed with its state and reason; the selection is explicit and never "latest".`}
        actions={<ObcButton variant="flat" onClick={() => navigate('/cpm/response')}>Change loop</ObcButton>} />
      {picker}
      <div className="cpm-response-columns">
        <EventList events={flat} selectedId={eventParam} timeZone={timeZone} loading={events.isLoading || events.isFetchingNextPage}
          hasMore={!!events.hasNextPage} onMore={() => void events.fetchNextPage()} onSelect={e => navigate(responseHref(loopId, e.eventId))}
          censoredCount={censoredCount} showCensored={showCensored} onToggleCensored={setShowCensored} />

        <main className="cpm-response-centre" aria-busy={eventLoading || decoding || undefined}>
          {events.isError && <QueryError error={events.error} retry={() => void events.refetch()} />}
          {!eventParam && !methodRunParam && <EmptyState title="No event selected" copy="Choose an event on the left. Its result, chart, residuals, candidate models and Bode data are the kernel's artifacts for that method run." />}
          {!eventParam && methodRunParam && (runLookup.isError ? <QueryError error={runLookup.error} /> : <EmptyState title="Resolving the method run to its event…" />)}
          {eventParam && detail.isError && <QueryError error={detail.error} retry={() => void detail.refetch()} />}
          {eventParam && !detail.isError && <ResultCard result={result} metrics={detail.data?.metrics} loading={detail.isLoading} />}
          {eventParam && manifest.isError && <QueryError title="Evidence manifest unavailable" error={manifest.error} retry={() => void manifest.refetch()} />}
          {eventParam && !manifest.isError && !manifest.data && (
            <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" role="status" aria-busy="true" aria-label="Loading the evidence manifest">
              <span className="cpm-skeleton__label">Loading the evidence manifest…</span>
            </div>
          )}
          {eventParam && manifest.data && (
            <>
              <ResponseChart arts={arts} timeZone={timeZone} t0Ms={t0Ms} healthExclusions={healthExclusions} />
              <ResidualPanel residuals={one('residuals')} acf={one('residual_acf')} timeZone={timeZone} validation={result?.subgates?.E} loading={decoding} />
              <CandidateModelsTable table={one('candidate_models')} delayCurve={one('delay_objective_curve')} intervals={one('parameter_intervals')} rejections={one('rejection_reasons')} loading={decoding} />
              <BodePanel bode={one('bode')} metrics={detail.data?.metrics} controller={result?.subgates?.F} loading={decoding} />
            </>
          )}
          {eventParam && manifest.data && manifest.data.readiness !== 'COMPLETE' && (
            <p className="cpm-copy" role="status">Evidence readiness: {manifest.data.readiness} ({manifest.data.count} artifact(s)). The manifest refreshes while artifacts arrive.</p>
          )}
        </main>

        <aside className="cpm-response-detail">
          {eventParam && result && (
            <EventAside result={result} metrics={detail.data?.metrics} timeZone={timeZone} methodRunId={methodRunId} loopId={loopId} resultRevision={selected?.resultRevision} eventType={selected?.eventType} />
          )}
          {eventParam && !result && !detail.isError && (
            <div className="cpm-surface cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true" aria-label="Loading the event">
              <span className="cpm-skeleton__label">Loading the event…</span>
            </div>
          )}
          {models.isError ? <QueryError error={models.error} retry={() => void models.refetch()} /> : (
            <ModelHistoryBody models={models.data?.models ?? []} timeZone={timeZone} canReview={canReview} onReview={m => { review.reset(); setReviewing(m); }} />
          )}
          {!canReview && <p className="cpm-copy">Model review needs the cpm.model.review permission.</p>}
        </aside>
      </div>
      {reviewing && <ModelReviewDialog model={reviewing} pending={review.isPending} error={review.error} onClose={() => setReviewing(null)} onSubmit={args => review.mutate(args)} />}
    </div>
  );
};

export default ResponseWorkspace;
