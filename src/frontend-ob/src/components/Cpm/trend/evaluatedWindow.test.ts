import { describe, expect, it } from 'vitest';
import type { CpmTrendPoint } from '../../../api/cpm/kpis';
import { evaluatedWindowOf, isWindowRange, overlaps, pinEvaluated, sharedBounds } from './evaluatedWindow';

const w = evaluatedWindowOf('2026-10-04T12:15:00Z', '2026-10-05T12:15:00Z', 'Evaluated 24h window')!;
const ms = (iso: string) => Date.parse(iso);

describe('evaluated window vs the plotted range', () => {
  it('parses the served bounds, null for a broken or backwards pair', () => {
    expect(w.endMs - w.startMs).toBe(24 * 3600_000);
    expect(evaluatedWindowOf(null, '2026-10-05T12:15:00Z', 'x')).toBeNull();
    expect(evaluatedWindowOf('2026-10-05T12:15:00Z', '2026-10-04T12:15:00Z', 'x')).toBeNull();
  });

  it('knows when the window is outside the trend (live 8 h a day later)', () => {
    expect(overlaps(w, ms('2026-10-06T02:00:00Z'), ms('2026-10-06T10:00:00Z'))).toBe(false);
    expect(overlaps(w, ms('2026-10-05T06:00:00Z'), ms('2026-10-05T14:00:00Z'))).toBe(true);
  });

  it('knows when the trend IS the window (to the minute)', () => {
    expect(isWindowRange(w, w.startMs, w.endMs)).toBe(true);
    expect(isWindowRange(w, w.startMs + 30_000, w.endMs)).toBe(true);
    expect(isWindowRange(w, w.startMs - 3600_000, w.endMs)).toBe(false);
  });
});

describe('sharedBounds', () => {
  it('spans both trends on each axis, padded 5 % and snapped to a clean step', () => {
    const then: CpmTrendPoint[] = [{ ts: 1, pv_min: 73, pv_max: 79, sp: 77.8, op_avg: 29 }, { ts: 2, op_avg: 35 }];
    const now: CpmTrendPoint[] = [{ ts: 3, pv_avg: 70, op: 40 }];
    const b = sharedBounds([then, now]);
    // 70..79 padded to 69.55..79.45, snapped outward to the 2-unit step → 68..80
    expect(b.pv).toEqual({ min: 68, max: 80 });
    // 29..40 padded to 28.45..40.55, step 5 → 25..45
    expect(b.op).toEqual({ min: 25, max: 45 });
  });

  it('is null for an axis with no values', () => {
    expect(sharedBounds([[{ ts: 1 }]])).toEqual({ pv: null, op: null });
  });
});

describe('pinEvaluated', () => {
  it('pins the window, turns compare on and opens the Summary tab, keeping the loop', () => {
    const p = pinEvaluated(new URLSearchParams('loop=FIC10401&tab=Signals'), '2026-10-04T12:15:00Z', '2026-10-05T12:15:00Z');
    expect(Object.fromEntries(p)).toEqual({
      loop: 'FIC10401', tab: 'Summary', from: '2026-10-04T12:15:00.000Z', to: '2026-10-05T12:15:00.000Z', compare: '1',
    });
  });
});
