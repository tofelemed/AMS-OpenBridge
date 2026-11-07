/**
 * CHG-140: what the window browser says when it has no PREVIOUS window to put beside the current one. Every case is
 * derived from the same list the tiles above show, so the line can never contradict it (it once said "only one
 * evaluated window stored" beside "1-5 of 100").
 */
import { fmtInstant } from '../context/LoopContextBar';

export type Comparison =
  | { state: 'loading' }
  | { state: 'none' }
  | { state: 'unavailable' }
  | { state: 'missing'; end: string }
  | { state: 'ready' };

/** The state from the two reads: the previous end, then the previous window at that end. A failed read is a read error, never "no full stored result". */
export function comparisonOf(
  prevEnd: { end: string | null | undefined; isError: boolean; isLoading: boolean },
  prevRow: { row: unknown; isError: boolean; isLoading: boolean },
): Comparison {
  if (prevEnd.isError) return { state: 'unavailable' };
  if (prevEnd.isLoading) return { state: 'loading' };
  if (!prevEnd.end) return { state: 'none' };
  if (prevRow.row) return { state: 'ready' };
  if (prevRow.isLoading) return { state: 'loading' };
  if (prevRow.isError) return { state: 'unavailable' };
  return { state: 'missing', end: prevEnd.end };
}

export function comparisonNote(c: Comparison): string {
  switch (c.state) {
    case 'loading': return 'Loading the previous window…';
    case 'none': return 'No earlier evaluated window is stored, so there is nothing to compare against.';
    case 'unavailable': return 'The previous window could not be read.';
    case 'missing': return `The previous window (ends ${fmtInstant(c.end)}) has no full stored result to compare against.`;
    default: return '';
  }
}
