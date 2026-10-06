/**
 * Explorer › Summary › the loop trend panel (moved out of OperatingState in CHG-049).
 *
 * The period bar (CHG-048), then the evaluated window against what is plotted (SME review #12):
 *  - the latest evaluated window is a labelled band on the trend wherever it overlaps the range;
 *  - when it lies outside the range, a line says so, with "Show evaluated period ›";
 *  - when the trend IS the evaluated window (a diagnosis click lands here), "Compare with now" adds a
 *    second trend of the live 8 h under it, both on ONE y-scale so the shapes compare like with like.
 * The gate row is the one LoopWorkspace already holds (same query key); the live trend is fetched only
 * while the comparison is on.
 */
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../../api/cpmApi';
import type { CpmTrendPoint } from '../../../../api/cpm/kpis';
import { useCpmTrend, useLatestGates } from '../../../../hooks/useCpm';
import { loopSeries } from '../../../../utils/loopSeries';
import { EmptyState, QueryError, TREND_SPAN_MS, TREND_TICK_MS, useRollingWindow } from '../../shared';
import { historicalHref } from '../../cpaHref';
import { fmtPeriod } from '../../context/LoopContextBar';
import SignalTrend from '../../trend/SignalTrend';
import TimeRangeBar from '../../trend/TimeRangeBar';
import type { useTrendRange } from '../../trend/useTrendRange';
import { evaluatedWindowOf, isWindowRange, overlaps, pinEvaluated, sharedBounds } from '../../trend/evaluatedWindow';
import { conditionOf } from './summaryText';

export const LoopTrendPanel: React.FC<{
  loop: CpmLoop;
  range: ReturnType<typeof useTrendRange>;
  trend: UseQueryResult<{ points: CpmTrendPoint[] }>;
  points: CpmTrendPoint[];
}> = ({ loop, range, trend, points }) => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { from, to } = range;
  const windowKind = params.get('window') ?? '24h';
  const gates = useLatestGates(loop.loopId, windowKind);
  const m = gates.data;
  const evaluated = m ? evaluatedWindowOf(m.windowStart, m.windowEnd,
    `Evaluated ${windowKind} window · ${conditionOf(m.diagnosis).label}`) : null;
  const inView = !!evaluated && overlaps(evaluated, from.getTime(), to.getTime());
  const isEvaluatedView = !!evaluated && !range.live && isWindowRange(evaluated, from.getTime(), to.getTime());
  const compare = isEvaluatedView && params.get('compare') === '1';

  // "Now" for the comparison: the live 8 h, fetched only while the comparison is shown.
  const now = useRollingWindow(TREND_SPAN_MS, TREND_TICK_MS);
  const nowTrend = useCpmTrend(loopSeries(loop.loopId), now.start, now.end, 240, 'pv,sp,op', compare, true);
  const nowPoints = useMemo(() => nowTrend.data?.points ?? [], [nowTrend.data]);
  const yBounds = useMemo(() => (compare ? sharedBounds([points, nowPoints]) : null), [compare, points, nowPoints]);

  const showEvaluated = () => {
    if (m?.windowStart && m.windowEnd) setParams(p => pinEvaluated(p, m.windowStart!, m.windowEnd!), { replace: true });
  };
  const setCompare = (on: boolean) => setParams(p => { if (on) p.set('compare', '1'); else p.delete('compare'); return p; }, { replace: true });
  const windowText = evaluated ? fmtPeriod({ label: `Evaluated ${windowKind} window`, start: evaluated.startMs, end: evaluated.endMs }) : '';

  return (
    <div id="cpm-loop-trend">
      <TimeRangeBar from={from} to={to} presets={range.presets} preset={range.preset}
        onPreset={range.applyPreset} onStep={range.step} onApplyCustom={range.applyCustom}
        nowLabel="Live" nowTitle="Back to the live rolling 8 h" onNow={range.goLive}
        stateNote={isEvaluatedView ? 'evaluated window' : range.live ? 'live' : 'fixed period'}
        hideCustomInputs={isEvaluatedView}>
        <ObcButton variant="flat" title={`Open ${loop.loopId} in Historical on this period`}
          onClick={() => navigate(historicalHref(loop.loopId, { from: from.toISOString(), to: to.toISOString() }))}>
          Open in Historical ›
        </ObcButton>
      </TimeRangeBar>

      {evaluated && !inView && (
        <p className="cpm-eval-note">
          <span>{windowText} is outside this trend range — the diagnosis is about that window, not this one.</span>
          <ObcButton variant="normal" onClick={showEvaluated}>Show evaluated period ›</ObcButton>
        </p>
      )}
      {isEvaluatedView && (
        <p className="cpm-eval-note">
          <span>This trend is the evaluated {windowKind} window the diagnosis is about.</span>
          <ObcButton variant={compare ? 'normal' : 'raised'} aria-pressed={compare}
            title={compare ? 'Hide the live 8 h comparison' : 'Add the live 8 h under it, on the same scale'}
            onClick={() => setCompare(!compare)}>
            {compare ? 'Hide comparison' : 'Compare with now'}
          </ObcButton>
        </p>
      )}
      {evaluated && inView && !isEvaluatedView && (
        <p className="cpm-eval-note">
          <span>The shaded band is the evaluated {windowKind} window behind the diagnosis.</span>
          <ObcButton variant="flat" onClick={showEvaluated}>Show only that window ›</ObcButton>
        </p>
      )}

      {trend.isLoading && <EmptyState title="Loading trend…" />}
      {/* A historian 403/500 is not an empty historian. */}
      {trend.isError && (
        <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />
      )}
      {points.length > 0 && (
        <SignalTrend loopId={loop.loopId} points={points} live={range.live}
          caption={isEvaluatedView ? 'Evaluated window (diagnosis)' : range.live ? 'Trend · live 8 h' : 'Trend · fixed period'}
          xRange={{ fromMs: from.getTime(), toMs: to.getTime() }}
          evaluated={inView ? evaluated : null} yBounds={yBounds} />
      )}
      {compare && (nowTrend.isLoading ? <EmptyState title="Loading the live 8 h…" />
        : nowTrend.isError ? <QueryError title="Live trend unavailable" error={nowTrend.error} retry={() => void nowTrend.refetch()} />
        : (
          <SignalTrend loopId={loop.loopId} points={nowPoints} live caption="Now · live 8 h"
            xRange={{ fromMs: now.start.getTime(), toMs: now.end.getTime() }} yBounds={yBounds} />
        ))}
    </div>
  );
};

export default LoopTrendPanel;
