/**
 * One sort for the Performance list. It holds the two orders the old "Opportunity ranking" list offered
 * (evidence score, control error) beside the list's own (tag, result) and the server's priority order.
 * The `error` and `priority` orders come from the fleet rankings; a loop the ranking did not return follows by tag.
 */
import { bandOf, type DiagnosisBandKey } from '../vocabulary';

export type LoopSort = 'evidence' | 'tag' | 'result' | 'error' | 'priority';

export const LOOP_SORTS: ReadonlyArray<{ value: LoopSort; label: string }> = [
  { value: 'evidence', label: 'Evidence score' },
  { value: 'tag', label: 'Tag' },
  { value: 'result', label: 'Result' },
  { value: 'error', label: 'Control error' },
  { value: 'priority', label: 'Priority' },
];

export const loopSortOf = (v: string | null): LoopSort =>
  LOOP_SORTS.find(s => s.value === v)?.value ?? 'evidence';

/** The rankings are asked for this many loops; past it, loops follow by tag. */
export const RANKING_LIMIT = 200;

const BAND_ORDER: ReadonlyArray<DiagnosisBandKey> =
  ['CONFIRMED', 'SUSPECTED', 'CLASSIFIED', 'DETECTED', 'NO_FAULT', 'NO_DATA', 'EXCLUDED', 'NOT_EVALUATED', 'OTHER'];

interface Sortable { loopId: string; diagnosis: string; confidence: number | null }

const byTag = (a: Sortable, b: Sortable) => a.loopId.localeCompare(b.loopId, undefined, { numeric: true });

/** `rank` maps a lower-cased loop id to its place in the server's ranking. */
export function sortLoops<T extends Sortable>(rows: readonly T[], sort: LoopSort, rank?: ReadonlyMap<string, number>): T[] {
  const out = [...rows];
  switch (sort) {
    case 'tag':
      return out.sort(byTag);
    case 'evidence':
      return out.sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1) || byTag(a, b));
    case 'result':
      return out.sort((a, b) => BAND_ORDER.indexOf(bandOf(a.diagnosis)) - BAND_ORDER.indexOf(bandOf(b.diagnosis)) || byTag(a, b));
    default: {
      if (!rank) return out.sort(byTag);
      const place = (r: T) => rank.get(r.loopId.toLowerCase()) ?? Number.POSITIVE_INFINITY;
      return out.sort((a, b) => {
        const pa = place(a);
        const pb = place(b);
        if (pa === pb) return byTag(a, b);
        return pa < pb ? -1 : 1;
      });
    }
  }
}
