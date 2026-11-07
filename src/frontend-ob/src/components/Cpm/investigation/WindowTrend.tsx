/**
 * CHG-141: the left column of the evidence: the values at the window end, the trend over the window (same chart, same
 * height), its links, and the instrument health over the same window beneath it (v2.5 1H.6), so a health exclusion or a
 * device replacement shows beside the evidence it affected. The values come from the trend's own last bucket: this
 * page is about a window, so it never shows today's values beside it.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmLoop } from '../../../api/cpmApi';
import type { CpmTrendPoint } from '../../../api/cpm/kpis';
import { useCpmTrend } from '../../../hooks/useCpm';
import { Toggletip } from '../../../ui/Toggletip';
import { loopSeries } from '../../../utils/loopSeries';
import { registryHref, replayHref } from '../cpaHref';
import { SignalStripAt } from '../explorer/summary/SignalStrip';
import { bucketValue } from '../explorer/summary/useSignalValues';
import { HealthLane } from '../health/HealthLane';
import { useInstrumentHealthHistory } from '../health/useInstrumentHealth';
import { EmptyState, KvRow, QueryError } from '../shared';
import SignalTrend from '../trend/SignalTrend';

/** The newest bucket that holds a value: a stalled feed can end the window on empty buckets. */
const lastBucket = (points: CpmTrendPoint[]): CpmTrendPoint | undefined =>
  [...points].reverse().find(p => bucketValue(p, 'pv') != null || bucketValue(p, 'op') != null) ?? points[points.length - 1];

export const WindowTrend: React.FC<{
  loopId: string;
  loop: CpmLoop | undefined;
  matrix: CpmGateMatrix;
  windowKind: string;
  /** The gate open in the panel: Replay opens on it. */
  gate: string | null;
}> = ({ loopId, loop, matrix, windowKind, gate }) => {
  const navigate = useNavigate();
  const series = loopSeries(loopId);
  // I10: on a stiction-diagnosis investigation, VP-vs-OP is the direct visual signature of a sticking valve.
  const hasVp = !!loop?.tags['VP'];
  const { start, end } = useMemo(() => {
    if (matrix.windowStart && matrix.windowEnd) return { start: new Date(matrix.windowStart), end: new Date(matrix.windowEnd) };
    const now = new Date();
    return { start: new Date(now.getTime() - 24 * 3600_000), end: now };
  }, [matrix.windowStart, matrix.windowEnd]);
  const trend = useCpmTrend(series, start, end, 280, hasVp ? 'pv,sp,op,vp,mode' : 'pv,sp,op,mode', true);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  const health = useInstrumentHealthHistory(loopId, start, end);
  const intervals = health.data?.intervals ?? [];
  const at = lastBucket(points);

  return (
    <section className="cpm-surface cpm-inv-trend" aria-label="Signals over this window">
      {at && <SignalStripAt point={at} />}
      {trend.isLoading && <EmptyState title="Loading signals…" />}
      {trend.isError && <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />}
      {!trend.isLoading && !trend.isError && points.length === 0 && (
        // CHG-098 (SME review 2 #29): plain wording, the series as detail, a route to the mapping.
        <EmptyState title="No historian data for this window"
          copy={`No PV / SP / OP samples were stored for this loop over this window. Check its signal mapping in the Loop Registry. (Historian series: ${series})`}
          next={[{ label: 'Signal mapping in the Loop Registry', to: registryHref(loopId) }]} />
      )}
      {points.length > 0 && (
        <SignalTrend loopId={loopId} points={points} hasVp={hasVp} height={260} resetLabel="Full window"
          foot={<ObcButton variant="flat" onClick={() => navigate(replayHref(loopId, { window: matrix.windowEnd, kind: windowKind, gate }))}>Evidence Replay ↗</ObcButton>} />
      )}
      <KvRow label="Instrument health">
        {intervals.length > 0 || health.isLoading ? <HealthLane rows={intervals} from={start} to={end} role="PV" /> : (
          <span className="cpm-title-row">
            <span className="cpm-metric-na">No health data for this window — not checked</span>
            <Toggletip variant="how-to" label="Missing health data"><p>NAMUR NE107: missing diagnostics are not OK.</p></Toggletip>
          </span>
        )}
      </KvRow>
    </section>
  );
};

export default WindowTrend;
