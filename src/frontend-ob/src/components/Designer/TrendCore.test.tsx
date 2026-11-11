// @vitest-environment jsdom
/**
 * CHG-175: the shared trend engine. The cursor tooltip stays while the pointer is still (a cursor move no longer
 * re-applies the option), every time is in one zone, and the Trend page's frame (head row, foot strip, empty text).
 * The Designer's dialog and canvas symbol keep their time bar and failed-pen line.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const st = vi.hoisted(() => ({
  options: [] as Array<Record<string, any>>,
  events: {} as Record<string, (e: unknown) => void>,
  zr: {} as Record<string, (e: unknown) => void>,
  dispatch: [] as Array<Record<string, unknown>>,

  resolved: new Map<string, unknown>(),
}));

vi.mock('echarts-for-react', () => {
  const FakeChart = (p: { option: Record<string, unknown>; onEvents: typeof st.events; onChartReady?: (c: unknown) => void }) => {
    if (st.options[st.options.length - 1] !== p.option) st.options.push(p.option);
    st.events = p.onEvents;
    React.useEffect(() => {
      p.onChartReady?.({
        dispatchAction: (a: Record<string, unknown>) => st.dispatch.push(a),
        getOption: () => ({}),
        getZr: () => ({ on: (ev: string, fn: (e: unknown) => void) => { st.zr[ev] = fn; } }),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="echart" />;
  };
  return { default: FakeChart };
});
// react-query hands back the same data object until it changes; so does this stand-in (a new one each render loops).
vi.mock('../../hooks/useBindingResolver', () => ({
  useBatchBindingResolver: (paths: string[]) => {
    const key = paths.join('|');
    if (!st.resolved.has(key)) {
      // A path under f. resolves only from the path string (provenance "fallback"); under x. it does not resolve at all.
      st.resolved.set(key, { data: { bindings: paths.map(p => ({
        resolved: !p.startsWith('x.'),
        provenance: p.startsWith('f.') ? 'fallback' : 'asset-model',
        history: { ioTDbPath: `root.s.${p.replace(/\W/g, '_')}.${p.split('.').pop()}` },
      })) } });
    }
    return st.resolved.get(key);
  },
}));
const T0 = Date.parse('2026-11-06T11:00:00Z');
const store = vi.hoisted(() => ({
  fetchTrend: vi.fn(async (_s: string, _a: Date, _b: Date, _w: number, m: string) => {
    if (m === 'op' && (globalThis as { __failOp?: boolean }).__failOp) throw new Error('down');
    const t0 = Date.parse('2026-11-06T11:00:00Z');
    return [{ ts: t0, [m]: 1 }, { ts: t0 + 60_000, [m]: 2 }];
  }),
  connect: () => undefined,
}));
vi.mock('../../store/mqttStore', () => ({
  useMqttStore: (pick: (s: typeof store) => unknown) => pick(store),
  getLiveSeries: () => [],
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));

import TrendCore from './TrendCore';
import { useDisplayTimeStore } from '../../store/timeStore';

vi.stubGlobal('ResizeObserver', class { observe() { /* jsdom has none */ } disconnect() { /* none */ } });

const PIN = { start: Date.parse('2026-11-06T10:45:00Z'), end: Date.parse('2026-11-06T22:45:00Z'), live: false };
const PENS = [{ path: 'a.pv', label: 'PV' }, { path: 'a.op', label: 'OP' }];
const last = () => st.options[st.options.length - 1];
const loaded = () => waitFor(() => expect((last()?.series?.[0]?.data ?? []).length).toBe(2));

beforeEach(() => { st.options = []; st.events = {}; st.zr = {}; st.dispatch = []; (globalThis as { __failOp?: boolean }).__failOp = false; useDisplayTimeStore.setState({ tz: 'UTC' }); });
afterEach(cleanup);

describe('the cursor tooltip', () => {
  it('keeps the same option while the cursor moves, so ECharts does not clear the tooltip', async () => {
    render(<TrendCore pens={PENS} controlledWindow={PIN} showTimeBar={false} />);
    await loaded();
    const before = last();
    act(() => st.events.updateAxisPointer({ axesInfo: [{ axisDim: 'x', value: T0 }] }));
    await waitFor(() => expect(screen.getAllByTestId('pen-value')[0].textContent).toBe('1.00')); // the legend follows the cursor
    expect(last()).toBe(before);
  });

  it('shows the tooltip again where the pointer rests when new data re-applies the option', async () => {
    const { rerender } = render(<TrendCore pens={PENS} controlledWindow={{ ...PIN, live: true }} showTimeBar={false} />);
    await loaded();
    act(() => st.zr.mousemove({ offsetX: 120, offsetY: 60 }));
    st.dispatch = [];
    rerender(<TrendCore pens={PENS} controlledWindow={{ ...PIN, end: PIN.end + 2000, live: true }} showTimeBar={false} />);
    await waitFor(() => expect(st.dispatch).toContainEqual({ type: 'showTip', x: 120, y: 60 }));
    act(() => st.zr.globalout({}));
    st.dispatch = [];
    rerender(<TrendCore pens={PENS} controlledWindow={{ ...PIN, end: PIN.end + 4000, live: true }} showTimeBar={false} />);
    await new Promise(r => setTimeout(r, 50));
    expect(st.dispatch.filter(a => a.type === 'showTip')).toEqual([]);
  });
});

describe('the zone', () => {
  it('draws every time in the zone it is given', async () => {
    render(<TrendCore pens={PENS} controlledWindow={PIN} timeZone="Asia/Dubai" showTimeBar={false} />);
    await loaded();
    expect(last().xAxis.axisLabel.formatter(Date.parse('2026-11-06T15:00:00Z'))).toBe('19:00');
  });

  it('keeps the display zone of the Designer when none is given', async () => {
    render(<TrendCore pens={PENS} controlledWindow={PIN} showTimeBar={false} />);
    await loaded();
    expect(last().xAxis.axisLabel.formatter(Date.parse('2026-11-06T15:00:00Z'))).toBe('15:00');
  });
});

describe('the Trend page frame', () => {
  const frame = { headTools: <button>Signals</button>, state: 'stale' as const, zoneName: 'UTC' };

  it('puts the legend, the page tools and the zoom tools in one head row, and the state in the foot', async () => {
    render(<TrendCore pens={PENS} controlledWindow={PIN} frame={frame} />);
    await loaded();
    const head = screen.getByTestId('trend-head');
    expect(head.textContent).toContain('PV');
    for (const name of ['Signals', 'Zoom area', 'Undo', 'Reset']) expect(head.textContent).toContain(name);
    expect(screen.getByTestId('trend-foot').textContent).toContain('No new samples');
    expect(screen.queryByTestId('trend-timebar')).toBeNull();
    expect(screen.queryByTestId('trend-zoombar')).toBeNull();
  });

  it('names a pen that was not read in the foot, not above the plot', async () => {
    (globalThis as { __failOp?: boolean }).__failOp = true;
    render(<TrendCore pens={PENS} controlledWindow={PIN} frame={{ ...frame, state: 'fixed' }} />);
    await waitFor(() => expect(screen.getByTestId('trend-foot').textContent).toContain('OP not read'));
    expect(screen.queryByText(/pen\(s\) failed to load/)).toBeNull();
  });

  it('shows the empty text in place of the plot when there are no pens', () => {
    render(<TrendCore pens={[]} frame={{ ...frame, state: null }} emptyContent="Select a loop" />);
    expect(screen.getByText('Select a loop')).toBeTruthy();
    expect(screen.queryByTestId('echart')).toBeNull();
    expect(screen.queryByTestId('trend-foot')).toBeNull();
  });

  it('resets the zoom when the page says the period changed', async () => {
    const { rerender } = render(<TrendCore pens={PENS} controlledWindow={PIN} frame={frame} zoomResetKey="a" />);
    await loaded();
    st.dispatch = [];
    rerender(<TrendCore pens={PENS} controlledWindow={PIN} frame={frame} zoomResetKey="b" />);
    await waitFor(() => expect(st.dispatch.some(a => a.type === 'dataZoom')).toBe(true));
  });

  it('holds a live window still while a zoom rectangle is being drawn', async () => {
    const live = { ...PIN, live: true };
    const { rerender } = render(<TrendCore pens={PENS} controlledWindow={live} frame={frame} />);
    await loaded();
    fireEvent.click(screen.getByText('Zoom area'));
    rerender(<TrendCore pens={PENS} controlledWindow={{ ...live, start: live.start + 2000, end: live.end + 2000 }} frame={frame} />);
    expect(last().xAxis.max).toBe(live.end);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(last().xAxis.max).toBe(live.end + 2000));
  });
});

describe('a loop pen whose binding is only derived from its path (CHG-175)', () => {
  const frame = { state: 'fixed' as const, zoneName: 'UTC' };
  const series = () => store.fetchTrend.mock.calls.map(c => c[0]);
  beforeEach(() => store.fetchTrend.mockClear());

  it('is not read: no history is asked from the derived path, and the foot names it', async () => {
    const pens = [
      { path: 'f.pv', label: 'PV', needsModelBinding: true },
      { path: 'x.sp', label: 'SP', needsModelBinding: true },
      { path: 'a.op', label: 'OP', needsModelBinding: true },
    ];
    render(<TrendCore pens={pens} controlledWindow={PIN} frame={frame} />);
    await waitFor(() => expect(screen.getByTestId('trend-foot').textContent).toContain('◐ PV, SP not read · the values shown may be incomplete'));
    expect(series()).toEqual(['root.s.a_op']);   // the asset-model pen is read as before
    expect(screen.getAllByTestId('pen-value').map(v => v.textContent)).toEqual(['--', '--', '2.00']); // the legend keeps both pens
  });

  it('stays as before for a tag pen, which a path-derived binding may serve', async () => {
    render(<TrendCore pens={[{ path: 'f.pv', label: 'fic.pv' }]} controlledWindow={PIN} frame={frame} />);
    await waitFor(() => expect(series()).toEqual(['root.s.f_pv']));
    await waitFor(() => expect(screen.getAllByTestId('pen-value')[0].textContent).toBe('2.00'));
    expect(screen.getByTestId('trend-foot').textContent).not.toContain('not read');
  });
});

describe('the Designer users', () => {
  it('keep the time bar and the failed-pen line above the plot', async () => {
    (globalThis as { __failOp?: boolean }).__failOp = true;
    render(<TrendCore pens={PENS} />);
    expect(screen.getByTestId('trend-timebar')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/1 pen\(s\) failed to load: OP - values shown may be incomplete/)).toBeTruthy());
    expect(screen.queryByTestId('trend-foot')).toBeNull();
  });
});
