/**
 * CPLM Phase 7 (F0.2) — react-query hooks over cpmApi.
 * Components consume these, never cpmApi directly, so caching/invalidation
 * stays in one place.
 */
import React from 'react';
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

export function useCpmEvents(q: cpm.CpmEventsQuery, refetchMs = 30_000) {
  return useQuery({
    queryKey: KEYS.events(q),
    queryFn: () => cpm.getEvents(q),
    refetchInterval: refetchMs,
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
    queryFn: () => cpm.getLatestGates(loopId!, windowKind),
    enabled: !!loopId,
  });
}

export function useFleetSummary(site?: string) {
  return useQuery({
    queryKey: KEYS.fleetSummary(site),
    queryFn: () => cpm.getFleetSummary(site),
    refetchInterval: 60_000,
  });
}

export function useCpmPipelineStatus(refetchMs = 15_000) {
  return useQuery({
    queryKey: KEYS.pipeline,
    queryFn: cpm.getPipelineStatus,
    refetchInterval: refetchMs,
  });
}

export function useFleetRankings(site?: string, windowKind = '24h') {
  return useQuery({
    queryKey: ['cpm', 'fleet', 'rankings', site ?? '', windowKind],
    queryFn: () => cpm.getFleetRankings(site, windowKind),
    refetchInterval: 60_000,
  });
}

export function useFleetHeatmap(site?: string, windowKind = '24h') {
  return useQuery({
    queryKey: ['cpm', 'fleet', 'heatmap', site ?? '', windowKind],
    queryFn: () => cpm.getFleetHeatmap(site, windowKind),
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
) {
  return useQuery({
    queryKey: ['cpm', 'trend', series ?? '', start.getTime(), end.getTime(), width, measurements],
    queryFn: () => cpm.getTrend(series!, start, end, width, measurements, true),
    enabled: !!series,
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
    queryFn: () => cpm.getTrend(series!, start, end, width, 'mode', false),
    enabled: !!series,
    staleTime: 60_000,
  });
}

export function useGateHistory(
  loopId: string | undefined, windowKind = '24h', from?: string, to?: string,
) {
  return useQuery({
    queryKey: ['cpm', 'gate-history', loopId ?? '', windowKind, from ?? '', to ?? ''],
    queryFn: () => cpm.getGateHistory(loopId!, windowKind, from, to),
    enabled: !!loopId,
  });
}

export function useCpmKpis(loopId: string | undefined, resolution = '24h', limit = 50) {
  return useQuery({
    queryKey: ['cpm', 'kpis', loopId ?? '', resolution, limit],
    queryFn: () => cpm.getKpis(loopId!, resolution, undefined, undefined, limit),
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
) {
  return useQuery({
    queryKey: ['cpm', 'kpis-range', loopId ?? '', resolution, from ?? '', to ?? '', limit],
    queryFn: () => cpm.getKpis(loopId!, resolution, from, to, limit),
    enabled: !!loopId,
    staleTime: 60_000,
  });
}

export function useRawWindow(
  series: string | undefined, start: Date | undefined, end: Date | undefined,
  measurements = 'pv,sp,op,mode', maxCount = 2000,
) {
  return useQuery({
    queryKey: ['cpm', 'raw', series ?? '', start?.getTime() ?? 0, end?.getTime() ?? 0, measurements],
    queryFn: () => cpm.getRawCursor(series!, start!, end!, maxCount, undefined, measurements),
    enabled: !!series && !!start && !!end,
    staleTime: 5 * 60_000,
  });
}

export function usePipelineMetrics(refetchMs = 20_000) {
  return useQuery({
    queryKey: ['cpm', 'pipeline-metrics'],
    queryFn: cpm.getPipelineMetrics,
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
    queryFn: () => cpm.getReplayStatus(handle!.replayId, handle!.jobId),
    enabled: !!handle,
    refetchInterval: (q) => (q.state.data?.finished ? false : 5_000),
  });
  React.useEffect(() => {
    if (status.data?.finished) {
      void qc.invalidateQueries({ queryKey: ['cpm', 'gates'] });
      void qc.invalidateQueries({ queryKey: ['cpm', 'gate-history'] });
    }
  }, [status.data?.finished, qc]);
  return { submit, status: handle ? status.data : null, reset: () => setHandle(null) };
}
