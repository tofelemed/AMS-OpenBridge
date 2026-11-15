// CHG-200 (final test #19): linked trends (one ECharts connect group) share the zoom; Reset on one brings every chart back to the
// whole range, and then no chart of the group offers an Undo back into the zoom that was reset. A chart on its own keeps its
// history as before.
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ECharts } from 'echarts';
import { BOX_X } from './boxZoom';
import { useBoxZoom } from './useBoxZoom';

/** A chart whose box components read the given x range (as ECharts reports them after a dataZoom). */
function fakeChart() {
  let x = { start: 0, end: 100 };
  const chart = { dispatchAction: () => {}, getOption: () => ({ dataZoom: [{ id: BOX_X, ...x }] }) } as unknown as ECharts;
  return { chart, setX: (start: number, end: number) => { x = { start, end }; } };
}

describe('useBoxZoom in a linked group', () => {
  it('a reset arriving from another chart of the group clears this chart\'s undo', () => {
    const { result } = renderHook(() => useBoxZoom({ hasY: false, linked: true }));
    const c = fakeChart();
    act(() => result.current.onChartReady(c.chart));
    c.setX(20, 60);
    act(() => result.current.onDataZoom());   // the group zoomed in
    expect(result.current.canUndo).toBe(true);
    c.setX(0, 100);
    act(() => result.current.onDataZoom());   // another chart's Reset, echoed by the connect group
    expect(result.current.zoomed).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it('a chart on its own keeps its undo when it is zoomed back out', () => {
    const { result } = renderHook(() => useBoxZoom({ hasY: false }));
    const c = fakeChart();
    act(() => result.current.onChartReady(c.chart));
    c.setX(20, 60);
    act(() => result.current.onDataZoom());
    c.setX(0, 100);
    act(() => result.current.onDataZoom());
    expect(result.current.canUndo).toBe(true);
  });
});
