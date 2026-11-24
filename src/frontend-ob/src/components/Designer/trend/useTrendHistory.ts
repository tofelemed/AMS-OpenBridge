/**
 * The trend's data (split out of TrendCore, CHG-175, unchanged in what it reads): the history of every pen, read when
 * the window or the pens change, the live tail from the MQTT ring buffer while the chart tails, and the pens whose
 * read failed. `penData` keeps its identity until the data may have changed, so a cursor move re-applies nothing.
 *
 * CHG-227 (owner, 24 Nov 2026: the trend only moved on refresh): while the chart tails, it subscribes to its pens' live
 * topics, so new values reach the ring buffer (nothing else on the Trend page subscribed), and it reads the historian
 * again once a minute, so the line keeps up while the live feed is quiet (report by exception) or down.
 */
import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { useMqttStore, getLiveSeries } from '../../../store/mqttStore';
import { FETCH_FAILED, type Pen, type TrendPoint } from './trendSupport';

/** CHG-227: how often a tailing trend reads its history again. */
export const HISTORY_REFRESH_MS = 60_000;

interface History { map: Record<string, TrendPoint[]>; failed: string[] }

export function useTrendHistory(o: {
  pens: Pen[];
  windowStart: number;
  windowEnd: number;
  /** Changes when the history must be read again (the span while live, both bounds when fixed). */
  fetchKey: string;
  /** Live samples are appended after the history. */
  tailing: boolean;
  /** The live tick: a new value pulls the ring buffer again. */
  tick: number;
  /** The plot's width in pixels; the historian sizes its buckets to it (U9). */
  widthRef: MutableRefObject<number>;
}): { penData: TrendPoint[][]; failed: string[] } {
  const { pens, windowStart, windowEnd, fetchKey, tailing, tick, widthRef } = o;
  const fetchTrend = useMqttStore(s => s.fetchTrend);
  const connect = useMqttStore(s => s.connect);
  const subscribeScreen = useMqttStore(s => s.subscribeScreen);
  const unsubscribeScreen = useMqttStore(s => s.unsubscribeScreen);
  const [hist, setHist] = useState<History>({ map: {}, failed: [] });

  useEffect(() => { connect(); }, [connect]);

  // CHG-227: one subscription per live topic (a loop's PV, SP and OP share its device topic), only while tailing. The
  // store counts references, so a faceplate or a Loop Explorer row on the same loop keeps its own.
  const topicsKey = tailing
    ? [...new Set(pens.map(p => p.liveTopic).filter((t): t is string => !!t))].sort().join('|')
    : '';
  useEffect(() => {
    if (!topicsKey) return undefined;
    const topics = topicsKey.split('|');
    subscribeScreen(topics);
    return () => unsubscribeScreen(topics);
  }, [topicsKey, subscribeScreen, unsubscribeScreen]);

  // CHG-227: while tailing, the history is read again each time the window end enters a new minute.
  const refreshSlot = tailing ? Math.floor(windowEnd / HISTORY_REFRESH_MS) : -1;

  // Historical fetch per pen, on window/pen change (identical to Phase C), and each minute while tailing (CHG-227).
  useEffect(() => {
    if (pens.length === 0) return undefined;
    let cancelled = false;
    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    Promise.all(pens.map(async pen => {
      // CHG-175: a loop pen without a binding from the asset model is not read; it is named with the failed pens.
      if (pen.unread) return FETCH_FAILED;
      if (!pen.iotSeries || !pen.measurement) return [];
      try {
        const pts = await fetchTrend(pen.iotSeries, start, end, widthRef.current, pen.measurement);
        // The historian returns `null` for buckets with no samples. Number(null) === 0 (and 0 is
        // finite), so a plain Number() cast plotted every gap as a zero — drop empty buckets first.
        return pts
          .map(p => ({ ts: Number(p.ts), raw: (p as Record<string, unknown>)[pen.measurement!] }))
          .filter(p => p.raw !== null && p.raw !== undefined && p.raw !== '')
          .map(p => ({ ts: p.ts, value: Number(p.raw) }))
          .filter(p => Number.isFinite(p.value));
      } catch {
        // P2-23 - swallowing this made a failed pen render as an empty series,
        // indistinguishable from "no data": one pen silently vanished while its
        // siblings plotted. Mark it so the chart can say so.
        return FETCH_FAILED;
      }
    })).then(results => {
      if (cancelled) return;
      const map: Record<string, TrendPoint[]> = {};
      const failed: string[] = [];
      pens.forEach((pen, i) => {
        if (results[i] === FETCH_FAILED) {
          map[pen.path] = [];
          failed.push(pen.label || pen.measurement || pen.path);
        } else {
          map[pen.path] = results[i] as TrendPoint[];
        }
      });
      setHist({ map, failed });
    });
    return () => { cancelled = true; };
    // re-fetch when the window span/bounds change (fetchKey), the pens change, fetchTrend changes, or a tailing minute passes
  }, [pens, fetchKey, fetchTrend, refreshSlot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merged (history + live tail) data per pen — also what the legend reads at the cursor.
  const penData = useMemo(() => pens.map(pen => {
    const h = hist.map[pen.path] ?? [];
    const lastHistTs = h.length ? h[h.length - 1].ts : 0;
    const liveTail = tailing && pen.liveKey
      ? getLiveSeries(pen.liveKey, windowStart).filter(p => p.ts > lastHistTs).map(p => ({ ts: p.ts, value: p.v }))
      : [];
    return h.concat(liveTail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick is the recompute trigger: the ring buffer is not reactive.
  }), [pens, hist, tailing, windowStart, tick]);

  return { penData, failed: hist.failed };
}
