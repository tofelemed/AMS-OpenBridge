// CHG-140: the window browser lists the same windows as the Evidence pages, pages onto older ones, and its
// "nothing to compare" line is derived from that list, so it cannot say "only one window" beside "1-5 of 100".
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WindowBrowser } from './WindowBrowser';
import { comparisonNote } from './comparisonNote';
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
  comparison: { state: 'loading' as const }, windowKind: '12h', setParams: vi.fn(), ...over,
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
});

describe('comparisonNote', () => {
  it('says nothing earlier is stored only for that state', () => {
    expect(comparisonNote({ state: 'none' })).toMatch(/No earlier evaluated window is stored/);
    expect(comparisonNote({ state: 'loading' })).toBe('Loading the previous window…');
    expect(comparisonNote({ state: 'unavailable' })).toBe('The previous window could not be read.');
    expect(comparisonNote({ state: 'ready' })).toBe('');
  });
});
