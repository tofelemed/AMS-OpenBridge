// Shared client for /api/v1/analytics/kpi.
//
// Both the Analytics page and the Dashboard need these plant-wide KPIs
// (mean-time-to-ack, hourly alarm rates, priority split). They use the SAME
// react-query key ['alarmAnalytics'] so the data is fetched once and cached
// across both surfaces — the Dashboard's MTTA and rate sparkline are exactly
// the numbers the Analytics page shows, with no extra request.
import { useQuery } from '@tanstack/react-query';
import { authedAxios } from '../api/http';

export interface AnalyticsKpiResponse {
  hourlyRates?: Array<{ hour?: string; count?: number; rate?: number }>;
  chatteringCount?: number;
  fleetingCount?: number;
  top10ContributionPercent?: number;
  badActors?: Array<{ sourceName: string; alarmCount?: number; count?: number }>;
  staleAlarmCount?: number;
  totalAlarms24h?: number;
  priorities?: Array<{ priority: string; count: number }>;
  // Phase 8 (N18) — EEMUA-191 / ISA-18.2 KPIs served by analytics when available (else derived/—).
  peakAlarmRate?: number;
  timeInFloodPercent?: number;
  alarmsPerShift?: number;
  meanTimeToAckSec?: number;
  meanTimeToRespondMin?: number;
  operatorCompliancePercent?: number;
  falseAlarmRatePercent?: number;
}

export interface BadActorRow { sourceName: string; count: number; alarmCount: number; percentage: number; }

export async function fetchAlarmAnalytics() {
  // H2: authedAxios (401 replay); skipActivity because this query re-fires on an
  // interval — a parked tab must not keep the session alive.
  const res = await authedAxios.get<AnalyticsKpiResponse>('/api/v1/analytics/kpi', {
    skipActivity: true,
  });
  const raw = res.data;

  const badActors = (raw.badActors ?? []).map(a => {
    const count = a.alarmCount ?? a.count ?? 0;
    return { sourceName: a.sourceName, count, alarmCount: count };
  });
  const badActorTotal = badActors.reduce((sum, a) => sum + a.count, 0);

  return {
    ...raw,
    hourlyRates: raw.hourlyRates ?? [],
    badActors: badActors.map(a => ({
      ...a,
      percentage: badActorTotal > 0 ? (a.count / badActorTotal) * 100 : 0,
    })),
  };
}

export type AlarmAnalytics = Awaited<ReturnType<typeof fetchAlarmAnalytics>>;

/** Shared react-query for /api/v1/analytics/kpi (key ['alarmAnalytics']). */
export function useAlarmAnalytics(refetchInterval: number | false = 60_000) {
  return useQuery({
    queryKey: ['alarmAnalytics'],
    queryFn: fetchAlarmAnalytics,
    refetchInterval,
  });
}
