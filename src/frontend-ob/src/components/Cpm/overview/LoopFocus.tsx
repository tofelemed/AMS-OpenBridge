'use client';

/**
 * Loop focus panel: the live signal row and an 8h rolling PV/SP/OP envelope
 * for the selected loop.
 *
 * CHG-177 (owner review, Overview v2, the approved sample and the answers of 12 Nov 2026): headed by the tag alone with
 * Review → (the name went: it was said in the rows too); no "live · source · feed · envelope" line (Signal quality says
 * live or not, the 8 h are on the chart's time axis, source and feed times are on Loop Explorer); the trend without
 * Zoom area / Undo / Reset and its ? (How to read holds the band note); an empty read says one line.
 * Owner, 12 Nov (after the build): the PV / SP / OP / MODE pills always show (— until a value arrives) and the Signal
 * quality pill leaves the Overview (Loop Explorer keeps it).
 */
import { pipelineHref, registryHref, investigationHref } from '../cpaHref';
import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PanelHead, TonePill, QueryError, useRollingWindow, TREND_SPAN_MS, TREND_TICK_MS } from '../shared';
import { usePipelineAccess } from '../access';
import { useCpmTrend } from '../../../hooks/useCpm';
import { useLoopLive } from '../../../hooks/useLoopLive';
import { loopSeries } from '../../../utils/loopSeries';
import SignalTrend from '../trend/SignalTrend';

const RANGE = 'in the last 8 h';

export const LoopFocus: React.FC<{
  loopId: string;
  windowKind?: string;
}> = ({ loopId, windowKind }) => {
  const navigate = useNavigate();
  const canPipeline = usePipelineAccess();
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
  const fmtLive = (m: { value: number | string | boolean } | undefined, digits = 1) =>
    m == null ? '—' : typeof m.value === 'number' ? m.value.toFixed(digits) : String(m.value);

  return (
    <section className="cpm-surface cpm-ov-focus" aria-label={`Chosen loop ${loopId}`}>
      <PanelHead title={loopId}
        right={<ObcButton variant="raised" onClick={() => navigate(investigationHref(loopId, { kind: windowKind }))}>Review →</ObcButton>} />
      <div className="cpm-filter-row cpm-ov-focus__chips">
        {/* Live signal row (F0.5): RBE means "no update" ≠ 0 — absent renders as —.
            SME #8 (CHG-046): the values are neutral (alert colours mean a state, never a pen). */}
        <TonePill tone="muted">PV {fmtLive(live.pv)}</TonePill>
        <TonePill tone="muted">SP {fmtLive(live.sp)}</TonePill>
        <TonePill tone="muted">OP {fmtLive(live.op)}</TonePill>
        <TonePill tone="muted">MODE {fmtLive(live.mode)}</TonePill>
      </div>
      {trend.isLoading && <p className="cpm-empty-line">Loading trend…</p>}
      {/* A 403/500 from the historian is not an empty historian — claiming "no
          samples stored" for a failed read sends the reader to debug IoTDB. */}
      {trend.isError && (
        <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />
      )}
      {!trend.isLoading && !trend.isError && points.length === 0 && (
        // CHG-098 (SME review 2 #29): routes to the mapping and the engine. CHG-177: one line, without the historian path.
        <p className="cpm-empty-line">
          <strong>No PV, SP or OP samples stored {RANGE}</strong>
          {' · '}<Link className="cpm-link" to={registryHref(loopId)}>Signal mapping ↗</Link>
          {canPipeline && <>{' · '}<Link className="cpm-link" to={pipelineHref()}>Pipeline Health ↗</Link></>}
        </p>
      )}
      {points.length > 0 && <SignalTrend loopId={loopId} points={points} height={260} live tools={false} rangeText={RANGE} />}
    </section>
  );
};

export default LoopFocus;
