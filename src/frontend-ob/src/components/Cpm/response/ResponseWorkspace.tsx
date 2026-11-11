/**
 * v2.5 Task 2E.5 (spec §2, §3.1; NR-034, NR-035): the System Response workspace. Route /cpm/response?loop=&event=&tab= (or
 * &methodRun= from the G12 evidence view). Everything shown is the kernel's: events, result, response chart, residuals,
 * candidate models, frequency response, steps and quantities, the loop's model history.
 * CHG-165 (owner review, the approved sample docs/theme/redesign/samples/system-response-proposal.html): one band chooses the
 * loop and the event (‹ › step through the events; Workbench ↗ opens the event's G12 run, Open loop ↗ the Loop Explorer), and
 * six tabs each answer one question (see ResponseTabs). The three columns, the right column and the catalogue card are gone;
 * the result, steps and quantities are each said once; a run whose arrays were not kept says so once per tab.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError, WorkspaceHeader } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { LoopBand } from '../context/LoopBand';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';
import { useEvidenceManifest, useMethodRun } from '../evidence/useEvidence';
import { useGateArtifacts } from '../evidence/useGateArtifacts';
import { siteZoneOf } from '../evidence/timezone';
import { workbenchHref } from '../evidence/selection';
import { explorerHref } from '../cpaHref';
import { ResponseEmpty } from './ResponseSummary';
import { ModelReviewDialog } from './ModelReviewDialog';
import { ModelHistoryBody } from './ModelHistory';
import { useModels, useResponseEvent, useResponseEvents, useReviewModel } from './useResponse';
import { EventSelect } from './EventSelect';
import { EventsTab } from './EventsTab';
import { ResponseTabs, needsEvent, tabOf, type ResponseTab } from './ResponseTabs';
import { EventPanes } from './EventPanes';
import { eventFoot } from './responseLabels';

export { responseHref } from '../cpaHref';

export const ResponseWorkspace: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const loopId = params.get('loop')?.trim() || undefined;
  const eventParam = params.get('event')?.trim() || undefined;
  const methodRunParam = params.get('methodRun')?.trim() || undefined;
  const tab = tabOf(params);

  const loops = useCpmLoops();
  const loopList = useMemo(() => loops.data?.loops ?? [], [loops.data]);
  const loop = loopList.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const timeZone = siteZoneOf(loop);
  const canReview = useAuthStore(s => s.hasPermission('cpm.model.review'));
  const canConfig = useAuthStore(s => s.hasPermission('cpm.config.read'));

  // audit F20: censored candidates are most of the table; they are counted, and listed only on request
  const [showCensored, setShowCensored] = useState(false);
  const events = useResponseEvents(loopId, 'LIVE', showCensored);
  const flat = useMemo(() => events.data?.pages.flatMap(p => p.events) ?? [], [events.data]);
  const censoredCount = events.data?.pages[0]?.censoredCount ?? 0;
  // a G12 view links by method run: resolve it to its event once, then navigate to the event id
  const runLookup = useMethodRun(!eventParam && methodRunParam ? methodRunParam : undefined);
  useEffect(() => {
    const id = runLookup.data?.result?.event_id;
    if (!eventParam && loopId && typeof id === 'string' && id) setParams(p => { p.set('event', id); p.delete('methodRun'); return p; }, { replace: true });
  }, [runLookup.data, eventParam, loopId, setParams]);

  const selected: ResponseEventSummary | undefined = flat.find(e => e.eventId === eventParam);
  const noEvents = events.isSuccess && flat.length === 0 && !showCensored;
  const detail = useResponseEvent(eventParam);
  // a deep link to a censored candidate: list it rather than leave the selection invisible
  useEffect(() => {
    if (eventParam && !selected && !showCensored && events.isSuccess && censoredCount > 0 && detail.data?.result.capture_state === 'CENSORED') setShowCensored(true);
  }, [eventParam, selected, showCensored, events.isSuccess, censoredCount, detail.data]);

  const result = detail.data?.result;
  const methodRunId = selected?.methodRunId ?? (result?.method_run_id as string | undefined);
  const manifest = useEvidenceManifest(methodRunId, 15_000);
  const arts = useGateArtifacts(manifest.data, 'G12');
  const models = useModels(loopId);
  const review = useReviewModel(loopId);
  const [reviewing, setReviewing] = useState<SystemModel | null>(null);
  useEffect(() => { if (review.isSuccess) setReviewing(null); }, [review.isSuccess]);

  const setTab = (t: ResponseTab) => setParams(p => { p.set('tab', t); return p; });
  /** An explicit choice; from the Events tab it opens the event on Response. */
  const choose = (e: ResponseEventSummary) => setParams(p => {
    p.set('event', e.eventId); p.delete('methodRun');
    if (tab === 'events') p.set('tab', 'response');
    return p;
  });

  const band = (
    <LoopBand card loopId={loopId}
      onLoop={id => setParams(p => { p.set('loop', id); ['event', 'methodRun', 'tab'].forEach(k => p.delete(k)); return p; })}
      end={loopId && (
        <>
          <ReasonedButton variant="normal" disabled={!methodRunId} reason={!methodRunId ? (eventParam ? 'This event has no stored analysis run' : 'Choose an event first') : null}
            onClick={() => { if (methodRunId) navigate(workbenchHref(loopId, methodRunId, 'G12')); }}>
            Workbench ↗
          </ReasonedButton>
          <ObcButton variant="flat" onClick={() => navigate(explorerHref(loopId))}>Open loop ↗</ObcButton>
        </>
      )}>
      {loopId && (flat.length > 0 || eventParam) && (
        <EventSelect events={flat} selectedId={eventParam} timeZone={timeZone} hasMore={!!events.hasNextPage}
          loading={events.isLoading || events.isFetchingNextPage} onSelect={choose} onMore={() => void events.fetchNextPage()} />
      )}
    </LoopBand>
  );
  const header = <WorkspaceHeader eyebrow="Understand the cause" title="System Response" copy="" />;

  if (!loopId) {
    return (
      <div className="cpm-screen cpm-compact">
        {header}
        {band}
        {loops.isError && <QueryError error={loops.error} retry={() => void loops.refetch()} />}
        <EmptyState level={2} title="Pick a loop" copy="Choose a loop above. Its response events (setpoint or output steps) then appear on the Events tab; choose one to read the model and the evidence behind it." />
      </div>
    );
  }

  // CHG-130: nothing at all to show: one explanation, not one per tab. Censored events keep the list, which can show them.
  const nothingYet = noEvents && censoredCount === 0 && !eventParam && !methodRunParam && models.isSuccess && (models.data?.models ?? []).length === 0;
  const footEvent = selected ?? (result && typeof result.window_start_ms === 'number'
    ? { eventType: String(result.event_type ?? ''), pathId: result.path_id, t0Ms: result.window_start_ms, tEndMs: (result.window_end_ms as number | null) ?? null, methodRunId: methodRunId ?? '' }
    : undefined);

  let body: React.ReactNode;
  if (tab === 'events') {
    body = (
      <>
        {events.isError && <QueryError error={events.error} retry={() => void events.refetch()} />}
        <EventsTab events={flat} selectedId={eventParam} timeZone={timeZone} loading={events.isLoading || events.isFetchingNextPage} hasMore={!!events.hasNextPage}
          models={models.data?.models} modelsStatus={models.isError ? 'error' : models.isSuccess ? 'ready' : 'loading'}
          censoredCount={censoredCount} showCensored={showCensored} onToggleCensored={setShowCensored}
          onMore={() => void events.fetchNextPage()} onSelect={choose} onModels={() => setTab('models')} />
      </>
    );
  } else if (tab === 'models') {
    const list = models.data?.models ?? [];
    body = models.isError ? <QueryError error={models.error} retry={() => void models.refetch()} />
      : list.length === 0 ? <EmptyState title={models.isSuccess ? 'No system model yet' : 'Loading the models…'} copy={models.isSuccess ? 'A model is estimated from an accepted response event.' : undefined} />
        : <ModelHistoryBody models={list} timeZone={timeZone} pvUnit={loop?.engineering?.pvUnit} canReview={canReview} onReview={m => { review.reset(); setReviewing(m); }} />;
  } else if (needsEvent(tab) && !eventParam) {
    body = methodRunParam
      ? (runLookup.isError ? <QueryError title="Method run not found" error={runLookup.error} retry={() => void runLookup.refetch()} /> : <EmptyState title="Resolving the method run to its event…" />)
      : <EmptyState title="No event selected" copy="Choose an event in the band above or on the Events tab." />;
  } else {
    body = (
      <EventPanes tab={tab} loopId={loopId} timeZone={timeZone} detail={detail} manifest={manifest} arts={arts}
        methodRunId={methodRunId} t0Ms={selected?.t0Ms ?? (result?.window_start_ms as number | undefined) ?? 0} resultRevision={selected?.resultRevision}
        pvUnit={loop?.engineering?.pvUnit} />
    );
  }

  return (
    <div className="cpm-screen cpm-compact cpm-response-workspace">
      {header}
      {band}
      {nothingYet ? <ResponseEmpty loopId={loopId} canConfig={canConfig} /> : (
        <ResponseTabs tab={tab} onTab={setTab} foot={footEvent ? eventFoot(footEvent, timeZone) : undefined}>{body}</ResponseTabs>
      )}
      {reviewing && <ModelReviewDialog model={reviewing} pending={review.isPending} error={review.error} onClose={() => setReviewing(null)} onSubmit={args => review.mutate(args)} />}
    </div>
  );
};

export default ResponseWorkspace;
