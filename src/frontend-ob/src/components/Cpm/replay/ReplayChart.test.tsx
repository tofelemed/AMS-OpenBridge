// @vitest-environment jsdom
// B7: a truncated slice says so under the chart and labels the sample count as loaded, so it cannot read as the window's count.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CpmTrendPoint } from '../../../api/cpm/kpis';
import { chartPalette } from '../../../charts/chartTheme';

vi.mock('echarts-for-react', () => ({ default: () => null }));
import { ReplayChart, buildReplayOption } from './ReplayChart';

afterEach(cleanup);
const T0 = Date.UTC(2026, 9, 5, 0, 30);
const points: CpmTrendPoint[] = Array.from({ length: 5 }, (_, i) => ({ ts: T0 + i * 5000, pv: 50, sp: 50, op: 40, mode: 'AUT' }));
const show = (truncated: boolean) => render(<ReplayChart points={points} phasePlane={false} cursorPct={100} onCursor={() => {}} truncated={truncated} timeZone="UTC" />);

describe('ReplayChart truncated slice', () => {
  it('labels the count as loaded and explains the budget', () => {
    show(true);
    expect(screen.getByText('Sample 5 / 5 loaded')).toBeTruthy();
    expect(document.body.textContent).toMatch(/the slice hit the replay budget/);
  });
  it('is silent on a whole slice', () => {
    show(false);
    expect(screen.getByText('Sample 5 / 5')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/replay budget/);
  });
});

describe('ReplayChart axis names (CHG-184, owner review item 12)', () => {
  it('names no unit when the loop has none, never "unit not set"', () => {
    const palette = chartPalette();
    const time = buildReplayOption({ points, cursorTs: null, phasePlane: false, palette, pvUnit: '', timeZone: 'UTC' }) as { yAxis: Array<{ name: string }> };
    expect(time.yAxis[0].name).toBe('PV / SP');
    const plane = buildReplayOption({ points, cursorTs: null, phasePlane: true, palette, pvUnit: '', timeZone: 'UTC' }) as unknown as { yAxis: { name: string } };
    expect(plane.yAxis.name).toBe('PV');
    expect((buildReplayOption({ points, cursorTs: null, phasePlane: true, palette, pvUnit: 'kg/h', timeZone: 'UTC' }) as unknown as { yAxis: { name: string } }).yAxis.name).toBe('PV (kg/h)');
  });
});
