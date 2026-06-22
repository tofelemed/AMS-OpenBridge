import type { ActiveAlarm } from '../store/alarmStore';



function parseCookie(raw: unknown): number {

  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;

  if (typeof raw === 'string') {

    const n = Number(raw);

    return Number.isFinite(n) ? n : 0;

  }

  return 0;

}

function isSnapshotFeedAlarm(alarm: ActiveAlarm): boolean {

  return alarm.serverName === 'Current Alarms Feed' || alarm.opcAttributes?.feed === 'http-current-alarms';

}



/** OPC A&E condition alarms with cookie — Honeywell DCS or lab simulator. */

function isHttpFeedAlarm(alarm: ActiveAlarm): boolean {
  return alarm.serverName === 'Current Alarms Feed'
    || alarm.opcAttributes?.feed === 'http-current-alarms'
    || alarm.opcAttributes?.ackPath === 'http';
}

export function isOpcAckWriteable(alarm: ActiveAlarm): boolean {
  if (isHttpFeedAlarm(alarm)) {
    return alarm.conditionActive && !!(alarm.conditionName ?? '').trim();
  }

  const explicit = alarm.opcAttributes?.opcAckWriteable;

  if (explicit === true || explicit === 'true') return true;

  if (explicit === false || explicit === 'false') return false;

  if (isSnapshotFeedAlarm(alarm)) return false;

  const cookie = parseCookie(alarm.opcAttributes?.cookieOffset);

  if (cookie <= 0) return false;

  if (!alarm.conditionActive) return false;

  if (!(alarm.conditionName ?? '').trim()) return false;



  const kind = String(alarm.opcAttributes?.alarmEventKind ?? 'CONDITION').toUpperCase();

  if (kind !== 'CONDITION') return false;



  const src = (alarm.sourceName ?? '').trim();

  if (/^Tracking/i.test(src) || /^System/i.test(src)) return false;



  return true;

}



export function opcAckSkipReason(alarm: ActiveAlarm): string {

  if (isOpcAckWriteable(alarm)) return '';

  if (isHttpFeedAlarm(alarm) && !alarm.conditionActive) return 'Alarm is not active';
  if (isHttpFeedAlarm(alarm) && !(alarm.conditionName ?? '').trim()) return 'Missing condition name';
  if (isSnapshotFeedAlarm(alarm)) return 'ACK writeback is unavailable for HTTP snapshot feeds';

  const ackPath = String(alarm.opcAttributes?.ackPath ?? '').toLowerCase();

  if (ackPath === 'none' || ackPath.includes('foxapi')) return `ACK requires ${String(alarm.opcAttributes?.ackPath)}`;

  const cookie = parseCookie(alarm.opcAttributes?.cookieOffset);

  if (cookie <= 0) return 'No OPC cookieOffset — wait for live DCS event';

  if (!alarm.conditionActive) return 'Alarm is not active on DCS';

  if (!(alarm.conditionName ?? '').trim()) return 'Missing OPC condition name';

  const kind = String(alarm.opcAttributes?.alarmEventKind ?? 'CONDITION').toUpperCase();

  if (kind !== 'CONDITION') return `${kind} events are not writeback-ackable`;

  const src = alarm.sourceName ?? '';

  if (/^Tracking|^System/i.test(src)) return 'Tracking/System events are not writeback-ackable';

  return 'OPC writeback ACK not available';

}

