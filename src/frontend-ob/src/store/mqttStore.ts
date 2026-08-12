// H12: the mqtt + sparkplug libraries (~480KB) are loaded via dynamic import
// inside connect(), NOT statically — App.tsx imports this store at the top
// level, so a static import here shipped vendor-mqtt in the entry bundle to
// every first paint including /login. Only the TYPES are imported statically
// (erased at build time).
import type { MqttClient } from 'mqtt';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { apiFetch } from '../api/apiFetch';
import { getAuthToken } from '../api/auth';

// Bound inside connect() once the sparkplug library has been dynamically
// imported; messages only arrive after connect, so decode is always ready.
let decodeSparkplugPayload: ((payload: Uint8Array) => unknown) | null = null;

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
  /** FE-03: optional AbortSignal — pass it so a superseded query can be cancelled. */
  fetchTrend:        (series: string, start: Date, end: Date, width?: number, measurements?: string, signal?: AbortSignal) => Promise<TrendPoint[]>;
  fetchRaw:          (series: string, start: Date, end: Date, maxCount?: number, offset?: number, signal?: AbortSignal) => Promise<RawTrendPage>;
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

// ── H10: snapshot request micro-batching ────────────────────────────────────
// subscribeScreen() is called one topic at a time by per-slot binding hooks, so
// a 20-device display used to issue 20 separate GET /snapshot?assets=<device>
// calls — right after the connect handler had already fetched ?assets=* with
// all of them. Devices now collect for 50ms and go out as ONE comma-joined GET,
// and any device seeded by a snapshot response in the last 5s is skipped.
const SNAPSHOT_BATCH_MS = 50;
const SNAPSHOT_DEDUPE_MS = 5_000;
let pendingSnapshotDevices = new Set<string>();
let snapshotBatchTimer: ReturnType<typeof setTimeout> | null = null;
const recentSnapshotAt = new Map<string, number>();

// ── Store ──────────────────────────────────────────────────────────────────

export const useMqttStore = create<MqttStoreState>()(
  immer((set, get) => {
    let client: MqttClient | null = null;
    let connecting = false; // guards the async dynamic-import + WS-handshake window
    let firehoseRefs = 0; // ref count for the plant-wide DDATA firehose subscription
    // FE-06: per-topic ref counts for screen subscriptions (survives reconnects —
    // the 'connect' handler resubscribes from `subscribed`, refs stay authoritative).
    const screenRefs = new Map<string, number>();

    function ensureConnected() {
      if (!client?.connected) get().connect();
    }

    // Typed by what we use: the dynamically-imported default export's connect().
    function openClient(mqtt: { connect: (url: string, opts: Record<string, unknown>) => MqttClient }) {
        const brokerUrl = resolveMqttWsUrl();
        // AUTH-03 (Plan 04 item 6): the broker no longer accepts anonymous
        // connections. The RS256 access token rides in two places:
        //  - MQTT CONNECT password — EMQX's JWT authenticator (from=password)
        //    validates it against auth-service JWKS;
        //  - ?access_token= on the WS URL — the API gateway authenticates the
        //    WebSocket upgrade at the edge (browsers cannot set headers on WS).
        // Both are refreshed per (re)connect attempt so a rotated token never
        // strands the live-value stream.
        const withToken = (url: string): string => {
          const token = getAuthToken();
          if (!token) return url;
          return `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
        };
        client = mqtt.connect(withToken(brokerUrl), {
          clientId:        `ams-hmi-${Math.random().toString(16).slice(2, 8)}`,
          clean:           true,
          keepalive:       30,
          reconnectPeriod: 2000,
          connectTimeout:  10_000,
          username:        'hmi-browser',
          password:        getAuthToken() || undefined,
          transformWsUrl:  () => withToken(brokerUrl),
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
          // Refresh the MQTT password with the CURRENT access token before the
          // CONNECT packet goes out — the original token may have rotated (15m
          // TTL) since the client was created. transformWsUrl (above) refreshes
          // the URL query token the same way for the gateway's edge auth.
          if (client) {
            (client.options as { password?: Buffer | string }).password = getAuthToken() || undefined;
          }
          // Resubscribe to previously subscribed DDATA topics on reconnect
          const subs = get().subscribed;
          subs.forEach(t => client!.subscribe(t));
        });
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
      // H12: mqtt + sparkplug are dynamically imported here so they stay out of
      // the entry bundle. The `client` / `connecting` guards also fix the old
      // race where two components mounting during the WS handshake each built
      // a client and orphaned the first (`client?.connected` was false while
      // still connecting, so the guard passed twice).
      connect: () => {
        if (client || connecting) return;
        connecting = true;
        void (async () => {
          try {
            const [{ default: mqtt }, { get: getSparkplugPayload }] = await Promise.all([
              import('mqtt'),
              import('sparkplug-payload'),
            ]);
            if (!decodeSparkplugPayload) {
              const spb = getSparkplugPayload('spBv1.0');
              if (!spb) throw new Error('sparkplug-payload spBv1.0 namespace unavailable');
              decodeSparkplugPayload = spb.decodePayload.bind(spb) as (p: Uint8Array) => unknown;
            }
            openClient(mqtt);
          } catch (err) {
            set(s => { s.error = err instanceof Error ? err.message : String(err); });
          } finally {
            connecting = false;
          }
        })();
      },

      // ── disconnect ───────────────────────────────────────────────────────
      disconnect: () => {
        client?.end(true);
        client = null;
        connecting = false;
        set(s => { s.connected = false; });
      },

      // ── subscribeScreen ───────────────────────────────────────────────────
      // Scoped, per-open-screen subscription (W10). Callers pass fully-qualified DDATA topics
      // from the binding (which carry the real group/edge — multi-site safe).
      // FE-06: topics are REF-COUNTED. Two mounted components sharing a device topic
      // each hold a reference; the broker subscribe happens only 0→1 and the
      // unsubscribe only 1→0 — the first unmount no longer starves the survivor.
      subscribeScreen: (topics: string[]) => {
        ensureConnected();
        const fresh: string[] = [];
        topics.forEach(topic => {
          if (!topic) return;
          const refs = (screenRefs.get(topic) ?? 0) + 1;
          screenRefs.set(topic, refs);
          if (refs === 1) {
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
      // FE-06: decrement the ref; only the LAST subscriber's unmount unsubscribes at
      // the broker (this used to unsubscribe unconditionally — the survivor silently
      // showed stale values).
      unsubscribeScreen: (topics: string[]) => {
        topics.forEach(topic => {
          if (!topic) return;
          // Never tear down the shared firehose from a per-screen unsubscribe.
          if (topic === FIREHOSE_DDATA_TOPIC) return;
          const refs = (screenRefs.get(topic) ?? 0) - 1;
          if (refs > 0) {
            screenRefs.set(topic, refs);
            return;
          }
          screenRefs.delete(topic);
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
        // H10: batch + dedupe — collect devices for 50ms, skip ones a snapshot
        // response already covered in the last 5s (incl. the ?assets=* seed).
        const now = Date.now();
        for (const a of assets) {
          if (!a) continue;
          const seenAt = recentSnapshotAt.get(a);
          if (seenAt !== undefined && now - seenAt < SNAPSHOT_DEDUPE_MS) continue;
          pendingSnapshotDevices.add(a);
        }
        if (pendingSnapshotDevices.size === 0 || snapshotBatchTimer) return;
        snapshotBatchTimer = setTimeout(() => {
          snapshotBatchTimer = null;
          const batch = [...pendingSnapshotDevices];
          pendingSnapshotDevices = new Set();
          if (batch.length === 0) return;
          void (async () => {
            try {
              const url = `${SNAPSHOT_URL}?assets=${batch.map(encodeURIComponent).join(',')}`;
              const res = await apiFetch(url);
              if (!res.ok) return;
              const data = await res.json() as { assets: Record<string, Record<string, unknown>> };
              const ts = Date.now();
              for (const dev of Object.keys(data.assets ?? {})) recentSnapshotAt.set(dev, ts);
              for (const dev of batch) recentSnapshotAt.set(dev, ts);
              applySnapshotAssets(set, data.assets ?? {});
            } catch (err) {
              console.warn('[MqttStore] loadSnapshot failed:', err);
            }
          })();
        }, SNAPSHOT_BATCH_MS);
      },

      // ── loadAllSnapshots ────────────────────────────────────────────────────
      // Discover all devices from Redis via BFF GET /snapshot?assets=*
      loadAllSnapshots: async () => {
        try {
          const res = await apiFetch(`${SNAPSHOT_URL}?assets=${encodeURIComponent('*')}`);
          if (!res.ok) return;
          const data = await res.json() as { assets: Record<string, Record<string, unknown>> };
          // H10: the wildcard seed covers every returned device — stamp them so
          // the per-screen loads that follow within 5s become no-ops.
          const ts = Date.now();
          for (const dev of Object.keys(data.assets ?? {})) recentSnapshotAt.set(dev, ts);
          applySnapshotAssets(set, data.assets ?? {});
        } catch (err) {
          console.warn('[MqttStore] loadAllSnapshots failed:', err);
        }
      },

      // ── fetchTrend ────────────────────────────────────────────────────────
      // Calls historian-bff /trend for a time-series window.
      fetchTrend: async (series, start, end, width = 200, measurements, signal) => {
        try {
          const params = new URLSearchParams({
            series,
            start:  start.toISOString(),
            end:    end.toISOString(),
            width:  String(width),
          });
          if (measurements) params.set('measurements', measurements);
          const res = await apiFetch(`${HIST_URL}/trend?${params}`, { signal });
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

      fetchRaw: async (series, start, end, maxCount = 50, offset = 0, signal) => {
        try {
          const params = new URLSearchParams({
            series,
            start:    start.toISOString(),
            end:      end.toISOString(),
            maxCount: String(maxCount),
            offset:   String(offset),
          });
          const res = await apiFetch(`${HIST_URL}/raw?${params}`, { signal });
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

// FE-01 (coalescing): one immer set() per DDATA message meant React notification
// rate == broker message rate — at plant scale, thousands of renders per second in
// every client. DDATA updates are buffered here (last-write-wins per metric key,
// exactly like the trend ring buffer that already lives outside zustand) and applied
// as ONE batched store update per 100 ms tick. NBIRTH/DBIRTH stay immediate — they
// are rare and reset session state.
const FLUSH_INTERVAL_MS = 100;
const pendingMetrics = new Map<string, LiveMetric>();
const pendingAlarmDevices = new Map<string, number>(); // device → latest ts
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const ALARM_FIELDS = new Set(
  ['state', 'severity', 'acknowledged', 'priority', 'sourceName', 'conditionName', 'message'],
);

function scheduleFlush(set: (fn: (s: MqttStoreState) => void) => void) {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (pendingMetrics.size === 0 && pendingAlarmDevices.size === 0) return;

    // Drain the buffers BEFORE the store update so messages arriving during the
    // set() land in the next tick instead of being lost.
    const metrics = new Map(pendingMetrics);
    const alarmDevices = new Map(pendingAlarmDevices);
    pendingMetrics.clear();
    pendingAlarmDevices.clear();

    set(s => {
      for (const [key, metric] of metrics) s.metrics.set(key, metric);
      for (const [device, ts] of alarmDevices) {
        // Build from the draft map — it already contains this flush's values.
        const alarm = buildLiveAlarmFromMetrics(device, s.metrics as Map<string, LiveMetric>, ts);
        if (alarm.state === 'CLEARED' || !alarm.conditionActive) {
          s.liveAlarms.delete(device);
        } else {
          s.liveAlarms.set(device, alarm);
        }
      }
    });
  }, FLUSH_INTERVAL_MS);
}

function handleMessage(
  topic: string,
  payload: Buffer,
  set: (fn: (s: MqttStoreState) => void) => void,
  get: () => MqttStoreState,
) {
  try {
    if (!decodeSparkplugPayload) return; // library still loading — cannot happen post-connect

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const ts = Number(decoded.timestamp ?? Date.now());
      for (const m of (decoded.metrics ?? [])) {
        const name = m.name
          ? String(m.name)
          : aliasMap.get(Number(m.alias)) ?? `alias_${m.alias}`;
        pendingMetrics.set(`${device}/${name}`, {
          value:   m.value,
          quality: m.properties?.quality?.value ?? 192,
          ts,
        });
        pushLiveSample(`${device}/${name}`, ts, m.value); // trend buffer: immediate, outside zustand
        if (ALARM_FIELDS.has(name)) {
          pendingAlarmDevices.set(device, ts);
        }
      }
      scheduleFlush(set);
    }
  } catch (err) {
    console.debug('[MqttStore] Failed to decode Sparkplug message:', err);
  }
}
