import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { fetchAllActiveAlarms, fetchAlarmStatistics, fetchConnectedOpcAeServers, purgeLabInjectedAlarms } from '../api/alarmApi';
import { mapHubAlarmPayload } from '../api/alarmMappers';
import { applyAckLifecycleToAlarm, upsertAlarm, alarmsEqual } from '../utils/alarmReconciliation';
import { alarmMatchesConnectedOpcServer } from '../utils/opcAlarmFilter';

enableMapSet();

export interface ActiveAlarm {
  id: string;
  serverId: string;
  serverName: string;
  sourceName: string;
  conditionName: string | null;
  subConditionName: string | null;
  message: string | null;
  severity: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'DIAGNOSTIC';
  category: string;
  state: string;
  conditionActive: boolean;
  acknowledged: boolean;
  isShelved: boolean;
  isSuppressed: boolean;
  isOutOfService: boolean;
  qualityGood: boolean;
  eventTimeEpochMs: number;
  activeTimeEpochMs: number;
  ackTimeEpochMs: number | null;
  ackedByUsername: string | null;
  ackComment: string | null;
  shelveUntilEpochMs: number | null;
  shelveComment: string | null;
  suppressionReason: string | null;
  correlationId: string | null;
  isRootCause: boolean;
  processValue: number | null;
  processUnit: string | null;
  serverReceivedEpochMs: number;
  opcAttributes: Record<string, unknown>;
  logicalAlarmFamilyId: string;
  instanceKeySchemaVersion: number;
  eventTimeMissing?: boolean;
  ackLifecycleState?: string | null;
  ackRequestedAtEpochMs?: number | null;
  pendingAckActionId?: string | null;
  commandId?: string | null;
  lifecycleId?: string | null;
  dcsSequenceId?: string | null;
}

export type AckLifecycleState =
  | 'ACK_REQUESTED' | 'ACK_QUEUED' | 'ACK_PROCESSING' | 'ACK_DISPATCHED'
  | 'ACK_PENDING_DCS' | 'ACK_CONFIRMED' | 'ACK_FAILED' | 'ACK_TIMEOUT' | 'ACK_RETRYING';

export interface AlarmStats {
  totalActive: number;
  totalCritical: number;
  totalHigh: number;
  totalMedium: number;
  totalLow: number;
  unacknowledged: number;
  shelved: number;
  suppressed: number;
  outOfService: number;
  alarmsPerTenMin: number;
  floodActive: boolean;
}

export interface FloodAlert {
  serverId: string;
  alarmsPerTenMin: number;
  isFlood: boolean;
  detectedAtEpochMs: number;
}

export interface ServerStatus {
  serverId: string;
  serverName: string;
  isConnected: boolean;
  error: string | null;
  timestampEpochMs: number;
}

export interface SoeEvent {
  id: number;
  sourceName: string;
  serverId: string;
  sourceTimestampEpochMs: number;
  severity: number;
  priority: string;
  message: string;
  conditionActive: boolean;
  isOutOfOrder: boolean;
}

export interface LoopKpiPayload {
  tagId: string;
  windowStartMs: number;
  windowEndMs: number;
  iae: number;
  ise: number;
  dominantMode: string;
  sampleCount: number;
}

export interface AlarmKpiPayload {
  kpiType: string;
  windowStartMs: number;
  windowEndMs: number;
  alarmCount: number;
  floodStatus?: string;
  standingCount: number;
  oldestStandingDurationMs: number;
  alarmId?: string;
  nuisanceType?: string;
  occurrences: number;
  healthScore: number;
  area?: string;
  priority?: string;
}

interface AlarmStore {
  alarms: Map<string, ActiveAlarm>;
  stats: AlarmStats;
  floodAlert: FloodAlert | null;
  serverStatuses: Map<string, ServerStatus>;
  connectedOpcServerIds: Set<string>;
  recentSoeEvents: SoeEvent[];
  loopKpis: Record<string, LoopKpiPayload>;
  alarmKpis: Record<string, AlarmKpiPayload>;
  hubConnection: HubConnection | null;
  connectionState: HubConnectionState | 'uninitialized';
  lastUpdated: number;
  selectedAlarmIds: Set<string>;
  activeProtocol: string | null;

  initialize: (token: string) => Promise<void>;
  refreshActiveAlarms: () => Promise<void>;
  disconnect: () => Promise<void>;
  setAlarm: (alarm: ActiveAlarm) => void;
  removeAlarm: (id: string) => void;
  bulkUpdateAlarms: (ids: string[], action: string) => void;
  applyAckLifecycle: (
    alarmId: string,
    lifecycleState: string,
    detail?: string | null,
    timestampEpochMs?: number,
    trace?: { commandId?: string; correlationId?: string; lifecycleId?: string; dcsSequenceId?: string }
  ) => void;
  setStats: (stats: AlarmStats) => void;
  setFloodAlert: (alert: FloodAlert | null) => void;
  setServerStatus: (status: ServerStatus) => void;
  addSoeEvent: (event: SoeEvent) => void;
  setLoopKpi: (payload: LoopKpiPayload) => void;
  setAlarmKpi: (payload: AlarmKpiPayload) => void;
  toggleAlarmSelection: (id: string) => void;
  clearSelection: () => void;
  setSelectedAlarmIds: (ids: Iterable<string>) => void;
  selectAll: () => void;
  subscribeToServer: (serverId: string) => Promise<void>;
  subscribeToPriority: (priority: string) => Promise<void>;
}

const MAX_SOE_EVENTS = 500;

function recalcStatsFromAlarms(alarms: Map<string, ActiveAlarm>, connectedOpcServerIds: Set<string>): AlarmStats {
  const visible = Array.from(alarms.values()).filter(a =>
    alarmMatchesConnectedOpcServer(a, connectedOpcServerIds));
  const active = visible.filter(a => a.conditionActive && !a.isShelved && !a.isSuppressed && !a.isOutOfService);
  return {
    totalActive: active.length,
    totalCritical: active.filter(a => a.priority === 'CRITICAL').length,
    totalHigh: active.filter(a => a.priority === 'HIGH').length,
    totalMedium: active.filter(a => a.priority === 'MEDIUM').length,
    totalLow: active.filter(a => a.priority === 'LOW' || a.priority === 'DIAGNOSTIC').length,
    unacknowledged: active.filter(a => !a.acknowledged).length,
    shelved: visible.filter(a => a.isShelved).length,
    suppressed: visible.filter(a => a.isSuppressed).length,
    outOfService: visible.filter(a => a.isOutOfService).length,
    alarmsPerTenMin: 0,
    floodActive: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SetState = (fn: (state: any) => void) => void;

async function syncConnectedOpcServers(set: SetState): Promise<{ id?: string; protocol?: string }> {
  try {
    const connected = await fetchConnectedOpcAeServers();
    const ids = new Set(connected.map(s => s.id.trim().toLowerCase()));
    set(state => {
      state.connectedOpcServerIds = ids;
      for (const s of connected) {
        state.serverStatuses.set(s.id, {
          serverId: s.id,
          serverName: s.name,
          isConnected: true,
          error: null,
          timestampEpochMs: Date.now(),
        });
      }
    });
    return connected[0] ? { id: connected[0].id, protocol: connected[0].protocol } : {};
  } catch (err) {
    console.warn('[AlarmStore] Could not resolve connected OPC servers', err);
    const fallback = import.meta.env.VITE_OPC_SERVER_ID as string | undefined;
    if (fallback) {
      set(state => {
        state.connectedOpcServerIds = new Set([fallback.trim().toLowerCase()]);
      });
    }
    return fallback ? { id: fallback } : {};
  }
}

type HydrateOptions = { purgeLab?: boolean; reconcile?: boolean };

async function hydrateAlarmsFromApi(
  set: SetState,
  opts: HydrateOptions = {},
) {
  const { purgeLab = false, reconcile = true } = opts;
  const primaryConnection = await syncConnectedOpcServers(set);
  const serverId = primaryConnection.id ?? (import.meta.env.VITE_OPC_SERVER_ID as string | undefined);

  set(state => {
    state.activeProtocol = primaryConnection.protocol || null;
  });

  if (purgeLab && serverId && primaryConnection.protocol === 'OPC-AE') {
    try {
      const removed = await purgeLabInjectedAlarms(serverId);
      if (removed > 0) console.info(`[AlarmStore] Purged ${removed} lab/storm alarms for server ${serverId}`);
    } catch (err) {
      console.warn('[AlarmStore] Purge lab alarms failed', err);
    }
  }

  try {
    const stats = await fetchAlarmStatistics(serverId || undefined);
    set(state => {
      Object.assign(state.stats, stats);
    });
  } catch {
    /* fallback to client-side recalc */
  }

  if (serverId) {
    set(state => {
      if (state.connectedOpcServerIds.size === 0) {
        state.connectedOpcServerIds.add(serverId.trim().toLowerCase());
      }
    });
  }

  let fetched = 0;
  let stored = 0;
  let hydrateDirty = false;
  const fetchedIds = new Set<string>();
  await fetchAllActiveAlarms(serverId || undefined, (pageAlarms) => {
    set(state => {
      if (state.connectedOpcServerIds.size === 0) {
        for (const a of pageAlarms) {
          if (alarmMatchesConnectedOpcServer(a, new Set())) {
            state.connectedOpcServerIds.add(a.serverId.trim().toLowerCase());
          }
        }
      }
      for (const alarm of pageAlarms) {
        if (alarmMatchesConnectedOpcServer(alarm, state.connectedOpcServerIds)) {
          const prev = state.alarms.get(alarm.id);
          const next = prev ? upsertAlarm(prev, alarm) : alarm;
          if (next !== prev) {
            state.alarms.set(alarm.id, next);
            hydrateDirty = true;
          }
          fetchedIds.add(alarm.id);
          stored++;
        }
      }
    });
    fetched += pageAlarms.length;
  });

  if (reconcile) {
    set(state => {
      for (const id of [...state.alarms.keys()]) {
        const alarm = state.alarms.get(id);
        if (!alarm) continue;
        if (!alarmMatchesConnectedOpcServer(alarm, state.connectedOpcServerIds)) continue;
        if (!fetchedIds.has(id)) {
          state.alarms.delete(id);
          hydrateDirty = true;
        }
      }
      if (hydrateDirty) {
        state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds);
        state.lastUpdated = Date.now();
      }
    });
  } else if (hydrateDirty) {
    set(state => {
      state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds);
      state.lastUpdated = Date.now();
    });
  }

  console.info(`[AlarmStore] Loaded ${stored}/${fetched} alarms from API`);
}

let hubInitInFlight: Promise<void> | null = null;

function pickId(raw: Record<string, unknown>): string {
  return String(raw.id ?? raw.Id ?? '');
}

export const useAlarmStore = create<AlarmStore>()(
  immer((set, get) => ({
    alarms: new Map(),
    stats: { totalActive: 0, totalCritical: 0, totalHigh: 0, totalMedium: 0, totalLow: 0, unacknowledged: 0, shelved: 0, suppressed: 0, outOfService: 0, alarmsPerTenMin: 0, floodActive: false },
    floodAlert: null,
    serverStatuses: new Map(),
    connectedOpcServerIds: new Set(),
    recentSoeEvents: [],
    loopKpis: {},
    alarmKpis: {},
    hubConnection: null,
    connectionState: 'uninitialized',
    lastUpdated: 0,
    selectedAlarmIds: new Set(),
    activeProtocol: null,

    initialize: async (token: string) => {
      if (hubInitInFlight) return hubInitInFlight;

      const existing = get().hubConnection;
      if (existing?.state === HubConnectionState.Connected) return;

      hubInitInFlight = (async () => {
        (window as unknown as { amsDevToken?: string }).amsDevToken = token;
        const hubUrl = import.meta.env.VITE_SIGNALR_HUB_URL ?? '/hubs/alarms';

        const connection = new HubConnectionBuilder()
          .withUrl(hubUrl, {
            accessTokenFactory: () => token,
            withCredentials: true,
          })
          .withAutomaticReconnect({
            nextRetryDelayInMilliseconds: (ctx) => {
              if (ctx.previousRetryCount === 0) return 1000;
              if (ctx.previousRetryCount < 5) return 3000;
              if (ctx.previousRetryCount < 10) return 10000;
              return 30000;
            }
          })
          .configureLogging(LogLevel.Warning)
          .build();

        connection.on('OnNewAlarm', (raw: Record<string, unknown>) => {
          set(state => {
            const id = pickId(raw);
            const incoming = mapHubAlarmPayload(raw, state.alarms.get(id));
            if (!alarmMatchesConnectedOpcServer(incoming, state.connectedOpcServerIds)) return;
            state.alarms.set(incoming.id, incoming);
            state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds);
            state.lastUpdated = Date.now();
            playAlarmSound(incoming.priority);
          });
        });

        connection.on('OnAlarmUpdated', (raw: Record<string, unknown>) => {
          set(state => {
            const id = String(pickId(raw));
            const incoming = mapHubAlarmPayload(raw, state.alarms.get(id));
            if (!alarmMatchesConnectedOpcServer(incoming, state.connectedOpcServerIds)) {
              if (state.alarms.has(id)) {
                state.alarms.delete(id);
                state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds);
                state.lastUpdated = Date.now();
              }
              return;
            }
            if (!incoming.conditionActive) {
              if (state.alarms.has(id)) {
                state.alarms.delete(id);
                state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds);
                state.lastUpdated = Date.now();
              }
              return;
            }
            const existing = state.alarms.get(incoming.id);
            const next = existing ? upsertAlarm(existing, incoming) : incoming;
            if (existing && alarmsEqual(existing, next)) return;
            state.alarms.set(incoming.id, next);
            state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds);
            state.lastUpdated = Date.now();
          });
        });

        connection.on('OnAlarmCleared', (payload: { alarmId?: string; AlarmId?: string }) => {
          const alarmId = String(payload.alarmId ?? payload.AlarmId ?? '');
          set(state => {
            state.alarms.delete(alarmId);
            state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds);
            state.lastUpdated = Date.now();
          });
        });

        connection.on('OnBulkAlarmsUpdated', ({ alarmIds, action }: { alarmIds: string[]; action: string }) => {
          get().bulkUpdateAlarms(alarmIds, action);
        });

        connection.on('OnAckLifecycleUpdated', (payload: Record<string, unknown>) => {
          const id = String(payload.alarmId ?? payload.AlarmId ?? '');
          get().applyAckLifecycle(
            id,
            String(payload.lifecycleState ?? payload.LifecycleState ?? ''),
            (payload.detail ?? payload.Detail) as string | undefined,
            Number(payload.timestampEpochMs ?? payload.TimestampEpochMs ?? Date.now()),
            {
              commandId: String(payload.commandId ?? payload.CommandId ?? payload.actionId ?? ''),
              correlationId: String(payload.correlationId ?? payload.CorrelationId ?? ''),
              lifecycleId: (payload.lifecycleId ?? payload.LifecycleId) as string | undefined,
              dcsSequenceId: (payload.dcsSequenceId ?? payload.DcsSequenceId) as string | undefined,
            },
          );
        });

        connection.on('OnConnected', () => {});
        connection.on('onconnected', () => {});

        connection.on('OnFloodAlert', (alert: FloodAlert) => {
          set(state => { state.floodAlert = alert.isFlood ? alert : null; });
        });

        connection.on('OnServerStatusChanged', (status: ServerStatus) => {
          set(state => { state.serverStatuses.set(status.serverId, status); });
        });

        connection.on('OnSoeEvent', (event: SoeEvent) => {
          get().addSoeEvent(event);
        });

        connection.on('OnAnalyticsUpdate', (analytics: { totalActive: number; totalCritical: number; totalUnacknowledged: number; floodActive: boolean; alarmsPerTenMin: number }) => {
          set(state => {
            state.stats.totalActive = analytics.totalActive;
            state.stats.totalCritical = analytics.totalCritical;
            state.stats.unacknowledged = analytics.totalUnacknowledged;
            state.stats.floodActive = analytics.floodActive;
            state.stats.alarmsPerTenMin = analytics.alarmsPerTenMin;
          });
        });

        connection.on('OnLoopKpiUpdate', (payload: LoopKpiPayload) => {
          get().setLoopKpi(payload);
        });

        connection.on('OnAlarmKpiUpdate', (payload: AlarmKpiPayload) => {
          get().setAlarmKpi(payload);
        });

        connection.onreconnecting(() => {
          set(state => { state.connectionState = HubConnectionState.Reconnecting; });
        });

        connection.onreconnected(async () => {
          set(state => { state.connectionState = HubConnectionState.Connected; });
          try {
            await hydrateAlarmsFromApi(set, { reconcile: true });
            const serverId = get().connectedOpcServerIds.values().next().value as string | undefined;
            if (serverId) await get().subscribeToServer(serverId);
          } catch (err) {
            console.warn('[AlarmStore] Reconcile after reconnect failed', err);
          }
        });

        connection.onclose(() => {
          set(state => { state.connectionState = HubConnectionState.Disconnected; });
        });

        try {
          await connection.start();
          set(state => {
            state.hubConnection = connection;
            state.connectionState = HubConnectionState.Connected;
          });
          console.info('[AlarmHub] Connected');

          void hydrateAlarmsFromApi(set, { purgeLab: true, reconcile: true }).then(async () => {
            const serverId = get().connectedOpcServerIds.values().next().value as string | undefined;
            if (serverId) {
              try {
                await get().subscribeToServer(serverId);
              } catch (subErr) {
                console.warn('[AlarmStore] Hub server subscription failed', subErr);
              }
            }
          }).catch(loadErr => {
            console.warn('[AlarmStore] Failed to load active alarms snapshot', loadErr);
          });
        } catch (err) {
          console.error('[AlarmHub] Connection failed:', err);
          set(state => { state.connectionState = HubConnectionState.Disconnected; });
        }
      })();

      try {
        await hubInitInFlight;
      } finally {
        hubInitInFlight = null;
      }
    },

    refreshActiveAlarms: async () => {
      try {
        await hydrateAlarmsFromApi(set, { purgeLab: false, reconcile: true });
      } catch (err) {
        console.warn('[AlarmStore] Refresh failed', err);
        throw err;
      }
    },

    disconnect: async () => {
      const conn = get().hubConnection;
      if (conn) await conn.stop();
      set(state => { state.hubConnection = null; state.connectionState = HubConnectionState.Disconnected; });
    },

    setAlarm: (alarm) => {
      set(state => { state.alarms.set(alarm.id, alarm); });
    },

    removeAlarm: (id) => {
      set(state => { state.alarms.delete(id); state.selectedAlarmIds.delete(id); });
    },

    applyAckLifecycle: (alarmId, lifecycleState, _detail, timestampEpochMs, trace) => {
      set(state => {
        const alarm = state.alarms.get(alarmId);
        if (!alarm) return;

        const updated = applyAckLifecycleToAlarm(alarm, lifecycleState, timestampEpochMs, trace);
        if (updated === alarm) return;

        state.alarms.set(alarmId, updated);
        state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds);
        state.lastUpdated = Date.now();
      });
    },

    bulkUpdateAlarms: (ids, action) => {
      set(state => {
        for (const id of ids) {
          const alarm = state.alarms.get(id);
          if (!alarm) continue;
          if (action === 'ACKNOWLEDGED') {
            continue;
          } else if (action === 'SHELVED') {
            alarm.isShelved = true;
            alarm.state = 'SHELVED';
            state.stats.shelved += 1;
            state.stats.totalActive = Math.max(0, state.stats.totalActive - 1);
          } else if (action === 'SUPPRESSED') {
            alarm.isSuppressed = true;
            alarm.state = 'SUPPRESSED';
            state.stats.suppressed += 1;
            state.stats.totalActive = Math.max(0, state.stats.totalActive - 1);
          } else if (action === 'OUT_OF_SERVICE') {
            alarm.isOutOfService = true;
            alarm.state = 'OUT_OF_SERVICE';
          }
          state.alarms.set(id, alarm);
        }
        state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds);
        state.lastUpdated = Date.now();
      });
    },

    setStats: (stats) => { set(state => { state.stats = stats; }); },
    setFloodAlert: (alert) => { set(state => { state.floodAlert = alert; }); },
    setServerStatus: (status) => {
      set(state => { state.serverStatuses.set(status.serverId, status); });
    },
    addSoeEvent: (event) => {
      set(state => {
        state.recentSoeEvents.unshift(event);
        if (state.recentSoeEvents.length > MAX_SOE_EVENTS)
          state.recentSoeEvents.pop();
      });
    },
    setLoopKpi: (payload) => {
      set(state => { state.loopKpis[payload.tagId] = payload; });
    },
    setAlarmKpi: (payload) => {
      set(state => { state.alarmKpis[payload.kpiType] = payload; });
    },
    toggleAlarmSelection: (id) => {
      set(state => {
        if (state.selectedAlarmIds.has(id)) state.selectedAlarmIds.delete(id);
        else state.selectedAlarmIds.add(id);
      });
    },
    clearSelection: () => { set(state => { state.selectedAlarmIds.clear(); }); },
    setSelectedAlarmIds: (ids: Iterable<string>) => {
      set(state => { state.selectedAlarmIds = new Set(ids); });
    },
    selectAll: () => {
      set(state => { state.alarms.forEach((_, id) => state.selectedAlarmIds.add(id)); });
    },
    subscribeToServer: async (serverId) => {
      const conn = get().hubConnection;
      if (conn?.state === HubConnectionState.Connected)
        await conn.invoke('SubscribeToServer', serverId);
    },
    subscribeToPriority: async (priority) => {
      const conn = get().hubConnection;
      if (conn?.state === HubConnectionState.Connected)
        await conn.invoke('SubscribeToPriority', priority);
    },
  }))
);

const audioCtx = typeof window !== 'undefined' ? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() : null;

function playAlarmSound(priority: string) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const freq = priority === 'CRITICAL' ? 880 : priority === 'HIGH' ? 660 : 440;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.4);
  } catch {
    /* Audio may be blocked by browser policy */
  }
}
