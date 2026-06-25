import mqtt, { type MqttClient } from 'mqtt';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';

// sparkplug-payload has no type defs — decode via its JS API
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SparkplugPayload = require('sparkplug-payload/lib/sparkplug-b');

enableMapSet();

const MQTT_WS_URL  = (import.meta.env.VITE_MQTT_WS_URL  as string | undefined) ?? 'ws://localhost:8083/mqtt';
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
  [key: string]: unknown;
}

interface MqttStoreState {
  connected:    boolean;
  error:        string | null;
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
  fetchTrend:        (series: string, start: Date, end: Date, width?: number) => Promise<TrendPoint[]>;
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
      metrics:    new Map(),
      liveAlarms: new Map(),
      aliasMap:   new Map(),
      subscribed: new Set(),

      // ── connect ──────────────────────────────────────────────────────────
      connect: () => {
        if (client?.connected) return;

        client = mqtt.connect(MQTT_WS_URL, {
          clientId:        `ams-hmi-${Math.random().toString(16).slice(2, 8)}`,
          clean:           true,
          keepalive:       30,
          reconnectPeriod: 2000,
          connectTimeout:  10_000,
        });

        client.on('connect', () => {
          set(s => { s.connected = true; s.error = null; });
          // Always subscribe to BIRTH topics to seed alias map + initial values
          client!.subscribe(`spBv1.0/${SPARKPLUG_GROUP}/NBIRTH/${SPARKPLUG_EDGE}`);
          client!.subscribe(`spBv1.0/${SPARKPLUG_GROUP}/DBIRTH/${SPARKPLUG_EDGE}/#`);
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
      // Reads Redis snapshot via historian-bff /snapshot to seed initial values
      // on screen open (so there's no blank state before first DDATA arrives).
      loadSnapshot: async (assets: string[]) => {
        if (assets.length === 0) return;
        try {
          const url = `${SNAPSHOT_URL}?assets=${assets.map(encodeURIComponent).join(',')}`;
          const res = await fetch(url);
          if (!res.ok) return;
          const data = await res.json() as { assets: Record<string, Record<string, LiveMetric>> };
          set(s => {
            for (const [asset, metricMap] of Object.entries(data.assets ?? {})) {
              for (const [metric, mv] of Object.entries(metricMap)) {
                s.metrics.set(`${asset}/${metric}`, mv);
              }
            }
          });
        } catch (err) {
          console.warn('[MqttStore] loadSnapshot failed:', err);
        }
      },

      // ── fetchTrend ────────────────────────────────────────────────────────
      // Calls historian-bff /trend for a time-series window.
      fetchTrend: async (series, start, end, width = 800) => {
        try {
          const params = new URLSearchParams({
            series,
            start:  start.toISOString(),
            end:    end.toISOString(),
            width:  String(width),
          });
          const res = await fetch(`${HIST_URL}/trend?${params}`);
          if (!res.ok) return [];
          const data = await res.json() as { points: TrendPoint[] };
          return data.points ?? [];
        } catch (err) {
          console.warn('[MqttStore] fetchTrend failed:', err);
          return [];
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
    const decoded: any = SparkplugPayload.decodePayload(payload);
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
          // Also update the liveAlarms map if this device carries alarm fields
          if (name === 'state' || name === 'severity' || name === 'acknowledged') {
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
  field: string,
  value: unknown,
  ts: number,
  get: () => MqttStoreState,
) {
  const existing: LiveAlarm = s.liveAlarms.get(device) ?? {
    alarmId:        device,
    state:          '',
    severity:       0,
    acknowledged:   false,
    conditionActive:true,
    priority:       '',
    sourceName:     device,
    conditionName:  '',
    message:        '',
    ts,
  };

  // Pull other fields from metric map for a complete snapshot
  const metrics = get().metrics;
  const alarm: LiveAlarm = {
    ...existing,
    alarmId:        device,
    state:          field === 'state'        ? String(value)   : (metrics.get(`${device}/state`)?.value as string   ?? existing.state),
    severity:       field === 'severity'     ? Number(value)   : (metrics.get(`${device}/severity`)?.value as number ?? existing.severity),
    acknowledged:   field === 'acknowledged' ? Boolean(value)  : (metrics.get(`${device}/acknowledged`)?.value as boolean ?? existing.acknowledged),
    conditionActive:String(metrics.get(`${device}/state`)?.value ?? existing.state) !== 'CLEARED',
    priority:       metrics.get(`${device}/priority`)?.value as string     ?? existing.priority,
    sourceName:     metrics.get(`${device}/sourceName`)?.value as string   ?? existing.sourceName,
    conditionName:  metrics.get(`${device}/conditionName`)?.value as string ?? existing.conditionName,
    message:        metrics.get(`${device}/message`)?.value as string      ?? existing.message,
    ts,
  };

  if (alarm.state === 'CLEARED') {
    s.liveAlarms.delete(device);
  } else {
    s.liveAlarms.set(device, alarm);
  }
}
