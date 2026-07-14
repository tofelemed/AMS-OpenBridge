import type { LiveAlarm, LiveMetric } from '../store/mqttStore';
import { apiFetch } from '../api/apiFetch';

/** IoTDB alarm device prefix — must match IoTDBPersistenceJob.PATH_PREFIX. */
export const IOTDB_ALARM_PREFIX = 'root.ams.site1.alarms.';

const HIST_URL = (import.meta.env.VITE_HIST_URL as string | undefined) ?? '/api/hist';

/** Sanitise alarm id for IoTDB path (alnum + underscore only). */
export function sanitizeIotdbAlarmId(alarmId: string): string {
  return alarmId.replace(/[^a-zA-Z0-9_]/g, '_');
}

/** Full IoTDB device path for a Kafka/raw alarm id. */
export function iotdbAlarmPath(alarmId: string): string {
  return `${IOTDB_ALARM_PREFIX}${sanitizeIotdbAlarmId(alarmId)}`;
}

/** Strip measurement suffix: root.ams.site1.alarms.device.severity → device path. */
export function devicePathFromTimeseries(path: string): string {
  const i = path.lastIndexOf('.');
  return i > 0 ? path.slice(0, i) : path;
}

/**
 * Parse IoTDB SHOW TIMESERIES REST response.
 * Values are column-major: one row with many timeseries paths in columns.
 */
export function parseTimeseriesPaths(body: { values?: unknown[][] }): string[] {
  const paths: string[] = [];
  for (const row of body.values ?? []) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const path = String(cell ?? '');
      if (path.startsWith(IOTDB_ALARM_PREFIX)) paths.push(path);
    }
  }
  return paths;
}

/** Discover unique IoTDB alarm device paths via Historian BFF /series. */
export async function discoverIotdbDevicePaths(): Promise<string[]> {
  try {
    const res = await apiFetch(`${HIST_URL}/series?prefix=${encodeURIComponent('root.ams.site1.alarms.**')}`);
    if (!res.ok) return [];
    const body = await res.json() as { values?: unknown[][] };
    const devices = new Set<string>();
    for (const tsPath of parseTimeseriesPaths(body)) {
      devices.add(devicePathFromTimeseries(tsPath));
    }
    return [...devices].sort();
  } catch {
    return [];
  }
}

/**
 * Map MQTT live alarm → IoTDB device path.
 * MQTT device id is Sparkplug topic id (sanitised sourceName); IoTDB uses Kafka alarmId.
 * When edge node publishes alarmId metric, use that; otherwise fall back to sanitised device id.
 */
export function resolveHistorianPathForLiveAlarm(
  alarm: LiveAlarm,
  metrics: Map<string, LiveMetric>,
): string {
  const kafkaAlarmId = metrics.get(`${alarm.alarmId}/alarmId`)?.value;
  if (kafkaAlarmId != null && String(kafkaAlarmId).trim()) {
    return iotdbAlarmPath(String(kafkaAlarmId));
  }
  return iotdbAlarmPath(alarm.alarmId);
}

/** Navigate to trend viewer with series or alarm id pre-selected. */
export function buildTrendViewerUrl(
  target: { series: string } | { alarmId: string },
  opts?: { hours?: number; auto?: boolean },
): string {
  const params = new URLSearchParams({
    hours: String(opts?.hours ?? 6),
    auto: (opts?.auto !== false) ? '1' : '0',
  });
  if ('series' in target) {
    params.set('series', target.series);
  } else {
    params.set('alarmId', target.alarmId);
  }
  return `/trend?${params.toString()}`;
}
