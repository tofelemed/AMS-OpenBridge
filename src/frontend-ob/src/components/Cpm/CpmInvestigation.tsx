'use client';

/**
 * CPLM Phase 7 — U5 Investigation (/cpm/investigation?loop=&window=&case=).
 * CPA-prototype IA parity: analysis-case chips (derived from the fleet's SERVED
 * verdicts), live/historical controls, the final-conclusion card, key-facts
 * tiles, evidence chart, the Eligibility→Evidence→Fusion reasoning chain with the
 * machine reason code, the fusion v2 hypothesis comparison (observations /
 * hypotheses / fault-scoped confirmation, v2.5 1E.2), next-best action, and the
 * window browser with a PREVIOUS/CURRENT delta table. Case management beyond a
 * note on the event frame is DG-7 and is said so on screen.
 *
 * Split in v2.5: investigation/{CaseTriage, HypothesisPanel, ReasoningChain,
 * WindowBrowser, cases, confirmationCopy, keyFacts}.
 */
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KpiTile, KvRow, PanelHead, TonePill, WorkspaceHeader, toneFor,
  fmtDateTime, QueryError } from './shared';
import { LoopContextBar } from './context/LoopContextBar';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import { staleVerdictLine } from './verdictAge';
import SignalTrend from './trend/SignalTrend';
import { ApiError } from '../../api/apiFetch';
import type { CpmGateMatrix } from '../../api/cpmApi';
import { HYPOTHESIS_LABEL } from '../../api/cpm/verdict';
import {
  useCpmEvents, useCpmLoops, useCpmTrend,
  useFleetRankings, useGateHistory, useLatestGates,
} from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';
import { CaseTriage } from './investigation/CaseTriage';
import { HypothesisPanel } from './investigation/HypothesisPanel';
import { ReasoningChain } from './investigation/ReasoningChain';
import { WindowBrowser } from './investigation/WindowBrowser';
import { caseCounts, caseIdFor } from './investigation/cases';
import { confirmationLabel } from './investigation/confirmationCopy';
import { KEY_FACTS, fmtFact } from './investigation/keyFacts';
import { HealthLane } from './health/HealthLane';
import CollapsibleSection from './CollapsibleSection';
import ConclusionStrip from './ConclusionStrip';
import SelectionSummary from './SelectionSummary';
import { useInstrumentHealth, useInstrumentHealthHistory } from './health/useInstrumentHealth';
import { codeLabel, diagnosisLabel } from './vocabulary';
import { CodeLabel } from './CodeLabel';
import { EngineTrace } from './evidence/views/engineTrace';
import { contextOfMatrix, hasVerdict, metricAvailability } from './metricAvailability';
import { MetricValue } from './MetricValue';
import { windowEnds, windowLabel, windowSize } from './windowLabel';
import { LoopNotes } from './investigation/LoopNotes';
import { CauseBreakdownRows } from './CauseBreakdown';
import { EVIDENCE_SCORE_HELP, evidenceScoreText } from './evidenceScore';
import { EvidenceScoreNote } from './EvidenceScoreNote';
import { inputContextOf, vpAbsent } from './optionalInputs';
import { basisOf } from './conclusionBasis';
import { loopHealthSummary } from './health/TransmitterHealthPanel';

export const CpmInvestigation: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const loopsQuery = useCpmLoops();
  // 200 = the server's max. The default page (50, confidence-ordered) made the
  // case chips count a biased slice while the copy said "the fleet's verdicts";
  // past 200 loops the chips would still undercount — the server aggregate
  // endpoint would be the real fix at that scale.
  // Plant scope (A6.3): case list narrows to a section/unit.
  const scope = useCpmScope();
  // CHG-065: the case chips count the same window kind the page shows (was always 24h)
  const rankings = useFleetRankings(scope.params, params.get('profile') === '12h' ? '12h' : '24h', 'confidence', 200);

  const caseFilter = params.get('case');
  const allLoops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);
  const rankedLoops = useMemo(() => rankings.data?.loops ?? [], [rankings.data]);

  // Case chips from the fleet's actual verdicts (served leading hypothesis).
  const cases = useMemo(() => caseCounts(rankedLoops), [rankedLoops]);

  const filteredLoops = useMemo(() => {
    if (!caseFilter) return allLoops;
    const ids = new Set(rankedLoops.filter(l => caseIdFor(l) === caseFilter).map(l => l.loopId));
    return allLoops.filter(l => ids.has(l.loopId));
  }, [allLoops, rankedLoops, caseFilter]);

  // No default selection: registry order is arbitrary, so `loops[0]` is a
  // CHOICE presented as a default — the same lie the ?loop=-names-nothing
  // fallback was fixed for, minus the URL. It also fired this page's whole
  // query set for a loop nobody asked for.
  const loopId = params.get('loop') ?? undefined;
  const mode = params.get('mode') === 'historical' ? 'historical' : 'live';
  const windowKind = params.get('profile') === '12h' ? '12h' : '24h';

  const latest = useLatestGates(loopId, windowKind);
  const history = useGateHistory(loopId, windowKind);
  const windows = useMemo(() => {
    const rows = history.data?.windows ?? [];
    return [...rows].sort((a, b) => (b.windowEnd ?? '').localeCompare(a.windowEnd ?? ''));
  }, [history.data]);

  const selectedEnd = params.get('window');
  const matrix: CpmGateMatrix | undefined = mode === 'historical'
    ? (windows.find(w => w.windowEnd === selectedEnd) ?? windows[0])
    : latest.data;
  // Deep-linked window not in the fetched set → fell back to newest; say so.
  const windowFellBack = mode === 'historical' && !!selectedEnd && windows.length > 0
    && !windows.some(w => w.windowEnd === selectedEnd);
  // gates/latest answers 404 for "no fused window yet" — a real answer, not a
  // failure; it must render as the no-verdict empty state, not an error card.
  const noVerdictYet = latest.isError
    && latest.error instanceof ApiError && latest.error.status === 404;
  // findIndex returns -1 when the current verdict is not among the fetched
  // history — in live mode that happens whenever `latest` is newer than the
  // gate-history page. `-1 + 1 = 0` then made windows[0], the NEWEST window, the
  // "PREVIOUS" one, so the delta table compared the window against itself and
  // reported "unchanged / 0 pt" as a finding.
  const previous = useMemo(() => {
    if (!matrix) return undefined;
    const i = windows.findIndex(w => w.windowEnd === matrix.windowEnd);
    return i >= 0 ? windows[i + 1] : undefined;
  }, [matrix, windows]);

  // Evidence chart over the verdict's own window.
  const series = loopId ? loopSeries(loopId) : undefined;
  const loop = allLoops.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  // I10: on a stiction-diagnosis investigation, VP-vs-OP is the direct visual
  // signature of a sticking valve — draw the VP pen whenever the loop maps one.
  const hasVp = !!loop?.tags['VP'];
  const { start, end } = useMemo(() => {
    if (matrix?.windowStart && matrix.windowEnd)
      return { start: new Date(matrix.windowStart), end: new Date(matrix.windowEnd) };
    const now = new Date();
    return { start: new Date(now.getTime() - 24 * 3600_000), end: now };
  }, [matrix?.windowStart, matrix?.windowEnd]);
  const trend = useCpmTrend(series, start, end, 280, hasVp ? 'pv,sp,op,vp' : 'pv,sp,op', !!matrix); // C: hold until the verdict window is known
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  // v2.5 (1H.6): the PV instrument's eligibility over the SAME window as the verdict, so a
  // health exclusion or a device replacement is visible beside the evidence it affected.
  const healthHistory = useInstrumentHealthHistory(matrix ? loopId : undefined, start, end);
  // CHG-064 (SME #24): the conclusion says what it rests on and what it was judged without (same query as the Explorer)
  const healthNow = useInstrumentHealth(matrix ? loopId : undefined);
  const healthLabel = healthNow.data || healthNow.isError ? loopHealthSummary(healthNow.data).label : undefined;
  const basis = matrix ? basisOf(matrix, { healthLabel, inputs: inputContextOf(loop) }) : null;


  const metrics = matrix?.metrics ?? {};
  const machineReason = matrix?.insufficientEvidenceReason
    ?? matrix?.familyDisqualifiers[0]
    ?? matrix?.narrative?.statusReason
    ?? null;
  const verdict = matrix?.verdictV2;

  // Investigation note → the loop's open event frame (full cases are DG-7).
  const events = useCpmEvents({ loopId, openOnly: true, limit: 5 }, 60_000, !!loopId); // C
  const openFrame = events.data?.events.find(e => e.ack_state === 'UNACKNOWLEDGED');

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm/investigation"
        title="Investigation"
      />
      <LoopContextBar loopId={loopId} period={matrix ? { label: `${windowKind} fused window${mode === 'historical' ? ' (selected)' : ' (latest)'}`, start: matrix.windowStart, end: matrix.windowEnd } : null} />
      {/* SME #13 (CHG-050): the diagnosis stays in view while the reasoning below it is read. */}
      <ConclusionStrip targetId="cpm-conclusion" active={!!matrix} label="Final conclusion"
        tone={toneFor(matrix?.diagnosis)} text={diagnosisLabel(matrix?.diagnosis)}
        detail={matrix?.narrative?.recommendation ?? undefined} />
      {/* The fleet case chips and pickers fold to one line once a verdict is on screen. */}
      <SelectionSummary summary={loopId && matrix
        ? `${loop?.loopId ?? loopId} · ${windowSize({ windowKind })} fused window · ${windowEnds({ windowEnd: matrix.windowEnd })} (${mode === 'historical' ? 'selected' : 'latest'})`
        : null}>
        <PlantScopeFilter scope={scope} summary={rankings.data ? `${rankings.data.count} loop(s) in scope` : null} />
        <CaseTriage scope={scope} cases={cases} caseFilter={caseFilter}
          loops={filteredLoops.length ? filteredLoops : allLoops} loopId={loopId}
          mode={mode} windowKind={windowKind} windows={windows} matrix={matrix} setParams={setParams} />
      </SelectionSummary>

      {/* I6: error/empty rendering keyed on the query the ACTIVE MODE reads.
          Historical mode used to key on the live query — a failed gate-history
          read showed "No fused verdict" while `latest` had quietly succeeded. */}
      {mode === 'live' && latest.isError && !noVerdictYet && (
        <QueryError title="Verdict unavailable" error={latest.error} retry={() => void latest.refetch()} />
      )}
      {mode === 'historical' && history.isError && (
        <QueryError title="Gate history unavailable" error={history.error} retry={() => void history.refetch()} />
      )}
      {windowFellBack && (
        <p className="cpm-copy" role="status">
          The window this link pointed at is not among the fetched results — showing the
          newest evaluated window instead.
        </p>
      )}
      {!loopId && (
        <section className="cpm-surface">
          <EmptyState title="Select a loop"
            copy="Pick a loop above — or a case chip, then a loop — to follow its evidence from raw signals to the fused conclusion." />
        </section>
      )}
      {loopId && !matrix
        && !(mode === 'live' ? latest.isLoading : history.isLoading)
        && !(mode === 'live' ? latest.isError && !noVerdictYet : history.isError) && (
        <section className="cpm-surface">
          <EmptyState title="No fused verdict for this loop"
            copy="Verdicts appear once the loop completes a 12h/24h evaluation window, or after a recompute." />
        </section>
      )}

      {matrix && (
        <>
          <div className="cpm-grid-2">
            <section className="cpm-surface" id="cpm-conclusion">
              <PanelHead eyebrow="Final conclusion" title={diagnosisLabel(matrix.diagnosis)}
                right={<span title={EVIDENCE_SCORE_HELP}><TonePill tone={toneFor(matrix.diagnosis)}>
                  {matrix.confidence != null && hasVerdict(matrix.diagnosis) ? evidenceScoreText(matrix.confidence) : 'no verdict'}
                </TonePill></span>} />
              {hasVerdict(matrix.diagnosis) && <EvidenceScoreNote statusReason={matrix.narrative?.statusReason} score={matrix.confidence} />}
              {basis && (
                <dl className="cpm-cause" aria-label="Basis of the conclusion">
                  <dt className="cpm-cause__label">Basis</dt>
                  <dd className="cpm-cause__items"><strong>{basis.lead}</strong> {basis.from}.</dd>
                  {basis.notChecked.length > 0 && <>
                    <dt className="cpm-cause__label">Not checked</dt>
                    <dd className="cpm-cause__items"><ul className="cpm-cause-list">{basis.notChecked.map(t => <li key={t}>{t}.</li>)}</ul></dd>
                  </>}
                </dl>
              )}
              <KvRow label="Window">
                {matrix.windowStart ? fmtDateTime(matrix.windowStart) : '—'} →{' '}
                {matrix.windowEnd ? fmtDateTime(matrix.windowEnd) : '—'} ({matrix.windowKind})
              </KvRow>
              {/* audit F4: the newest window is what is shown; an older verdict is named as older, with its age */}
              {matrix.lastVerdict && (
                <KvRow label="Last verdict">
                  <span title={matrix.lastVerdict.windowEnd ?? undefined}>{staleVerdictLine(matrix.lastVerdict)?.replace(/^last verdict /, '')}</span>
                </KvRow>
              )}
              <KvRow label="Instrument health">
                {(healthHistory.data?.intervals ?? []).length > 0 || healthHistory.isLoading
                  ? <HealthLane rows={healthHistory.data?.intervals ?? []} from={start} to={end} role="PV" />
                  : <span className="cpm-metric-na">No health data for this window — not checked (NE107: missing diagnostics are not OK)</span>}
              </KvRow>
              <KvRow label="Severity">{codeLabel(matrix.severity)}</KvRow>
              <KvRow label="Selected family">{codeLabel(matrix.narrative?.selectedFamily)}</KvRow>
              {/* SME #19 (CHG-055): the confirmed SYMPTOM apart from the possible CAUSE */}
              {verdict && !verdict.legacy
                ? <CauseBreakdownRows verdict={verdict} flags={matrix.observabilityFlags} inputs={inputContextOf(loop)} cells={matrix.gates} />
                : <KvRow label="Possible cause">not served (pre-v2.5 result)</KvRow>}
              <KvRow label="G14 confirmation">
                <TonePill tone={verdict?.confirmation.state === 'CONFIRMED' ? 'bad'
                  : verdict?.confirmation.state === 'CONTRADICTED' ? 'good' : 'muted'}>
                  {confirmationLabel(verdict?.confirmation, verdict?.legacy ?? true)}
                </TonePill>
              </KvRow>
              {/* CHG-051: the reason in words; an engine trace string ("selected_family=…") lives in Advanced */}
              {!(machineReason && matrix.familyDisqualifiers.includes(machineReason)) && (
                <KvRow label="Reason">
                  {machineReason && !machineReason.includes('=') ? <CodeLabel code={machineReason} /> : machineReason ? 'see Advanced below' : '—'}
                </KvRow>
              )}
              {matrix.familyDisqualifiers.length > 0 && (
                <KvRow label="Disqualifiers">
                  {matrix.familyDisqualifiers.map(d => (
                    <TonePill key={d} tone="warn"><CodeLabel code={d} /></TonePill>
                  ))}
                </KvRow>
              )}
              {matrix.narrative?.recommendation && (
                <>
                  <PanelHead eyebrow="Next-best action" title="Engine recommendation" />
                  <p className="cpm-copy">{matrix.narrative.recommendation}</p>
                </>
              )}
              <EngineTrace entries={[['diagnosis', matrix.diagnosis], ['leading_hypothesis', verdict?.leadingHypothesis],
                ['confirmation', verdict ? `${verdict.confirmation.state}${verdict.confirmation.reason ? ` / ${verdict.confirmation.reason}` : ''}` : null],
                ['machine_reason', machineReason], ['family_disqualifiers', matrix.familyDisqualifiers.join(', ')],
                ['status_reason', matrix.narrative?.statusReason], ['selected_family', matrix.narrative?.selectedFamily]]} />
            </section>

            <section className="cpm-surface">
              <PanelHead eyebrow="Key facts" title="Numeric evidence on this window" />
              <div className="cpm-kpi-row">
                {KEY_FACTS.map(f => {
                  // CHG-053: a placeholder 0 (method did not qualify) or a value from an excluded window is not a fact
                  const a = metricAvailability(contextOfMatrix(matrix), f.field, metrics[f.field]);
                  return (
                    <KpiTile key={f.field} caption={f.label} tone="muted"
                      value={<MetricValue a={a} text={fmtFact(f, (metrics[f.field] ?? 0) * (f.scale ?? 1))} />}
                      sub={a.reason ?? undefined} />
                  );
                })}
              </div>
            </section>
          </div>

          <section className="cpm-surface">
            <PanelHead eyebrow="Evidence" title="Signals over the evaluated window"
              right={<ObcButton variant="normal" onClick={() => {
                const q = new URLSearchParams({ loop: loopId ?? '' });
                if (matrix.windowEnd) q.set('window', matrix.windowEnd);
                navigate(`/cpm/replay?${q.toString()}`);
              }}>Open in Evidence Replay ›</ObcButton>} />
            {trend.isLoading && <EmptyState title="Loading signals…" />}
            {trend.isError && (
              <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />
            )}
            {!trend.isLoading && !trend.isError && points.length === 0 && (
              <EmptyState title="No historian data for this window" copy={`Nothing stored at ${series}.`} />
            )}
            {points.length > 0 && loopId && <SignalTrend loopId={loopId} points={points} hasVp={hasVp} height={260} />}
          </section>

          <div className="cpm-grid-2">
            <CollapsibleSection id="inv-reasoning" title="Reasoning chain — how the engine got there"
              summary={`Eligibility → Evidence → Fusion · ${machineReason ? `reason code ${machineReason}` : 'fused cleanly'}`}>
              <ReasoningChain matrix={matrix} machineReason={machineReason} />
            </CollapsibleSection>
            <CollapsibleSection id="inv-hypotheses" title="Hypothesis comparison"
              summary={verdict && !verdict.legacy && verdict.leadingHypothesis
                ? `Leading: ${HYPOTHESIS_LABEL[verdict.leadingHypothesis] ?? verdict.leadingHypothesis} · ${confirmationLabel(verdict.confirmation, false)}`
                : 'Family and detector scores (pre-v2.5 result)'}>
              <HypothesisPanel verdict={verdict} metrics={metrics} vpAbsentOnLoop={vpAbsent(inputContextOf(loop))} />
            </CollapsibleSection>
          </div>


          <WindowBrowser windows={windows} matrix={matrix} previous={previous}
            windowKind={windowKind} setParams={setParams} />
        </>
      )}

      {/* SME #22 (CHG-058): notes on the loop — with or without a verdict, with or without an open episode */}
      {loopId && (
        <LoopNotes loopId={loopId} openFrame={openFrame ?? null}
          window={matrix ? { methodRunId: matrix.methodRunIds?.G15 ?? null, label: windowLabel({ windowKind, windowEnd: matrix.windowEnd }) } : null} />
      )}
    </div>
  );
};

export default CpmInvestigation;
