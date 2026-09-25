// Phase 5 (docs/cpa-ui-fix-plan.md): the ECharts side of rectangle zoom is pure and testable.
import { describe, it, expect } from 'vitest';
import { BOX_X, BOX_Y, FULL_ZOOM, boxZoomOption, isZoomed, readZoom, sameZoom, zoomBatch } from './boxZoom';

describe('boxZoom', () => {
  it('shows the toolbox to ECharts but keeps it off-canvas, and gives the box components fixed ids', () => {
    const o = boxZoomOption({ xAxisIndex: [0, 1], yAxisIndex: [0] }, FULL_ZOOM);
    expect(o.toolbox.show).toBe(true);
    expect(o.toolbox.top).toBeLessThan(0);
    expect(o.toolbox.feature.dataZoom.yAxisIndex).toEqual([0]);
    expect(o.dataZoom.map(d => d.id)).toEqual([BOX_X, BOX_Y]);
    expect(o.dataZoom[0]).toMatchObject({ type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100, filterMode: 'none' });
  });

  it('is x-only when no y axis is given', () => {
    const o = boxZoomOption({ xAxisIndex: 0 }, FULL_ZOOM);
    expect(o.toolbox.feature.dataZoom.yAxisIndex).toBe('none');
    expect(o.dataZoom.map(d => d.id)).toEqual([BOX_X]);
  });

  it('carries the state into the option so a re-applied option keeps the zoom', () => {
    const z = { x: { start: 37.6, end: 59.8 }, y: { start: 31.5, end: 69.4 } };
    const o = boxZoomOption({ xAxisIndex: 0, yAxisIndex: 0 }, z);
    expect(o.dataZoom[0]).toMatchObject({ start: 37.6, end: 59.8 });
    expect(o.dataZoom[1]).toMatchObject({ start: 31.5, end: 69.4 });
    expect(isZoomed(z)).toBe(true);
    expect(isZoomed(FULL_ZOOM)).toBe(false);
  });

  it('reads the box components back from getOption() and ignores the toolbox-internal ones', () => {
    const read = readZoom({ dataZoom: [
      { id: '\u0000_ec_\u0000toolbox-dataZoom_xAxis0', start: 1, end: 2 },
      { id: BOX_X, start: 37.6, end: 59.8 },
      { id: BOX_Y, start: 31.5, end: 69.4 },
    ] });
    expect(read).toEqual({ x: { start: 37.6, end: 59.8 }, y: { start: 31.5, end: 69.4 } });
    expect(sameZoom(readZoom({ dataZoom: [] }), FULL_ZOOM)).toBe(true);
    expect(sameZoom(readZoom(undefined), FULL_ZOOM)).toBe(true);
  });

  it('builds the action batch only for the components the chart has', () => {
    expect(zoomBatch(FULL_ZOOM, false)).toEqual([{ dataZoomId: BOX_X, start: 0, end: 100 }]);
    expect(zoomBatch(FULL_ZOOM, true)).toHaveLength(2);
  });
});
