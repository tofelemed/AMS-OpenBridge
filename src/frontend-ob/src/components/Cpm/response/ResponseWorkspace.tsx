/**
 * v2.5 Task 2E.5 (spec §2, §3.1; NR-034, NR-035): the System Response workspace. Route
 * /cpm/response?loop=&event= (or &methodRun= from the G12 evidence view). Left: every event of the
 * loop, newest first, incl. rejected and censored. Centre: the event's response chart, residuals,
 * candidate models, frequency response - all from the kernel's artifacts. Right: the event's
 * subgates and quantities, the loop's model history with the server-owned review.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, KvRow, PanelHead, QueryError, TonePill, WorkspaceHeader } from '../shared';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';
import { useEvidenceManifest, useMethodRun } from '../evidence/useEvidence';
import { useGateArtifacts } from '../evidence/useGateArtifacts';
import { formatInZone, siteZoneOf } from '../evidence/timezone';
import { workbenchHref } from '../evidence/selection';
import { EventList } from './EventList';
import { ResponseChart } from './ResponseChart';
import { ResidualPanel } from './ResidualPanel';
import { CandidateModelsTable } from './CandidateModelsTable';
import { BodePanel } from './BodePanel';
import { ModelHistoryBody } from './ModelHistory';
import { ModelReviewDialog } from './ModelReviewDialog';
import { useModels, useResponseEvent, useResponseEvents, useReviewModel } from './useResponse';
import { quantityText, stateTone } from './responseSupport';

export const responseHref = (loopId: string, eventId?: string) => `/cpm/response?loop=${encodeURIComponent(loopId)}${eventId ? `&event=${encodeURIComponent(eventId)}` : ''}`;

const SUBGATES: Array<[string, string]> = [['A', 'Eligibility'], ['B', 'Event capture'], ['C', 'Observed metrics'], ['D', 'Estimation'], ['E', 'Validation'], ['F', 'Controller / frequency'], ['G', 'Model comparison'], ['H', 'Advisory']];

const outputText = (v: unknown): string => v == null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : typeof v === 'object' ? JSON.stringify(v) : String(v);

export const ResponseWorkspace: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const loopId = params.get('loop')?.trim() || undefined;
  const eventParam = params.get('event')?.trim() || undefined;
  const methodRunParam = params.get('methodRun')?.trim() || undefined;

  const loops = useCpmLoops();
  const loop = loops.data?.loops.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const timeZone = siteZoneOf(loop);
  const canReview = useAuthStore(s => s.hasPermission('cpm.model.review'));

  const events = useResponseEvents(loopId);
  const flat = useMemo(() => events.data?.pages.flatMap(p => p.events) ?? [], [events.data]);
  // a G12 view links by method run: resolve it to its event once, then navigate to the event id
  const runLookup = useMethodRun(!eventParam && methodRunParam ? methodRunParam : undefined);
  useEffect(() => {
    const id = runLookup.data?.result?.event_id;
    if (!eventParam && loopId && typeof id === 'string' && id) navigate(responseHref(loopId, id), { replace: true });
  }, [runLookup.data, eventParam, loopId, navigate]);

  const selected: ResponseEventSummary | undefined = flat.find(e => e.eventId === eventParam);
  const detail = useResponseEvent(eventParam);
  const methodRunId = selected?.methodRunId ?? (detail.data?.result.method_run_id as string | undefined);
  const manifest = useEvidenceManifest(methodRunId, 15_000);
  const arts = useGateArtifacts(manifest.data, 'G12');
  const models = useModels(loopId);
  const review = useReviewModel(loopId);
  const [reviewing, setReviewing] = useState<SystemModel | null>(null);
  useEffect(() => { if (review.isSuccess) setReviewing(null); }, [review.isSuccess]);

  if (!loopId) {
    return (
      <div className="cpm-screen">
        <WorkspaceHeader eyebrow="Loop performance" title="System response" copy="Pick a loop to see its response events, fits, residuals, candidate models and model history." />
        <section className="cpm-surface">
          {loops.isError && <QueryError error={loops.error} retry={() => void loops.refetch()} />}
          <ul className="cpm-response-events__list">
            {(loops.data?.loops ?? []).map(l => (
              <li key={l.loopId}><button type="button" className="cpm-response-event" onClick={() => navigate(responseHref(l.loopId))}><span className="cpm-mono">{l.loopId}</span><span>{l.displayName}</span></button></li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const result = detail.data?.result;
  const t0Ms = selected?.t0Ms ?? (result?.window_start_ms as number | undefined) ?? 0;
  const healthExclusions = Array.isArray(result?.health_exclusions) ? (result!.health_exclusions as string[]) : [];
  const one = (k: string) => arts.byKind[k]?.[0];

  return (
    <div className="cpm-screen cpm-response-workspace">
      <WorkspaceHeader eyebrow="Loop performance" title={`System response — ${loop?.displayName ?? loopId}`}
        copy={`Site zone ${timeZone}. Every event is listed with its state and reason; the selection is explicit and never "latest".`}
        actions={<ObcButton variant="flat" onClick={() => navigate('/cpm/response')}>Change loop</ObcButton>} />
      <div className="cpm-response-columns">
        <EventList events={flat} selectedId={eventParam} timeZone={timeZone} loading={events.isLoading || events.isFetchingNextPage}
          hasMore={!!events.hasNextPage} onMore={() => void events.fetchNextPage()} onSelect={e => navigate(responseHref(loopId, e.eventId))} />

        <main className="cpm-response-centre">
          {events.isError && <QueryError error={events.error} retry={() => void events.refetch()} />}
          {!eventParam && !methodRunParam && <EmptyState title="No event selected" copy="Choose an event on the left. Its chart, residuals, candidate models and Bode data are the kernel's artifacts for that method run." />}
          {!eventParam && methodRunParam && (runLookup.isError ? <QueryError error={runLookup.error} /> : <EmptyState title="Resolving the method run to its event…" />)}
          {eventParam && detail.isError && <QueryError error={detail.error} retry={() => void detail.refetch()} />}
          {eventParam && manifest.isError && <QueryError title="Evidence manifest unavailable" error={manifest.error} retry={() => void manifest.refetch()} />}
          {eventParam && manifest.data && (
            <>
              <ResponseChart manifest={manifest.data} timeZone={timeZone} t0Ms={t0Ms} metrics={detail.data?.metrics} healthExclusions={healthExclusions} />
              <ResidualPanel residuals={one('residuals')} acf={one('residual_acf')} timeZone={timeZone} validation={result?.subgates?.E} />
              <CandidateModelsTable table={one('candidate_models')} delayCurve={one('delay_objective_curve')} intervals={one('parameter_intervals')} rejections={one('rejection_reasons')} />
              <BodePanel bode={one('bode')} metrics={detail.data?.metrics} controller={result?.subgates?.F} />
            </>
          )}
          {eventParam && manifest.data && manifest.data.readiness !== 'COMPLETE' && (
            <p className="cpm-copy" role="status">Evidence readiness: {manifest.data.readiness} ({manifest.data.count} artifact(s)). The manifest refreshes while artifacts arrive.</p>
          )}
        </main>

        <aside className="cpm-response-detail">
          {eventParam && result && (
            <section className="cpm-surface">
              <PanelHead eyebrow="Event" title={`${selected?.eventType ?? result.event_type ?? ''} · ${result.path_id}`} right={<TonePill tone={stateTone(result.evaluation_state)}>{result.evaluation_state}</TonePill>} />
              <KvRow label="t0 → end">{formatInZone(t0Ms, timeZone)} → {selected?.tEndMs != null ? formatInZone(selected.tEndMs, timeZone) : 'open'}</KvRow>
              <KvRow label="eligibility / finding / model">{result.eligibility} / {result.finding} / {result.model_state}</KvRow>
              <KvRow label="identity">purpose {result.purpose} · bundle {String(result.bundle_hash).slice(0, 12)} · rev {selected?.resultRevision ?? '—'}</KvRow>
              <KvRow label="method">{String(result.method_id ?? 'G12.SYSTEM_RESPONSE')} {String(result.method_version ?? '')}</KvRow>
              {methodRunId && <ObcButton variant="flat" onClick={() => navigate(workbenchHref(loopId, methodRunId, 'G12'))}>Open in Evidence Workbench ›</ObcButton>}
              <PanelHead eyebrow="Subgates" title="A–H" />
              {SUBGATES.map(([k, name]) => {
                const sg = result.subgates?.[k];
                return (
                  <div key={k} className="cpm-response-subgate" data-subgate={k}>
                    <KvRow label={`${k} ${name}`}><TonePill tone={stateTone(sg?.state)}>{sg?.state ?? 'NOT_RUN'}</TonePill></KvRow>
                    {sg && Object.entries(sg.outputs ?? {}).slice(0, 8).map(([ok, ov]) => <KvRow key={ok} label={ok}>{outputText(ov)}</KvRow>)}
                  </div>
                );
              })}
              <PanelHead eyebrow="Quantities" title={`${detail.data?.metrics.length ?? 0} of the catalogue`} />
              <table className="cpm-table" data-table="quantities-all">
                <thead><tr><th>quantity</th><th>value</th><th>method</th></tr></thead>
                <tbody>{(detail.data?.metrics ?? []).map(q => <tr key={q.quantityId}><td className="cpm-mono">{q.quantityId}</td><td>{quantityText(q)}</td><td className="cpm-mono">{q.method || '—'}</td></tr>)}</tbody>
              </table>
            </section>
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
