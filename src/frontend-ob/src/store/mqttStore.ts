import mqtt, { type MqttClient } from 'mqtt';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { get as getSparkplugPayload } from 'sparkplug-payload';

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
const SPARKPLUG_GROUP = 'ams_site1';
const SPARKPLUG_EDGE  = 'ams_edge1';

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
  subscribeScreen:   (devices: string[]) => void;
  unsubscribeScreen: (devices: string[]) => void;
  loadSnapshot:      (assets: string[]) => Promise<void>;
  loadAllSnapshots:  () => Promise<void>;
  fetchTrend:        (series: string, start: Date, end: Date, width?: number) => Promise<TrendPoint[]>;
  fetchRaw:          (series: string, start: Date, end: Date, maxCount?: number, offset?: number) => Promise<RawTrendPage>;
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

// ── Store ──────────────────────────────────────────────────────────────────

export const useMqttStore = create<MqttStoreState>()(
  immer((set, get) => {
    let client: MqttClient | null = null;

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
          client!.subscribe(`spBv1.0/${SPARKPLUG_GROUP}/NBIRTH/${SPARKPLUG_EDGE}`);
          client!.subscribe(`spBv1.0/${SPARKPLUG_GROUP}/DBIRTH/${SPARKPLUG_EDGE}/#`);
          client!.subscribe(`spBv1.0/${SPARKPLUG_GROUP}/DDATA/${SPARKPLUG_EDGE}/#`);
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
      subscribeScreen: (devices: string[]) => {
        ensureConnected();
        devices.forEach(device => {
          const topic = `spBv1.0/${SPARKPLUG_GROUP}/DDATA/${SPARKPLUG_EDGE}/${device}`;
          if (!get().subscribed.has(topic)) {
            client?.subscribe(topic, { qos: 0 });
            set(s => { s.subscribed.add(topic); });
          }
        });
      },

      // ── unsubscribeScreen ─────────────────────────────────────────────────
      unsubscribeScreen: (devices: string[]) => {
        devices.forEach(device => {
          const topic = `spBv1.0/${SPARKPLUG_GROUP}/DDATA/${SPARKPLUG_EDGE}/${device}`;
          client?.unsubscribe(topic);
          set(s => { s.subscribed.delete(topic); });
        });
      },

      // ── loadSnapshot ──────────────────────────────────────────────────────
      loadSnapshot: async (assets: string[]) => {
        if (assets.length === 0) return;
        try {
          const url = `${SNAPSHOT_URL}?assets=${assets.map(encodeURIComponent).join(',')}`;
          const res = await fetch(url);
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
          const res = await fetch(`${SNAPSHOT_URL}?assets=${encodeURIComponent('*')}`);
          if (!res.ok) return;
          const data = await res.json() as { assets: Record<string, Record<string, unknown>> };
          applySnapshotAssets(set, data.assets ?? {});
        } catch (err) {
          console.warn('[MqttStore] loadAllSnapshots failed:', err);
        }
      },

      // ── fetchTrend ────────────────────────────────────────────────────────
      // Calls historian-bff /trend for a time-series window.
      fetchTrend: async (series, start, end, width = 200) => {
        try {
          const params = new URLSearchParams({
            series,
            start:  start.toISOString(),
            end:    end.toISOString(),
            width:  String(width),
          });
          const res = await fetch(`${HIST_URL}/trend?${params}`);
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

      fetchRaw: async (series, start, end, maxCount = 50, offset = 0) => {
        try {
          const params = new URLSearchParams({
            series,
            start:    start.toISOString(),
            end:      end.toISOString(),
            maxCount: String(maxCount),
            offset:   String(offset),
          });
          const res = await fetch(`${HIST_URL}/raw?${params}`);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
