/**
 * The values behind PV, SP, OP and Mode for one loop, shared by the Summary signal strip and the Signals table so
 * both show the same number. Live values first, then the newest trend bucket, then the last stored value, the only
 * plane with no time bound. A value is live or old, never both (CHG-078).
 */
import { useMemo } from 'react';
import type { CpmLoop } from '../../../../api/cpmApi';
import type { CpmTrendPoint } from '../../../../api/cpm/kpis';
import { useCpmTrend, useLoopLastValues } from '../../../../hooks/useCpm';
import { liveQuality, useLoopLive } from '../../../../hooks/useLoopLive';
import { loopSeries } from '../../../../utils/loopSeries';
import { modeLabel } from '../../../../utils/modeVocabulary';
import { STALE_LIVE_MS, liveSignalQuality } from '../../FacetPill';
import { useTrendRange } from '../../trend/useTrendRange';
import { ageText } from './summaryText';

const num = (v: unknown) => (typeof v === 'number' ? v : null);

/** A signal in a trend bucket, the SAME aggregate the chart pen draws: PV and OP from the bucket average, SP from last_value. */
export const bucketValue = (point: CpmTrendPoint | undefined, m: 'pv' | 'sp' | 'op'): number | null =>
  m === 'sp' ? num(point?.[m]) : num(point?.[`${m}_avg`]) ?? num(point?.[m]);

/** Age of a stored value, in the app's age words (summaryText.ageText). */
const ageLabel = (ts: number | undefined): string => (ts ? ageText(Date.now() - ts) : 'earlier');

/**
 * CHG-078: "live" while the feed is current (RBE heartbeats every signal every 300 s, so past two heartbeats the
 * feed has stalled); otherwise only its age ("last received 13 days ago").
 */
export const liveSource = (ts: number | undefined): string =>
  ts && Date.now() - ts > STALE_LIVE_MS ? `last received ${ageLabel(ts)}` : 'live';

export interface SignalValue {
  role: 'PV' | 'SP' | 'OP';
  /** The shown number, or null when nothing is live, trended or stored: missing is never 0. */
  value: string | null;
  /** OP is a percentage of span in this engine; PV and SP carry no registered unit. */
  unit: string;
  /** What differs from the rest: a stalled live value, or a stored one older than its neighbours. */
  note: string;
}

export function useSignalValues(loop: CpmLoop) {
  const live = useLoopLive(loop.loopId);
  const series = loopSeries(loop.loopId);
  // The same query as the trend below the strip, so the two share one fetch.
  const { from, to, live: rolling } = useTrendRange();
  const trend = useCpmTrend(series, from, to, 240, 'pv,sp,op,mode', true, rolling);
  const lastStored = useLoopLastValues(series);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  // The newest bucket is the loop's current value only while the trend is live.
  const last = rolling && points.length ? points[points.length - 1] : undefined;
  const held = lastStored.data?.values ?? {};
  const noData = !live.hasData && !trend.isLoading && !trend.isError && points.length === 0
    && !lastStored.isLoading && Object.keys(held).length === 0;

  // One age when every stored value has the same one.
  const ages = new Set(Object.values(held).map(v => ageLabel(v?.ts)));
  const oneAge = !live.hasData && ages.size === 1 ? [...ages][0] : null;
  const note = (liveTs: number | undefined, liveShown: boolean, heldTs: number | undefined, fromTrend: boolean): string => {
    if (liveShown) { const s = liveSource(liveTs); return s === 'live' ? '' : s; }
    return !fromTrend && heldTs && !oneAge ? `last stored ${ageLabel(heldTs)}` : '';
  };

  const signals: SignalValue[] = (['pv', 'sp', 'op'] as const).map(m => {
    const lv = live[m];
    const liveVal = lv && typeof lv.value === 'number' ? lv.value.toFixed(2) : null;
    const stored = bucketValue(last, m);
    const heldVal = num(held[m]?.value);
    const shown = liveVal ?? (stored != null ? stored.toFixed(2) : heldVal != null ? heldVal.toFixed(2) : null);
    return {
      role: m.toUpperCase() as SignalValue['role'], value: shown, unit: m === 'op' ? '%' : '',
      note: note(lv?.ts, !!liveVal, held[m]?.ts, stored != null),
    };
  });

  const liveMode = live.mode?.value;
  const mode = modeLabel(liveMode ?? last?.mode ?? held.mode?.value);
  // Good news is not repeated on the card; a mode that excludes the loop at G1 is a warning and stays.
  const modeNote = [mode.tone === 'warn' || mode.tone === 'bad' ? mode.note : '',
    note(live.mode?.ts, liveMode != null, held.mode?.ts, last?.mode != null)].filter(Boolean).join(' · ');
  const sq = liveSignalQuality(liveQuality(live), live.lastSourceTs);

  return {
    signals, mode, modeNote, oneAge, noData, series, rolling,
    hasLive: live.hasData,
    quality: { tone: live.hasData ? sq.tone : ('muted' as const), text: live.hasData ? sq.text : 'No live publisher' },
  };
}
