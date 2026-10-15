/**
 * CHG-098 (SME review 2 #25): ordering of the Calculations catalogue. The catalogue is client-side (a fixed list of
 * stored metrics), so sorting the whole filtered list here is honest — unlike a server-paged list, where sorting one
 * page would mislead. Status sorts by severity of the gate verdict, not by its label text.
 */
import type { MetricDef } from './calcCatalogue';
import type { SortDir } from './SortHeader';

export type CalcSortKey = 'id' | 'name' | 'gate' | 'status';
export interface CalcSort { key: CalcSortKey; dir: SortDir }
export type Tone = 'good' | 'warn' | 'bad' | 'muted';

/** Catalogue order (by id, which is gate order). */
export const DEFAULT_CALC_SORT: CalcSort = { key: 'id', dir: 'asc' };

/** Ascending status = needs attention first: out of spec, review, acceptable, then not evaluated. */
const TONE_RANK: Record<Tone, number> = { bad: 0, warn: 1, good: 2, muted: 3 };

/** Same column again flips the direction; a new column starts ascending. */
export const nextCalcSort = (cur: CalcSort, key: CalcSortKey): CalcSort =>
  cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export function sortMetrics(list: readonly MetricDef[], sort: CalcSort, toneOf: (m: MetricDef) => Tone): MetricDef[] {
  const cmp = (a: MetricDef, b: MetricDef): number => {
    switch (sort.key) {
      case 'name': return natural(a.name, b.name);
      case 'gate': return natural(a.gate, b.gate);
      case 'status': return TONE_RANK[toneOf(a)] - TONE_RANK[toneOf(b)];
      default: return natural(a.id, b.id);
    }
  };
  const sign = sort.dir === 'asc' ? 1 : -1;
  // ties keep catalogue (id) order in either direction, so equal rows never shuffle between renders
  return [...list].sort((a, b) => sign * cmp(a, b) || natural(a.id, b.id));
}

/** The order in words, for the column heading's accessible name. */
export function calcOrderText(sort: CalcSort): string {
  if (sort.key === 'status') return sort.dir === 'asc' ? 'needs attention first' : 'not evaluated first';
  return sort.dir === 'asc' ? 'ascending' : 'descending';
}
