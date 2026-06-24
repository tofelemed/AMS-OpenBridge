import type { ActiveAlarm } from '../store/alarmStore';

const TERMINAL_ACK = new Set(['ACK_CONFIRMED', 'ACK_FAILED', 'ACK_TIMEOUT']);
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
    return preferRicherState(existing, merged);
  }

  return mergeFields(existing, incoming);
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
