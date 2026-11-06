// Task 8: the old "Opportunity ranking" orders and the list's own orders are one sort.
import { describe, expect, it } from 'vitest';
import { LOOP_SORTS, loopSortOf, sortLoops, type LoopSort } from './loopSort';

const r = (loopId: string, diagnosis: string, confidence: number | null) => ({ loopId, diagnosis, confidence });
const ROWS = [
  r('TIC-3', 'SUSPECTED_STICTION', 0.5),
  r('FIC-1', 'CONFIRMED_OSCILLATION', 0.9),
  r('LIC-2', 'NOT_EVALUATED', null),
  r('PIC-4', 'DETECTED_BACKLASH', 0.7),
];
const ids = (rows: { loopId: string }[]) => rows.map(x => x.loopId);

describe('sortLoops', () => {
  it('offers the five orders, each by name', () => {
    expect(LOOP_SORTS.map(s => s.value)).toEqual(['evidence', 'tag', 'result', 'error', 'priority']);
  });

  it('keeps every ranking of the old panel in one sort', () => {
    const rank = new Map([['pic-4', 0], ['tic-3', 1], ['fic-1', 2]]);
    const by = (s: LoopSort) => ids(sortLoops(ROWS, s, rank));
    expect(by('evidence')).toEqual(['FIC-1', 'PIC-4', 'TIC-3', 'LIC-2']);   // highest score first, no score last
    expect(by('tag')).toEqual(['FIC-1', 'LIC-2', 'PIC-4', 'TIC-3']);
    expect(by('result')).toEqual(['FIC-1', 'TIC-3', 'PIC-4', 'LIC-2']);     // confirmed, suspected, detected, not evaluated
    expect(by('error')).toEqual(['PIC-4', 'TIC-3', 'FIC-1', 'LIC-2']);      // the server's rank, the unranked follow by tag
    expect(by('priority')).toEqual(['PIC-4', 'TIC-3', 'FIC-1', 'LIC-2']);
  });

  it('falls back to tag order while the ranking has not arrived', () => {
    expect(ids(sortLoops(ROWS, 'error', undefined))).toEqual(['FIC-1', 'LIC-2', 'PIC-4', 'TIC-3']);
  });

  it('does not change the rows it is given', () => {
    const copy = [...ROWS];
    sortLoops(ROWS, 'tag');
    expect(ROWS).toEqual(copy);
  });

  it('reads the address, evidence score when absent or unknown', () => {
    expect(loopSortOf(null)).toBe('evidence');
    expect(loopSortOf('nonsense')).toBe('evidence');
    expect(loopSortOf('priority')).toBe('priority');
  });
});
