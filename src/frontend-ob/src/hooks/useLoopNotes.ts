/** SME review #22 (CHG-058): react-query hooks for loop notes (cplm-api investigations). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createLoopNote, getEventNotes, getLoopNotes, linkLoopNote, setLoopNoteOutcome,
  type NewLoopNote, type NoteOutcome,
} from '../api/cpm/investigations';

const KEY = ['cpm', 'loop-notes'] as const;

export function useLoopNotes(loopId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'loop', loopId ?? ''],
    queryFn: ({ signal }) => getLoopNotes(loopId!, signal),
    enabled: !!loopId,
    staleTime: 30_000,
  });
}

export function useEventNotes(eventId: number | undefined) {
  return useQuery({
    queryKey: [...KEY, 'event', eventId ?? 0],
    queryFn: ({ signal }) => getEventNotes(eventId!, signal),
    enabled: eventId != null,
    staleTime: 30_000,
  });
}

function useInvalidateNotes() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateLoopNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: (n: NewLoopNote) => createLoopNote(n), onSuccess: invalidate });
}

export function useLinkLoopNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: ({ refId, eventId }: { refId: string; eventId: number | null }) => linkLoopNote(refId, eventId), onSuccess: invalidate });
}

export function useSetLoopNoteOutcome() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: ({ refId, outcome }: { refId: string; outcome: NoteOutcome }) => setLoopNoteOutcome(refId, outcome), onSuccess: invalidate });
}
