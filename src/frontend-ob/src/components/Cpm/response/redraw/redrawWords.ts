/** CHG-198 (owner, approved 2026-11-15): the words of "Redraw from historian", each said once, in plain words. */
import { HISTORIAN_KEEP_DAYS } from './historianRead';

export const REDRAW_TITLE = 'Redraw from historian';

/** One line above the redrawn trends, once. */
export const REDRAWN_LABEL = 'Redrawn from the historian. The values are the engine\'s; samples the engine left out are not marked.';

/** Where a part that is never redrawn would be. */
export const NOT_REDRAWN = {
  modelFit: 'Model fit exists only with the stored charts.',
  fit: 'Fit quality exists only with the stored charts.',
  frequency: 'The frequency response exists only with the stored charts.',
} as const;

export const PAST_KEEP = `The historian keeps loop samples for ${HISTORIAN_KEEP_DAYS} days; this event is older.`;

export const NO_SAMPLES = 'The historian has no samples for this window.';

/** The progress word while the run is in flight. */
export const readingWord = (points: number): string =>
  (points > 0 ? `Reading the historian · ${points.toLocaleString('en-GB')} points` : 'Reading the historian');
export const DRAWING_WORD = 'Drawing';
