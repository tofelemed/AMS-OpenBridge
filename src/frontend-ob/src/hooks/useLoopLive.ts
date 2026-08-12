/**
 * CPLM Phase 7 (F0.5) — live plane for one control loop.
 *
 * The LoopLiveRbeJob emits report-by-exception deltas per (loopId, metric) to
 * live.loop.metrics; sparkplug-edge-node bridges them to Sparkplug B DDATA on
 * device `<loopId sanitized>` under the configured group/edge, and mirrors
 * snapshots into Redis. Subscribing via mqttStore.subscribeScreen gives us the
 * exact-topic scoping (W10) plus snapshot-on-open (Phase 6.6), so a steady loop
 * that hasn't published in minutes still paints its last known values.
 *
 * RBE honesty note: no data here means "no live producer or no change", which
 * is NOT the same as a dead loop — callers should render '—', never 0.
 */
import { useEffect, useMemo } from 'react';
import { useMqttStore, type LiveMetric } from '../store/mqttStore';

const GROUP = (import.meta.env.VITE_SPARKPLUG_GROUP as string | undefined) || 'ams_site1';
const EDGE = (import.meta.env.VITE_SPARKPLUG_EDGE as string | undefined) || 'ams_edge1';

/** Same sanitation the edge node applies to loopId → device. */
const deviceOf = (loopId: string) => loopId.replace(/[^a-zA-Z0-9_-]/g, '_');


export interface LoopLiveState {
  pv: LiveMetric | undefined;
  sp: LiveMetric | undefined;
  op: LiveMetric | undefined;
  vp: LiveMetric | undefined;
  mode: LiveMetric | undefined;
  quality: LiveMetric | undefined;
  /** True once any metric for this loop has arrived (snapshot or DDATA). */
  hasData: boolean;
  /** Newest timestamp across the loop's metrics, for a staleness chip. */
  lastTs: number | null;
}

export function useLoopLive(loopId: string | undefined): LoopLiveState {
  const device = loopId ? deviceOf(loopId) : undefined;
  const subscribeScreen = useMqttStore(s => s.subscribeScreen);
  const unsubscribeScreen = useMqttStore(s => s.unsubscribeScreen);

  // D: select THIS loop's six metric keys individually — the old version
  // subscribed to the whole metrics Map, whose identity changes on every 100ms
  // flush, so every mounted loop row re-rendered 10×/s regardless of its own
  // data. Per-key selectors re-render only when a key's own object changes
  // (unchanged keys keep identity across the coalesced flush).
  const pv      = useMqttStore(s => (device ? s.metrics.get(`${device}/pv`) : undefined));
  const sp      = useMqttStore(s => (device ? s.metrics.get(`${device}/sp`) : undefined));
  const op      = useMqttStore(s => (device ? s.metrics.get(`${device}/op`) : undefined));
  const vp      = useMqttStore(s => (device ? s.metrics.get(`${device}/vp`) : undefined));
  const mode    = useMqttStore(s => (device ? s.metrics.get(`${device}/mode`) : undefined));
  const quality = useMqttStore(s => (device ? s.metrics.get(`${device}/quality`) : undefined));

  useEffect(() => {
    if (!device) return;
    const topic = `spBv1.0/${GROUP}/DDATA/${EDGE}/${device}`;
    subscribeScreen([topic]);
    return () => unsubscribeScreen([topic]);
  }, [device, subscribeScreen, unsubscribeScreen]);

  return useMemo(() => {
    const all = [pv, sp, op, vp, mode, quality];
    const stamps = all.filter((x): x is LiveMetric => x != null).map(x => x.ts);
    return {
      pv, sp, op, vp, mode, quality,
      hasData: stamps.length > 0,
      lastTs: stamps.length ? Math.max(...stamps) : null,
    };
  }, [pv, sp, op, vp, mode, quality]);
}

/** OPC/Sparkplug quality number → NAMUR-style label + tone. */
export function qualityLabel(q: LiveMetric | undefined): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } {
  if (!q) return { label: 'NO SIGNAL', tone: 'muted' };
  // P2-20 - the live plane carries OPC numerics but the batch plane (and some
  // producers) carry strings; a string reaching the old numeric-only branches
  // compared undefined >= 192 and returned a red BAD for a healthy loop. Handle
  // both vocabularies, incl. the NE107 states CLAUDE.md mandates.
  const v = q.value;
  if (typeof v === 'string') {
    const s = v.trim().toUpperCase();
    if (s.startsWith('GOOD')) return { label: 'GOOD', tone: 'good' };
    if (s.startsWith('UNCERTAIN')) return { label: 'UNCERTAIN', tone: 'warn' };
    if (s.startsWith('MAINT')) return { label: 'MAINTENANCE', tone: 'warn' };
    if (s.startsWith('OUT_OF_SERVICE') || s === 'OOS') return { label: 'OUT OF SERVICE', tone: 'muted' };
    if (s.startsWith('BAD')) return { label: 'BAD', tone: 'bad' };
  }
  const n = typeof v === 'number' ? v : q.quality;
  if (typeof n !== 'number' || Number.isNaN(n)) return { label: 'UNKNOWN', tone: 'muted' };
  if (n >= 192) return { label: 'GOOD', tone: 'good' };
  if (n >= 64) return { label: 'UNCERTAIN', tone: 'warn' };
  return { label: 'BAD', tone: 'bad' };
}
