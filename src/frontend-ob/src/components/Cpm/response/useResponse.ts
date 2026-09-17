/**
 * v2.5 Task 2E.5: the response workspace's data hooks. Events are cursor-paged (older on demand),
 * an event is immutable for its id, models are read as-of now, and a review invalidates the
 * loop's models so the recorded decision - not the optimistic one - is what renders.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getModels, getResponseEvent, getResponseEvents, reviewModel, type ReviewDecision } from '../../../api/cpm/response';

/** audit F19/F20: censored candidates (most of the table) are left out by default; the page still counts them. */
export function useResponseEvents(loopId: string | undefined, purpose = 'LIVE', includeCensored = false) {
  return useInfiniteQuery({
    queryKey: ['cpm', 'response-events', loopId ?? '', purpose, includeCensored],
    queryFn: ({ pageParam, signal }) => getResponseEvents(loopId!, { cursor: pageParam ?? undefined, limit: 50, purpose, includeCensored }, signal),
    initialPageParam: null as number | null,
    getNextPageParam: last => last.nextCursor,
    enabled: !!loopId,
    staleTime: 30_000,
  });
}

export function useResponseEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['cpm', 'response-event', eventId ?? ''],
    queryFn: ({ signal }) => getResponseEvent(eventId!, signal),
    enabled: !!eventId,
    staleTime: Infinity,                                   // immutable for its method run
  });
}

export function useModels(loopId: string | undefined) {
  return useQuery({
    queryKey: ['cpm', 'models', loopId ?? ''],
    queryFn: ({ signal }) => getModels(loopId!, undefined, signal),
    enabled: !!loopId,
    staleTime: 30_000,
  });
}

export function useReviewModel(loopId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { modelId: string; revision: number; decision: ReviewDecision; note?: string; domain?: Record<string, unknown> }) =>
      reviewModel(args.modelId, args.revision, args.decision, args.note, args.domain),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['cpm', 'models', loopId ?? ''] }); },
  });
}
