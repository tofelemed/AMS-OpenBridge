'use client';

/**
 * Loop focus panel: the live signal row and an 8h rolling PV/SP/OP envelope
 * for the selected loop. Phase 5 (cpa-ui-fix-plan): rectangle zoom on the
 * already loaded window; the rolling refetch keeps the zoom (it lives in the
 * option) and the bar says the viewport is held while zoomed.
 */
import React, { useMemo } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, PanelHead, TonePill, fmtDateTime, QueryError, useRollingWindow, TREND_SPAN_MS, TREND_TICK_MS } from '../shared';
import { useCpmTrend } from '../../../hooks/useCpm';
import { useLoopLive, qualityLabel } from '../../../hooks/useLoopLive';
import { FacetPill, liveSignalQuality } from '../FacetPill';
import { loopSeries } from '../../../utils/loopSeries';
import SignalTrend from '../trend/SignalTrend';

// ── loop focus panel (signal row + envelope trend) ─────────────────────────

export const LoopFocus: React.FC<{
  loopId: string;
  displayName: string;
  onOpenAnalysis: () => void;
}> = ({ loopId, displayName, onOpenAnalysis }) => {
  // The historian device for a loop follows the Phase 3 convention.
  const series = loopSeries(loopId);
  // Rolling, not anchored-at-mount: this panel sits on an overview screen that is
  // routinely left open, and a window frozen at click time is indistinguishable
  // from a live one. pollDriven keeps the timer refetches off the session clock.
  const { start, end } = useRollingWindow(TREND_SPAN_MS, TREND_TICK_MS);

  const trend = useCpmTrend(series, start, end, 240, 'pv,sp,op', true, true);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  // F0.5 — live plane: RBE deltas + snapshot-on-open for this loop's device.
  const live = useLoopLive(loopId);
  const q = qualityLabel(live.quality ?? live.pv);
  const sq = liveSignalQuality(q, live.lastSourceTs);
  const fmtLive = (m: { value: number | string | boolean } | undefined, digits = 1) =>
    m == null ? '—' : typeof m.value === 'number' ? m.value.toFixed(digits) : String(m.value);


  return (
    <section className="cpm-surface">
      <PanelHead eyebrow={displayName} title={loopId}
        right={<ObcButton variant="raised" onClick={onOpenAnalysis}>Open analysis ›</ObcButton>} />
      <div className="cpm-filter-row" style={{ marginBottom: 8 }}>
        {/* Live signal row (F0.5): RBE means "no update" ≠ 0 — absent renders as —.
            SME #8 (CHG-046): the values are neutral (alert colours mean a state, never a pen) and
            quality is its own captioned facet, so a green "Good" is never read as a verdict. */}
        <TonePill tone="muted">PV {fmtLive(live.pv)}</TonePill>
        <TonePill tone="muted">SP {fmtLive(live.sp)}</TonePill>
        <TonePill tone="muted">OP {fmtLive(live.op)}</TonePill>
        <TonePill tone="muted">MODE {fmtLive(live.mode)}</TonePill>
        <FacetPill facet="signal" tone={sq.tone}>{sq.text}</FacetPill>
        <span className="cpm-filter-count">
          {live.hasData && live.lastSourceTs
            ? `live · source ${new Date(live.lastSourceTs).toLocaleTimeString()}`
              + (live.lastEmissionTs ? ` · feed ${new Date(live.lastEmissionTs).toLocaleTimeString()}` : '')
            : 'no live publisher for this loop'}
          {/* State the window: it rolls, and a rolling window that has silently
              stopped advancing looks identical to a live one otherwise. */}
          {' · '}envelope {fmtDateTime(start.getTime())} → {fmtDateTime(end.getTime())}
        </span>
      </div>
      {trend.isLoading && <EmptyState title="Loading trend…" />}
      {/* A 403/500 from the historian is not an empty historian — claiming "no
          samples stored" for a failed read sends the reader to debug IoTDB. */}
      {trend.isError && (
        <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />
      )}
      {!trend.isLoading && !trend.isError && points.length === 0 && (
        <EmptyState title="No historian data for this loop"
          copy={`No samples stored at ${series} in this window.`} />
      )}
      {points.length > 0 && <SignalTrend loopId={loopId} points={points} height={260} live />}
    </section>
  );
};

export default LoopFocus;
