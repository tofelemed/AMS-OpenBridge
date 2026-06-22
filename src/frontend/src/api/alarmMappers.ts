import type { ActiveAlarm } from '../store/alarmStore';
import { computeLogicalAlarmFamilyId, INSTANCE_KEY_SCHEMA_VERSION } from '../utils/alarmIdentity';
import { upsertAlarm } from '../utils/alarmReconciliation';

function pick<T>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  }
  return undefined;
}

function toEpochMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function resolveFamilyId(
  dto: Record<string, unknown>,
  serverId: string,
  sourceName: string,
  conditionName: string | null,
  subConditionName: string | null,
): string {
  const fromApi = pick<string>(dto, 'logicalAlarmFamilyId', 'LogicalAlarmFamilyId');
  if (fromApi?.trim()) return fromApi.trim();
  return computeLogicalAlarmFamilyId(serverId, sourceName, conditionName, subConditionName);
}

/** REST snapshot from GET /api/v1/alarms/active */
export function mapActiveAlarmDto(dto: Record<string, unknown>): ActiveAlarm {
  const opc = (pick<Record<string, unknown>>(dto, 'opcAttributes', 'OpcAttributes') ?? {}) as Record<string, unknown>;
  const custom = pick<Record<string, unknown>>(dto, 'customAttributes', 'CustomAttributes') ?? {};
  const ackLifecycle =
    (opc.ackLifecycleState as string | undefined) ??
    (custom.ackLifecycleState as string | undefined) ??
    null;

  const serverId = String(pick(dto, 'serverId', 'ServerId') ?? '');
  const sourceName = String(pick(dto, 'sourceName', 'SourceName') ?? '');
  const conditionName = (pick(dto, 'conditionName', 'ConditionName') as string | null) ?? null;
  const subConditionName = (pick(dto, 'subConditionName', 'SubConditionName') as string | null) ?? null;

  const eventTimeEpochMs = toEpochMs(pick(dto, 'eventTime', 'EventTime'));
  const activeTimeEpochMs = toEpochMs(pick(dto, 'activeTime', 'ActiveTime'));
  const serverReceivedEpochMs =
    toEpochMs(pick(dto, 'serverReceivedAt', 'ServerReceivedAt', 'serverReceivedEpochMs', 'ServerReceivedEpochMs'))
    ?? null;

  return {
    id: String(pick(dto, 'id', 'Id')),
    serverId,
    serverName: String(pick(dto, 'serverName', 'ServerName') ?? ''),
    sourceName,
    conditionName,
    subConditionName,
    message: (pick(dto, 'message', 'Message') as string | null) ?? null,
    severity: Number(pick(dto, 'severity', 'Severity') ?? 0),
    priority: String(pick(dto, 'priorityLabel', 'PriorityLabel', 'priority', 'Priority') ?? 'LOW').toUpperCase() as ActiveAlarm['priority'],
    category: String(pick(dto, 'category', 'Category') ?? 'PROCESS').toUpperCase(),
    state: String(pick(dto, 'stateLabel', 'StateLabel', 'state', 'State') ?? 'UNACKNOWLEDGED_UNCLEARED').toUpperCase(),
    conditionActive: Boolean(pick(dto, 'conditionActive', 'ConditionActive') ?? true),
    acknowledged: Boolean(pick(dto, 'acknowledged', 'Acknowledged') ?? false),
    isShelved: Boolean(pick(dto, 'isShelved', 'IsShelved') ?? false),
    isSuppressed: Boolean(pick(dto, 'isSuppressed', 'IsSuppressed') ?? false),
    isOutOfService: Boolean(pick(dto, 'isOutOfService', 'IsOutOfService') ?? false),
    qualityGood: Boolean(pick(dto, 'qualityGood', 'QualityGood') ?? true),
    eventTimeEpochMs: eventTimeEpochMs ?? 0,
    activeTimeEpochMs: activeTimeEpochMs ?? eventTimeEpochMs ?? 0,
    ackTimeEpochMs: toEpochMs(pick(dto, 'ackTime', 'AckTime')),
    ackedByUsername: (pick(dto, 'ackedByUsername', 'AckedByUsername') as string | null) ?? null,
    ackComment: (pick(dto, 'ackComment', 'AckComment') as string | null) ?? null,
    shelveUntilEpochMs: toEpochMs(pick(dto, 'shelveUntil', 'ShelveUntil')),
    shelveComment: (pick(dto, 'shelveComment', 'ShelveComment') as string | null) ?? null,
    suppressionReason: (pick(dto, 'suppressionReason', 'SuppressionReason') as string | null) ?? null,
    correlationId: pick(dto, 'correlationId', 'CorrelationId') != null
      ? String(pick(dto, 'correlationId', 'CorrelationId'))
      : null,
    isRootCause: Boolean(pick(dto, 'isRootCause', 'IsRootCause') ?? false),
    processValue: (pick(dto, 'processValue', 'ProcessValue') as number | null) ?? null,
    processUnit: (pick(dto, 'processUnit', 'ProcessUnit') as string | null) ?? null,
    serverReceivedEpochMs: serverReceivedEpochMs ?? 0,
    opcAttributes: opc as Record<string, unknown>,
    ackLifecycleState: ackLifecycle,
    ackRequestedAtEpochMs: null,
    pendingAckActionId: null,
    logicalAlarmFamilyId: resolveFamilyId(dto, serverId, sourceName, conditionName, subConditionName),
    instanceKeySchemaVersion: Number(
      pick(dto, 'instanceKeySchemaVersion', 'InstanceKeySchemaVersion') ?? INSTANCE_KEY_SCHEMA_VERSION,
    ),
    eventTimeMissing: eventTimeEpochMs == null,
  };
}

/** SignalR hub payload — merge with existing for at-least-once reconciliation. */
export function mapHubAlarmPayload(raw: Record<string, unknown>, existing?: ActiveAlarm): ActiveAlarm {
  const base = mapActiveAlarmDto(raw);
  const merged: ActiveAlarm = {
    ...base,
    id: String(pick(raw, 'id', 'Id') ?? base.id),
    eventTimeEpochMs: Number(pick(raw, 'eventTimeEpochMs', 'EventTimeEpochMs') ?? base.eventTimeEpochMs),
    activeTimeEpochMs: Number(pick(raw, 'activeTimeEpochMs', 'ActiveTimeEpochMs') ?? base.activeTimeEpochMs),
    ackTimeEpochMs: pick(raw, 'ackTimeEpochMs', 'AckTimeEpochMs') != null
      ? Number(pick(raw, 'ackTimeEpochMs', 'AckTimeEpochMs'))
      : base.ackTimeEpochMs,
    shelveUntilEpochMs: pick(raw, 'shelveUntilEpochMs', 'ShelveUntilEpochMs') != null
      ? Number(pick(raw, 'shelveUntilEpochMs', 'ShelveUntilEpochMs'))
      : base.shelveUntilEpochMs,
    serverReceivedEpochMs: Number(
      pick(raw, 'serverReceivedEpochMs', 'ServerReceivedEpochMs') ?? base.serverReceivedEpochMs,
    ),
    subConditionName: (pick(raw, 'subConditionName', 'SubConditionName') as string | null) ?? base.subConditionName,
    ackComment: (pick(raw, 'ackComment', 'AckComment') as string | null) ?? base.ackComment,
    ackedByUsername: (pick(raw, 'ackedByUsername', 'AckedByUsername') as string | null) ?? base.ackedByUsername,
    state: String(pick(raw, 'state', 'State') ?? base.state).toUpperCase(),
    priority: String(pick(raw, 'priority', 'Priority') ?? base.priority).toUpperCase() as ActiveAlarm['priority'],
    logicalAlarmFamilyId: pick<string>(raw, 'logicalAlarmFamilyId', 'LogicalAlarmFamilyId') ?? base.logicalAlarmFamilyId,
    instanceKeySchemaVersion: Number(
      pick(raw, 'instanceKeySchemaVersion', 'InstanceKeySchemaVersion') ?? base.instanceKeySchemaVersion,
    ),
    eventTimeMissing: base.eventTimeMissing,
  };

  return existing ? upsertAlarm(existing, merged) : merged;
}

/** Historical query rows (snake_case Dapper or camelCase API). eventTime authority for SOE. */
export function mapHistoricalAlarmRow(row: Record<string, unknown>): Record<string, unknown> {
  const serverId = String(pick(row, 'server_id', 'serverId', 'ServerId') ?? '');
  const sourceName = String(pick(row, 'source_name', 'sourceName', 'SourceName') ?? '');
  const conditionName = (pick(row, 'condition_name', 'conditionName', 'ConditionName') as string | null) ?? null;
  const subConditionName = (pick(row, 'sub_condition_name', 'subConditionName', 'SubConditionName') as string | null) ?? null;

  const eventTimeEpochMs =
    toEpochMs(pick(row, 'event_time', 'eventTime', 'EventTime'))
    ?? toEpochMs(pick(row, 'eventTimeEpochMs', 'EventTimeEpochMs'));

  const activeTimeEpochMs =
    toEpochMs(pick(row, 'active_time', 'activeTime', 'ActiveTime'))
    ?? toEpochMs(pick(row, 'activeTimeEpochMs', 'ActiveTimeEpochMs'));

  const ackTimeEpochMs =
    toEpochMs(pick(row, 'ack_time', 'ackTime', 'AckTime'))
    ?? toEpochMs(pick(row, 'ackTimeEpochMs', 'AckTimeEpochMs'));

  const priorityRaw = String(pick(row, 'priority', 'Priority') ?? 'LOW').toUpperCase();
  const stateRaw = String(
    pick(row, 'alarm_state', 'state', 'State', 'alarmState', 'AlarmState') ?? '',
  ).toUpperCase();

  return {
    id: pick(row, 'id', 'Id'),
    serverId,
    sourceName,
    conditionName,
    subConditionName,
    message: pick(row, 'message', 'Message'),
    severity: pick(row, 'severity', 'Severity'),
    priority: priorityRaw,
    category: String(pick(row, 'category', 'Category') ?? 'PROCESS').toUpperCase(),
    state: stateRaw.replace(/ /g, '_'),
    eventTimeEpochMs: eventTimeEpochMs ?? 0,
    activeTimeEpochMs: activeTimeEpochMs ?? eventTimeEpochMs ?? 0,
    ackTimeEpochMs,
    ackedByUsername: pick(row, 'acked_by_username', 'ackedByUsername', 'AckedByUsername'),
    logicalAlarmFamilyId: resolveFamilyId(row, serverId, sourceName, conditionName, subConditionName),
    instanceKeySchemaVersion: INSTANCE_KEY_SCHEMA_VERSION,
  };
}
