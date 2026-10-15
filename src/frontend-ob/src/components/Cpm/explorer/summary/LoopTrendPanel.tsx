/**
 * Explorer › Summary › the loop trend panel (moved out of OperatingState in CHG-067).
 *
 * The period bar (CHG-048), then the evaluated window against what is plotted (SME review #12):
 *  - the latest evaluated window is a labelled band on the trend wherever it overlaps the range;
 *  - when it lies outside the range, a line says so, with "Show evaluated period ›";
 *  - when the trend IS the evaluated window (a diagnosis click lands here), "Compare with previous window" /
 *    "Compare with now" add a second trend under it of the SAME LENGTH (the window just before it, or the same span
 *    ending now), both on ONE y-scale and equal time spans, so the shapes line up (CHG-097, SME review 2 #26).
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
import { EmptyState, QueryError, TREND_TICK_MS, fmtDuration, useRollingWindow } from '../../shared';
import { historicalHref } from '../../cpaHref';
import { fmtPeriod } from '../../context/LoopContextBar';
import SignalTrend from '../../trend/SignalTrend';
import TimeRangeBar from '../../trend/TimeRangeBar';
import type { useTrendRange } from '../../trend/useTrendRange';
import { evaluatedWindowOf, isWindowRange, overlaps, pinEvaluated, sharedBounds } from '../../trend/evaluatedWindow';
import { conditionOf } from './summaryText';
import { windowKindOf } from '../../useWindowKind';

export const LoopTrendPanel: React.FC<{
  loop: CpmLoop;
  range: ReturnType<typeof useTrendRange>;
  trend: UseQueryResult<{ points: CpmTrendPoint[] }>;
  points: CpmTrendPoint[];
}> = ({ loop, range, trend, points }) => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { from, to } = range;
  const windowKind = windowKindOf(params.get('window'));   // CHG-089: 12h default
  const gates = useLatestGates(loop.loopId, windowKind);
  const m = gates.data;
  const evaluated = m ? evaluatedWindowOf(m.windowStart, m.windowEnd,
    `Evaluated ${windowKind} window · ${conditionOf(m.diagnosis).label}`) : null;
  const inView = !!evaluated && overlaps(evaluated, from.getTime(), to.getTime());
  const isEvaluatedView = !!evaluated && !range.live && isWindowRange(evaluated, from.getTime(), to.getTime());
  // ?compare=previous | now ('1' = now, links written before CHG-097); only on the evaluated-window view
  const compareParam = params.get('compare');
  const compareMode: 'previous' | 'now' | null = !isEvaluatedView ? null
    : compareParam === 'previous' ? 'previous' : compareParam === 'now' || compareParam === '1' ? 'now' : null;
  const compare = compareMode != null;

  // The comparison period has the evaluated window's own length — never a different span — so the two time axes align.
  const lengthMs = evaluated ? evaluated.endMs - evaluated.startMs : 0;
  const rolling = useRollingWindow(Math.max(lengthMs, 60_000), TREND_TICK_MS);
  const other = compareMode === 'previous' && evaluated
    ? { start: new Date(evaluated.startMs - lengthMs), end: new Date(evaluated.startMs) }
    : { start: rolling.start, end: rolling.end };
  const otherTrend = useCpmTrend(loopSeries(loop.loopId), other.start, other.end, 240, 'pv,sp,op', compare, compareMode === 'now');
  const otherPoints = useMemo(() => otherTrend.data?.points ?? [], [otherTrend.data]);
  const yBounds = useMemo(() => (compare ? sharedBounds([points, otherPoints]) : null), [compare, points, otherPoints]);
  const otherCaption = compareMode === 'previous'
    ? `Previous window · the ${fmtDuration(lengthMs)} before it`
    : `Now · the latest ${fmtDuration(lengthMs)}`;

  const showEvaluated = () => {
    if (m?.windowStart && m.windowEnd) setParams(p => pinEvaluated(p, m.windowStart!, m.windowEnd!), { replace: true });
  };
  const setCompare = (mode: 'previous' | 'now' | null) =>
    setParams(p => { if (mode) p.set('compare', mode); else p.delete('compare'); return p; }, { replace: true });
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
          <ObcButton variant={compareMode === 'previous' ? 'raised' : 'normal'} aria-pressed={compareMode === 'previous'}
            title="Add the window just before it, of the same length, under it on the same scale"
            onClick={() => setCompare(compareMode === 'previous' ? null : 'previous')}>
            Compare with previous window
          </ObcButton>
          <ObcButton variant={compareMode === 'now' ? 'raised' : 'normal'} aria-pressed={compareMode === 'now'}
            title="Add the same length of time ending now under it, on the same scale"
            onClick={() => setCompare(compareMode === 'now' ? null : 'now')}>
            Compare with now
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
      {compare && (otherTrend.isLoading ? <EmptyState title="Loading the comparison period…" />
        : otherTrend.isError ? <QueryError title="Comparison trend unavailable" error={otherTrend.error} retry={() => void otherTrend.refetch()} />
        : (
          <>
            <p className="cpm-eval-note"><span>Same length and same y-scale as the evaluated window above: a point at the same
              horizontal position is the same time into each period.</span></p>
            <SignalTrend loopId={loop.loopId} points={otherPoints} live={compareMode === 'now'} caption={otherCaption}
              xRange={{ fromMs: other.start.getTime(), toMs: other.end.getTime() }} yBounds={yBounds} />
          </>
        ))}
    </div>
  );
};

export default LoopTrendPanel;
