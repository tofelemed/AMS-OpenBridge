import mqtt, { type MqttClient } from 'mqtt';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { get as getSparkplugPayload } from 'sparkplug-payload';
import { apiFetch } from '../api/apiFetch';

const SparkplugPayload = getSparkplugPayload('spBv1.0');
if (!SparkplugPayload) {
  throw new Error('[MqttStore] sparkplug-payload spBv1.0 namespace unavailable');
}
const decodeSparkplugPayload = SparkplugPayload.decodePayload.bind(SparkplugPayload);

enableMapSet();

/** Resolve MQTT WebSocket URL — supports full ws(s):// URLs and same-origin paths like /mqtt-ws. */
function resolveMqttWsUrl(): string {
  const configured = (import.meta.env.VITE_MQTT_WS_URL as string | undefined)?.trim();
  if (!configured) {
    return 'ws://localhost:8083/mqtt';
  }
  if (/^wss?:\/\//i.test(configured)) {
    return configured;
  }
  // Relative path — nginx/vite proxy on same host (e.g. /mqtt-ws → EMQX /mqtt)
  if (configured.startsWith('/')) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}${configured}`;
  }
  // host:port without scheme
  return `ws://${configured}`;
}

export function getMqttBrokerUrl(): string {
  if (typeof window === 'undefined') {
    return (import.meta.env.VITE_MQTT_WS_URL as string | undefined) ?? 'ws://localhost:8083/mqtt';
  }
  return resolveMqttWsUrl();
}

const SNAPSHOT_URL = (import.meta.env.VITE_SNAPSHOT_URL as string | undefined) ?? '/api/hist/snapshot';
const HIST_URL     = (import.meta.env.VITE_HIST_URL     as string | undefined) ?? '/api/hist';
// Plant-wide DDATA "firehose". The display runtime NEVER subscribes to this — it subscribes
// per-open-screen (W10 / CQRS scoping). Only monitoring surfaces (Live Events, dashboards)
// opt in via subscribeFirehose()/unsubscribeFirehose().
const FIREHOSE_DDATA_TOPIC = 'spBv1.0/+/DDATA/+/#';

// ── Types ──────────────────────────────────────────────────────────────────

/** Current metric value from MQTT/snapshot. */
export interface LiveMetric {
  value:   number | string | boolean;
  quality: number;     // 192 = GOOD (Sparkplug B quality code)
  ts:      number;     // epoch ms
}

/** Compact live alarm from live.alarms / MQTT DDATA. */
export interface LiveAlarm {
  alarmId:        string;
  state:          string;
  severity:       number;
  acknowledged:   boolean;
  conditionActive:boolean;
  priority:       string;
  sourceName:     string;
  conditionName:  string;
  message:        string;
  ts:             number;
}

/** One decimated trend point from /api/hist/trend. */
export interface TrendPoint {
  ts:        number;
  severity?: number;
  state?:    string;
  priority?: string;
  ack_status?: boolean | number;
  [key: string]: unknown;
}

export interface RawTrendPage {
  points:  TrendPoint[];
  count:   number;
  hasMore: boolean;
  offset:  number;
}

/** Aggregate summary of one measurement over a window (historian-bff /summary). */
export interface TrendSummary {
  min:   number | null;
  max:   number | null;
  avg:   number | null;
  total: number | null;
  count: number | null;
}

interface MqttStoreState {
  connected:    boolean;
  error:        string | null;
  snapshotLoaded: boolean;
  /** key = "device/metricName" */
  metrics:      Map<string, LiveMetric>;
  /** Live alarm state map — key = alarmId */
  liveAlarms:   Map<string, LiveAlarm>;
  /** alias (number) → metric name (from DBIRTH) */
  aliasMap:     Map<number, string>;
  /** Currently subscribed DDATA topic patterns */
  subscribed:   Set<string>;

  connect:           () => void;
  disconnect:        () => void;
  /** Subscribe to specific DDATA topics for the open screen's bound devices (W10 scoping). */
  subscribeScreen:   (topics: string[]) => void;
  unsubscribeScreen: (topics: string[]) => void;
  /** Opt into the plant-wide DDATA firehose (monitoring surfaces only; ref-counted). */
  subscribeFirehose:   () => void;
  unsubscribeFirehose: () => void;
  loadSnapshot:      (assets: string[]) => Promise<void>;
  loadAllSnapshots:  () => Promise<void>;
  fetchTrend:        (series: string, start: Date, end: Date, width?: number, measurements?: string) => Promise<TrendPoint[]>;
  fetchRaw:          (series: string, start: Date, end: Date, maxCount?: number, offset?: number) => Promise<RawTrendPage>;
  fetchSummary:      (series: string, start: Date, end: Date, measurement: string) => Promise<TrendSummary | null>;
}

/** Redis snapshot JSON: { v, q, ts } written by sparkplug-edge-node. */
function parseSnapshotMetric(raw: unknown): LiveMetric | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if ('v' in o && 'ts' in o) {
    return {
      value:   o.v as number | string | boolean,
      quality: Number(o.q ?? 192),
      ts:      Number(o.ts),
    };
  }
  if ('value' in o && 'ts' in o) {
    return {
      value:   o.value as number | string | boolean,
      quality: Number(o.quality ?? 192),
      ts:      Number(o.ts),
    };
  }
  return null;
}

function buildLiveAlarmFromMetrics(
  device: string,
  metrics: Map<string, LiveMetric>,
  fallbackTs: number,
): LiveAlarm {
  const get = (name: string) => metrics.get(`${device}/${name}`);
  const stateVal = get('state')?.value;
  const state = stateVal != null ? String(stateVal) : '';
  return {
    alarmId:         device,
    state,
    severity:        Number(get('severity')?.value ?? 0),
    acknowledged:    Boolean(get('acknowledged')?.value ?? false),
    conditionActive: state !== 'CLEARED',
    priority:        String(get('priority')?.value ?? ''),
    sourceName:      String(get('sourceName')?.value ?? device),
    conditionName:   String(get('conditionName')?.value ?? ''),
    message:         String(get('message')?.value ?? ''),
    ts:              get('severity')?.ts ?? get('state')?.ts ?? fallbackTs,
  };
}

function applySnapshotAssets(
  set: (fn: (s: MqttStoreState) => void) => void,
  assets: Record<string, Record<string, unknown>>,
) {
  set(s => {
    for (const [device, metricMap] of Object.entries(assets)) {
      let latestTs = 0;
      for (const [metric, raw] of Object.entries(metricMap)) {
        const mv = parseSnapshotMetric(raw);
        if (!mv) continue;
        s.metrics.set(`${device}/${metric}`, mv);
        if (mv.ts > latestTs) latestTs = mv.ts;
      }
      const alarm = buildLiveAlarmFromMetrics(device, s.metrics, latestTs || Date.now());
      if (alarm.conditionActive && alarm.state !== 'CLEARED') {
        s.liveAlarms.set(device, alarm);
      }
    }
    s.snapshotLoaded = true;
  });
}

// ── Live trend ring-buffer ───────────────────────────────────────────────────
// Kept OUTSIDE zustand/immer state to avoid clone churn on every sample. Charts
// poll it on a timer. Keyed by "device/metric" (same key as `metrics`).
export interface SeriesSample { ts: number; v: number; }
const LIVE_SERIES_CAP = 2000; // ~66 min at 2s cadence
const liveSeries = new Map<string, SeriesSample[]>();

function pushLiveSample(key: string, ts: number, value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  let buf = liveSeries.get(key);
  if (!buf) { buf = []; liveSeries.set(key, buf); }
  // drop out-of-order / duplicate timestamps
  if (buf.length && ts <= buf[buf.length - 1].ts) return;
  buf.push({ ts, v: value });
  if (buf.length > LIVE_SERIES_CAP) buf.splice(0, buf.length - LIVE_SERIES_CAP);
}

/** Live samples for "device/metric" accumulated from the MQTT stream, optionally since a ts. */
export function getLiveSeries(key: string, sinceTs = 0): SeriesSample[] {
  const buf = liveSeries.get(key);
  if (!buf) return [];
  return sinceTs ? buf.filter(p => p.ts >= sinceTs) : buf.slice();
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useMqttStore = create<MqttStoreState>()(
  immer((set, get) => {
    let client: MqttClient | null = null;
    let firehoseRefs = 0; // ref count for the plant-wide DDATA firehose subscription

    function ensureConnected() {
      if (!client?.connected) get().connect();
    }

    return {
      connected:  false,
      error:      null,
      snapshotLoaded: false,
      metrics:    new Map(),
      liveAlarms: new Map(),
      aliasMap:   new Map(),
      subscribed: new Set(),

      // ── connect ──────────────────────────────────────────────────────────
      connect: () => {
        if (client?.connected) return;

        const brokerUrl = resolveMqttWsUrl();
        client = mqtt.connect(brokerUrl, {
          clientId:        `ams-hmi-${Math.random().toString(16).slice(2, 8)}`,
          clean:           true,
          keepalive:       30,
          reconnectPeriod: 2000,
          connectTimeout:  10_000,
        });

        client.on('connect', () => {
          set(s => { s.connected = true; s.error = null; });
          // Birth certificates are low-volume and needed to decode DDATA aliases → keep the
          // NBIRTH/DBIRTH wildcards. Process-value DDATA is NOT wildcarded here: the display
          // runtime subscribes per-open-screen (W10) and monitoring surfaces opt into the
          // firehose via subscribeFirehose(). Active subscriptions are restored on reconnect below.
          client!.subscribe('spBv1.0/+/NBIRTH/+');
          client!.subscribe('spBv1.0/+/DBIRTH/+/#');
          // Restore any active per-screen / firehose subscriptions after a (re)connect.
          get().subscribed.forEach(t => client!.subscribe(t, { qos: 0 }));
          // Re-seed from Redis after refresh or reconnect (TTL ~1h on edge node)
          void get().loadAllSnapshots();
        });

        client.on('message', (topic: string, payload: Buffer) => {
          handleMessage(topic, payload, set, get);
        });

        client.on('error', (err: Error) => {
          set(s => { s.error = err.message; });
        });

        client.on('offline', () => {
          set(s => { s.connected = false; });
        });

        client.on('reconnect', () => {
          // Resubscribe to previously subscribed DDATA topics on reconnect
          const subs = get().subscribed;
          subs.forEach(t => client!.subscribe(t));
        });
      },

      // ── disconnect ───────────────────────────────────────────────────────
      disconnect: () => {
        client?.end(true);
        client = null;
        set(s => { s.connected = false; });
      },

      // ── subscribeScreen ───────────────────────────────────────────────────
      // Scoped, per-open-screen subscription (W10). Callers pass fully-qualified DDATA topics
      // from the binding (which carry the real group/edge — multi-site safe).
      subscribeScreen: (topics: string[]) => {
        ensureConnected();
        const fresh: string[] = [];
        topics.forEach(topic => {
          if (!topic) return;
          if (!get().subscribed.has(topic)) {
            client?.subscribe(topic, { qos: 0 });
            set(s => { s.subscribed.add(topic); });
            fresh.push(topic);
          }
        });

        // Phase 6.6 — paint on OPEN, not on connect.
        // Snapshots were only re-seeded from Redis when MQTT connected, so a
        // faceplate opened on an already-connected client showed nothing until
        // the next DDATA arrived. With report-by-exception upstream, a steady
        // signal may not publish for minutes, so "blank until something changes"
        // is indistinguishable from "broken" to an operator.
        const devices = fresh
          .map(t => {
            // spBv1.0/<group>/DDATA/<edge>/<device>[/...]
            const parts = t.split('/');
            const i = parts.indexOf('DDATA');
            return i >= 0 && parts.length > i + 2 ? parts[i + 2] : '';
          })
          .filter(d => d && d !== '#' && d !== '+');
        if (devices.length > 0) void get().loadSnapshot([...new Set(devices)]);
      },

      // ── unsubscribeScreen ─────────────────────────────────────────────────
      unsubscribeScreen: (topics: string[]) => {
        topics.forEach(topic => {
          if (!topic) return;
          // Never tear down the shared firehose from a per-screen unsubscribe.
          if (topic === FIREHOSE_DDATA_TOPIC) return;
          client?.unsubscribe(topic);
          set(s => { s.subscribed.delete(topic); });
        });
      },

      // ── firehose (plant-wide DDATA; monitoring surfaces only, ref-counted) ─
      subscribeFirehose: () => {
        ensureConnected();
        firehoseRefs += 1;
        if (firehoseRefs === 1) {
          client?.subscribe(FIREHOSE_DDATA_TOPIC, { qos: 0 });
          set(s => { s.subscribed.add(FIREHOSE_DDATA_TOPIC); });
        }
      },

      unsubscribeFirehose: () => {
        if (firehoseRefs === 0) return;
        firehoseRefs -= 1;
        if (firehoseRefs === 0) {
          client?.unsubscribe(FIREHOSE_DDATA_TOPIC);
          set(s => { s.subscribed.delete(FIREHOSE_DDATA_TOPIC); });
        }
      },

      // ── loadSnapshot ──────────────────────────────────────────────────────
      loadSnapshot: async (assets: string[]) => {
        if (assets.length === 0) return;
        try {
          const url = `${SNAPSHOT_URL}?assets=${assets.map(encodeURIComponent).join(',')}`;
          const res = await apiFetch(url);
          if (!res.ok) return;
          const data = await res.json() as { assets: Record<string, Record<string, unknown>> };
          applySnapshotAssets(set, data.assets ?? {});
        } catch (err) {
          console.warn('[MqttStore] loadSnapshot failed:', err);
        }
      },

      // ── loadAllSnapshots ────────────────────────────────────────────────────
      // Discover all devices from Redis via BFF GET /snapshot?assets=*
      loadAllSnapshots: async () => {
        try {
          const res = await apiFetch(`${SNAPSHOT_URL}?assets=${encodeURIComponent('*')}`);
          if (!res.ok) return;
          const data = await res.json() as { assets: Record<string, Record<string, unknown>> };
          applySnapshotAssets(set, data.assets ?? {});
        } catch (err) {
          console.warn('[MqttStore] loadAllSnapshots failed:', err);
        }
      },

      // ── fetchTrend ────────────────────────────────────────────────────────
      // Calls historian-bff /trend for a time-series window.
      fetchTrend: async (series, start, end, width = 200, measurements) => {
        try {
          const params = new URLSearchParams({
            series,
            start:  start.toISOString(),
            end:    end.toISOString(),
            width:  String(width),
          });
          if (measurements) params.set('measurements', measurements);
          const res = await apiFetch(`${HIST_URL}/trend?${params}`);
          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `HTTP ${res.status}`);
          }
          const data = await res.json() as { points: TrendPoint[] };
          return data.points ?? [];
        } catch (err) {
          console.warn('[MqttStore] fetchTrend failed:', err);
          throw err;
        }
      },

      // ── fetchSummary ──────────────────────────────────────────────────────
      // Aggregate summary (min/max/avg/total/count) of one measurement over a window.
      fetchSummary: async (series, start, end, measurement) => {
        try {
          const params = new URLSearchParams({
            series,
            start:       start.toISOString(),
            end:         end.toISOString(),
            measurement,
          });
          const res = await apiFetch(`${HIST_URL}/summary?${params}`);
          if (!res.ok) return null;
          return await res.json() as TrendSummary;
        } catch (err) {
          console.warn('[MqttStore] fetchSummary failed:', err);
          return null;
        }
      },

      fetchRaw: async (series, start, end, maxCount = 50, offset = 0) => {
        try {
          const params = new URLSearchParams({
            series,
            start:    start.toISOString(),
            end:      end.toISOString(),
            maxCount: String(maxCount),
            offset:   String(offset),
          });
          const res = await apiFetch(`${HIST_URL}/raw?${params}`);
          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `HTTP ${res.status}`);
          }
          const data = await res.json() as {
            points?: TrendPoint[];
            count?: number;
            hasMore?: boolean;
            offset?: number;
          };
          return {
            points:  data.points ?? [],
            count:   data.count ?? 0,
            hasMore: data.hasMore ?? false,
            offset,
          };
        } catch (err) {
          console.warn('[MqttStore] fetchRaw failed:', err);
          throw err;
        }
      },
    };
  }),
);

// ── Sparkplug B message handler ────────────────────────────────────────────

function handleMessage(
  topic: string,
  payload: Buffer,
  set: (fn: (s: MqttStoreState) => void) => void,
  get: () => MqttStoreState,
) {
  try {
     
    const decoded: any = decodeSparkplugPayload(payload);
    const parts  = topic.split('/'); // spBv1.0 / group / VERB / edge [/ device]
    const verb   = parts[2];
    const device = parts[4] ?? '';

    if (verb === 'NBIRTH') {
      // Node birth — clear alias map (session reset)
      set(s => { s.aliasMap.clear(); });
      return;
    }

    if (verb === 'DBIRTH') {
      // Device birth — register alias → name + seed initial metric values
      set(s => {
        for (const m of (decoded.metrics ?? [])) {
          if (m.alias !== undefined && m.name) {
            s.aliasMap.set(Number(m.alias), String(m.name));
          }
          if (m.name && m.value !== undefined) {
            s.metrics.set(`${device}/${m.name}`, {
              value:   m.value,
              quality: m.properties?.quality?.value ?? 192,
              ts:      Number(decoded.timestamp ?? Date.now()),
            });
          }
        }
      });
      return;
    }

    if (verb === 'DDATA') {
      const aliasMap = get().aliasMap;
      set(s => {
        const ts = Number(decoded.timestamp ?? Date.now());
        for (const m of (decoded.metrics ?? [])) {
          const name = m.name
            ? String(m.name)
            : aliasMap.get(Number(m.alias)) ?? `alias_${m.alias}`;
          s.metrics.set(`${device}/${name}`, {
            value:   m.value,
            quality: m.properties?.quality?.value ?? 192,
            ts,
          });
          pushLiveSample(`${device}/${name}`, ts, m.value); // feed the live trend buffer
          // Update liveAlarms when any alarm field changes
          if (['state', 'severity', 'acknowledged', 'priority', 'sourceName', 'conditionName', 'message']
              .includes(name)) {
            updateLiveAlarm(s, device, name, m.value, ts, get);
          }
        }
      });
    }
  } catch (err) {
    console.debug('[MqttStore] Failed to decode Sparkplug message:', err);
  }
}

function updateLiveAlarm(
   
  s: any,
  device: string,
  _field: string,
  _value: unknown,
  ts: number,
  get: () => MqttStoreState,
) {
  const alarm = buildLiveAlarmFromMetrics(device, get().metrics, ts);

  if (alarm.state === 'CLEARED' || !alarm.conditionActive) {
    s.liveAlarms.delete(device);
  } else {
    s.liveAlarms.set(device, alarm);
  }
}
