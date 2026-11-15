// CHG-197 (owner Q10): the options the System Response trends need from the one chart wrapper, all optional so no other
// chart changes: a fixed shared time range, annotations drawn from the chart's own palette (kept out of the legend and the
// hover readout), x-only zoom so linked charts stay aligned, a dash-dot pen, a help tip in the head and a connect group.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { chartPalette } from '../../../charts/chartTheme';
import { BOX_Y } from '../../charts/boxZoom';

const charts: Array<{ group: string }> = [];
vi.mock('echarts-for-react', () => ({
  default: function FakeECharts(p: { onChartReady?: (c: unknown) => void }) {
    React.useEffect(() => {
      const chart = { group: '', dispatchAction: () => {}, getOption: () => ({}) };
      charts.push(chart);
      p.onChartReady?.(chart);
    }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- once, as echarts-for-react does
    return React.createElement('div', { 'data-testid': 'echarts' });
  },
}));
import { buildCpmChartOption, CpmChart, type CpmSeries } from './CpmChart';

afterEach(() => { cleanup(); charts.length = 0; });

const palette = chartPalette();
const pv: CpmSeries = { id: 'pv', label: 'PV', unit: 'm3/h', x: [1000, 2000, 3000], y: [1, 2, 3], pen: 'pv' };
const op: CpmSeries = { id: 'op', label: 'OP applied', unit: '% OP', x: [1000, 2000, 3000], y: [40, 45, 45], pen: 'op', held: true };

describe('CpmChart options for linked trends', () => {
  it('fixes the time axis to a shared range', () => {
    const o = buildCpmChartOption({ series: [pv], xKind: 'time', timeZone: 'UTC', palette, xRange: [500, 4000] });
    expect(o.xAxis).toMatchObject({ min: 500, max: 4000 });
    expect(buildCpmChartOption({ series: [pv], xKind: 'time', timeZone: 'UTC', palette }).xAxis).not.toHaveProperty('min');
  });

  it('adds annotation series on the axis of their unit, out of the legend and out of the hover readout', () => {
    const o = buildCpmChartOption({
      series: [op, pv], xKind: 'time', timeZone: 'UTC', palette,
      annotate: (p, axisOf) => [{ id: 'step', type: 'line', data: [], yAxisIndex: axisOf('m3/h'), markLine: { data: [{ xAxis: 1500 }] }, lineStyle: { color: p.tick } }],
    });
    expect(o.series.map(s => s.id)).toEqual(['op', 'pv', 'step']);
    expect((o.series[2] as { yAxisIndex: number }).yAxisIndex).toBe(1);
    expect(o.legend).toMatchObject({ data: ['OP applied', 'PV'] });
    const text = o.tooltip.formatter([
      { seriesId: 'pv', seriesName: 'PV', value: [2000, 2], dataIndex: 1 },
      { seriesId: 'step', seriesName: 'step', value: [2000, 9], dataIndex: 0 },
    ]);
    expect(text).toContain('PV: 2 m3/h');
    expect(text).not.toContain('step');
  });

  it('zooms on time only when asked, so charts that share an axis stay aligned', () => {
    const both = buildCpmChartOption({ series: [pv], xKind: 'time', timeZone: 'UTC', palette });
    expect(both.dataZoom.map(z => z.id)).toContain(BOX_Y);
    const xOnly = buildCpmChartOption({ series: [pv], xKind: 'time', timeZone: 'UTC', palette, zoomY: false });
    expect(xOnly.dataZoom.map(z => z.id)).not.toContain(BOX_Y);
    expect(xOnly.toolbox.feature.dataZoom.yAxisIndex).toBe('none');
  });

  it('draws an estimated series as a dash-dot line', () => {
    const fit: CpmSeries = { ...pv, id: 'fit', label: 'Model fit', pen: 'overlay', dashDot: true };
    const o = buildCpmChartOption({ series: [pv, fit], xKind: 'time', timeZone: 'UTC', palette });
    expect(Array.isArray(o.series[1].lineStyle.type)).toBe(true);
    expect(o.series[0].lineStyle.type).toBe('solid');
  });

  it('puts a help tip beside the heading and joins every chart of a group to one connect group', () => {
    render(<>
      <CpmChart title="Measured response" headingLevel={3} help={<span>how it is measured</span>} series={[pv]} xKind="time" timeZone="UTC" connectGroup="trends-1" />
      <CpmChart title="Input" headingLevel={3} series={[op]} xKind="time" timeZone="UTC" connectGroup="trends-1" />
    </>);
    const head = screen.getByRole('heading', { level: 3, name: 'Measured response' }).parentElement!;
    expect(head.textContent).toContain('how it is measured');
    expect(charts.map(c => c.group)).toEqual(['trends-1', 'trends-1']);
  });
});
