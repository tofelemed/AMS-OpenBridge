import { describe, expect, it } from 'vitest';
import { cpaHref, selectLoop, selectedWindow, windowEnd, windowKind } from './navigation';

describe('CPA navigation identity', () => {
  it('accepts legacy durations without confusing them with evaluated ends', () => {
    const old = new URLSearchParams('loop=FIC10301&window=12h');
    expect(windowKind(old)).toBe('12h');
    expect(windowEnd(old)).toBeUndefined();
    expect(cpaHref('/cpm/explorer', old)).toBe('/cpm/explorer?loop=FIC10301&kind=12h');
  });
  it('preserves immutable context and scope but not unrelated event IDs', () => {
    const p = new URLSearchParams('loop=A%26B&kind=12h&window=2026-09-18T00%3A00%3A00Z&gate=G5&methodRun=run-5&event=833&site=plant');
    const next = new URL(cpaHref('/cpm/evidence', p), 'http://localhost').searchParams;
    expect(next.get('loop')).toBe('A&B');
    expect(next.get('window')).toBe('2026-09-18T00:00:00Z');
    expect(next.get('kind')).toBe('12h');
    expect(next.get('methodRun')).toBe('run-5');
    expect(next.get('mode')).toBe('FIXED');
    expect(next.get('site')).toBe('plant');
    expect(next.has('event')).toBe(false);
  });
  it('clears incompatible identity on loop change without mutating the source', () => {
    const p = new URLSearchParams('loop=A&gate=G5&window=end&methodRun=run&event=833&kind=12h');
    const next = selectLoop(p, 'B');
    expect(next.toString()).toBe('loop=B&kind=12h');
    expect(p.get('loop')).toBe('A');
    expect(cpaHref('/cpm/explorer', p, { loop: 'B' })).toBe('/cpm/explorer?loop=B&kind=12h');
  });
  it('matches timestamp instants and never substitutes the latest result', () => {
    const rows = [{ windowEnd: '2026-09-18T00:00:00.000Z' }];
    expect(selectedWindow(rows, '2026-09-18T00:00:00Z')).toBe(rows[0]);
    expect(selectedWindow(rows, '2020-01-01T00:00:00Z')).toBeUndefined();
    expect(selectedWindow(rows)).toBe(rows[0]);
  });
});
