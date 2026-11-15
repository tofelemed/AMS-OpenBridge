// CHG-197 (owner Q10): the Response tab draws its trends one per row, each with its heading, its "?" tip and its zoom tools, all
// in one connect group (one cursor, one zoom down the page); the marks really draw (rendered to SVG with ECharts itself).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import * as echarts from 'echarts';

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
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
import { buildCpmChartOption } from '../../evidence/CpmChart';
import { chartPalette } from '../../../../charts/chartTheme';
import { drawMarks } from './annotations';
import { buildFacts } from './responseFacts';
import { responseTrendSpecs } from './responseTrendSpecs';
import { ResponseTrends } from './ResponseTrends';
import { levelLoop, result, selfRegulating, T0S } from './trendFixtures';

afterEach(() => { cleanup(); charts.length = 0; vi.restoreAllMocks(); });

const draw = (e = selfRegulating(), over: { censored?: boolean; exclusions?: string[] } = {}) => render(
  <ResponseTrends byKind={e.byKind} metrics={e.metrics} result={over.censored ? result({ evaluation_state: 'CENSORED', model_state: 'NONE' }) : e.result}
    t0Ms={T0S * 1000} pvUnit="m3/h" timeZone="UTC" healthExclusions={over.exclusions ?? []} />,
);
const headings = () => screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);

describe('ResponseTrends', () => {
  it('draws one trend per row in page order, each with its tip and its zoom tools', () => {
    const { container } = draw();
    expect(headings()).toEqual(['Measured response', 'Input', 'Dead time and time constant', 'Rise time and settling', 'Error from the setpoint', 'Model fit']);
    const rows = container.querySelector('.cpm-response-trend-rows')!;
    expect([...rows.children].every(c => c.classList.contains('cpm-chart'))).toBe(true);
    for (const c of rows.children) {
      expect(c.querySelector('[aria-label="Chart zoom"]')).toBeTruthy();
      expect(c.querySelector('.ui-toggletip__button')).toBeTruthy();
    }
  });

  it('links every trend into one connect group so the cursor and the zoom stay aligned', () => {
    draw();
    expect(charts.length).toBe(6);
    expect(new Set(charts.map(c => c.group)).size).toBe(1);
    expect(charts[0].group).not.toBe('');
  });

  it('a censored event draws the measured response and the input only', () => {
    draw(selfRegulating(), { censored: true });
    expect(headings()).toEqual(['Measured response', 'Input']);
  });

  it('a level event draws measured, input, slope and model fit', () => {
    draw(levelLoop());
    expect(headings()).toEqual(['Measured response', 'Input', 'Slope', 'Model fit']);
  });

  it('keeps the health exclusions line under the trends', () => {
    draw(selfRegulating(), { exclusions: ['F on PV 12:00-12:01'] });
    expect(screen.getByText(/F on PV 12:00-12:01/)).toBeTruthy();
  });

  it('really draws the marks: the labels come out of ECharts itself', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ measureText: (t: string) => ({ width: t.length * 7 }), font: '' }) as unknown as CanvasRenderingContext2D);
    const f = buildFacts({ ...selfRegulating(), t0Ms: T0S * 1000, pvUnit: 'm3/h' })!;
    const spec = responseTrendSpecs(f).find(s => s.id === 'dead-time')!;
    const chart = echarts.init(null as unknown as HTMLElement, null, { renderer: 'svg', ssr: true, width: 1200, height: 320 });
    chart.setOption(buildCpmChartOption({ series: spec.series, xKind: 'time', timeZone: 'UTC', palette: chartPalette(), xRange: f.xRange, zoomY: false, annotate: drawMarks(spec.marks, spec.unit) }) as never);
    const svg = chart.renderToSVGString();
    chart.dispose();
    for (const text of ['Step', 'Dead time', '34 s', 'Time constant', '120 s', '63 % of the change', 'Measured 63 %']) expect(svg).toContain(text);
  });
});
