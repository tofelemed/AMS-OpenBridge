import type { ActiveAlarm } from '../store/alarmStore';

/**
 * OPC A&E rule: an alarm is only "active" (and thus displayable in the banner/grid)
 * when conditionActive = true.  Cleared alarms (conditionActive = false) must never
 * appear in the active alarm list, regardless of acknowledged state.
 */
export function isActiveOpcAlarm(alarm: ActiveAlarm): boolean {
  return alarm.conditionActive === true;
}

/** Basic displayability guard: source and condition must be non-empty. */
export function isDisplayableOpcAlarm(alarm: ActiveAlarm): boolean {
  return !!(alarm.sourceName ?? '').trim() && !!(alarm.conditionName ?? '').trim();
}

/** @deprecated Lab storm filter removed — HTTP API is sole ingest. */
export function isLabStormAlarm(_alarm: ActiveAlarm): boolean {
  return false;
}

/** @deprecated Use isDisplayableOpcAlarm */
export function isLiveSimulatorAlarm(alarm: ActiveAlarm): boolean {
  return isDisplayableOpcAlarm(alarm);
}

const HTTP_FEED_SERVER_ID = 'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110';

/**
 * Returns true when the alarm:
 * 1. Belongs to the connected HTTP feed server.
 * 2. Is displayable (source + condition non-empty).
 * 3. Is conditionActive = true (OPC A&E rule — cleared alarms must not appear).
 */
export function alarmMatchesConnectedOpcServer(
  alarm: ActiveAlarm,
  connectedServerIds: ReadonlySet<string>,
): boolean {
  if (!isDisplayableOpcAlarm(alarm)) return false;
  if (!isActiveOpcAlarm(alarm)) return false;      // ← OPC A&E: inactive alarms are hidden
  const serverId = alarm.serverId.trim().toLowerCase();
  // HTTP API is the sole production source — ONLY show its alarms
  return serverId === HTTP_FEED_SERVER_ID;
}

const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, DIAGNOSTIC: 4,
};

/**
 * Primary sort: newest event first (descending eventTimeEpochMs).
 * Secondary sort: highest priority first (Critical < High < Medium < Low).
 */
export function sortAlarmsForConsole(a: ActiveAlarm, b: ActiveAlarm): number {
  // Descending by event time — newest alarm at the top
  const te = (b.eventTimeEpochMs ?? 0) - (a.eventTimeEpochMs ?? 0);
  if (te !== 0) return te;
  // Then ascending priority rank (0 = Critical)
  const pa = PRIORITY_RANK[(a.priority ?? 'LOW').toUpperCase()] ?? 9;
  const pb = PRIORITY_RANK[(b.priority ?? 'LOW').toUpperCase()] ?? 9;
  return pa - pb;
}
