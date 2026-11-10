'use client';

/**
 * Investigation (/cpm/investigation?loop=&window=&profile=&case=&tab=&tier=&gate=): Overview, Performance and Loop Events all
 * land here. CHG-160 (owner review): five steps in the engineer's order, one tab each: Result, Evidence, Windows, Hypotheses,
 * Review (investigation/InvestigationSteps). The context lives in the address: `window` is an evaluated END (or a kind),
 * `tab` the step, `tier` the chosen card, `gate` the gate open in it. Detail on one small item is a dialog.
 *
 * A named window opens that window or says it cannot, never the newest (CHG-140). The title is that window's own result.
 * A note on the loop is available with or without a verdict, and never changes the engine's result.
 */
import { pipelineStep, usePipelineAccess } from './access';
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError, WorkspaceHeader } from './shared';
import { LoopBand } from './context/LoopBand';
import { useCpmScope } from './plantScope';
import { ApiError } from '../../api/apiFetch';
import type { CpmGateMatrix } from '../../api/cpmApi';
import { useCpmEvents, useCpmLoops, useFleetRankings, useLatestGates } from '../../hooks/useCpm';
import { chosenKind } from '../../cpa/tabKind';
import { DEFAULT_WINDOW_KIND, WINDOW_KINDS } from './useWindowKind';
import { useEvidenceWindows } from './evidence/useEvidenceWindows';
import { EvidenceWindowSelect } from './evidence/EvidenceToolbar';
import { sameInstant, useWindowAt } from './evidence/useWindowAt';
import { CaseAnnouncement, CaseSelect, NoEvaluatedLoops } from './investigation/CaseTriage';
import { caseCounts, caseIdFor } from './investigation/cases';
import { chosenTier, conclusionLimits } from './investigation/gateGroups';
import { episodeAt } from './investigation/heroFacts';
import { HypothesisPanel } from './investigation/HypothesisPanel';
import { InvestigationDialogs, type InvestigationDialog } from './investigation/InvestigationDialogs';
import { InvestigationHero } from './investigation/InvestigationHero';
import { InvestigationSteps, stepOf, type InvestigationStep } from './investigation/InvestigationSteps';
import { ReviewNotes, ReviewStep } from './investigation/ReviewStep';
import { WhyResult } from './investigation/WhyResult';
import { WindowsStep } from './investigation/WindowsStep';
import { WindowTrend } from './investigation/WindowTrend';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { useInstrumentHealth } from './health/useInstrumentHealth';
import { diagnosisLabel } from './vocabulary';
import { shortState, windowPick } from './windowLabel';
import { inputContextOf, vpAbsent } from './optionalInputs';
import { basisOf } from './conclusionBasis';
import { limitationsOf } from './explorer/summary/summaryText';
import { INPUT_LIMITS_GATE, effectiveInputFlags } from './inputLimits';
import { fmtInstant } from './context/LoopContextBar';
import { explorerHref, pipelineHref } from './cpaHref';
import { loopHealthSummary } from './health/TransmitterHealthPanel';

/** What belongs to one loop and goes with it; the step stays. */
const LOOP_KEYS = ['window', 'tier', 'gate'];

export const CpmInvestigation: React.FC = () => {
  const canPipeline = usePipelineAccess();
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
  const openFrame = openEvents.data?.events.find(e => e.ack_state === 'UNACKNOWLEDGED') ?? null;
  const episode = openEvents.data && recentEvents.data ? episodeAt([...openEvents.data.events, ...recentEvents.data.events], matrix?.windowEnd) : undefined;

  const step = stepOf(params);
  const setStep = (s: InvestigationStep) => patch(p => { p.set('tab', s); });
  const gate = params.get('gate');
  const tier = matrix ? chosenTier(matrix, params.get('tier'), gate) : '';
  // The newest window is no end at all: the page then follows the newest, as Live did.
  const openWindow = (end: string) => patch(p => { if (sameInstant(end, list.options[0]?.windowEnd)) p.delete('window'); else p.set('window', end); p.delete('mode'); });
  // A check that asked for a dialog now gone opens its step instead (CHG-160).
  const onCheck = (d: InvestigationDialog) => {
    if (d?.kind === 'hypotheses') setStep('Hypotheses');
    else if (d?.kind === 'compare') setStep('Windows');
    else setDialog(d);
  };

  return (
    // CHG-160 (owner review): no ? on the title; buttons and fields are 32 px, as on Historical (cpm-compact)
    <div className="cpm-screen cpm-compact">
      <WorkspaceHeader page="/cpm/investigation" title="Investigation" copy=""
        actions={<WindowKindToggle value={windowKind} kinds={WINDOW_KINDS} onChange={k => patch(p => { p.set('profile', k); p.delete('window'); p.delete('kind'); })} />} />
      {/* CHG-160: the band is a card, as on Historical and Loop Explorer; the case filter came out of More */}
      <LoopBand card loopId={loopId} only={caseFilter && filteredLoops.length ? filteredLoops : undefined}
        onLoop={id => patch(p => { p.set('loop', id); for (const k of LOOP_KEYS) p.delete(k); })}>
        <CaseSelect cases={cases} caseFilter={caseFilter} setParams={setParams} />
        <EvidenceWindowSelect loopId={loopId} kind={windowKind} windows={list.options} windowsLoading={list.isLoading} windowsError={list.error}
          currentMethodRunId={matrix?.methodRunIds?.G15} currentEnd={matrix?.windowEnd}
          runWindow={matrix ? `${windowPick(matrix, timeZone)} · ${shortState(diagnosisLabel(matrix.diagnosis))}` : null}
          onWindow={w => openWindow(w.windowEnd)} />
        {list.error ? <ObcButton variant="flat" onClick={() => list.refetch()}>Retry</ObcButton> : null}
        <CaseAnnouncement caseFilter={caseFilter} windowKind={windowKind} />
      </LoopBand>
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
            copy="Pick a loop above, or a case and then a loop, to follow its evidence from raw signals to the fused result." />
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
              ...pipelineStep(canPipeline, pipelineHref()),
            ]} />
        </section>
      )}

      {matrix && loopId && (
        <InvestigationSteps step={step} onStep={setStep}>
          {step === 'Result' && (
            <InvestigationHero matrix={matrix} episode={episode} latest={isLatest} windowKind={windowKind} timeZone={timeZone}
              basis={basis} limits={conclusionLimits(matrix, { basis, limits, machineReason })} />
          )}
          {step === 'Evidence' && (
            <WhyResult matrix={matrix} flags={flags} vpAbsentOnLoop={vpAbsent(inputs)} tier={tier} gate={gate}
              onTier={t => patch(p => { p.set('tier', t); p.delete('gate'); })}
              onGate={g => patch(p => { if (g) p.set('gate', g); else p.delete('gate'); })}
              onProof={g => setDialog({ kind: 'proof', gate: g })} onAllGates={() => setDialog({ kind: 'all' })}>
              <WindowTrend loopId={loopId} loop={loop} matrix={matrix} windowKind={windowKind} gate={gate} />
            </WhyResult>
          )}
          {step === 'Windows' && <WindowsStep loopId={loopId} matrix={matrix} windowKind={windowKind} list={list} onWindow={openWindow} />}
          {step === 'Hypotheses' && <HypothesisPanel verdict={matrix.verdictV2} metrics={matrix.metrics ?? {}} vpAbsentOnLoop={vpAbsent(inputs)} />}
          {step === 'Review' && (
            <ReviewStep loopId={loopId} matrix={matrix} windowKind={windowKind} openFrame={openFrame} episodeId={episode?.id}
              onSignals={() => setStep('Evidence')} onGate={g => patch(p => { p.delete('tier'); p.set('gate', g); p.set('tab', 'Evidence'); })}
              onDialog={onCheck} />
          )}
        </InvestigationSteps>
      )}

      {/* SME #22 (CHG-058): notes on the loop with or without a verdict; with one they sit on the Review step */}
      {loopId && !matrix && <ReviewNotes loopId={loopId} matrix={undefined} windowKind={windowKind} openFrame={openFrame} />}
      {matrix && loopId && (
        <InvestigationDialogs dialog={dialog} onDialog={setDialog} loopId={loopId} matrix={matrix} windowKind={windowKind} flags={flags} />
      )}
    </div>
  );
};

export default CpmInvestigation;
