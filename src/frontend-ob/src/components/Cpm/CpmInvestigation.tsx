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
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KpiTile, KvRow, PanelHead, TonePill, WorkspaceHeader, toneFor,
  fmtDateTime, QueryError, cpmChartColors } from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import { staleVerdictLine } from './verdictAge';
import { ApiError } from '../../api/apiFetch';
import type { CpmGateMatrix } from '../../api/cpmApi';
import { HYPOTHESIS_LABEL } from '../../api/cpm/verdict';
import {
  useAcknowledgeEvent, useCpmEvents, useCpmLoops, useCpmTrend,
  useFleetRankings, useGateHistory, useLatestGates,
} from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';
import { useObcTheme } from '../../hooks/useObcTheme';
import { CaseTriage } from './investigation/CaseTriage';
import { HypothesisPanel } from './investigation/HypothesisPanel';
import { ReasoningChain } from './investigation/ReasoningChain';
import { WindowBrowser } from './investigation/WindowBrowser';
import { caseCounts, caseIdFor } from './investigation/cases';
import { confirmationLabel } from './investigation/confirmationCopy';
import { KEY_FACTS, fmt } from './investigation/keyFacts';
import { HealthLane } from './health/HealthLane';
import { useInstrumentHealthHistory } from './health/useInstrumentHealth';

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
  const rankings = useFleetRankings(scope.params, '24h', 'confidence', 200);

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

  const obcTheme = useObcTheme(); // C: re-derive chart colors on theme switch
  const chartOption = useMemo(() => {
    const { good, amber, grey, pink } = cpmChartColors();
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    return {
      animation: false,
      grid: { left: 48, right: 16, top: 20, bottom: 30 },
      tooltip: {
        trigger: 'axis',
        // I14: filter the stacked envelope helpers — their values (min, and
        // max-minus-min) are not signals; report the bucket's real min–max.
        formatter: (ps: Array<{ seriesName: string; marker: string; value: [number, number | null] }>) => {
          if (!ps.length) return '';
          const ts = ps[0].value?.[0];
          const p = points.find(pt => pt.ts === ts);
          const rows = ps
            .filter(x => x.seriesName !== 'pv-min' && x.seriesName !== 'pv-band')
            .map(x => `${x.marker} ${x.seriesName}: ${x.value?.[1] == null ? '—' : Number(x.value[1]).toFixed(2)}`);
          const lo = p && typeof p.pv_min === 'number' ? p.pv_min : null;
          const hi = p && typeof p.pv_max === 'number' ? p.pv_max : null;
          if (lo != null && hi != null) rows.push(`PV range: ${lo.toFixed(2)} – ${hi.toFixed(2)}`);
          return [`<strong>${fmtDateTime(ts)}</strong>`, ...rows].join('<br/>');
        },
      },
      xAxis: { type: 'time', axisLabel: { color: grey } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
      series: [
        { name: 'pv-min', type: 'line', stack: 'pv', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, data: points.map(p => [p.ts, num(p.pv_min)]) },
        { name: 'pv-band', type: 'line', stack: 'pv', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, areaStyle: { color: good, opacity: 0.18 },
          data: points.map(p => {
            const lo = num(p.pv_min); const hi = num(p.pv_max);
            return [p.ts, lo != null && hi != null ? hi - lo : null];
          }) },
        { name: 'PV', type: 'line', symbol: 'none', lineStyle: { color: good, width: 2 },
          data: points.map(p => [p.ts, num(p.pv_avg) ?? num(p.pv)]) },
        { name: 'SP', type: 'line', symbol: 'none', lineStyle: { color: grey, width: 1, type: 'dashed' },
          data: points.map(p => [p.ts, num(p.sp)]) },
        { name: 'OP', type: 'line', symbol: 'none', lineStyle: { color: amber, width: 1.5 },
          data: points.map(p => [p.ts, num(p.op_avg) ?? num(p.op)]) },
        ...(hasVp ? [
          { name: 'VP', type: 'line', symbol: 'none', lineStyle: { color: pink, width: 1.5 },
            data: points.map(p => [p.ts, num(p.vp_avg) ?? num(p.vp)]) },
        ] : []),
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- obcTheme is a recompute trigger: chart colors are read from CSS vars that change with the theme.
  }, [points, hasVp, obcTheme]);

  const metrics = matrix?.metrics ?? {};
  const machineReason = matrix?.insufficientEvidenceReason
    ?? matrix?.familyDisqualifiers[0]
    ?? matrix?.narrative?.statusReason
    ?? null;
  const verdict = matrix?.verdictV2;

  // Investigation note → the loop's open event frame (full cases are DG-7).
  const events = useCpmEvents({ loopId, openOnly: true, limit: 5 }, 60_000, !!loopId); // C
  const openFrame = events.data?.events.find(e => e.ack_state === 'UNACKNOWLEDGED');
  const ack = useAcknowledgeEvent();
  const [note, setNote] = useState('');

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Root-cause workspace"
        title="Investigation"
        copy="Follow one loop's evidence from raw signals through the gate chain to the fused conclusion."
      />
      <PlantScopeFilter scope={scope} summary={rankings.data ? `${rankings.data.count} loop(s) in scope` : null} />

      <CaseTriage scope={scope} cases={cases} caseFilter={caseFilter}
        loops={filteredLoops.length ? filteredLoops : allLoops} loopId={loopId}
        mode={mode} windowKind={windowKind} windows={windows} matrix={matrix} setParams={setParams} />

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
            <section className="cpm-surface">
              <PanelHead eyebrow="Final conclusion" title={(matrix.diagnosis ?? 'NONE').replace(/_/g, ' ')}
                right={<TonePill tone={toneFor(matrix.diagnosis)}>
                  {matrix.confidence != null ? `${(matrix.confidence * 100).toFixed(0)}% confidence` : 'no confidence'}
                </TonePill>} />
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
                <HealthLane rows={healthHistory.data?.intervals ?? []} from={start} to={end} role="PV" />
              </KvRow>
              <KvRow label="Severity">{matrix.severity ?? '—'}</KvRow>
              <KvRow label="Selected family">{matrix.narrative?.selectedFamily ?? '—'}</KvRow>
              <KvRow label="Leading hypothesis">
                {verdict && !verdict.legacy && verdict.leadingHypothesis
                  ? (HYPOTHESIS_LABEL[verdict.leadingHypothesis] ?? verdict.leadingHypothesis)
                  : 'not served (pre-v2.5 result)'}
              </KvRow>
              <KvRow label="G14 confirmation">
                <TonePill tone={verdict?.confirmation.state === 'CONFIRMED' ? 'bad'
                  : verdict?.confirmation.state === 'CONTRADICTED' ? 'good' : 'muted'}>
                  {confirmationLabel(verdict?.confirmation, verdict?.legacy ?? true)}
                </TonePill>
              </KvRow>
              <KvRow label="Machine reason">
                <span className="cpm-mono">{machineReason ?? '—'}</span>
              </KvRow>
              {matrix.familyDisqualifiers.length > 0 && (
                <KvRow label="Disqualifiers">
                  {matrix.familyDisqualifiers.map(d => (
                    <TonePill key={d} tone="warn">{d}</TonePill>
                  ))}
                </KvRow>
              )}
              {matrix.narrative?.recommendation && (
                <>
                  <PanelHead eyebrow="Next-best action" title="Engine recommendation" />
                  <p className="cpm-copy">{matrix.narrative.recommendation}</p>
                </>
              )}
            </section>

            <section className="cpm-surface">
              <PanelHead eyebrow="Key facts" title="Numeric evidence on this window" />
              <div className="cpm-kpi-row">
                {KEY_FACTS.map(f => (
                  <KpiTile key={f.field} caption={f.label} tone="muted"
                    value={metrics[f.field] != null
                      ? `${fmt(metrics[f.field]! * (f.scale ?? 1))}${f.unit}` : '—'}
                    sub={metrics[f.field] == null ? 'not in this payload' : undefined} />
                ))}
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
            {points.length > 0 && <ReactECharts option={chartOption} style={{ height: 260 }} notMerge />}
          </section>

          <div className="cpm-grid-2">
            <section className="cpm-surface">
              <ReasoningChain matrix={matrix} machineReason={machineReason} />
            </section>

            <section className="cpm-surface">
              <HypothesisPanel verdict={verdict} metrics={metrics} />

              <PanelHead eyebrow="Record it" title="Investigation note" />
              {openFrame ? (
                <>
                  <textarea className="cpm-textarea" rows={2} value={note}
                    placeholder="Finding, action taken, follow-up owner…"
                    onChange={e => setNote(e.target.value)} />
                  <div className="cpm-filter-row" style={{ marginTop: 8 }}>
                    <ObcButton variant="raised" disabled={note.trim().length === 0 || ack.isPending}
                      onClick={() => ack.mutate(
                        { id: openFrame.id, note: `INVESTIGATION: ${note.trim()}` },
                        { onSuccess: () => setNote('') })}>
                      {ack.isPending ? 'Saving…' : 'Create investigation note ›'}
                    </ObcButton>
                    {ack.isSuccess && <TonePill tone="good">SAVED</TonePill>}
                  </div>
                  <p className="cpm-copy">
                    Saved as a note on the open event frame (acknowledges it). Full case
                    management is not built yet — that is data-gap DG-7, not a hidden feature.
                  </p>
                </>
              ) : (
                <EmptyState title="No open event frame"
                  copy="Notes attach to event frames; this loop has none open right now." />
              )}
            </section>
          </div>

          <WindowBrowser windows={windows} matrix={matrix} previous={previous}
            windowKind={windowKind} setParams={setParams} />
        </>
      )}
    </div>
  );
};

export default CpmInvestigation;
