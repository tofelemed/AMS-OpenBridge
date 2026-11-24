/**
 * The values behind PV, SP, OP and Mode for one loop, shared by the Summary signal strip and the Signals table so
 * both show the same number. Live values first, then the newest trend bucket, then the last stored value, the only
 * plane with no time bound. A value is live or old, never both (CHG-078). CHG-158 (owner review): every value says where it
 * came from — live, last received …, from historian or last stored … — as it did before the redesign.
 * CHG-227: a live value that stopped arriving (older than STALE_LIVE_MS) gives way to a newer trend bucket (./signalSource).
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
import { pickSource, type ValueSource } from './signalSource';
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
  /** Where the shown value came from: live, last received …, from historian or last stored …; empty with no value. */
  note: string;
  /** CHG-185: the shown number as a number, for the state colour (null with no value). */
  num: number | null;
  /** CHG-185: the shown value is live and its feed is current ("live" under it); only such a value takes a state colour. */
  live: boolean;
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

  const note = (from: ValueSource | null, liveTs: number | undefined, heldTs: number | undefined): string =>
    from === 'live' ? liveSource(liveTs) : from === 'trend' ? 'from historian' : from === 'held' && heldTs ? `last stored ${ageLabel(heldTs)}` : '';
  /** A live value whose feed is current: the note under it reads "live". */
  const current = (from: ValueSource | null, liveTs: number | undefined) => from === 'live' && liveSource(liveTs) === 'live';
  // CHG-227: a live value that stopped arriving gives way to a newer bucket (re-read every minute), so the values move.
  const now = Date.now();

  const signals: SignalValue[] = (['pv', 'sp', 'op'] as const).map(m => {
    const lv = live[m];
    const planes = { live: lv ? num(lv.value) : null, trend: bucketValue(last, m), held: num(held[m]?.value) };
    const from = pickSource({ value: planes.live, ts: lv?.ts }, { value: planes.trend, ts: last?.ts },
      { value: planes.held, ts: held[m]?.ts }, now);
    const shownNum = from ? planes[from] : null;
    return {
      role: m.toUpperCase() as SignalValue['role'], value: shownNum != null ? shownNum.toFixed(2) : null, unit: m === 'op' ? '%' : '',
      note: note(from, lv?.ts, held[m]?.ts),
      num: shownNum, live: current(from, lv?.ts),
    };
  });

  const modePlanes = { live: live.mode?.value, trend: last?.mode, held: held.mode?.value };
  const modeFrom = pickSource({ value: modePlanes.live, ts: live.mode?.ts }, { value: modePlanes.trend, ts: last?.ts },
    { value: modePlanes.held, ts: held.mode?.ts }, now);
  const modeToken = modeFrom ? modePlanes[modeFrom] : undefined;
  const mode = modeLabel(modeToken);
  // Good news is not repeated on the card; a mode that excludes the loop at G1 is a warning and stays.
  const modeNote = [mode.tone === 'warn' || mode.tone === 'bad' ? mode.note : '',
    note(modeFrom, live.mode?.ts, held.mode?.ts)].filter(Boolean).join(' · ');
  const sq = liveSignalQuality(liveQuality(live), live.lastSourceTs);

  return {
    signals, mode, modeNote, noData, series, rolling,
    /** CHG-185: the shown mode is live and current; `modeToken` is the value behind its label. */
    modeLive: current(modeFrom, live.mode?.ts), modeToken,
    hasLive: live.hasData,
    quality: { tone: live.hasData ? sq.tone : ('muted' as const), text: live.hasData ? sq.text : 'No live publisher' },
  };
}
