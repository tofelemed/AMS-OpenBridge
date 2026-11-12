// CHG-177 (owner review, Overview v2, answer 5): the shared loop trend (Overview, Loop Explorer, Investigation) says an
// empty trend in one line, "No PV, SP or OP values in this range" (the Overview: "in the last 8 h"), without the guess
// "the feed may have stopped". `tools={false}` is the Overview's trend: no Zoom area / Undo / Reset and no ?; the scale
// toggle, pens and legend stay. Loop Explorer and Investigation keep their tools.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CpmTrendPoint } from '../../../api/cpm/kpis';

const { options } = vi.hoisted(() => ({ options: [] as Array<Record<string, unknown>> }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
    <button type="button" onClick={() => onClick?.()}>{children}</button>,
}));
vi.mock('echarts-for-react', () => ({
  default: (p: { option: Record<string, unknown> }) => { options.push(p.option); return <div data-testid="chart" />; },
}));
vi.mock('../../../hooks/useCpm', () => ({ useCpmLoops: () => ({ data: { loops: [] } }) }));

import { SignalTrend } from './SignalTrend';

const values: CpmTrendPoint[] = [
  { ts: '2026-11-12T08:00:00Z', pv_avg: 41.6, sp: 40, op_avg: 63.2 },
  { ts: '2026-11-12T08:02:00Z', pv_avg: 41.9, sp: 40, op_avg: 62.8 },
] as unknown as CpmTrendPoint[];
const empty: CpmTrendPoint[] = [
  { ts: '2026-11-12T08:00:00Z', pv_avg: null, sp: null, op_avg: null },
] as unknown as CpmTrendPoint[];

beforeEach(() => { options.length = 0; });
afterEach(cleanup);

describe('SignalTrend empty line (CHG-177)', () => {
  it('says one line with no signal values, without the feed guess', () => {
    const { container } = render(<SignalTrend loopId="FIC10301" points={empty} />);
    const line = container.querySelector('.cpm-empty-line')!;
    expect(line.textContent).toBe('No PV, SP or OP values in this range');
    expect(container.textContent).not.toMatch(/feed may have stopped|historian returned/i);
    expect(container.querySelector('.cpm-empty')).toBeNull();
  });

  it('names the range it was given', () => {
    const { container } = render(<SignalTrend loopId="FIC10301" points={empty} rangeText="in the last 8 h" />);
    expect(container.querySelector('.cpm-empty-line')!.textContent).toBe('No PV, SP or OP values in the last 8 h');
  });

  it('keeps the caption in front, so two stacked trends stay apart', () => {
    const { container } = render(<SignalTrend loopId="FIC10301" points={empty} caption="Evaluated window (diagnosis)" />);
    expect(container.querySelector('.cpm-empty-line')!.textContent).toBe('Evaluated window (diagnosis): no PV, SP or OP values in this range');
  });
});

describe('SignalTrend tools', () => {
  it('keeps Zoom area, Undo, Reset and the ? by default (Loop Explorer, Investigation)', () => {
    render(<SignalTrend loopId="FIC10301" points={values} />);
    for (const word of ['Zoom area', 'Undo', 'Reset']) expect(screen.getByRole('button', { name: word })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'How to read this trend' })).toBeTruthy();
    expect(options.at(-1)).toHaveProperty('dataZoom');
  });

  it('without tools draws the chart and the scale toggle, with no zoom bar, no ? and no wheel zoom (Overview)', () => {
    const { container } = render(<SignalTrend loopId="FIC10301" points={values} tools={false} />);
    expect(screen.getByTestId('chart')).toBeTruthy();
    expect(screen.getByText('Fit to data')).toBeTruthy();
    expect(screen.getByText('Engineering range')).toBeTruthy();
    for (const word of ['Zoom area', 'Undo', 'Reset']) expect(screen.queryByRole('button', { name: word })).toBeNull();
    expect(screen.queryByRole('button', { name: 'How to read this trend' })).toBeNull();
    expect(container.querySelector('.chart-zoombar')).toBeNull();
    expect(options.at(-1)).not.toHaveProperty('dataZoom');
    expect(options.at(-1)).not.toHaveProperty('toolbox');
  });
});
