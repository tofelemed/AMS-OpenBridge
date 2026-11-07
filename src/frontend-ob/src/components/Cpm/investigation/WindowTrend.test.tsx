// @vitest-environment jsdom
// Investigation's trend column: a stalled feed names the bucket's own time; the Replay link survives a trend with no points.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmGateMatrix } from '../../../api/cpm/gates';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
const hooks = vi.hoisted(() => ({ trend: vi.fn() }));
vi.mock('../../../hooks/useCpm', () => ({ useCpmTrend: hooks.trend }));
vi.mock('../health/useInstrumentHealth', () => ({ useInstrumentHealthHistory: () => ({ data: { intervals: [] }, isLoading: false }) }));
vi.mock('../health/HealthLane', () => ({ HealthLane: () => null }));
vi.mock('../trend/SignalTrend', () => ({ default: (p: { foot?: React.ReactNode }) => <div data-testid="trend">{p.foot}</div> }));

import WindowTrend from './WindowTrend';

const matrix = { windowStart: '2026-11-05T00:00:00Z', windowEnd: '2026-11-05T12:00:00Z' } as CpmGateMatrix;
const T0 = Date.parse('2026-11-05T00:00:00Z');
const point = (i: number, pv: number | null) => ({ ts: T0 + i * 3_600_000, pv, sp: pv, op: pv, mode: 'AUTO' });
const show = () => render(<MemoryRouter><WindowTrend loopId="FIC1" loop={undefined} matrix={matrix} windowKind="12h" gate={null} /></MemoryRouter>);

beforeEach(() => hooks.trend.mockReturnValue({ data: { points: [point(0, 1), point(1, 2)] }, isLoading: false, isError: false }));
afterEach(cleanup);

describe('WindowTrend', () => {
  it('says "at window end" when the last bucket holds the values', () => {
    show();
    expect(screen.getByText('at window end')).toBeTruthy();
  });

  it('names the bucket time when a stalled feed ends the window on empty buckets', () => {
    hooks.trend.mockReturnValue({ data: { points: [point(0, 1), point(1, 2), point(2, null), point(3, null)] }, isLoading: false, isError: false });
    show();
    expect(screen.queryByText('at window end')).toBeNull();
    expect(screen.getByText(/^last values at /)).toBeTruthy();
  });

  it('keeps Evidence Replay when the trend has no points, once', () => {
    hooks.trend.mockReturnValue({ data: { points: [] }, isLoading: false, isError: false });
    show();
    expect(screen.getAllByRole('button', { name: 'Evidence Replay ↗' })).toHaveLength(1);
  });

  it('shows Evidence Replay once, in the chart foot, when there are points', () => {
    show();
    expect(screen.getAllByRole('button', { name: 'Evidence Replay ↗' })).toHaveLength(1);
    expect(screen.getByTestId('trend').textContent).toContain('Evidence Replay');
  });
});
