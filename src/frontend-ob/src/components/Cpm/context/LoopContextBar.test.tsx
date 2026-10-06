import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LoopContextBar, fmtInstant, fmtLocation, fmtPeriod } from './LoopContextBar';

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

describe('fmtInstant', () => {
  it('is the same compact form as a period end, zone named', () => {
    expect(fmtInstant('2026-08-09T21:00:00Z', 'UTC')).toBe('9 Aug 21:00 UTC');
    expect(fmtInstant(null)).toBe('—');
  });
});

describe('fmtLocation', () => {
  it('reads as a path without underscores and skips missing levels', () => {
    expect(fmtLocation(FIC)).toBe('HDPE › Section 400 › U4002 catalyst tankfarm');
    expect(fmtLocation({ site: 'hdpe', area: null, unit: 'u1' })).toBe('HDPE › U1');
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
    expect(bar.textContent).toContain('HDPE › Section 400 › U4002 catalyst tankfarm');
    expect(bar.textContent).toContain('Latest results');
  });

  it('says so when the loop is not registered', () => {
    loopsState.data = { loops: [] };
    render(<LoopContextBar loopId="XYZ1" />);
    expect(screen.getByTestId('loop-context').textContent).toContain('not in the loop registry');
  });
});
