'use client';

/**
 * Investigation (/cpm/investigation?loop=&window=&profile=&case=&tier=&gate=): Overview, Performance and Loop Events all land
 * here. The latest result, why it is that result, the evidence over the window, what to check next, and a place to record
 * the review. The context lives in the address: `window` is an evaluated END (or a kind), `tier` the chosen card, `gate`
 * the gate open in it. Detail on one small item is a dialog, and the blocks live in investigation/.
 *
 * A named window opens that window or says it cannot, never the newest (CHG-140). The title is that window's own result.
 * A note on the loop is available with or without a verdict, and never changes the engine's result.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError, WorkspaceHeader, toneFor } from './shared';
import { LoopBand } from './context/LoopBand';
import { useCpmScope } from './plantScope';
import { ApiError } from '../../api/apiFetch';
import type { CpmGateMatrix } from '../../api/cpmApi';
import { useCpmEvents, useCpmLoops, useFleetRankings, useLatestGates } from '../../hooks/useCpm';
import { chosenKind } from '../../cpa/tabKind';
import { DEFAULT_WINDOW_KIND, WINDOW_KINDS } from './useWindowKind';
import { useEvidenceWindows } from './evidence/useEvidenceWindows';
import { EvidenceMore, EvidenceWindowSelect } from './evidence/EvidenceToolbar';
import { sameInstant, useWindowAt } from './evidence/useWindowAt';
import { CaseAnnouncement, CaseSelect, NoEvaluatedLoops } from './investigation/CaseTriage';
import { caseCounts, caseIdFor } from './investigation/cases';
import { chosenTier, conclusionLimits } from './investigation/gateGroups';
import { episodeAt, heroTitle } from './investigation/heroFacts';
import { InvestigationDialogs, type InvestigationDialog } from './investigation/InvestigationDialogs';
import { InvestigationHero } from './investigation/InvestigationHero';
import { LoopNotes } from './investigation/LoopNotes';
import { NextChecks } from './investigation/NextChecksPanel';
import { NumericEvidence } from './investigation/NumericEvidence';
import { TechnicalDetails } from './investigation/TechnicalDetails';
import { WhyResult } from './investigation/WhyResult';
import { WindowTrend } from './investigation/WindowTrend';
import ConclusionStrip from './ConclusionStrip';
import { ReasonedButton } from './ReasonedButton';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { useInstrumentHealth } from './health/useInstrumentHealth';
import { diagnosisLabel } from './vocabulary';
import { windowLabel } from './windowLabel';
import { inputContextOf, vpAbsent } from './optionalInputs';
import { basisOf } from './conclusionBasis';
import { limitationsOf } from './explorer/summary/summaryText';
import { INPUT_LIMITS_GATE, effectiveInputFlags } from './inputLimits';
import { fmtInstant } from './context/LoopContextBar';
import { eventsHref, explorerHref, pipelineHref } from './cpaHref';
import { loopHealthSummary } from './health/TransmitterHealthPanel';

/** What belongs to one loop and goes with it. */
const LOOP_KEYS = ['window', 'tier', 'gate'];

const scrollToEvidence = () => document.getElementById('cpm-inv-evidence')?.scrollIntoView({
  behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
});

export const CpmInvestigation: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const patch = (edit: (p: URLSearchParams) => void) => setParams(p => { edit(p); return p; }, { replace: true });
  const [dialog, setDialog] = useState<InvestigationDialog>(null);
  const loopsQuery = useCpmLoops();
  // 200 = the server's max. The default page (50, confidence-ordered) made the case list count a biased slice while the
  // copy said "the fleet's verdicts"; past 200 loops it would still undercount: the server aggregate would be the real fix.
  const scope = useCpmScope();
  // CHG-065: the cases count the same window kind the page shows. The kind: ?profile=, else one carried in ?window= or ?kind=; an END is never read as one.
  const windowKind = chosenKind(params, 'profile') ?? DEFAULT_WINDOW_KIND;
  const rankings = useFleetRankings(scope.params, windowKind, 'confidence', 200);

  const caseFilter = params.get('case');
  const allLoops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);
  const rankedLoops = useMemo(() => rankings.data?.loops ?? [], [rankings.data]);
  const cases = useMemo(() => caseCounts(rankedLoops), [rankedLoops]);
  const filteredLoops = useMemo(() => {
    if (!caseFilter) return allLoops;
    const ids = new Set(rankedLoops.filter(l => caseIdFor(l) === caseFilter).map(l => l.loopId));
    return allLoops.filter(l => ids.has(l.loopId));
  }, [allLoops, rankedLoops, caseFilter]);

  // No default selection: registry order is arbitrary, so `loops[0]` would be a choice presented as a default, and it
  // would fire this page's whole query set for a loop nobody asked for.
  const loopId = params.get('loop') ?? undefined;
  // ?window= is an evaluated window END unless it is a kind ('12h' / '24h'). Naming an end opens that window.
  const endParam = params.get('window');
  const selectedEnd = endParam && !(WINDOW_KINDS as readonly string[]).includes(endParam) ? endParam : null;
  const loop = allLoops.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const timeZone = loop?.timezone || 'UTC';

  const latestGates = useLatestGates(loopId, windowKind, !selectedEnd);
  // CHG-140: the window list is the one the Evidence pages read; the window itself is read at its exact end.
  const list = useEvidenceWindows(loopId, windowKind, 'fused', timeZone);
  const at = useWindowAt(selectedEnd ? loopId : undefined, windowKind, selectedEnd);
  const matrix: CpmGateMatrix | undefined = selectedEnd ? at.row : latestGates.data;
  const windowNotStored = !!selectedEnd && at.notFound;
  // gates/latest answers 404 for "no fused window yet": a real answer, not a failure, so it renders as the no-verdict empty state.
  const noVerdictYet = latestGates.isError && latestGates.error instanceof ApiError && latestGates.error.status === 404;
  const isLatest = !selectedEnd || sameInstant(matrix?.windowEnd, list.options[0]?.windowEnd);

  // CHG-064 (SME #24): the conclusion says what it rests on and what it was judged without (same query as the Explorer)
  const healthNow = useInstrumentHealth(matrix ? loopId : undefined);
  const healthLabel = healthNow.data || healthNow.isError ? loopHealthSummary(healthNow.data).label : undefined;
  const inputs = inputContextOf(loop);
  const basis = matrix ? basisOf(matrix, { healthLabel, inputs }) : null;
  // CHG-098 (SME review 2 #21): the Investigation is the one full home of the limitations; with a basis on screen the missing inputs are listed once.
  const limits = matrix ? limitationsOf((matrix.observabilityFlags ?? []).filter(f => !basis || !(f in INPUT_LIMITS_GATE)), inputs) : [];
  const flags = matrix ? effectiveInputFlags(matrix.observabilityFlags, inputs) : [];
  const machineReason = matrix?.insufficientEvidenceReason ?? matrix?.familyDisqualifiers[0] ?? matrix?.narrative?.statusReason ?? null;

  // The loop's open episode for the acknowledge option (full cases are DG-7); the list LoopNotes reads finds the episode open at an older window's end.
  const openEvents = useCpmEvents({ loopId, openOnly: true, limit: 5 }, 60_000, !!loopId);
  const recentEvents = useCpmEvents({ loopId, openOnly: false, limit: 20, sort: 'recent' }, 60_000, !!loopId);
  const openFrame = openEvents.data?.events.find(e => e.ack_state === 'UNACKNOWLEDGED');
  const episode = openEvents.data && recentEvents.data ? episodeAt([...openEvents.data.events, ...recentEvents.data.events], matrix?.windowEnd) : undefined;

  const gate = params.get('gate');
  const tier = matrix ? chosenTier(matrix, params.get('tier'), gate) : '';
  const openGate = (g: string) => patch(p => { p.delete('tier'); p.set('gate', g); });
  // The newest window is no end at all: the page then follows the newest, as Live did.
  const openWindow = (end: string) => patch(p => { if (sameInstant(end, list.options[0]?.windowEnd)) p.delete('window'); else p.set('window', end); p.delete('mode'); });

  return (
    <div className="cpm-screen">
      <WorkspaceHeader page="/cpm/investigation" title="Investigation"
        actions={(
          <>
            <ReasonedButton variant="flat" disabled={!matrix} reason={loopId ? 'No evaluated window is open' : 'Choose a loop first'}
              onClick={() => setDialog({ kind: 'compare' })}>Compare windows</ReasonedButton>
            <WindowKindToggle value={windowKind} kinds={WINDOW_KINDS}
              onChange={k => patch(p => { p.set('profile', k); p.delete('window'); p.delete('kind'); })} />
          </>
        )} />
      <LoopBand loopId={loopId} only={caseFilter && filteredLoops.length ? filteredLoops : undefined}
        onLoop={id => patch(p => { p.set('loop', id); for (const k of LOOP_KEYS) p.delete(k); })}
        onClear={() => patch(p => { p.delete('loop'); for (const k of LOOP_KEYS) p.delete(k); })}
        end={(
          <EvidenceMore loopId={loopId} kind={windowKind} windowsError={list.error} onRetryWindows={list.refetch}
            hasMore={list.hasMore} onLoadMore={list.loadMore} loadingMore={list.isLoadingMore}>
            <CaseSelect cases={cases} caseFilter={caseFilter} setParams={setParams} />
          </EvidenceMore>
        )}>
        <EvidenceWindowSelect loopId={loopId} kind={windowKind} windows={list.options} windowsLoading={list.isLoading} windowsError={list.error}
          currentMethodRunId={matrix?.methodRunIds?.G15}
          runWindow={matrix ? `${windowLabel({ windowKind, windowEnd: matrix.windowEnd }, timeZone)} · ${diagnosisLabel(matrix.diagnosis)}` : null}
          onWindow={w => openWindow(w.windowEnd)} />
        <CaseAnnouncement caseFilter={caseFilter} windowKind={windowKind} />
      </LoopBand>
      {/* SME #13 (CHG-050): the result stays in view while the evidence below it is read. */}
      <ConclusionStrip targetId="cpm-conclusion" active={!!matrix} label="Result"
        tone={toneFor(matrix?.diagnosis)} text={matrix ? heroTitle(matrix) : ''} />
      {!loopId && cases.length === 0 && <NoEvaluatedLoops scope={scope} />}

      {/* I6: error and empty states keyed on the query that is actually being read. */}
      {!selectedEnd && latestGates.isError && !noVerdictYet && (
        <QueryError title="Verdict unavailable" error={latestGates.error} retry={() => void latestGates.refetch()} />
      )}
      {selectedEnd && at.isError && <QueryError title="Gate history unavailable" error={at.error} retry={at.refetch} />}
      {windowNotStored && (
        <section className="cpm-surface">
          <EmptyState title="That window is not stored"
            copy={`The service holds no result for the ${windowKind} window ending ${fmtInstant(selectedEnd, timeZone)}. Full gate results are kept for a limited time, so a window this old, or one never evaluated, cannot be opened.`}
            action={{ label: 'Open the newest window', onClick: () => patch(p => { p.delete('window'); p.delete('mode'); }) }} />
        </section>
      )}
      {!loopId && cases.length > 0 && (
        <section className="cpm-surface">
          <EmptyState level={2} title="Select a loop"
            copy="Pick a loop above, or a case under More and then a loop, to follow its evidence from raw signals to the fused result." />
        </section>
      )}
      {loopId && !matrix
        && !(selectedEnd ? at.isLoading : latestGates.isLoading)
        && !(selectedEnd ? at.isError : latestGates.isError && !noVerdictYet) && !windowNotStored && (
        <section className="cpm-surface">
          {/* CHG-098 (SME review 2 #29): routes to the loop's readiness and to the engine. */}
          <EmptyState title="No fused verdict for this loop"
            copy="Verdicts appear once the loop completes an evaluation window, or after a recompute. The loop's summary shows what it is still missing; Pipeline Health shows whether the analysis engine is running."
            next={[
              { label: 'Open the loop', to: explorerHref(loopId, { tab: 'Summary', kind: windowKind }) },
              { label: 'Pipeline Health', to: pipelineHref() },
            ]} />
        </section>
      )}

      {matrix && loopId && (
        <>
          <InvestigationHero matrix={matrix} episode={episode} latest={isLatest} windowKind={windowKind} timeZone={timeZone} onStart={scrollToEvidence} />
          <WhyResult matrix={matrix} flags={flags} vpAbsentOnLoop={vpAbsent(inputs)} tier={tier} gate={gate} basis={basis}
            limits={conclusionLimits(matrix, { basis, limits, machineReason })}
            onTier={t => patch(p => { p.set('tier', t); p.delete('gate'); })}
            onGate={g => patch(p => { if (g) p.set('gate', g); else p.delete('gate'); })}
            onProof={g => setDialog({ kind: 'proof', gate: g })} onAllGates={() => setDialog({ kind: 'all' })}>
            <WindowTrend loopId={loopId} loop={loop} matrix={matrix} windowKind={windowKind} gate={gate} />
          </WhyResult>
          <div className="cpm-inv-lower">
            <NextChecks matrix={matrix} loopId={loopId} windowKind={windowKind} onSignals={scrollToEvidence}
              onGate={g => { openGate(g); scrollToEvidence(); }} onDialog={setDialog} />
            <NumericEvidence matrix={matrix} onOpen={() => setDialog({ kind: 'numeric' })} />
          </div>
        </>
      )}

      {/* SME #22 (CHG-058): notes on the loop, with or without a verdict, with or without an open episode */}
      {loopId && (
        <LoopNotes loopId={loopId} openFrame={openFrame ?? null} title="Record your review" saveLabel="Save review"
          window={matrix ? { methodRunId: matrix.methodRunIds?.G15 ?? null, label: windowLabel({ windowKind, windowEnd: matrix.windowEnd }) } : null}
          links={(
            <>
              {matrix && <ObcButton variant="flat" onClick={() => setDialog({ kind: 'hypotheses' })}>Hypothesis comparison ↗</ObcButton>}
              <ObcButton variant="flat" onClick={() => navigate(eventsHref({ loop: loopId, event: episode?.id, filter: 'all' }))}>Related events ↗</ObcButton>
            </>
          )} />
      )}
      {matrix && <TechnicalDetails matrix={matrix} machineReason={machineReason} windowKind={windowKind} timeZone={timeZone} />}
      {matrix && loopId && (
        <InvestigationDialogs dialog={dialog} onDialog={setDialog} loopId={loopId} matrix={matrix} windowKind={windowKind}
          flags={flags} inputs={inputs} timeZone={timeZone} list={list} onWindow={openWindow} />
      )}
    </div>
  );
};

export default CpmInvestigation;
