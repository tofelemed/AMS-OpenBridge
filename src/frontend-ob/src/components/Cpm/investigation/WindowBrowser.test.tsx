// CHG-140: the window browser lists the same windows as the Evidence pages, pages onto older ones, and its
// "nothing to compare" line is derived from that list, so it cannot say "only one window" beside "1-5 of 100".
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WindowBrowser } from './WindowBrowser';
import { comparisonNote, comparisonOf } from './comparisonNote';
import { row } from '../evidence/windowFixtures';
import type { WindowOption } from '../evidence/useEvidenceWindows';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const opt = (i: number): WindowOption => ({
  windowEnd: new Date(Date.UTC(2026, 10, 4, 12, 15) - i * 900_000).toISOString(), windowStart: null, kind: '12h', tier: 'fused', label: '', tone: 'muted',
  ageMs: 0, sampleCount: null, methodRunIds: {}, hasRunIds: false, gates: [], flags: undefined, methodEligibility: null, purpose: null, diagnosis: 'NO_CALL',
});
const many = Array.from({ length: 100 }, (_, i) => opt(i));
const props = (over = {}) => ({
  windows: many, hasMore: true, isLoadingMore: false, loadMore: vi.fn(), matrix: row(many[0].windowEnd), previous: undefined,
  comparison: { state: 'loading' as const }, windowKind: '12h', onWindow: vi.fn(), ...over,
});

describe('WindowBrowser', () => {
  it('shows the count of the loaded windows, with a plus while older ones remain', () => {
    render(<WindowBrowser {...props()} />);
    expect(screen.getByText('1–5 of 100+')).toBeTruthy();
  });

  it('opens the page that holds the current window, matched by instant', () => {
    render(<WindowBrowser {...props({ matrix: row('2026-11-04T07:15:00Z') })} />);
    expect(screen.getByText('21–25 of 100+')).toBeTruthy();
  });

  it('asks for older windows from the last loaded page', () => {
    const loadMore = vi.fn();
    render(<WindowBrowser {...props({ windows: many.slice(0, 5), loadMore })} />);
    fireEvent.click(screen.getByText('Older ›'));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('never says "only one window" beside a longer list', () => {
    render(<WindowBrowser {...props({ comparison: { state: 'missing', end: many[1].windowEnd } })} />);
    expect(screen.queryByText(/only one evaluated window/i)).toBeNull();
    expect(screen.getByText(/has no full stored result to compare against/)).toBeTruthy();
  });

  it('opens the window that was picked', () => {
    const onWindow = vi.fn();
    render(<WindowBrowser {...props({ onWindow })} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Ends / })[1]);
    expect(onWindow).toHaveBeenCalledWith(many[1].windowEnd);
  });

  it('says why a window is not comparable in the page\'s own words, and only when it is not', () => {
    const excluded = row(many[0].windowEnd, { diagnosis: 'EXCLUDED_OPERATING_REGION' });
    const noFault = row(many[1].windowEnd, { diagnosis: 'INSUFFICIENT_EVIDENCE' });
    const short = row(many[1].windowEnd, { diagnosis: 'INSUFFICIENT_DATA' });
    render(<WindowBrowser {...props({ matrix: excluded, previous: noFault })} />);
    expect(screen.getByText('Current window excluded: outside operating region')).toBeTruthy();
    cleanup();
    render(<WindowBrowser {...props({ matrix: excluded, previous: short })} />);
    expect(screen.getByText(/Previous window not evaluated: not enough data/)).toBeTruthy();
    cleanup();
    render(<WindowBrowser {...props({ matrix: noFault, previous: noFault })} />);
    expect(screen.queryByText(/insufficient data|not enough data/i)).toBeNull();
  });

  it('shows a history-only window as not selectable, and never opens it (B4)', () => {
    const onWindow = vi.fn();
    const windows = [{ ...many[0], historyOnly: true }, many[1]];
    render(<WindowBrowser {...props({ windows, onWindow })} />);
    const tile = screen.getAllByRole('button', { name: /^Ends / })[0] as HTMLButtonElement;
    expect(tile.disabled).toBe(true);
    expect(tile.className).toContain('cpm-window-tile--history');
    expect(tile.title).toMatch(/History only/);
    expect(tile.textContent).toMatch(/History only: use Evaluate a window/);   // visible for keyboard and touch users
    fireEvent.click(tile);
    expect(onWindow).not.toHaveBeenCalled();
    expect((screen.getAllByRole('button', { name: /^Ends / })[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not move a later list change onto the next page after an Older that brought nothing (B4)', () => {
    const loadMore = vi.fn();
    const first5 = many.slice(0, 5);
    const { rerender } = render(<WindowBrowser {...props({ windows: first5, loadMore })} />);
    fireEvent.click(screen.getByText('Older ›'));                       // asks; the read ends with no new window
    rerender(<WindowBrowser {...props({ windows: first5, loadMore, isLoadingMore: true })} />);
    rerender(<WindowBrowser {...props({ windows: first5, loadMore, isLoadingMore: false })} />);
    act(() => { rerender(<WindowBrowser {...props({ windows: many.slice(0, 10), loadMore, isLoadingMore: false })} />); });
    expect(screen.getByText('1–5 of 10+')).toBeTruthy();                // the stale ask must not have jumped to 6–10
  });

  it('moves onto the new page when Older did bring windows (B4)', () => {
    const loadMore = vi.fn();
    const { rerender } = render(<WindowBrowser {...props({ windows: many.slice(0, 5), loadMore })} />);
    fireEvent.click(screen.getByText('Older ›'));
    rerender(<WindowBrowser {...props({ windows: many.slice(0, 10), loadMore })} />);
    expect(screen.getByText('6–10 of 10+')).toBeTruthy();
  });

  it('sits in the dialog with no heading of its own', () => {
    render(<WindowBrowser {...props()} />);
    expect(screen.queryByText('Window browser')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('comparisonNote', () => {
  it('says nothing earlier is stored only for that state', () => {
    expect(comparisonNote({ state: 'none' })).toMatch(/No earlier evaluated window is stored/);
    expect(comparisonNote({ state: 'loading' })).toBe('Loading the previous window…');
    expect(comparisonNote({ state: 'unavailable' })).toBe('The previous window could not be read.');
    expect(comparisonNote({ state: 'ready' })).toBe('');
  });
});

describe('comparisonOf (B4)', () => {
  const idle = { isError: false, isLoading: false };
  it('reads a failed previous-window read as a read error, not as "no full stored result"', () => {
    const c = comparisonOf({ end: '2026-11-04T12:00:00Z', ...idle }, { row: undefined, isError: true, isLoading: false });
    expect(c).toEqual({ state: 'unavailable' });
    expect(comparisonNote(c)).toBe('The previous window could not be read.');
  });
  it('keeps the other states', () => {
    expect(comparisonOf({ end: '2026-11-04T12:00:00Z', ...idle }, { row: undefined, isError: false, isLoading: false })).toEqual({ state: 'missing', end: '2026-11-04T12:00:00Z' });
    expect(comparisonOf({ end: null, ...idle }, { row: undefined, isError: false, isLoading: false })).toEqual({ state: 'none' });
    expect(comparisonOf({ end: 'x', ...idle }, { row: {}, isError: false, isLoading: false })).toEqual({ state: 'ready' });
  });
});
