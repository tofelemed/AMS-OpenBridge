import axios from 'axios';
import { getAuthToken } from './auth';
import { mapActiveAlarmDto } from './alarmMappers';
import type { ActiveAlarm, AlarmStats } from '../store/alarmStore';

// No `|| 'dev'` fallback: AMS.Api validates tokens for real now, so a literal "Bearer dev" is just a
// guaranteed 401 that hides the actual cause (no session).
const authHeaders = () => ({ Authorization: `Bearer ${getAuthToken() ?? ''}` });

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function fetchAlarmStatistics(serverId?: string): Promise<Partial<AlarmStats>> {
  const res = await axios.get('/api/v1/alarms/active/statistics', {
    params: { serverId: serverId || undefined },
    headers: authHeaders(),
  });
  const d = res.data ?? {};
  return {
    totalActive: Number(d.totalActive ?? 0),
    totalCritical: Number(d.totalCritical ?? 0),
    totalHigh: Number(d.totalHigh ?? 0),
    totalMedium: Number(d.totalMedium ?? 0),
    totalLow: Number(d.totalLow ?? 0),
    unacknowledged: Number(d.unacknowledged ?? d.totalUnacknowledged ?? 0),
    shelved: Number(d.shelved ?? 0),
    suppressed: Number(d.suppressed ?? 0),
    outOfService: Number(d.outOfService ?? 0),
    alarmsPerTenMin: Number(d.alarmsPerTenMin ?? 0),
    floodActive: Boolean(d.floodActive ?? false),
  };
}

export async function fetchAllActiveAlarms(
  serverId?: string,
  onPage?: (alarms: ActiveAlarm[], pageNumber: number) => void,
): Promise<ActiveAlarm[]> {
  const pageSize = 500;
  let pageNumber = 1;
  const all: ActiveAlarm[] = [];
  let totalCount = Number.POSITIVE_INFINITY;

  while (all.length < totalCount) {
    const res = await axios.get('/api/v1/alarms/active', {
      params: {
        pageNumber,
        pageSize,
        serverId: serverId || undefined,
        sortBy: 'EventTime',
        sortDescending: true,
      },
      headers: authHeaders(),
    });

    const items = (res.data?.items ?? res.data?.Items ?? []) as Record<string, unknown>[];
    const headerTotal = Number(res.headers?.['x-total-count'] ?? res.headers?.['X-Total-Count']);
    totalCount = Number(
      res.data?.totalCount ?? res.data?.TotalCount ?? (headerTotal || items.length),
    );

    const pageAlarms = items.map(mapActiveAlarmDto);
    all.push(...pageAlarms);
    onPage?.(pageAlarms, pageNumber);

    if (items.length < pageSize) break;
    pageNumber += 1;
    await sleep(0);
  }

  return all;
}

export async function acknowledgeAlarmsBatch(
  alarmIds: string[],
  comment: string,
  operatorStation: string,
): Promise<{ message?: string }> {
  const { data } = await axios.post(
    '/api/v1/alarms/acknowledge/batch',
    { alarmIds, comment, operatorStation },
    { headers: authHeaders() },
  );
  return data;
}

export async function shelveAlarm(
  alarmId: string,
  durationMinutes: number,
  comment: string,
  operatorStation: string,
): Promise<void> {
  await axios.post(
    `/api/v1/alarms/${alarmId}/shelve`,
    { durationMinutes, comment, operatorStation },
    { headers: authHeaders() },
  );
}

export async function suppressAlarm(
  alarmId: string,
  reason: string,
  operatorStation: string,
): Promise<void> {
  await axios.post(
    `/api/v1/alarms/${alarmId}/suppress`,
    { reason, operatorStation },
    { headers: authHeaders() },
  );
}

export async function setAlarmOutOfService(
  alarmId: string,
  reason: string,
  operatorStation: string,
): Promise<void> {
  await axios.post(
    `/api/v1/alarms/${alarmId}/out-of-service`,
    { reason, operatorStation },
    { headers: authHeaders() },
  );
}

export async function fetchConnectedOpcAeServers(): Promise<
  { id: string; name: string; status: string; protocol: string }[]
> {
  try {
    const res = await axios.get('/api/v1/admin/alarm-feed', { headers: authHeaders() });
    const feed = res.data as {
      enabled: boolean;
      serverId: string;
      serverName: string;
      protocol: string;
      status: string;
    };
    if (!feed.enabled) return [];
    return [{
      id: feed.serverId.toLowerCase(),
      name: feed.serverName,
      status: feed.status === 'Connected' ? 'Connected' : feed.status,
      protocol: feed.protocol ?? 'HTTP-JSON',
    }];
  } catch {
    return [];
  }
}

export async function purgeLabInjectedAlarms(serverId?: string): Promise<number> {
  const res = await axios.post(
    '/api/v1/alarms/active/purge-lab-data',
    null,
    { params: { serverId: serverId || undefined }, headers: authHeaders() },
  );
  return Number(res.data?.removedCount ?? res.data?.RemovedCount ?? 0);
}
