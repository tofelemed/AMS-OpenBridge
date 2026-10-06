/**
 * SME review #22 (CHG-058): loop notes = cplm-api investigations (analytics.investigation_reference, v2.5 2D.2).
 * A note belongs to a LOOP; it may name the evaluated window it was written on (method run, its evidence pinned)
 * and the diagnosis episode it is about — linked at creation or later. Writing a note never acknowledges.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';

export type NoteOutcome = 'INCONCLUSIVE' | 'WORK_COMPLETED' | 'PERFORMANCE_RESTORED';

export interface LoopNote {
  refId: string;
  loopId: string;
  methodRunId: string | null;
  evidenceIds: string[];
  note: string;
  outcome: NoteOutcome;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  pinned: boolean;
  eventId: number | null;
}

export interface NewLoopNote {
  loopId: string;
  note: string;
  outcome?: NoteOutcome;
  methodRunId?: string | null;
  evidenceIds?: string[];
  eventId?: number | null;
}

const json = (method: string, body: unknown): RequestInit =>
  ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const getLoopNotes = (loopId: string, signal?: AbortSignal) =>
  apiJson<{ loopId: string; count: number; investigations: LoopNote[] }>(`${CPM_BASE}/loops/${encodeURIComponent(loopId)}/investigations`, { signal });

export const getEventNotes = (eventId: number, signal?: AbortSignal) =>
  apiJson<{ eventId: number; count: number; investigations: LoopNote[] }>(`${CPM_BASE}/events/${eventId}/investigations`, { signal });

export const createLoopNote = (n: NewLoopNote) =>
  apiJson<LoopNote>(`${CPM_BASE}/investigations`, json('POST', n));

export const linkLoopNote = (refId: string, eventId: number | null) =>
  apiJson<LoopNote>(`${CPM_BASE}/investigations/${encodeURIComponent(refId)}/event`, json('PATCH', { eventId }));

export const setLoopNoteOutcome = (refId: string, outcome: NoteOutcome, note?: string) =>
  apiJson<LoopNote>(`${CPM_BASE}/investigations/${encodeURIComponent(refId)}/outcome`, json('PATCH', { outcome, note }));

/** The note limit the API enforces (CpmInvestigationsController.MaxNoteLength). */
export const MAX_NOTE_LENGTH = 4000;
