import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LoopContextBar, fmtLocation, fmtPeriod } from './LoopContextBar';

const loopsState: { data?: unknown; isLoading: boolean } = { isLoading: false };
vi.mock('../../../hooks/useCpm', () => ({ useCpmLoops: () => loopsState }));

const FIC = {
  loopId: 'FIC10301', displayName: 'Flow controller FIC10301 (FCS0101)', loopType: 'FIC', criticality: 'medium',
  site: 'hdpe', area: 'section_400', unit: 'u4002_catalyst_tankfarm',
};

describe('fmtPeriod', () => {
  it('names the range and the zone once', () => {
    expect(fmtPeriod({ label: '24h fused window', start: '2026-10-04T12:15:00Z', end: '2026-10-05T12:15:00Z' }, 'UTC'))
      .toBe('24h fused window · 4 Oct 12:15 → 5 Oct 12:15 UTC');
  });
  it('accepts epoch ms and a single end', () => {
    expect(fmtPeriod({ label: 'Window', end: Date.UTC(2026, 9, 5, 8, 0) }, 'UTC')).toBe('Window · ending 5 Oct 08:00 UTC');
  });
  it('is just the label without times, and ignores unparseable ones', () => {
    expect(fmtPeriod({ label: 'Latest results' })).toBe('Latest results');
    expect(fmtPeriod({ label: 'Latest results', start: 'nope', end: null })).toBe('Latest results');
  });
});

describe('fmtLocation', () => {
  it('reads as a path without underscores and skips missing levels', () => {
    expect(fmtLocation(FIC)).toBe('hdpe › section 400 › u4002 catalyst tankfarm');
    expect(fmtLocation({ site: 'hdpe', area: null, unit: 'u1' })).toBe('hdpe › u1');
  });
});

describe('LoopContextBar', () => {
  afterEach(cleanup);

  it('renders nothing without a loop', () => {
    const { container } = render(<LoopContextBar loopId={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows loop, service, location and period (case-insensitive loop match)', () => {
    loopsState.data = { loops: [FIC] };
    render(<LoopContextBar loopId="fic10301" period={{ label: 'Latest results' }} />);
    const bar = screen.getByTestId('loop-context');
    expect(bar.textContent).toContain('FIC10301');
    expect(bar.textContent).toContain('Flow controller FIC10301 (FCS0101)');
    expect(bar.textContent).toContain('FIC · criticality medium');
    expect(bar.textContent).toContain('hdpe › section 400 › u4002 catalyst tankfarm');
    expect(bar.textContent).toContain('Latest results');
  });

  it('says so when the loop is not registered', () => {
    loopsState.data = { loops: [] };
    render(<LoopContextBar loopId="XYZ1" />);
    expect(screen.getByTestId('loop-context').textContent).toContain('not in the loop registry');
  });
});
