import { describe, expect, it } from 'vitest';
import { selectedWindowOf } from './selectWindow';
import type { HistoryWindow } from './useWindowKpis';

const w = (end: string) => ({ windowEnd: end } as HistoryWindow);
const list = [w('2026-11-04T12:00:00.000Z'), w('2026-11-05T00:00:00.000Z')];   // oldest first, as the page holds them

describe('selectedWindowOf', () => {
  it('names the window asked for, comparing instants', () => {
    expect(selectedWindowOf(list, '2026-11-04T12:00:00Z')).toEqual({ window: list[0], notFound: false });
  });
  it('a window it does not hold is not found and is never replaced by the newest', () => {
    expect(selectedWindowOf(list, '2026-10-01T00:00:00Z')).toEqual({ window: undefined, notFound: true });
  });
  it('with no window asked for, the newest is the default', () => {
    expect(selectedWindowOf(list, null)).toEqual({ window: list[1], notFound: false });
  });
  it('an end that is not a date is not found', () => {
    expect(selectedWindowOf(list, 'yesterday').notFound).toBe(true);
  });
  it('an empty list has nothing to be missing from', () => {
    expect(selectedWindowOf([], '2026-11-04T12:00:00Z')).toEqual({ window: undefined, notFound: false });
  });
});
