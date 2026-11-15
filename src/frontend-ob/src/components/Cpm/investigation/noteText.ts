/**
 * CHG-189 (owner review item 12): the words the loop notes button, dialog and cards share. Pure.
 */
import type { CpmEventFrame } from '../../../api/cpmApi';
import type { NoteOutcome } from '../../../api/cpm/investigations';
import type { CpmTone } from '../shared';
import { diagnosisLabel } from '../vocabulary';
import { fmtInstant } from '../context/LoopContextBar';

export const OUTCOMES: Array<{ value: NoteOutcome; label: string; tone: CpmTone }> = [
  { value: 'INCONCLUSIVE', label: 'Inconclusive', tone: 'muted' },
  { value: 'WORK_COMPLETED', label: 'Work completed', tone: 'warn' },
  { value: 'PERFORMANCE_RESTORED', label: 'Performance restored', tone: 'good' },
];

export const outcomeOf = (o: NoteOutcome) => OUTCOMES.find(x => x.value === o) ?? OUTCOMES[0];

export const episodeLabel = (e: CpmEventFrame) =>
  `EVT-${e.id} · ${diagnosisLabel(e.peak_diagnosis)} · ${fmtInstant(e.opened_at)}${e.closed_at ? '' : ' (open)'}`;

/** "1 note", "3 notes": never "note(s)". */
export const noteCount = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'note' : 'notes'}`;

/** The button names its count only when there is one to name. */
export const notesButtonLabel = (n: number) => (n > 0 ? `Loop notes (${n.toLocaleString('en-GB')})` : 'Loop notes');

/** A note being written: kept by the button, so closing the dialog never loses what was typed. */
export interface NoteDraft { text: string; outcome: NoteOutcome; attach: boolean; alsoAck: boolean }

export const EMPTY_DRAFT: NoteDraft = { text: '', outcome: 'INCONCLUSIVE', attach: true, alsoAck: false };
