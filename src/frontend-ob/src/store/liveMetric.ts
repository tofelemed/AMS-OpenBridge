/**
 * v2.5 (spec v6 R20): one live metric value with its THREE times.
 *
 * `ts` is the source sample time (the pre-v2.5 field, unchanged). `sourceTs`/`verifiedTs`
 * spell that out; `emissionTs` is when the live plane produced the record. A heartbeat
 * republishes an old value with a new emissionTs and the SAME sourceTs, so any staleness
 * shown to an operator must be computed from sourceTs - never from emissionTs, and never
 * from "when did the browser receive it".
 *
 * Pure helpers live here (no zustand) so they can be unit-tested.
 */
export interface LiveMetric {
  value:   number | string | boolean;
  quality: number;          // Sparkplug/OPC code: 192 GOOD, 64 UNCERTAIN, 0 BAD/UNKNOWN
  ts:      number;          // epoch ms, SOURCE sample time
  sourceTs?:   number;      // same as ts when present (v2.5 producers)
  verifiedTs?: number;      // last source verification; may be later than sourceTs
  emissionTs?: number;      // when the record was produced; the only time a heartbeat advances
  qualityToken?: string;    // GOOD | UNCERTAIN | BAD | UNKNOWN when the producer sent the verdict
}

const num = (x: unknown): number | undefined => {
  if (x === undefined || x === null) return undefined;
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Redis snapshot JSON written by sparkplug-edge-node: `{ v, q, ts }` plus, from v2.5,
 * `src`, `ver`, `emit`, `qt`. A pre-v2.5 record leaves the new fields undefined - they are
 * never invented. A missing quality is NOT GOOD (0, i.e. BAD/UNKNOWN on the OPC scale).
 */
export function parseSnapshotMetric(raw: unknown): LiveMetric | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if ('v' in o && 'ts' in o) {
    return {
      value:   o.v as number | string | boolean,
      quality: num(o.q) ?? 0,
      ts:      Number(o.ts),
      sourceTs: num(o.src),
      verifiedTs: num(o.ver),
      emissionTs: num(o.emit),
      qualityToken: typeof o.qt === 'string' ? o.qt : undefined,
    };
  }
  if ('value' in o && 'ts' in o) {
    return {
      value:   o.value as number | string | boolean,
      quality: num(o.quality) ?? 0,
      ts:      Number(o.ts),
      sourceTs: num(o.sourceTs),
      verifiedTs: num(o.verifiedTs),
      emissionTs: num(o.emissionTs),
      qualityToken: typeof o.qualityToken === 'string' ? o.qualityToken : undefined,
    };
  }
  return null;
}

/** A Sparkplug DDATA/DBIRTH metric (decoded by sparkplug-payload) -> LiveMetric, reading the v2.5 properties. */
export function metricFromSparkplug(m: any, payloadTs: number): LiveMetric {
  const p = m?.properties ?? {};
  const sourceTs = num(p.sourceTs?.value);
  return {
    value:   m.value,
    quality: num(p.quality?.value) ?? 0,
    ts:      sourceTs ?? payloadTs,
    sourceTs,
    verifiedTs: num(p.verifiedTs?.value),
    emissionTs: num(p.emissionTs?.value),
    qualityToken: typeof p.qualityToken?.value === 'string' ? p.qualityToken.value : undefined,
  };
}

export interface LiveAges {
  /** now - source sample time. This is the operator's staleness. */
  sourceAgeMs: number;
  /** now - emission time, or null when the producer did not say (pre-v2.5). Proves the feed is alive. */
  emissionAgeMs: number | null;
}

export function liveAges(m: LiveMetric, nowMs: number = Date.now()): LiveAges {
  const source = m.sourceTs ?? m.ts;
  return {
    sourceAgeMs: Math.max(0, nowMs - source),
    emissionAgeMs: m.emissionTs !== undefined ? Math.max(0, nowMs - m.emissionTs) : null,
  };
}
