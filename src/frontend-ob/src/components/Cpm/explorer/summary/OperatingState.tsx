'use client';

/**
 * Explorer › Summary › operating state: live / last-stored PV-SP-OP-MODE tiles
 * and the 8 h rolling trend. Moved out of SummaryTab (cpa-ui-fix-plan Phase 3)
 * so the Summary can carry the gate strip and calculations as well; Phase 5
 * adds rectangle zoom on the loaded window (held across the rolling refetch).
 *
 * When there is no live publisher AND no historian data it renders one honest
 * empty state instead of three "—" tiles that read like measured zeros.
 */
import React, { useMemo } from 'react';
import type { CpmLoop } from '../../../../api/cpmApi';
import { useCpmTrend, useLoopLastValues } from '../../../../hooks/useCpm';
import { useLoopLive, qualityLabel } from '../../../../hooks/useLoopLive';
import { FacetPill, STALE_LIVE_MS, liveSignalQuality } from '../../FacetPill';
import { ageText } from './summaryText';
import { loopSeries } from '../../../../utils/loopSeries';
import { modeLabel } from '../../../../utils/modeVocabulary';
import {
  EmptyState, PanelHead,
  fmtDateTime,
} from '../../shared';
import { useTrendRange } from '../../trend/useTrendRange';
import LoopTrendPanel from './LoopTrendPanel';

const num = (v: unknown) => (typeof v === 'number' ? v : null);

/**
 * CHG-078: a value is either live or old — never both. "live" while the feed is current (RBE heartbeats every
 * signal every 300 s, so past two heartbeats the feed has stalled); otherwise only its age ("last received 13 days
 * ago"), the same threshold and age words as the signal-quality pill.
 */
export const liveSource = (ts: number | undefined): string =>
  ts && Date.now() - ts > STALE_LIVE_MS ? `last received ${ageLabel(ts)}` : 'live';

/** Age of a stored value, in the app's age words (summaryText.ageText). */
const ageLabel = (ts: number | undefined): string => (ts ? ageText(Date.now() - ts) : 'earlier');

export const OperatingState: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  // Live plane (RBE + snapshot-on-open); historian values remain the fallback.
  const live = useLoopLive(loop.loopId);
  const series = loopSeries(loop.loopId);
  // SME #11 (CHG-048): live rolling 8 h by default; a preset, ‹ / › or a custom pair pins a period (URL).
  const range = useTrendRange();
  const { from: start, to: end } = range;
  // pollDriven only while live: then the window advances on a timer, not because the operator asked.
  const trend = useCpmTrend(series, start, end, 240, 'pv,sp,op,mode', true, range.live);
  // Third plane. live -> trend bucket -> last stored value, which is the only one
  // with no time bound: a setpoint held for a month and a loop parked in AUT are
  // invisible to the other two.
  const lastStored = useLoopLastValues(series);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  // The tiles' trend fallback is the newest bucket — only meaningful while the trend is live; a pinned
  // past period must never present its last bucket as the loop's current value.
  const last = range.live && points.length ? points[points.length - 1] : undefined;


  // The third plane counts: a loop whose only evidence is a last stored value must
  // render its tiles, not the "nothing here" state this guard exists for.
  const hasStored = Object.keys(lastStored.data?.values ?? {}).length > 0;
  const noData = !live.hasData && !trend.isLoading && !trend.isError && points.length === 0
                 && !lastStored.isLoading && !hasStored;

  return (
    <div>
      <PanelHead
        eyebrow={live.hasData ? 'Live operating state' : 'Last stored samples'}
        title="Operating state"
      />

      {noData ? (
        <EmptyState
          title="No operating data"
          copy={`No live publisher, and no samples stored at ${series} in ${range.live ? 'the last 8 hours' : 'this period'}.`}
        />
      ) : (
        <>
          <div className="cpm-kpi-row" style={{ marginBottom: 12 }}>
            {(['pv', 'sp', 'op'] as const).map(m => {
              const lv = live[m];
              const liveVal = lv && typeof lv.value === 'number' ? lv.value.toFixed(2) : null;
              // Read the SAME aggregate the chart pen draws: PV/OP from the
              // bucket average, SP from last_value.
              const stored = m === 'sp'
                ? num(last?.[m])
                : num(last?.[`${m}_avg`]) ?? num(last?.[m]);
              const held = num(lastStored.data?.values?.[m]?.value);
              const shown = liveVal ?? (stored != null ? stored.toFixed(2)
                                      : held != null ? held.toFixed(2) : null);
              const heldTs = stored == null && held != null
                ? lastStored.data?.values?.[m]?.ts : undefined;
              return (
                <div key={m} className="cpm-kpi">
                  <span className="cpm-kpi__caption">{m.toUpperCase()}</span>
                  <span className="cpm-kpi__value">{shown ?? '—'}</span>
                  {/* OP is a percentage of span by definition in this engine.
                      PV/SP carry no engineering unit in the registry. */}
                  <span className="cpm-kpi__sub">
                    {m === 'op' ? '% · ' : ''}
                    {liveVal ? liveSource(lv?.ts)
                     : stored != null ? 'from historian'
                     : heldTs ? `last stored ${ageLabel(heldTs)}`
                     : 'no value'}
                  </span>
                </div>
              );
            })}

            {/* MODE completes the picture: a loop in manual is excluded at Gate 1,
                so every verdict on this page was computed WITHOUT it. */}
            {(() => {
              const liveMode = live.mode?.value;
              const storedMode = last?.mode;
              const heldMode = lastStored.data?.values?.mode;
              const value = liveMode ?? storedMode ?? heldMode?.value;
              const m = modeLabel(value);
              const src = liveMode != null ? liveSource(live.mode?.ts)
                        : storedMode != null ? 'from historian'
                        : heldMode?.value != null ? `last stored ${ageLabel(heldMode.ts)}`
                        : null;
              return (
                <div className="cpm-kpi">
                  <span className="cpm-kpi__caption">MODE</span>
                  <span className="cpm-kpi__value">{m.label}</span>
                  <span className="cpm-kpi__sub">{src ? `${m.note} · ${src}` : m.note}</span>
                </div>
              );
            })()}
          </div>
          {/* "Trend range", not "Window": this is the rolling historian envelope,
              not an engine evaluation window (the gate strip below names its
              evaluated window separately). */}
          <p className="cpm-copy cpm-source-line">
            {(() => {
              const sq = liveSignalQuality(qualityLabel(live.quality ?? live.pv), live.lastSourceTs);
              return (
                <FacetPill facet="signal" tone={live.hasData ? sq.tone : 'muted'}>
                  {live.hasData ? sq.text : 'No live publisher'}
                </FacetPill>
              );
            })()}
            {' '}Trend range {fmtDateTime(start.getTime())} → {fmtDateTime(end.getTime())}
            {range.live ? ' · rolling 8 h' : ' · fixed period'}, not an evaluated window
          </p>
        </>
      )}

      {/* The period bar, the evaluated window against it and the comparison with now (CHG-048/049). */}
      <LoopTrendPanel loop={loop} range={range} trend={trend} points={points} />
    </div>
  );
};

export default OperatingState;
