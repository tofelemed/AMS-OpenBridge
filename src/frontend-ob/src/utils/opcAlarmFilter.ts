import type { ActiveAlarm } from '../store/alarmStore';

export function isActiveOpcAlarm(alarm: ActiveAlarm): boolean {
  return alarm.conditionActive === true;
}

export function isDisplayableOpcAlarm(alarm: ActiveAlarm): boolean {
  return !!(alarm.sourceName ?? '').trim() && !!(alarm.conditionName ?? '').trim();
}

export function isLabStormAlarm(_alarm: ActiveAlarm): boolean {
  return false;
}

export function isLiveSimulatorAlarm(alarm: ActiveAlarm): boolean {
  return isDisplayableOpcAlarm(alarm);
}

// Fallback when no server list has been synced yet: the lab HTTP-feed server.
// H7 fix: this used to be the ONLY id accepted — the connectedServerIds argument
// was ignored, silently dropping alarms from every other OPC server.
const HTTP_FEED_SERVER_ID = 'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110';

export function alarmMatchesConnectedOpcServer(
  alarm: ActiveAlarm,
  connectedServerIds: ReadonlySet<string>,
): boolean {
  if (!isDisplayableOpcAlarm(alarm)) return false;
  if (!isActiveOpcAlarm(alarm)) return false;
  const serverId = alarm.serverId.trim().toLowerCase();
  if (connectedServerIds.size > 0) return connectedServerIds.has(serverId);
  return serverId === HTTP_FEED_SERVER_ID;
}

const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, DIAGNOSTIC: 4,
};

export function sortAlarmsForConsole(a: ActiveAlarm, b: ActiveAlarm): number {
  const te = (b.eventTimeEpochMs ?? 0) - (a.eventTimeEpochMs ?? 0);
  if (te !== 0) return te;
  const pa = PRIORITY_RANK[(a.priority ?? 'LOW').toUpperCase()] ?? 9;
  const pb = PRIORITY_RANK[(b.priority ?? 'LOW').toUpperCase()] ?? 9;
  return pa - pb;
}
