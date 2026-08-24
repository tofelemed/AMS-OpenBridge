/**
 * CPLM Phase 7 (F0.2) — react-query hooks over cpmApi.
 * Components consume these, never cpmApi directly, so caching/invalidation
 * stays in one place.
 */
import React from 'react';
// H2: interval-polling queryFns are wrapped in backgroundPoll so machine
// refetches never extend the idle-session clock.
import { ApiError, backgroundPoll } from '../api/apiFetch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as cpm from '../api/cpmApi';

const KEYS = {
  loops: ['cpm', 'loops'] as const,
  loop: (id: string) => ['cpm', 'loop', id] as const,
  contract: ['cpm', 'registry-contract'] as const,
  readiness: (id: string) => ['cpm', 'readiness', id] as const,
  events: (q: cpm.CpmEventsQuery) => ['cpm', 'events', q] as const,
  gatesLatest: (id: string, wk: string) => ['cpm', 'gates', id, wk] as const,
  fleetSummary: (site?: string) => ['cpm', 'fleet', 'summary', site ?? ''] as const,
  pipeline: ['cpm', 'pipeline-status'] as const,
};

export function useCpmLoops() {
  return useQuery({ queryKey: KEYS.loops, queryFn: cpm.getLoops, staleTime: 30_000 });
}

export function useCpmLoop(loopId: string | undefined) {
  return useQuery({
    queryKey: KEYS.loop(loopId ?? ''),
    queryFn: () => cpm.getLoop(loopId!),
    enabled: !!loopId,
  });
}

export function useCpmRegistryContract() {
  return useQuery({
    queryKey: KEYS.contract,
    queryFn: cpm.getRegistryContract,
    staleTime: Infinity, // static per deployment
  });
}

export function useCpmReadiness(loopId: string | undefined) {
  return useQuery({
    queryKey: KEYS.readiness(loopId ?? ''),
    queryFn: () => cpm.getReadiness(loopId!),
    enabled: !!loopId,
  });
}

export function useActivateLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cpm.activateLoop,
    onSuccess: (loop) => {
      void qc.invalidateQueries({ queryKey: KEYS.loops });
      void qc.invalidateQueries({ queryKey: KEYS.loop(loop.loopId) });
      void qc.invalidateQueries({ queryKey: KEYS.readiness(loop.loopId) });
    },
  });
}

export function useDeleteLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cpm.deleteLoop,
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEYS.loops }),
  });
}

export function useRepublishEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cpm.republishEvidence,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: KEYS.loops });
      void qc.invalidateQueries({ queryKey: KEYS.loop(r.loopId) });
      void qc.invalidateQueries({ queryKey: KEYS.readiness(r.loopId) });
    },
  });
}

export function useCpmEvents(q: cpm.CpmEventsQuery, refetchMs = 30_000, enabled = true) {
  // C: `enabled` lets loop-scoped callers (Replay/Investigation) gate on !!loopId
  // so they don't fire a wasted fleet-wide fetch before the loop resolves; the
  // fleet-wide callers (Events page, Overview) simply omit it.
  return useQuery({
    queryKey: KEYS.events(q),
    queryFn: backgroundPoll(({ signal }) => cpm.getEvents(q, signal)),
    refetchInterval: refetchMs,
    enabled,
  });
}

export function useAcknowledgeEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      cpm.acknowledgeEvent(id, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cpm', 'events'] }),
  });
}

export function useShelveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, until, note }: { id: number; until: string; note?: string }) =>
      cpm.shelveEvent(id, until, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cpm', 'events'] }),
  });
}

export function useLatestGates(loopId: string | undefined, windowKind = '24h') {
  return useQuery({
    queryKey: KEYS.gatesLatest(loopId ?? '', windowKind),
    queryFn: ({ signal }) => cpm.getLatestGates(loopId!, windowKind, signal),
    enabled: !!loopId,
    // gates/latest answers 404 for a loop with no fused window yet. That is a
    // definitive answer, not a transient failure, so the global retry:2 turned
    // every newly-onboarded loop into 3 requests per selection (with backoff
    // delaying the "no verdict yet" message). Other statuses still retry.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

/**
 * Stable cache key for a plant scope. MUST be part of every fleet query key —
 * otherwise a scoped view would be served the cached whole-plant answer.
 */
function scopeKey(scope?: cpm.CpmFleetScope | string): string {
  if (!scope) return '';
  if (typeof scope === 'string') return scope;
  return [scope.site ?? '', scope.area ?? '', scope.unit ?? ''].join('|');
}

export function useFleetSummary(scope?: cpm.CpmFleetScope | string, windowKind = '24h') {
  // P10: this used to drop windowKind on the floor and always ask for 24h, while
  // the query key claimed to identify the result by site alone. Any caller behind
  // a 12h/24h toggle silently got 24h diagnosis counts — and cached them under a
  // key that could not tell the two apart.
  return useQuery({
    queryKey: [...KEYS.fleetSummary(scopeKey(scope)), windowKind],
    queryFn: backgroundPoll(() => cpm.getFleetSummary(scope, windowKind)),
    refetchInterval: 60_000,
  });
}

export function useCpmPipelineStatus(refetchMs = 15_000) {
  return useQuery({
    queryKey: KEYS.pipeline,
    queryFn: backgroundPoll(cpm.getPipelineStatus),
    refetchInterval: refetchMs,
  });
}

export function useFleetRankings(
  scope?: cpm.CpmFleetScope | string, windowKind = '24h',
  orderBy: cpm.CpmRankingOrder = 'confidence', limit = 50,
) {
  return useQuery({
    queryKey: ['cpm', 'fleet', 'rankings', scopeKey(scope), windowKind, orderBy, limit],
    queryFn: backgroundPoll(() => cpm.getFleetRankings(scope, windowKind, limit, orderBy)),
    refetchInterval: 60_000,
  });
}

export function useFleetHeatmap(scope?: cpm.CpmFleetScope | string, windowKind = '24h') {
  return useQuery({
    queryKey: ['cpm', 'fleet', 'heatmap', scopeKey(scope), windowKind],
    queryFn: backgroundPoll(() => cpm.getFleetHeatmap(scope, windowKind)),
    refetchInterval: 60_000,
  });
}

export function useCpmCalculations() {
  return useQuery({
    queryKey: ['cpm', 'calculations'],
    queryFn: cpm.getCalculations,
    staleTime: 5 * 60_000,
  });
}

export function useCpmTrend(
  series: string | undefined, start: Date, end: Date, width = 300, measurements = 'pv,sp,op',
  enabled = true, pollDriven = false,
) {
  // C: `enabled` lets a caller hold the trend until the real window bounds are
  // known (Investigation), instead of fetching the default 24h range and
  // discarding it when the verdict window arrives.
  //
  // H2: `pollDriven` is for callers whose window advances on a TIMER (Explorer's
  // rolling 8h). Those refetches are machine-initiated, so they must not extend
  // the idle-session clock — otherwise a parked Explorer tab keeps the session
  // alive forever. Callers whose window moves because a USER moved it (Historical,
  // Investigation, Replay) leave it false, so their work still counts as activity.
  const fetchTrend = ({ signal }: { signal: AbortSignal }) =>
    cpm.getTrend(series!, start, end, width, measurements, true, signal);
  return useQuery({
    queryKey: ['cpm', 'trend', series ?? '', start.getTime(), end.getTime(), width, measurements],
    queryFn: pollDriven ? backgroundPoll(fetchTrend) : fetchTrend,
    enabled: !!series && enabled,
    staleTime: 60_000,
  });
}

/**
 * U6 mode track (S7): coarse categorical ribbon — IoTDB last_value(mode) per
 * bucket via the trend endpoint. Quality has no stored series, so there is no
 * quality ribbon; this is the mode half only, honestly.
 */
export function useCpmModeTrack(
  series: string | undefined, start: Date, end: Date, width = 96,
) {
  return useQuery({
    queryKey: ['cpm', 'mode-track', series ?? '', start.getTime(), end.getTime(), width],
    queryFn: ({ signal }) => cpm.getTrend(series!, start, end, width, 'mode', false, signal),
    enabled: !!series,
    staleTime: 60_000,
  });
}

export function useGateHistory(
  loopId: string | undefined, windowKind = '24h', from?: string, to?: string,
) {
  return useQuery({
    queryKey: ['cpm', 'gate-history', loopId ?? '', windowKind, from ?? '', to ?? ''],
    queryFn: ({ signal }) => cpm.getGateHistory(loopId!, windowKind, from, to, 100, signal),
    enabled: !!loopId,
  });
}

export function useCpmKpis(loopId: string | undefined, resolution = '24h', limit = 50) {
  return useQuery({
    queryKey: ['cpm', 'kpis', loopId ?? '', resolution, limit],
    queryFn: ({ signal }) => cpm.getKpis(loopId!, resolution, undefined, undefined, limit, signal),
    enabled: !!loopId,
    staleTime: 60_000,
  });
}

export function useCpmResolutions() {
  return useQuery({
    queryKey: ['cpm', 'resolutions'],
    queryFn: cpm.getResolutions,
    staleTime: Infinity, // static per deployment
  });
}

/** KPI rows bounded to an explicit time range (U6 overlay, U7 inspector). */
export function useCpmKpisRange(
  loopId: string | undefined, resolution: string, from?: string, to?: string, limit = 500,
  enabled = true,
) {
  // C: `enabled` lets Replay gate on the selected window so it does not fire once
  // with from='' and again with from=windowStart, discarding the first response.
  return useQuery({
    queryKey: ['cpm', 'kpis-range', loopId ?? '', resolution, from ?? '', to ?? '', limit],
    queryFn: ({ signal }) => cpm.getKpis(loopId!, resolution, from, to, limit, signal),
    enabled: !!loopId && enabled,
    staleTime: 60_000,
  });
}

export function useRawWindow(
  series: string | undefined, start: Date | undefined, end: Date | undefined,
  measurements = 'pv,sp,op,mode', maxCount = 2000,
) {
  return useQuery({
    queryKey: ['cpm', 'raw', series ?? '', start?.getTime() ?? 0, end?.getTime() ?? 0, measurements],
    queryFn: ({ signal }) => cpm.getRawCursor(series!, start!, end!, maxCount, undefined, measurements, signal),
    enabled: !!series && !!start && !!end,
    staleTime: 5 * 60_000,
  });
}

export function usePipelineMetrics(refetchMs = 20_000) {
  return useQuery({
    queryKey: ['cpm', 'pipeline-metrics'],
    queryFn: backgroundPoll(cpm.getPipelineMetrics),
    refetchInterval: refetchMs,
  });
}

/** A8 recompute: submit, then poll until finished, then refetch gate queries. */
export function useRecompute(loopId: string | undefined) {
  const qc = useQueryClient();
  const [handle, setHandle] = React.useState<{ replayId: string; jobId: string } | null>(null);
  const submit = useMutation({
    mutationFn: () => cpm.recomputeLoop(loopId!),
    onSuccess: (h) => setHandle({ replayId: h.replayId, jobId: h.jobId }),
  });
  const status = useQuery({
    queryKey: ['cpm', 'replay-status', handle?.replayId ?? ''],
    queryFn: backgroundPoll(() => cpm.getReplayStatus(handle!.replayId, handle!.jobId)),
    enabled: !!handle,
    refetchInterval: (q) => (q.state.data?.finished ? false : 5_000),
  });
  React.useEffect(() => {
    if (status.data?.finished) {
      void qc.invalidateQueries({ queryKey: ['cpm', 'gates'] });
      void qc.invalidateQueries({ queryKey: ['cpm', 'gate-history'] });
      // A replay rewrites KPI rows too (source='flink-historical-replay') — the
      // Replay page's metric panel reads kpis-range, and without this it kept
      // showing the pre-recompute values next to the refreshed verdict.
      void qc.invalidateQueries({ queryKey: ['cpm', 'kpis'] });
      void qc.invalidateQueries({ queryKey: ['cpm', 'kpis-range'] });
    }
  }, [status.data?.finished, qc]);
  return { submit, status: handle ? status.data : null, reset: () => setHandle(null) };
}
