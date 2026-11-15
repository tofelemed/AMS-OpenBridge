// CHG-200 (final test #2, #16; C2, C3): optional chart wrapper options for the System Response trends, all optional so no other
// chart changes: a fixed value axis (range and step), fewer steps on a short chart so its numbers never touch, the plot size handed
// to the annotations so they can place their labels, and the labels that find no free place listed in one line under the chart.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { chartPalette } from '../../../charts/chartTheme';

vi.mock('echarts-for-react', () => ({ default: () => React.createElement('div', { 'data-testid': 'echarts' }) }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode }) => React.createElement('button', null, p.children),
}));
import { buildCpmChart, buildCpmChartOption, CpmChart, NARROW_CHART, type CpmSeries } from './CpmChart';

afterEach(cleanup);

const palette = chartPalette();
const pv: CpmSeries = { id: 'pv', label: 'PV', unit: 'm3/h', x: [1000, 2000, 3000], y: [1, 2, 3], pen: 'pv' };

describe('CpmChart value axis and annotation layout', () => {
  it('fixes the first value axis to a given range and step', () => {
    const o = buildCpmChartOption({ series: [pv], xKind: 'time', palette, yRange: { min: 0, max: 4, interval: 1 } });
    expect(o.yAxis[0]).toMatchObject({ min: 0, max: 4, interval: 1 });
    expect(buildCpmChartOption({ series: [pv], xKind: 'time', palette }).yAxis[0]).not.toHaveProperty('min');
  });

  it('asks a short chart for three value steps so its numbers never touch; a tall chart keeps the default', () => {
    expect(buildCpmChartOption({ series: [pv], xKind: 'time', palette, height: 200 }).yAxis[0]).toMatchObject({ splitNumber: 3 });
    expect(buildCpmChartOption({ series: [pv], xKind: 'time', palette, height: 320 }).yAxis[0]).not.toHaveProperty('splitNumber');
  });

  it('hands the annotations the plot size and says when the chart is narrow', () => {
    const seen: Array<{ width: number; height: number; narrow: boolean }> = [];
    const annotate = (_p: unknown, _a: unknown, plot: { width: number; height: number; narrow: boolean }) => { seen.push(plot); return []; };
    buildCpmChartOption({ series: [pv], xKind: 'time', palette, height: 320, width: 1000, annotate });
    buildCpmChartOption({ series: [pv], xKind: 'time', palette, height: 320, width: NARROW_CHART - 1, annotate });
    expect(seen[0]).toEqual({ width: 1000 - 64 - 24, height: 320 - 28 - (64 + 22), narrow: false });
    expect(seen[1].narrow).toBe(true);
  });

  it('lists the labels the annotations could not place in one line under the chart, words then value', () => {
    const annotate = () => ({ series: [], notes: [{ text: 'Final value', value: '115' }, { text: 'PV change', value: '14.99 PV unit' }] });
    expect(buildCpmChart({ series: [pv], xKind: 'time', palette, annotate }).notes).toHaveLength(2);
    const { container } = render(<CpmChart title="Measured response" series={[pv]} xKind="time" annotate={annotate} />);
    const line = container.querySelector('.cpm-chart__notes')!;
    expect([...line.querySelectorAll('.cpm-chart__notes-item')].map(n => n.textContent)).toEqual(['Final value 115', 'PV change 14.99 PV unit']);
    expect(line.querySelector('.cpm-chart__note-value')?.textContent).toBe('115');
  });

  it('draws no line under a chart whose annotations placed every label', () => {
    const { container } = render(<CpmChart title="Input" series={[pv]} xKind="time" annotate={() => ({ series: [], notes: [] })} />);
    expect(container.querySelector('.cpm-chart__notes')).toBeNull();
  });
});
