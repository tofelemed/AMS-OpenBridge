/**
 * v2.5 Task 1H.6 — react-query hooks over api/cpm/health. Live health polls every 30 s through
 * backgroundPoll (machine refetches never extend the idle-session clock); an as-of read is a
 * fixed question and is not polled.
 */
import { useQuery } from '@tanstack/react-query';
import { ApiError, backgroundPoll } from '../../../api/apiFetch';
import { getInstrumentHealth, getInstrumentHealthHistory } from '../../../api/cpm/health';

export const HEALTH_KEYS = {
  asOf: (loopId: string, at: string) => ['cpm', 'instrument-health', loopId, at] as const,
  history: (loopId: string, from: string, to: string) => ['cpm', 'instrument-health', 'history', loopId, from, to] as const,
};

/** An unregistered loop answers 404 — a definitive answer, not a transient failure. */
const retryUnlessNotFound = (count: number, err: unknown) =>
  !(err instanceof ApiError && err.status === 404) && count < 2;

export function useInstrumentHealth(loopId: string | undefined, at?: Date) {
  const atKey = at ? at.toISOString() : 'now';
  return useQuery({
    queryKey: HEALTH_KEYS.asOf(loopId ?? '', atKey),
    queryFn: backgroundPoll(({ signal }: { signal?: AbortSignal }) => getInstrumentHealth(loopId!, at, signal)),
    enabled: !!loopId,
    refetchInterval: at ? false : 30_000,
    retry: retryUnlessNotFound,
  });
}

export function useInstrumentHealthHistory(loopId: string | undefined, from?: Date, to?: Date, limit = 200) {
  return useQuery({
    queryKey: HEALTH_KEYS.history(loopId ?? '', from?.toISOString() ?? '', to?.toISOString() ?? ''),
    queryFn: ({ signal }) => getInstrumentHealthHistory(loopId!, from!, to!, limit, signal),
    enabled: !!loopId && !!from && !!to && to.getTime() > from.getTime(),
    retry: retryUnlessNotFound,
  });
}
