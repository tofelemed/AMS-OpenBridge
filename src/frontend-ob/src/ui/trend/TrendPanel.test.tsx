import React from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { connect, disconnect } from 'echarts';
import { TrendPanel } from './TrendPanel';
import type { TrendLane, TrendPane, TrendPanelProps, TrendSegment } from './trendTypes';

type FakeChart = ReturnType<typeof makeChart>;
const stage = { option: undefined as any, events: undefined as any, chart: undefined as unknown as FakeChart, mounts: 0, ready: vi.fn() };

vi.mock('echarts', () => ({ connect: vi.fn(), disconnect: vi.fn() }));
vi.mock('echarts-for-react', () => {
  const FakeEcharts = (props: { option: unknown; onEvents: unknown; onChartReady: (c: unknown) => void }) => {
    stage.option = props.option;
    stage.events = props.onEvents;
    React.useEffect(() => {
      stage.mounts += 1;
      props.onChartReady(stage.chart);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mounts once, as the real wrapper does
    return React.createElement('div', { 'data-testid': 'echarts' });
  };
  return { default: FakeEcharts };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) =>
    React.createElement('button', { type: 'button', onClick: p.onClick, disabled: p.disabled, 'data-variant': p.variant }, p.children),
}));
vi.mock('../../charts/chartTheme', async importOriginal => {
  const actual = await importOriginal<typeof import('../../charts/chartTheme')>();
  const { readTheme } = await import('../../theme/theme');
  return { ...actual, chartPalette: () => ({ ...actual.chartPalette(), tooltipBg: `tooltip-${readTheme()}` }) };
});

/** Stands in for the echarts instance: dataZoom updates its state and fires the event, as the real one does. */
function makeChart() {
  const zoom = [{ id: 'bz-x', start: 0, end: 100 }, { id: 'bz-y', start: 0, end: 100 }];
  const zrOn = vi.fn();
  return {
    group: '',
    zrOn,
    isDisposed: () => false,
    getZr: () => ({ on: zrOn }),
    getOption: () => ({ dataZoom: zoom.map(z => ({ ...z })) }),
    containPixel: () => true,
    convertFromPixel: vi.fn(() => 0),
    convertToPixel: vi.fn(() => 321),
    dispatchAction: vi.fn((action: { type: string; batch?: Array<{ dataZoomId: string; start: number; end: number }> }) => {
      if (action.type !== 'dataZoom') return;
      for (const b of action.batch ?? []) Object.assign(zoom.find(z => z.id === b.dataZoomId)!, { start: b.start, end: b.end });
      stage.events.datazoom();
    }),
  };
}

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 3, 8, 0); // 3 Nov 12:00 GST
const WINDOW = { from: T0, to: T0 + 24 * 60 * MIN };
const x = [0, 1, 2, 3].map(m => T0 + m * MIN);

const pane: TrendPane = {
  id: 'signals',
  axes: [{ id: 'pv', label: 'PV / SP', unit: 'kg/h' }, { id: 'output', label: 'Controller output', output: true }],
  series: [
    { id: 'pv', label: 'PV', role: 'pv', axis: 'pv', x, y: [10, null, 12, 13] },
    { id: 'sp', label: 'SP', role: 'sp', axis: 'pv', x, y: [12, 12, 12, 12] },
  ],
};
const verdict: TrendSegment[] = [
  { id: 'w1', startMs: T0, endMs: T0 + 2 * MIN, label: 'Oscillating', tone: 'warn' },
  { id: 'w2', startMs: T0 + 2 * MIN, endMs: T0 + 4 * MIN, label: 'Good control', tone: 'good' },
];
const lanes: TrendLane[] = [
  { id: 'mode', label: 'Mode', kind: 'mode', segments: [{ startMs: T0, endMs: T0 + 4 * MIN, label: 'AUTO', tone: 'neutral' }] },
  { id: 'verdict', label: 'Verdict', kind: 'verdict', segments: verdict },
];

const base: TrendPanelProps = {
  heading: 'FIC101 signals', zone: 'Asia/Dubai', panes: [pane], lanes, plotWindow: WINDOW, gapStepMs: null,
  source: 'Historian', aggregation: 'Raw samples',
};

const plottedText = () => screen.getByTestId('trend-plotted').textContent;
const live = () => screen.getByTestId('trend-live').textContent;
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const plotSlider = () => screen.getByRole('slider', { name: 'FIC101 signals cursor' });
const dragZoom = (start: number, end: number) => act(() => {
  stage.chart.dispatchAction({ type: 'dataZoom', batch: [{ dataZoomId: 'bz-x', start, end }] });
});

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 10, 4, 12) });
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  stage.chart = makeChart();
  stage.mounts = 0;
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => {
  cleanup();
  vi.mocked(connect).mockClear();
  vi.mocked(disconnect).mockClear();
});

describe('chart surface', () => {
  it('mounts one chart instance with one option', () => {
    render(<TrendPanel {...base} />);
    expect(screen.getAllByTestId('echarts').length).toBe(1);
    expect(stage.mounts).toBe(1);
    expect(stage.option.grid.length).toBe(3);
  });

  it('gives the canvas container role img and a real description', () => {
    render(<TrendPanel {...base} />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toContain('Trend chart: FIC101 signals');
    expect(img.getAttribute('aria-label')).toContain('Plotted: 3 Nov 12:00 to 4 Nov 12:00 GST');
    expect(within(img).queryByTestId('echarts')).toBeTruthy();
    expect(stage.option.aria.label.description).toBe(img.getAttribute('aria-label'));
  });

  it('puts the source and aggregation under the chart', () => {
    render(<TrendPanel {...base} source="Historian root.hdpe.cpm" aggregation="1 min average" />);
    expect(screen.getByText(/Source: Historian root\.hdpe\.cpm · Aggregation: 1 min average/)).toBeTruthy();
  });

  it('says when the drawing is sampled', () => {
    const many = Float64Array.from({ length: 6000 }, (_, i) => T0 + i * 1000);
    const y = Float64Array.from({ length: 6000 }, (_, i) => i);
    render(<TrendPanel {...base} plotWindow={undefined} panes={[{ ...pane, series: [{ id: 'pv', label: 'PV', role: 'pv', axis: 'pv', x: many, y: y as unknown as number[] }] }]} />);
    expect(screen.getByText(/shape-preserving sampling/)).toBeTruthy();
  });

  it('uses no title attribute anywhere', () => {
    const { container } = render(<TrendPanel {...base} />);
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('keeps a page control next to the zoom buttons', () => {
    render(<TrendPanel {...base} toolbar={<button type="button">Add tags</button>} />);
    expect(within(screen.getByRole('group', { name: 'FIC101 signals controls' })).getByRole('button', { name: 'Add tags' })).toBeTruthy();
  });
});

describe('plotted window and zoom (items 5, 6)', () => {
  it('states exactly what is drawn, in the site zone', () => {
    render(<TrendPanel {...base} />);
    expect(plottedText()).toBe('Plotted: 3 Nov 12:00 to 4 Nov 12:00 GST');
  });

  it('follows a zoom made on the chart', () => {
    render(<TrendPanel {...base} />);
    dragZoom(25, 75);
    expect(plottedText()).toBe('Plotted: 3 Nov 18:00 to 4 Nov 06:00 GST');
    expect(stage.option.dataZoom.find((d: { id: string }) => d.id === 'bz-x').start).toBe(25);
  });

  it('zooms in from a real button, keyboard reachable, around the middle', () => {
    render(<TrendPanel {...base} />);
    fireEvent.click(button('Zoom in'));
    expect(plottedText()).toBe('Plotted: 3 Nov 18:00 to 4 Nov 06:00 GST');
  });

  it('undoes one step and resets to the whole window', () => {
    render(<TrendPanel {...base} />);
    expect((button('Undo zoom') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Reset') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button('Zoom in'));
    fireEvent.click(button('Zoom in'));
    expect(plottedText()).toBe('Plotted: 3 Nov 21:00 to 4 Nov 03:00 GST');
    fireEvent.click(button('Undo zoom'));
    expect(plottedText()).toBe('Plotted: 3 Nov 18:00 to 4 Nov 06:00 GST');
    fireEvent.click(button('Reset'));
    expect(plottedText()).toBe('Plotted: 3 Nov 12:00 to 4 Nov 12:00 GST');
    expect((button('Reset') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says why Undo and Reset are off', () => {
    render(<TrendPanel {...base} />);
    expect(screen.getByText('Full window, nothing to undo')).toBeTruthy();
    fireEvent.click(button('Zoom in'));
    expect(screen.getByText('Zoomed view')).toBeTruthy();
  });

  it('arms the area zoom, and says so in the button', () => {
    render(<TrendPanel {...base} />);
    fireEvent.click(button('Zoom area'));
    expect(stage.chart.dispatchAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'takeGlobalCursor', dataZoomSelectActive: true }));
    expect(button('Zoom area: on')).toBeTruthy();
  });

  it('rebuilds the option on zoom, keeping the zoom in it', () => {
    render(<TrendPanel {...base} />);
    const before = stage.option;
    dragZoom(10, 20);
    expect(stage.option).not.toBe(before);
  });
});

describe('value table (item 7)', () => {
  it('stays closed until the toggle, which names what it will do', () => {
    render(<TrendPanel {...base} />);
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(button('Show value table'));
    expect(screen.getByRole('table')).toBeTruthy();
    fireEvent.click(button('Hide value table'));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('follows the zoom', () => {
    render(<TrendPanel {...base} />);
    fireEvent.click(button('Show value table'));
    expect(screen.getByText(/Rows 1 to 4 of 4/)).toBeTruthy();
    dragZoom(0, 0.1); // the first 1.44 minutes of the day
    expect(screen.getByText(/Rows 1 to 2 of 2/)).toBeTruthy();
  });
});

describe('keyboard (item 11)', () => {
  it('makes the plot and each lane focusable', () => {
    render(<TrendPanel {...base} />);
    expect(plotSlider().getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('slider', { name: 'Mode lane' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('slider', { name: 'Verdict lane' }).getAttribute('tabindex')).toBe('0');
  });

  it('puts the focus targets beside the img, where assistive technology can reach them', () => {
    render(<TrendPanel {...base} />);
    expect(within(screen.getByRole('img')).queryByRole('slider')).toBeNull();
  });

  it('moves one point per arrow and states the reading politely', () => {
    render(<TrendPanel {...base} />);
    const region = screen.getByTestId('trend-live');
    expect(region.getAttribute('aria-live')).toBe('polite');
    fireEvent.keyDown(plotSlider(), { key: 'ArrowRight' });
    expect(live()).toBe('3 Nov 2026, 12:00:00 GST. PV 10 kg/h. SP 12 kg/h. Mode AUTO. Verdict Oscillating.');
    fireEvent.keyDown(plotSlider(), { key: 'ArrowRight' });
    expect(live()).toBe('3 Nov 2026, 12:01:00 GST. PV No sample. SP 12 kg/h. Mode AUTO. Verdict Oscillating.');
    expect(plotSlider().getAttribute('aria-valuetext')).toBe('Point 2 of 4');
  });

  it('moves the chart cursor with the same key', () => {
    render(<TrendPanel {...base} />);
    fireEvent.keyDown(plotSlider(), { key: 'End' });
    expect(stage.chart.convertToPixel).toHaveBeenLastCalledWith({ xAxisIndex: 0 }, T0 + 3 * MIN);
    expect(stage.chart.dispatchAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'showTip', x: 321 }));
  });

  it('selects the verdict band at the cursor with Enter, and reports it', () => {
    const onSelectBand = vi.fn();
    render(<TrendPanel {...base} onSelectBand={onSelectBand} />);
    fireEvent.keyDown(plotSlider(), { key: 'End' });
    fireEvent.keyDown(plotSlider(), { key: 'Enter' });
    expect(onSelectBand).toHaveBeenCalledWith(verdict[1], lanes[1]);
    expect(live()).toContain('Selected Verdict: Good control');
  });

  it('says so when there is no verdict band at the cursor', () => {
    const onSelectBand = vi.fn();
    const before = [{ ...verdict[1], startMs: T0 + 10 * MIN, endMs: T0 + 20 * MIN }];
    render(<TrendPanel {...base} lanes={[{ ...lanes[1], segments: before }]} onSelectBand={onSelectBand} />);
    fireEvent.keyDown(plotSlider(), { key: 'ArrowRight' });
    fireEvent.keyDown(plotSlider(), { key: 'Enter' });
    expect(onSelectBand).not.toHaveBeenCalled();
    expect(live()).toBe('No verdict band at the cursor.');
  });

  it('does nothing on Enter with no cursor', () => {
    const onSelectBand = vi.fn();
    render(<TrendPanel {...base} onSelectBand={onSelectBand} />);
    fireEvent.keyDown(plotSlider(), { key: 'Enter' });
    expect(onSelectBand).not.toHaveBeenCalled();
  });

  it('clears the cursor and the selection with Escape', () => {
    const onSelectBand = vi.fn();
    render(<TrendPanel {...base} selectedBandId="w1" onSelectBand={onSelectBand} />);
    fireEvent.keyDown(plotSlider(), { key: 'ArrowRight' });
    fireEvent.keyDown(plotSlider(), { key: 'Escape' });
    expect(onSelectBand).toHaveBeenCalledWith(null, null);
    expect(live()).toBe('Cursor cleared.');
    expect(stage.chart.dispatchAction).toHaveBeenCalledWith({ type: 'hideTip' });
    expect(plotSlider().getAttribute('aria-valuetext')).toBe('No cursor placed');
  });

  it('leaves Escape alone when there is nothing to clear, so a drawer can close', () => {
    const outer = vi.fn();
    render(<div onKeyDown={outer}><TrendPanel {...base} /></div>);
    fireEvent.keyDown(plotSlider(), { key: 'Escape' });
    expect(outer).toHaveBeenCalled();
  });

  it('stops Escape at the panel when it cleared something', () => {
    const outer = vi.fn();
    render(<div onKeyDown={outer}><TrendPanel {...base} /></div>);
    fireEvent.keyDown(plotSlider(), { key: 'ArrowRight' });
    outer.mockClear();
    fireEvent.keyDown(plotSlider(), { key: 'Escape' });
    expect(outer).not.toHaveBeenCalled();
  });

  it('moves a whole segment on a lane, and selects with Enter', () => {
    const onSelectBand = vi.fn();
    render(<TrendPanel {...base} onSelectBand={onSelectBand} />);
    const lane = screen.getByRole('slider', { name: 'Verdict lane' });
    fireEvent.keyDown(lane, { key: 'ArrowRight' });
    expect(lane.getAttribute('aria-valuetext')).toBe('Oscillating');
    fireEvent.keyDown(lane, { key: 'ArrowRight' });
    expect(lane.getAttribute('aria-valuetext')).toBe('Good control');
    fireEvent.keyDown(lane, { key: 'Enter' });
    expect(onSelectBand).toHaveBeenCalledWith(verdict[1], lanes[1]);
  });

  it('does not select from a mode lane', () => {
    const onSelectBand = vi.fn();
    render(<TrendPanel {...base} onSelectBand={onSelectBand} />);
    const lane = screen.getByRole('slider', { name: 'Mode lane' });
    fireEvent.keyDown(lane, { key: 'ArrowRight' });
    fireEvent.keyDown(lane, { key: 'Enter' });
    expect(onSelectBand).not.toHaveBeenCalled();
  });

  it('continues inside the window after a zoom left the cursor outside it', () => {
    render(<TrendPanel {...base} />);
    fireEvent.keyDown(plotSlider(), { key: 'End' });
    dragZoom(0, 0.1);
    fireEvent.keyDown(plotSlider(), { key: 'ArrowLeft' });
    expect(live()).toContain('12:00:00');
  });

  it('honours a controlled cursor', () => {
    const onCursorChange = vi.fn();
    const { rerender } = render(<TrendPanel {...base} cursorAt={x[1]} onCursorChange={onCursorChange} />);
    expect(plotSlider().getAttribute('aria-valuenow')).toBe('1');
    fireEvent.keyDown(plotSlider(), { key: 'ArrowRight' });
    expect(onCursorChange).toHaveBeenCalledWith(x[2]);
    expect(plotSlider().getAttribute('aria-valuenow')).toBe('1');
    rerender(<TrendPanel {...base} cursorAt={x[2]} onCursorChange={onCursorChange} />);
    expect(plotSlider().getAttribute('aria-valuenow')).toBe('2');
  });
});

describe('pointer', () => {
  it('selects a verdict band on click', () => {
    const onSelectBand = vi.fn();
    render(<TrendPanel {...base} onSelectBand={onSelectBand} />);
    act(() => stage.events.click({ seriesId: 'lane:verdict', dataIndex: 1 }));
    expect(onSelectBand).toHaveBeenCalledWith(verdict[1], lanes[1]);
  });

  it('ignores a click on another lane', () => {
    const onSelectBand = vi.fn();
    render(<TrendPanel {...base} onSelectBand={onSelectBand} />);
    act(() => stage.events.click({ seriesId: 'lane:mode', dataIndex: 0 }));
    act(() => stage.events.click({ seriesId: 'pv', dataIndex: 0 }));
    expect(onSelectBand).not.toHaveBeenCalled();
  });

  it('places the cursor where the plot is clicked, without announcing it', () => {
    render(<TrendPanel {...base} />);
    stage.chart.convertFromPixel.mockReturnValue(T0 + 2 * MIN + 100);
    const click = stage.chart.zrOn.mock.calls[0][1] as (e: { offsetX: number; offsetY: number }) => void;
    act(() => click({ offsetX: 300, offsetY: 40 }));
    expect(plotSlider().getAttribute('aria-valuetext')).toBe('Point 3 of 4');
    expect(live()).toBe('');
  });
});

describe('theme (item 13)', () => {
  it('rebuilds the option when the theme changes, with no reload', async () => {
    render(<TrendPanel {...base} />);
    expect(stage.option.tooltip.backgroundColor).toBe('tooltip-day');
    const first = stage.option;
    act(() => document.documentElement.setAttribute('data-theme', 'night'));
    await waitFor(() => expect(stage.option.tooltip.backgroundColor).toBe('tooltip-night'));
    expect(stage.option).not.toBe(first);
    expect(stage.mounts).toBe(1);
  });
});

describe('states (item 15)', () => {
  const context = <span>FIC101, reactor feed</span>;

  it('shows loading in words, and keeps the context and the requested window', () => {
    render(<TrendPanel {...base} context={context} state={{ kind: 'loading' }} />);
    expect(screen.getByRole('status').textContent).toContain('Loading');
    expect(screen.getByText('FIC101, reactor feed')).toBeTruthy();
    expect(screen.getByText('Requested: 3 Nov 12:00 to 4 Nov 12:00 GST')).toBeTruthy();
    expect(screen.queryByTestId('echarts')).toBeNull();
    expect(screen.queryByTestId('trend-plotted')).toBeNull();
  });

  it('shows empty with its reason and action', () => {
    render(<TrendPanel {...base} context={context} state={{ kind: 'empty', message: 'No samples in 24 h.', action: <button type="button">Widen the range</button> }} />);
    expect(screen.getByTestId('trend-empty').textContent).toContain('No samples in 24 h.');
    expect(button('Widen the range')).toBeTruthy();
    expect(screen.getByText('FIC101, reactor feed')).toBeTruthy();
  });

  it('treats a window of only nulls as empty, without being told', () => {
    const silent: TrendPane = { ...pane, series: [{ ...pane.series[0], y: [null, null, null, null] }] };
    render(<TrendPanel {...base} panes={[silent]} lanes={[]} />);
    expect(screen.getByTestId('trend-empty')).toBeTruthy();
    expect(screen.queryByTestId('echarts')).toBeNull();
  });

  it('shows an error as an alert, with its own text', () => {
    render(<TrendPanel {...base} context={context} state={{ kind: 'error', message: 'Historian timed out.' }} />);
    expect(screen.getByRole('alert').textContent).toContain('Historian timed out.');
    expect(screen.getByText('FIC101, reactor feed')).toBeTruthy();
  });

  it('never leaves an error without words', () => {
    render(<TrendPanel {...base} state={{ kind: 'error' }} />);
    expect(screen.getByRole('alert').textContent).toContain('The service did not respond.');
  });

  it('keeps the chart when stale, with the time in the site zone', () => {
    render(<TrendPanel {...base} state={{ kind: 'stale', since: T0 + 5 * MIN }} />);
    expect(screen.getByText('Stale since 3 Nov 2026, 12:05:00 GST')).toBeTruthy();
    expect(screen.getByTestId('echarts')).toBeTruthy();
    expect(plottedText()).toBe('Plotted: 3 Nov 12:00 to 4 Nov 12:00 GST');
  });

  it('hides the zoom and table buttons when no chart is drawn', () => {
    render(<TrendPanel {...base} state={{ kind: 'loading' }} />);
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show value table' })).toBeNull();
  });

  it('keeps the source line in every state', () => {
    render(<TrendPanel {...base} state={{ kind: 'error' }} />);
    expect(screen.getByText(/Source: Historian/)).toBeTruthy();
  });
});

describe('groups (item 1)', () => {
  it('connects a grouped panel, and releases with the last one', () => {
    const first = render(<TrendPanel {...base} group="compare" />);
    expect(stage.chart.group).toBe('compare');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith('compare');
    stage.chart = makeChart();
    const second = render(<TrendPanel {...base} group="compare" />);
    expect(connect).toHaveBeenCalledTimes(1);
    first.unmount();
    expect(disconnect).not.toHaveBeenCalled();
    second.unmount();
    expect(disconnect).toHaveBeenCalledWith('compare');
  });

  it('stays out of connect without a group', () => {
    render(<TrendPanel {...base} />);
    expect(connect).not.toHaveBeenCalled();
    expect(stage.chart.group).toBe('');
  });
});
