/**
 * CHG-165 (owner review): the four System Response tabs that read one event. Response: the result row, the response chart full
 * width, the reported quantities. Fit quality: residuals beside their autocorrelation, the candidate models beside the delay
 * curve. Frequency: magnitude beside phase, the margins. Steps & data: subgates A–H, the event, every quantity. A run whose
 * arrays were not kept says so once per tab that draws arrays; its values still show (no Workbench link: an event-keyed G12
 * run cannot be reconstructed). CHG-195 (owner review item 19): the note is one plain line; a censored event's Fit quality
 * says it was cut short before its response finished, so no model was fitted, instead of a charts note.
 * CHG-197 (owner Q10): Response draws the event as separate trends, one per row (trends/ResponseTrends), between the result row
 * and the reported quantities; a censored event with its charts held says why it has only the measured response and the input.
 * CHG-198: when the charts are gone (not kept, or removed), the Response note offers "Redraw from historian"; a redraw (held in the
 * page, `redrawn`) shows the trends that can be made, and Model fit, Fit quality and Frequency say they exist only with the
 * stored charts. Stored charts always win over a redraw. CHG-199: an accepted event past the days its stored charts are kept
 * (`chartDays`, the server's acceptedChartDays) says they are no longer kept, with the same redraw.
 */
import React from 'react';
import { EmptyState, QueryError } from '../shared';
import type { GateArtifacts } from '../evidence/useGateArtifacts';
import type { useEvidenceManifest } from '../evidence/useEvidence';
import { ResultCard } from './ResultCard';
import { ResponseTrends } from './trends/ResponseTrends';
import { RequireKinds } from '../evidence/views/viewSupport';
import { ResidualPanel } from './ResidualPanel';
import { CandidateModelsTable } from './CandidateModelsTable';
import { BodePanel } from './BodePanel';
import { StepsDataTab } from './StepsDataTab';
import { ArraysNote, ReportedQuantities, arraysState, chartsGone } from './ResponseNotes';
import { metricOf } from './responseSupport';
import { RedrawAction } from './redraw/RedrawAction';
import { NotRedrawn, RedrawnTrends } from './redraw/RedrawnTrends';
import { NOT_REDRAWN } from './redraw/redrawWords';
import type { Redrawn } from './redraw/useRedraw';
import type { useResponseEvent } from './useResponse';
import type { ResponseTab } from './ResponseTabs';

export interface EventPanesProps {
  tab: ResponseTab;
  timeZone: string;
  detail: ReturnType<typeof useResponseEvent>;
  manifest: ReturnType<typeof useEvidenceManifest>;
  arts: GateArtifacts;
  t0Ms: number;
  pvUnit?: string | null;
  /** CHG-198: the event redrawn from the historian, while the page holds it. */
  redrawn?: Redrawn;
  /** The event as the event selector names it (the redraw dialog's band). */
  eventName?: string;
  /** CHG-199: how many days an accepted event's stored charts are kept (null = with the event; undefined = an older server). */
  chartDays?: number | null;
}

const Loading: React.FC<{ what: string }> = ({ what }) => (
  <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" role="status" aria-busy="true" aria-label={`Loading ${what}`}>
    <span className="cpm-skeleton__label">Loading {what}…</span>
  </div>
);

export const EventPanes: React.FC<EventPanesProps> = ({ tab, timeZone, detail, manifest, arts, t0Ms, pvUnit, redrawn: held, eventName, chartDays }) => {
  if (detail.isError) return <QueryError error={detail.error} retry={() => void detail.refetch()} />;
  const result = detail.data?.result;
  const metrics = detail.data?.metrics;
  if (tab === 'steps') return result ? <StepsDataTab result={result} metrics={metrics} timeZone={timeZone} pvUnit={pvUnit} /> : <Loading what="the event" />;

  // a censored event was cut short before its response finished: it never has a fit, whatever charts are held. The event's
  // result carries the state as evaluation_state (the list's captureState has no key of its own there).
  const censored = [result?.capture_state, result?.evaluation_state].includes('CENSORED');
  const endMs = Number(result?.window_end_ms) || t0Ms;
  const notKept = chartsGone(arraysState(manifest.data), { censored, endMs, chartDays, nowMs: Date.now() });
  const note = notKept && <ArraysNote state={notKept} />;
  // a redraw stands in only while the stored charts are gone
  const redrawn = notKept ? held : undefined;
  const one = (k: string) => arts.byKind[k]?.[0];
  // Phase 7: a panel is "decoding" only while a kind the manifest DECLARES is still loading
  const declared = new Set((manifest.data?.artifacts ?? []).filter(a => a.gate === 'G12' && a.readiness === 'COMPLETE').map(a => a.kind));
  const decoding = (...kinds: string[]) => arts.loading && kinds.some(k => declared.has(k));
  const manifestState = manifest.isError
    ? <QueryError title="Evidence manifest unavailable" error={manifest.error} retry={() => void manifest.refetch()} />
    : !manifest.data ? <Loading what="the evidence manifest" /> : null;
  const pending = manifest.data && !notKept && manifest.data.readiness !== 'COMPLETE'
    ? <p className="cpm-copy" role="status">Evidence readiness: {manifest.data.readiness} ({manifest.data.count} artifact(s)). The manifest refreshes while artifacts arrive.</p>
    : null;

  if (tab === 'response') {
    const healthExclusions = Array.isArray(result?.health_exclusions) ? (result!.health_exclusions as string[]) : [];
    const redrawable = (notKept === 'NOT_KEPT' || notKept === 'EXPIRED' || notKept === 'AGED_OUT') && !redrawn && result;
    return (
      <>
        <ResultCard result={result} metrics={metrics} loading={detail.isLoading} pvUnit={pvUnit} />
        {notKept && (
          <ArraysNote state={notKept}>
            {redrawable && <RedrawAction result={result} metrics={metrics} t0Ms={t0Ms} pvUnit={pvUnit} timeZone={timeZone} eventName={eventName} />}
          </ArraysNote>
        )}
        {manifestState}
        {((manifest.data && !notKept) || redrawn) && censored && <ArraysNote state="NOT_FITTED" />}
        {manifest.data && !notKept && (
          <RequireKinds arts={arts} kinds={['accepted_samples']} skeleton="evidence">
            <ResponseTrends byKind={arts.byKind} metrics={metrics} result={result} t0Ms={t0Ms} pvUnit={pvUnit} timeZone={timeZone} healthExclusions={healthExclusions} />
          </RequireKinds>
        )}
        {redrawn && <RedrawnTrends redrawn={redrawn} metrics={metrics} result={result} t0Ms={t0Ms} pvUnit={pvUnit} timeZone={timeZone} healthExclusions={healthExclusions} />}
        {pending}
        {detail.data && <ReportedQuantities metrics={metrics} pvUnit={pvUnit} />}
      </>
    );
  }
  if (tab === 'fit' && censored) return <ArraysNote state="NOT_FITTED" />;
  if (tab === 'fit') {
    return (
      <>
        {note}
        {redrawn && <NotRedrawn text={NOT_REDRAWN.fit} />}
        {manifestState}
        {manifest.data && !notKept && (
          <>
            <ResidualPanel residuals={one('residuals')} acf={one('residual_acf')} timeZone={timeZone} validation={result?.subgates?.E} loading={decoding('residuals', 'residual_acf')} pvUnit={pvUnit} />
            <CandidateModelsTable table={one('candidate_models')} delayCurve={one('delay_objective_curve')} intervals={one('parameter_intervals')} rejections={one('rejection_reasons')} loading={decoding('candidate_models', 'rejection_reasons')} pvUnit={pvUnit} />
          </>
        )}
        {pending}
      </>
    );
  }
  if (tab === 'frequency') {
    if (!detail.data) return <Loading what="the event" />;
    // a margin the kernel claimed with no Bode stored: the arrays were not kept; with no margin, the panel says why itself
    const claimed = metricOf(metrics, 'gain_margin')?.value != null;
    return (
      <>
        {claimed && note}
        {claimed && redrawn && <NotRedrawn text={NOT_REDRAWN.frequency} />}
        {manifestState}
        {manifest.data && <BodePanel bode={notKept ? undefined : one('bode')} metrics={metrics} controller={result?.subgates?.F} loading={!notKept && decoding('bode')} />}
      </>
    );
  }
  return <EmptyState title="Nothing to show on this tab" />;
};

export default EventPanes;
