'use client';

/**
 * PV, SP, OP and Mode as small cards in one row, with the signal quality beside them. The row is the one place the
 * redesign changes a size; it reads live values first, then the newest trend bucket, then the last stored value,
 * which is the only plane with no time bound. A value is live or old, never both (CHG-078), and when every stored
 * value has the same age the age is said once, beside the quality. With no publisher and no stored value the row
 * is one honest empty state, not four dashes that read like measured zeros.
 *
 * Used on Loop Explorer Summary and again on Investigation, so it takes the loop and nothing else.
 */
import React, { useMemo } from 'react';
import type { CpmLoop } from '../../../../api/cpmApi';
import { useCpmTrend, useLoopLastValues } from '../../../../hooks/useCpm';
import { liveQuality, useLoopLive } from '../../../../hooks/useLoopLive';
import { loopSeries } from '../../../../utils/loopSeries';
import { modeLabel } from '../../../../utils/modeVocabulary';
import { FacetPill, STALE_LIVE_MS, liveSignalQuality } from '../../FacetPill';
import { EmptyState } from '../../shared';
import { registryHref } from '../../cpaHref';
import { useTrendRange } from '../../trend/useTrendRange';
import { ageText } from './summaryText';

const num = (v: unknown) => (typeof v === 'number' ? v : null);

/** Age of a stored value, in the app's age words (summaryText.ageText). */
const ageLabel = (ts: number | undefined): string => (ts ? ageText(Date.now() - ts) : 'earlier');

/**
 * CHG-078: "live" while the feed is current (RBE heartbeats every signal every 300 s, so past two heartbeats the
 * feed has stalled); otherwise only its age ("last received 13 days ago").
 */
export const liveSource = (ts: number | undefined): string =>
  ts && Date.now() - ts > STALE_LIVE_MS ? `last received ${ageLabel(ts)}` : 'live';

const Signal: React.FC<{ caption: string; value: string; sub?: string }> = ({ caption, value, sub }) => (
  <div className="cpm-signal">
    <span className="cpm-signal__caption">{caption}</span>
    <span className="cpm-signal__value">{value}</span>
    {sub ? <span className="cpm-signal__sub">{sub}</span> : null}
  </div>
);

export const SignalStrip: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const live = useLoopLive(loop.loopId);
  const series = loopSeries(loop.loopId);
  // The same query as the trend below it, so the two share one fetch.
  const { from, to, live: rolling } = useTrendRange();
  const trend = useCpmTrend(series, from, to, 240, 'pv,sp,op,mode', true, rolling);
  const lastStored = useLoopLastValues(series);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  // The newest bucket is the loop's current value only while the trend is live.
  const last = rolling && points.length ? points[points.length - 1] : undefined;
  const held = lastStored.data?.values ?? {};
  const noData = !live.hasData && !trend.isLoading && !trend.isError && points.length === 0
    && !lastStored.isLoading && Object.keys(held).length === 0;

  if (noData) {
    return (
      <EmptyState
        title="No operating data"
        copy={`Nothing is publishing live values for this loop, and no samples were stored in ${rolling ? 'the last 8 hours' : 'this period'}. Check its signal mapping in the Loop Registry, or pick another period. (Historian series: ${series})`}
        next={[{ label: 'Signal mapping in the Loop Registry', to: registryHref(loop.loopId) }]}
      />
    );
  }

  // One age when every stored value has the same one.
  const ages = new Set(Object.values(held).map(v => ageLabel(v?.ts)));
  const oneAge = !live.hasData && ages.size === 1 ? [...ages][0] : null;
  /** What differs from the rest: a stalled live value, or a stored one older than its neighbours. */
  const note = (liveTs: number | undefined, liveShown: boolean, heldTs: number | undefined, fromTrend: boolean): string => {
    if (liveShown) { const s = liveSource(liveTs); return s === 'live' ? '' : s; }
    return !fromTrend && heldTs && !oneAge ? `last stored ${ageLabel(heldTs)}` : '';
  };

  const cards = (['pv', 'sp', 'op'] as const).map(m => {
    const lv = live[m];
    const liveVal = lv && typeof lv.value === 'number' ? lv.value.toFixed(2) : null;
    // Read the SAME aggregate the chart pen draws: PV and OP from the bucket average, SP from last_value.
    const stored = m === 'sp' ? num(last?.[m]) : num(last?.[`${m}_avg`]) ?? num(last?.[m]);
    const heldVal = num(held[m]?.value);
    const shown = liveVal ?? (stored != null ? stored.toFixed(2) : heldVal != null ? heldVal.toFixed(2) : null);
    const unit = m === 'op' ? '%' : '';   // OP is a percentage of span in this engine; PV and SP carry no registered unit
    return { caption: m.toUpperCase(), value: shown ?? '—',
      sub: [unit, note(lv?.ts, !!liveVal, held[m]?.ts, stored != null)].filter(Boolean).join(' · ') };
  });

  const liveMode = live.mode?.value;
  const mode = modeLabel(liveMode ?? last?.mode ?? held.mode?.value);
  // Good news is not repeated on the card; a mode that excludes the loop at G1 is a warning and stays.
  const modeNote = [mode.tone === 'warn' || mode.tone === 'bad' ? mode.note : '',
    note(live.mode?.ts, liveMode != null, held.mode?.ts, last?.mode != null)].filter(Boolean).join(' · ');
  const sq = liveSignalQuality(liveQuality(live), live.lastSourceTs);

  return (
    <div className="cpm-signal-strip" role="group" aria-label="Operating signals">
      {cards.map(c => <Signal key={c.caption} {...c} />)}
      <Signal caption="MODE" value={mode.label} sub={modeNote} />
      <p className="cpm-signal-strip__quality">
        <FacetPill facet="signal" tone={live.hasData ? sq.tone : 'muted'}>{live.hasData ? sq.text : 'No live publisher'}</FacetPill>
        {oneAge && <span className="cpm-signal-strip__age">last stored {oneAge}</span>}
      </p>
    </div>
  );
};

export default SignalStrip;
