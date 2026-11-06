import { describe, it, expect } from 'vitest';
import { resultMarkers, type ResultRow } from './lanes';

const MIN = 60_000;
const t0 = Date.UTC(2026, 10, 5, 0, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();
/** 12 h rolling windows that close every 15 minutes: each window overlaps the next one by 11 h 45 min. */
const rolling = (n: number, diagnosis = 'NO_CALL'): ResultRow[] => Array.from({ length: n }, (_, i) => {
  const end = t0 + (i + 1) * 15 * MIN;
  return { windowStart: iso(end - 12 * 60 * MIN), windowEnd: iso(end), diagnosis };
});
const range = { from: t0, to: t0 + 24 * 60 * MIN };

describe('resultMarkers', () => {
  it('marks a result at its window end, not across its whole window', () => {
    const { markers } = resultMarkers(rolling(8), range);
    expect(markers).toHaveLength(8);
    for (let i = 0; i < markers.length; i++) {
      expect(markers[i].endMs).toBe(t0 + (i + 1) * 15 * MIN);
      expect(markers[i].endMs - markers[i].startMs).toBeLessThanOrEqual(15 * MIN);
      if (i > 0) expect(markers[i].startMs).toBeGreaterThanOrEqual(markers[i - 1].endMs); // 15-minute rows do not overlap
    }
  });

  it('keeps a gap as a gap: a result after a long silence does not stretch back across it', () => {
    const rows: ResultRow[] = [
      { windowStart: null, windowEnd: iso(t0 + 15 * MIN), diagnosis: 'NO_CALL' },
      { windowStart: null, windowEnd: iso(t0 + 600 * MIN), diagnosis: 'NO_CALL' },
    ];
    const { markers } = resultMarkers(rows, range);
    expect(markers[1].endMs - markers[1].startMs).toBe(15 * MIN);
  });

  it('writes the window end on each marker, the same value the list writes to ?window=', () => {
    const rows = rolling(3);
    const { markers } = resultMarkers(rows, range);
    expect(markers.map(m => m.windowEnd)).toEqual(rows.map(r => r.windowEnd));
  });

  it('returns the selected window span, whole, not clipped to a marker', () => {
    const rows = rolling(4);
    const { selected } = resultMarkers(rows, range, rows[2].windowEnd);
    expect(selected).toEqual({ startMs: Date.parse(rows[2].windowStart!), endMs: Date.parse(rows[2].windowEnd!) });
    expect(resultMarkers(rows, range, 'nope').selected).toBeNull();
    expect(resultMarkers(rows, range).selected).toBeNull();
  });

  it('leaves out results that end outside the range, and rows with no end', () => {
    const rows = [...rolling(2), { windowStart: null, windowEnd: null, diagnosis: 'NO_CALL' }, { windowStart: null, windowEnd: iso(t0 + 99 * 3600_000), diagnosis: 'NO_CALL' }];
    expect(resultMarkers(rows, range).markers).toHaveLength(2);
  });

  it('paints no fault green in this lane and a finding in its own tone', () => {
    const none = resultMarkers(rolling(1, 'NO_CALL'), range).markers[0];
    const sus = resultMarkers(rolling(1, 'SUSPECTED_FINAL_ELEMENT_NONLINEARITY'), range).markers[0];
    expect(none.tone).toBe('good');
    expect(sus.tone).toBe('warn');
    expect(none.label).toBe('No fault identified');
  });
});
