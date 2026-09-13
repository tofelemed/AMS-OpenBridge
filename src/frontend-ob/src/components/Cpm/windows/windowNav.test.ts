// CHG-025 — the Window inspector: list view vs. a window's own sub-page.
//
// Selecting a window used to render its four detail sections BELOW a list that can be
// hundreds of rows long, so the reader had to scroll to find what they just clicked. The
// page now shows either the list or the selected window's sub-page (results, metadata,
// sample density, across window sizes) with Back and Newer/Older navigation. This helper
// decides which, from the loaded rows and the ?window= URL parameter.
import { describe, it, expect } from 'vitest';
import type { CpmKpiRow } from '../../../api/cpmApi';
import { resolveWindowView } from './windowNav';

const row = (end: string): CpmKpiRow =>
  ({ window_start: null, window_end: end, sample_count: 1, created_at: end } as unknown as CpmKpiRow);
// newest first, as the API serves them
const rows = [row('2026-09-13T12:00:00Z'), row('2026-09-13T11:45:00Z'), row('2026-09-13T11:30:00Z')];

describe('resolveWindowView', () => {
  it('shows the list when no window is selected', () => {
    expect(resolveWindowView(rows, null)).toEqual({ view: 'list' });
  });

  it('opens the sub-page for a loaded window with its newer and older neighbours', () => {
    const v = resolveWindowView(rows, '2026-09-13T11:45:00Z');
    expect(v.view).toBe('detail');
    if (v.view !== 'detail') return;
    expect(v.selected.window_end).toBe('2026-09-13T11:45:00Z');
    expect(v.index).toBe(1);
    expect(v.newer?.window_end).toBe('2026-09-13T12:00:00Z');
    expect(v.older?.window_end).toBe('2026-09-13T11:30:00Z');
  });

  it('has no newer neighbour at the newest window and no older one at the oldest loaded', () => {
    const newest = resolveWindowView(rows, '2026-09-13T12:00:00Z');
    const oldest = resolveWindowView(rows, '2026-09-13T11:30:00Z');
    expect(newest.view === 'detail' && newest.newer).toBeNull();
    expect(oldest.view === 'detail' && oldest.older).toBeNull();
  });

  it('falls back to the list when the selected window is not among the loaded rows', () => {
    // A stale or hand-typed ?window= must not silently open a DIFFERENT window's page.
    expect(resolveWindowView(rows, '2026-09-13T09:00:00Z')).toEqual({ view: 'list' });
    expect(resolveWindowView([], '2026-09-13T12:00:00Z')).toEqual({ view: 'list' });
  });
});
