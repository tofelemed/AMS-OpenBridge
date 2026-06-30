import type { ActiveAlarm } from '../store/alarmStore';

const TERMINAL_ACK = new Set(['ACK_CONFIRMED', 'ACK_FAILED', 'ACK_TIMEOUT']);

function shallowRecordEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

/** True when grid/API-visible alarm fields are unchanged (ignores reference identity). */
export function alarmsEqual(a: ActiveAlarm, b: ActiveAlarm): boolean {
  return (
    a.id === b.id
    && a.serverId === b.serverId
    && a.serverName === b.serverName
    && a.sourceName === b.sourceName
    && a.conditionName === b.conditionName
    && a.subConditionName === b.subConditionName
    && a.message === b.message
    && a.severity === b.severity
    && a.priority === b.priority
    && a.category === b.category
    && a.state === b.state
    && a.conditionActive === b.conditionActive
    && a.acknowledged === b.acknowledged
    && a.isShelved === b.isShelved
    && a.isSuppressed === b.isSuppressed
    && a.isOutOfService === b.isOutOfService
    && a.qualityGood === b.qualityGood
    && a.eventTimeEpochMs === b.eventTimeEpochMs
    && a.activeTimeEpochMs === b.activeTimeEpochMs
    && a.ackTimeEpochMs === b.ackTimeEpochMs
    && a.ackedByUsername === b.ackedByUsername
    && a.ackComment === b.ackComment
    && a.shelveUntilEpochMs === b.shelveUntilEpochMs
    && a.shelveComment === b.shelveComment
    && a.suppressionReason === b.suppressionReason
    && a.correlationId === b.correlationId
    && a.isRootCause === b.isRootCause
    && a.processValue === b.processValue
    && a.processUnit === b.processUnit
    && a.serverReceivedEpochMs === b.serverReceivedEpochMs
    && a.logicalAlarmFamilyId === b.logicalAlarmFamilyId
    && a.instanceKeySchemaVersion === b.instanceKeySchemaVersion
    && a.eventTimeMissing === b.eventTimeMissing
    && a.ackLifecycleState === b.ackLifecycleState
    && a.ackRequestedAtEpochMs === b.ackRequestedAtEpochMs
    && a.pendingAckActionId === b.pendingAckActionId
    && a.commandId === b.commandId
    && a.lifecycleId === b.lifecycleId
    && a.dcsSequenceId === b.dcsSequenceId
    && shallowRecordEqual(a.opcAttributes, b.opcAttributes)
  );
}

/** Fields that affect default grid sort order. */
export function alarmSortKeyChanged(a: ActiveAlarm, b: ActiveAlarm): boolean {
  return a.eventTimeEpochMs !== b.eventTimeEpochMs || a.priority !== b.priority;
}
const PENDING_ACK = new Set([
  'ACK_REQUESTED', 'ACK_QUEUED', 'ACK_PROCESSING', 'ACK_DISPATCHED', 'ACK_PENDING_DCS', 'ACK_RETRYING',
]);

export function upsertAlarm(existing: ActiveAlarm | undefined, incoming: ActiveAlarm): ActiveAlarm {
  if (!existing) return incoming;

  const incomingEvent = incoming.eventTimeEpochMs ?? 0;
  const existingEvent = existing.eventTimeEpochMs ?? 0;

  if (incomingEvent < existingEvent) {
    return existing;
  }

  if (incomingEvent === existingEvent && incoming.id === existing.id) {
    const merged = mergeFields(existing, incoming);
    const preferred = preferRicherState(existing, merged);
    return alarmsEqual(existing, preferred) ? existing : preferred;
  }

  const merged = mergeFields(existing, incoming);
  return alarmsEqual(existing, merged) ? existing : merged;
}

function preferRicherState(a: ActiveAlarm, b: ActiveAlarm): ActiveAlarm {
  const aScore = stateRichness(a);
  const bScore = stateRichness(b);
  return bScore >= aScore ? b : a;
}

function resolveOperatorAcknowledged(existing: ActiveAlarm, incoming: ActiveAlarm): boolean {
  if (incoming.acknowledged === true) return true;
  if (existing.ackLifecycleState === 'ACK_CONFIRMED') return true;
  if (incoming.ackLifecycleState === 'ACK_CONFIRMED') return true;
  if (incoming.ackLifecycleState === 'ACK_FAILED' || incoming.ackLifecycleState === 'ACK_TIMEOUT') return false;
  return existing.acknowledged ?? false;
}

function stateRichness(a: ActiveAlarm): number {
  let s = 0;
  if (a.commandId) s += 2;
  if (Object.keys(a.opcAttributes ?? {}).length > 0) s += 1;
  return s;
}

function mergeFields(existing: ActiveAlarm, incoming: ActiveAlarm): ActiveAlarm {
  const opc = { ...(existing.opcAttributes ?? {}) };
  if (incoming.opcAttributes && Object.keys(incoming.opcAttributes).length > 0) {
    Object.assign(opc, incoming.opcAttributes);
  }

  return {
    ...existing,
    ...incoming,
    acknowledged: resolveOperatorAcknowledged(existing, incoming),
    subConditionName: incoming.subConditionName ?? existing.subConditionName,
    ackComment: incoming.ackComment ?? existing.ackComment,
    ackedByUsername: incoming.ackedByUsername ?? existing.ackedByUsername,
    ackTimeEpochMs: incoming.ackTimeEpochMs ?? existing.ackTimeEpochMs,
    logicalAlarmFamilyId: incoming.logicalAlarmFamilyId ?? existing.logicalAlarmFamilyId,
    instanceKeySchemaVersion: incoming.instanceKeySchemaVersion ?? existing.instanceKeySchemaVersion,
    opcAttributes: opc,
    commandId: incoming.commandId ?? existing.commandId,
    correlationId: incoming.correlationId ?? existing.correlationId,
    lifecycleId: incoming.lifecycleId ?? existing.lifecycleId,
    dcsSequenceId: incoming.dcsSequenceId ?? existing.dcsSequenceId,
    ackLifecycleState: incoming.ackLifecycleState ?? existing.ackLifecycleState,
    ackRequestedAtEpochMs: incoming.ackRequestedAtEpochMs ?? existing.ackRequestedAtEpochMs,
    pendingAckActionId: incoming.pendingAckActionId ?? existing.pendingAckActionId,
  };
}

export function shouldApplyAckLifecycle(
  currentState: string | null | undefined,
  incomingState: string,
): boolean {
  const current = currentState ?? '';
  const alreadyTerminal = TERMINAL_ACK.has(current);
  const incomingTerminal = TERMINAL_ACK.has(incomingState);
  if (alreadyTerminal && !incomingTerminal) return false;
  return true;
}

export function applyAckLifecycleToAlarm(
  alarm: ActiveAlarm,
  lifecycleState: string,
  timestampEpochMs: number | undefined,
  trace?: { commandId?: string; correlationId?: string; lifecycleId?: string; dcsSequenceId?: string },
): ActiveAlarm {
  if (!shouldApplyAckLifecycle(alarm.ackLifecycleState, lifecycleState)) {
    return alarm;
  }

  const next = { ...alarm };
  next.ackLifecycleState = lifecycleState;

  if (trace?.commandId) next.commandId = trace.commandId;
  if (trace?.correlationId) next.correlationId = trace.correlationId;
  if (trace?.lifecycleId) next.lifecycleId = trace.lifecycleId;
  if (trace?.dcsSequenceId) next.dcsSequenceId = trace.dcsSequenceId;

  if (lifecycleState === 'ACK_REQUESTED' || lifecycleState === 'ACK_QUEUED') {
    next.ackRequestedAtEpochMs = timestampEpochMs ?? Date.now();
    next.pendingAckActionId = trace?.commandId ?? next.pendingAckActionId;
  }

  if (lifecycleState === 'ACK_CONFIRMED') {
    next.acknowledged = true;
    if (next.ackTimeEpochMs == null) {
      next.ackTimeEpochMs = timestampEpochMs ?? Date.now();
    }
    next.state = next.conditionActive ? 'ACKNOWLEDGED_UNCLEARED' : 'ACKNOWLEDGED_CLEARED';
    next.pendingAckActionId = null;
  } else if (lifecycleState === 'ACK_FAILED' || lifecycleState === 'ACK_TIMEOUT') {
    next.pendingAckActionId = null;
  } else if (PENDING_ACK.has(lifecycleState)) {
    next.acknowledged = false;
  }

  return next;
}
