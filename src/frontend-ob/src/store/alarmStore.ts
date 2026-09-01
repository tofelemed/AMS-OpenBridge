import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { fetchAllActiveAlarms, fetchAlarmStatistics, fetchConnectedOpcAeServers, purgeLabInjectedAlarms } from '../api/alarmApi';
import { getAuthToken } from '../api/auth';
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

/** H11: per-source derived alarm state consumed by HMI symbols — one O(1) map
 *  lookup with stable identity instead of every symbol scanning the whole Map. */
export interface SourceAlarmSummary {
  active: boolean;
  unacked: boolean;
  count: number;
  highestPriority?: string;
  message?: string;
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

// LoopKpiPayload removed (audit-jobs.md Phase G): LoopKpiStreamJob retired —
// per-loop KPIs come from the CPLM pipeline (/api/v1/cpm/loops/{id}/kpis).

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
  /** H11: sourceName → derived symbol state; identity preserved when unchanged. */
  alarmIndexBySource: Map<string, SourceAlarmSummary>;
  stats: AlarmStats;
  floodAlert: FloodAlert | null;
  serverStatuses: Map<string, ServerStatus>;
  connectedOpcServerIds: Set<string>;
  recentSoeEvents: SoeEvent[];
  alarmKpis: Record<string, AlarmKpiPayload>;
  hubConnection: HubConnection | null;
  connectionState: HubConnectionState | 'uninitialized';
  lastUpdated: number;
  selectedAlarmIds: Set<string>;
  activeProtocol: string | null;
  /** FE-05: true once the first alarm hydration has COMPLETED (success or failure).
   *  Until then, "0 active alarms" is 'not loaded yet', not 'quiet plant'. */
  hydrated: boolean;

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
  setAlarmKpi: (payload: AlarmKpiPayload) => void;
  toggleAlarmSelection: (id: string) => void;
  clearSelection: () => void;
  setSelectedAlarmIds: (ids: Iterable<string>) => void;
  selectAll: () => void;
  subscribeToServer: (serverId: string) => Promise<void>;
  subscribeToPriority: (priority: string) => Promise<void>;
}

const MAX_SOE_EVENTS = 500;

function recalcStatsFromAlarms(
  alarms: Map<string, ActiveAlarm>,
  connectedOpcServerIds: Set<string>,
  prev?: AlarmStats,
): AlarmStats {
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
    // H8: rate/flood come from /statistics and OnAnalyticsUpdate — a client-side
    // recount cannot compute them, so it must PRESERVE the last server values
    // instead of zeroing them on every SignalR alarm event.
    alarmsPerTenMin: prev?.alarmsPerTenMin ?? 0,
    floodActive: prev?.floodActive ?? false,
  };
}

const SUMMARY_PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'DIAGNOSTIC'];

/** H11: rebuild the per-source symbol index in one pass. Summaries that did not
 *  change keep their previous object identity, so per-source zustand selectors
 *  do not re-render symbols whose alarm state is untouched. */
function rebuildSourceIndex(
  alarms: Map<string, ActiveAlarm>,
  prev: Map<string, SourceAlarmSummary>,
): Map<string, SourceAlarmSummary> {
  const bySource = new Map<string, ActiveAlarm[]>();
  for (const a of alarms.values()) {
    if (!a.conditionActive || a.isSuppressed || a.isShelved || a.isOutOfService) continue;
    const list = bySource.get(a.sourceName);
    if (list) list.push(a); else bySource.set(a.sourceName, [a]);
  }
  const next = new Map<string, SourceAlarmSummary>();
  for (const [source, list] of bySource) {
    list.sort((x, y) =>
      SUMMARY_PRIORITY_ORDER.indexOf(x.priority) - SUMMARY_PRIORITY_ORDER.indexOf(y.priority));
    const candidate: SourceAlarmSummary = {
      active: true,
      unacked: list.some(a => !a.acknowledged),
      count: list.length,
      highestPriority: list[0]?.priority,
      message: list[0]?.message ?? undefined,
    };
    const old = prev.get(source);
    next.set(source,
      old &&
      old.active === candidate.active && old.unacked === candidate.unacked &&
      old.count === candidate.count && old.highestPriority === candidate.highestPriority &&
      old.message === candidate.message
        ? old
        : candidate);
  }
  return next;
}

 
type SetState = (fn: (state: any) => void) => void;

// ── H11: hub-delta coalescing ────────────────────────────────────────────────
// SignalR used to apply ONE store set() per message — during an alarm burst
// every subscriber (console grid, dashboard, every HMI symbol) re-rendered per
// event. Deltas now buffer for 100ms (mirroring the MQTT DDATA flush) and apply
// in a single set() with ONE stats/index rebuild per batch.
type HubDelta =
  | { kind: 'new'; raw: Record<string, unknown> }
  | { kind: 'update'; raw: Record<string, unknown> }
  | { kind: 'clear'; alarmId: string };

let pendingHubDeltas: HubDelta[] = [];
let hubFlushTimer: ReturnType<typeof setTimeout> | null = null;
const HUB_FLUSH_MS = 100;

function queueHubDelta(set: SetState, delta: HubDelta) {
  pendingHubDeltas.push(delta);
  if (!hubFlushTimer) hubFlushTimer = setTimeout(() => flushHubDeltas(set), HUB_FLUSH_MS);
}

function flushHubDeltas(set: SetState) {
  hubFlushTimer = null;
  const batch = pendingHubDeltas;
  pendingHubDeltas = [];
  if (batch.length === 0) return;

  const sounds: string[] = [];
  set(state => {
    let dirty = false;
    for (const d of batch) {
      if (d.kind === 'clear') {
        if (state.alarms.delete(d.alarmId)) dirty = true;
        continue;
      }
      const id = String(pickId(d.raw));
      const incoming = mapHubAlarmPayload(d.raw, state.alarms.get(id));
      if (!alarmMatchesConnectedOpcServer(incoming, state.connectedOpcServerIds)) {
        if (state.alarms.delete(id)) dirty = true;
        continue;
      }
      if (d.kind === 'update' && !incoming.conditionActive) {
        if (state.alarms.delete(id)) dirty = true;
        continue;
      }
      const existing = state.alarms.get(incoming.id);
      const next = existing ? upsertAlarm(existing, incoming) : incoming;
      if (existing && alarmsEqual(existing, next)) continue;
      state.alarms.set(incoming.id, next);
      dirty = true;
      // Annunciate genuinely NEW alarms only (re-deliveries no longer re-beep).
      if (d.kind === 'new' && !existing) sounds.push(incoming.priority);
    }
    if (dirty) {
      state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds, state.stats);
      state.alarmIndexBySource = rebuildSourceIndex(state.alarms, state.alarmIndexBySource);
      state.lastUpdated = Date.now();
    }
  });
  // Side effect deliberately OUTSIDE the immer producer.
  sounds.forEach(playAlarmSound);
}

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
        state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds, state.stats);
        state.alarmIndexBySource = rebuildSourceIndex(state.alarms, state.alarmIndexBySource);
        state.lastUpdated = Date.now();
      }
    });
  } else if (hydrateDirty) {
    set(state => {
      state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds, state.stats);
        state.alarmIndexBySource = rebuildSourceIndex(state.alarms, state.alarmIndexBySource);
      state.lastUpdated = Date.now();
    });
  }

  console.info(`[AlarmStore] Loaded ${stored}/${fetched} alarms from API`);
}

let hubInitInFlight: Promise<void> | null = null;
// D: hold the connection from the moment it is BUILT, before start() resolves —
// disconnect() (on logout) used to no-op because state.hubConnection is only set
// on success, so a logout racing the initial connect left a live hub pushing
// alarms and firing unauthenticated hydration after sign-out.
let liveHubConnection: HubConnection | null = null;

function pickId(raw: Record<string, unknown>): string {
  return String(raw.id ?? raw.Id ?? '');
}

// FE-07: prevents the 30s poll fallback from starting a hydration while one is in flight.
let refreshInFlight = false;

export const useAlarmStore = create<AlarmStore>()(
  immer((set, get) => ({
    alarms: new Map(),
    alarmIndexBySource: new Map(),
    stats: { totalActive: 0, totalCritical: 0, totalHigh: 0, totalMedium: 0, totalLow: 0, unacknowledged: 0, shelved: 0, suppressed: 0, outOfService: 0, alarmsPerTenMin: 0, floodActive: false },
    floodAlert: null,
    serverStatuses: new Map(),
    connectedOpcServerIds: new Set(),
    recentSoeEvents: [],
    alarmKpis: {},
    hubConnection: null,
    connectionState: 'uninitialized',
    lastUpdated: 0,
    selectedAlarmIds: new Set(),
    activeProtocol: null,
    hydrated: false,

    initialize: async (token: string) => {
      if (hubInitInFlight) return hubInitInFlight;

      const existing = get().hubConnection;
      if (existing?.state === HubConnectionState.Connected) return;

      hubInitInFlight = (async () => {
        (window as unknown as { amsDevToken?: string }).amsDevToken = token;
        const hubUrl = import.meta.env.VITE_SIGNALR_HUB_URL ?? '/hubs/alarms';

        const connection = new HubConnectionBuilder()
          .withUrl(hubUrl, {
            // H4: read the CURRENT token, not the initialize-time closure —
            // hub auto-reconnects after a rotation must present the new token.
            accessTokenFactory: () => getAuthToken() ?? token,
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
        liveHubConnection = connection;

        connection.on('OnNewAlarm', (raw: Record<string, unknown>) => {
          queueHubDelta(set, { kind: 'new', raw });
        });

        connection.on('OnAlarmUpdated', (raw: Record<string, unknown>) => {
          queueHubDelta(set, { kind: 'update', raw });
        });

        connection.on('OnAlarmCleared', (payload: { alarmId?: string; AlarmId?: string }) => {
          queueHubDelta(set, { kind: 'clear', alarmId: String(payload.alarmId ?? payload.AlarmId ?? '') });
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
          }).finally(() => {
            // FE-05: first hydration attempt finished — screens may stop showing skeletons.
            set(state => { state.hydrated = true; });
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
      // FE-07: overlap guard — a slow hydration must not interleave with the next
      // 30s poll tick (two concurrent hydrations can apply out of order).
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        await hydrateAlarmsFromApi(set, { purgeLab: false, reconcile: true });
      } catch (err) {
        console.warn('[AlarmStore] Refresh failed', err);
        throw err;
      } finally {
        refreshInFlight = false;
        // FE-05: hydration has completed at least once (even on failure the UI should
        // show an error/empty state, not an indefinite skeleton).
        set(state => { state.hydrated = true; });
      }
    },

    disconnect: async () => {
      if (hubFlushTimer) { clearTimeout(hubFlushTimer); hubFlushTimer = null; }
      pendingHubDeltas = [];
      // D: stop whichever connection exists — the module ref covers the window
      // where start() is still in flight and state.hubConnection is still null.
      const conn = get().hubConnection ?? liveHubConnection;
      liveHubConnection = null;
      if (conn) { try { await conn.stop(); } catch { /* already closing */ } }
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
        state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds, state.stats);
        state.alarmIndexBySource = rebuildSourceIndex(state.alarms, state.alarmIndexBySource);
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
        state.stats = recalcStatsFromAlarms(state.alarms, state.connectedOpcServerIds, state.stats);
        state.alarmIndexBySource = rebuildSourceIndex(state.alarms, state.alarmIndexBySource);
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

// D: audible annunciation was likely silent — the AudioContext was created at
// module load, so the browser autoplay policy started it 'suspended', and
// playAlarmSound never resumed it. Now it is created lazily and resumed on the
// first user gesture (the gesture is what the policy requires), then resumed
// again defensively before each beep.
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

if (typeof window !== 'undefined') {
  const unlock = () => { void getAudioContext()?.resume().catch(() => {}); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

function playAlarmSound(priority: string) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const freq = priority === 'CRITICAL' ? 880 : priority === 'HIGH' ? 660 : 440;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    /* Audio may be blocked by browser policy */
  }
}
