/**
 * CHG-165 (owner review): the four System Response tabs that read one event. Response: the result row, the response chart full
 * width, the reported quantities. Fit quality: residuals beside their autocorrelation, the candidate models beside the delay
 * curve. Frequency: magnitude beside phase, the margins. Steps & data: subgates A–H, the event, every quantity. A run whose
 * arrays were not kept says so once per tab that draws arrays, with the way to rebuild them; its values still show.
 */
import React from 'react';
import { EmptyState, QueryError } from '../shared';
import type { GateArtifacts } from '../evidence/useGateArtifacts';
import type { useEvidenceManifest } from '../evidence/useEvidence';
import { ResultCard } from './ResultCard';
import { ResponseChart } from './ResponseChart';
import { ResidualPanel } from './ResidualPanel';
import { CandidateModelsTable } from './CandidateModelsTable';
import { BodePanel } from './BodePanel';
import { StepsDataTab } from './StepsDataTab';
import { ArraysNote, ReportedQuantities, arraysState } from './ResponseNotes';
import { metricOf } from './responseSupport';
import type { useResponseEvent } from './useResponse';
import type { ResponseTab } from './ResponseTabs';

export interface EventPanesProps {
  tab: ResponseTab;
  loopId: string;
  timeZone: string;
  detail: ReturnType<typeof useResponseEvent>;
  manifest: ReturnType<typeof useEvidenceManifest>;
  arts: GateArtifacts;
  methodRunId: string | undefined;
  t0Ms: number;
  resultRevision: number | undefined;
  pvUnit?: string | null;
}

const Loading: React.FC<{ what: string }> = ({ what }) => (
  <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" role="status" aria-busy="true" aria-label={`Loading ${what}`}>
    <span className="cpm-skeleton__label">Loading {what}…</span>
  </div>
);

export const EventPanes: React.FC<EventPanesProps> = ({ tab, loopId, timeZone, detail, manifest, arts, methodRunId, t0Ms, resultRevision, pvUnit }) => {
  if (detail.isError) return <QueryError error={detail.error} retry={() => void detail.refetch()} />;
  const result = detail.data?.result;
  const metrics = detail.data?.metrics;
  if (tab === 'steps') return result ? <StepsDataTab result={result} metrics={metrics} timeZone={timeZone} methodRunId={methodRunId} resultRevision={resultRevision} pvUnit={pvUnit} /> : <Loading what="the event" />;

  const notKept = arraysState(manifest.data);
  const note = notKept && <ArraysNote state={notKept} loopId={loopId} methodRunId={methodRunId} />;
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
    return (
      <>
        <ResultCard result={result} metrics={metrics} loading={detail.isLoading} pvUnit={pvUnit} />
        {note}
        {manifestState}
        {manifest.data && !notKept && <ResponseChart arts={arts} timeZone={timeZone} t0Ms={t0Ms} healthExclusions={healthExclusions} />}
        {pending}
        {detail.data && <ReportedQuantities metrics={metrics} pvUnit={pvUnit} />}
      </>
    );
  }
  if (tab === 'fit') {
    return (
      <>
        {note}
        {manifestState}
        {manifest.data && !notKept && (
          <>
            <ResidualPanel residuals={one('residuals')} acf={one('residual_acf')} timeZone={timeZone} validation={result?.subgates?.E} loading={decoding('residuals', 'residual_acf')} />
            <CandidateModelsTable table={one('candidate_models')} delayCurve={one('delay_objective_curve')} intervals={one('parameter_intervals')} rejections={one('rejection_reasons')} loading={decoding('candidate_models', 'rejection_reasons')} />
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
        {manifestState}
        {manifest.data && <BodePanel bode={notKept ? undefined : one('bode')} metrics={metrics} controller={result?.subgates?.F} loading={!notKept && decoding('bode')} />}
      </>
    );
  }
  return <EmptyState title="Nothing to show on this tab" />;
};

export default EventPanes;
