// CHG-025, Task 19: which window the inspector shows, and where "Inspect this window" goes.
// The newest loaded window is selected unless ?window= names a loaded one.
import { describe, it, expect } from 'vitest';
import type { CpmKpiRow } from '../../../api/cpmApi';
import { inspectTarget, resolveWindowView } from './windowNav';

const row = (end: string): CpmKpiRow =>
  ({ window_start: null, window_end: end, sample_count: 1, created_at: end } as unknown as CpmKpiRow);
// newest first, as the API serves them
const rows = [row('2026-09-13T12:00:00Z'), row('2026-09-13T11:45:00Z'), row('2026-09-13T11:30:00Z')];

describe('resolveWindowView', () => {
  it('reads the same instant in +00:00 and Z as one window (CHG-153)', () => {
    const v = resolveWindowView(rows, '2026-09-13T11:45:00+00:00');
    expect(v?.index).toBe(1);
  });

  it('selects the newest row by default', () => {
    const v = resolveWindowView(rows, null);
    expect(v?.selected.window_end).toBe('2026-09-13T12:00:00Z');
    expect(v?.index).toBe(0);
    expect(v?.newer).toBeNull();
    expect(v?.older?.window_end).toBe('2026-09-13T11:45:00Z');
  });

  it('keeps an exact ?window= with its newer and older neighbours', () => {
    const v = resolveWindowView(rows, '2026-09-13T11:45:00Z');
    expect(v?.selected.window_end).toBe('2026-09-13T11:45:00Z');
    expect(v?.index).toBe(1);
    expect(v?.newer?.window_end).toBe('2026-09-13T12:00:00Z');
    expect(v?.older?.window_end).toBe('2026-09-13T11:30:00Z');
  });

  it('has no older neighbour at the oldest loaded window', () => {
    expect(resolveWindowView(rows, '2026-09-13T11:30:00Z')?.older).toBeNull();
  });

  it('selects nothing, not another window, when ?window= is not among the rows; none without rows', () => {
    expect(resolveWindowView(rows, '2026-09-13T09:00:00Z')).toBeNull();
    expect(resolveWindowView([], '2026-09-13T12:00:00Z')).toBeNull();
  });
});

describe('inspectTarget', () => {
  const w = { windowStart: '2026-09-13T11:45:00Z', windowEnd: '2026-09-13T12:00:00Z' };
  it('sends 15m and 4h to their own run, never to Replay', () => {
    expect(inspectTarget({ runId: 'r', gate: 'G15', ...w }, 'A', '15m')).toContain('/cpm/evidence');
    expect(inspectTarget({ runId: 'r', gate: 'G15', ...w }, 'A', '4h')).toContain('methodRun=r');
    expect(inspectTarget({ runId: 'r', ...w }, 'A', '12h')).toContain('/cpm/replay');
    expect(inspectTarget({ runId: null, ...w }, 'A', '24h')).toContain('/cpm/replay');
  });
  it('opens the period in Historical when a short window has no run', () => {
    const t = inspectTarget({ runId: null, ...w }, 'A', '15m');
    expect(t).toContain('/cpm/historical');
    expect(t).toContain('from=');
  });
});
