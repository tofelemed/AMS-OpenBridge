import { describe, expect, it, vi } from 'vitest';
import { FULL_ZOOM } from '../../components/charts/boxZoom';
import { MIN_ZOOM_SPAN, SHIFT_JUMP, nextIndex, zoomAround } from './trendKeyboard';
import { applyCursor } from './useTrendCursor';

describe('nextIndex', () => {
  it('moves one point per arrow', () => {
    expect(nextIndex('ArrowRight', false, 3, 10)).toBe(4);
    expect(nextIndex('ArrowLeft', false, 3, 10)).toBe(2);
    expect(nextIndex('ArrowUp', false, 3, 10)).toBe(4);
    expect(nextIndex('ArrowDown', false, 3, 10)).toBe(2);
  });

  it('moves ten with Shift, and stops at the ends', () => {
    expect(nextIndex('ArrowRight', true, 3, 100)).toBe(3 + SHIFT_JUMP);
    expect(nextIndex('ArrowLeft', true, 3, 100)).toBe(0);
    expect(nextIndex('ArrowRight', false, 9, 10)).toBe(9);
    expect(nextIndex('ArrowLeft', false, 0, 10)).toBe(0);
  });

  it('starts from an end when there is no cursor yet', () => {
    expect(nextIndex('ArrowRight', false, null, 10)).toBe(0);
    expect(nextIndex('ArrowLeft', false, null, 10)).toBe(9);
  });

  it('goes to the ends with Home and End', () => {
    expect(nextIndex('Home', false, 5, 10)).toBe(0);
    expect(nextIndex('End', false, 5, 10)).toBe(9);
  });

  it('ignores other keys, and an empty chart', () => {
    expect(nextIndex('a', false, 5, 10)).toBeNull();
    expect(nextIndex('Enter', false, 5, 10)).toBeNull();
    expect(nextIndex('ArrowRight', false, 5, 0)).toBeNull();
  });
});

describe('zoomAround', () => {
  const domain = { from: 0, to: 1000 };

  it('halves the span around the middle with no cursor', () => {
    expect(zoomAround(FULL_ZOOM, domain, null).x).toEqual({ start: 25, end: 75 });
  });

  it('centres on the cursor', () => {
    expect(zoomAround(FULL_ZOOM, domain, 400).x).toEqual({ start: 15, end: 65 });
  });

  it('stays inside the window near an edge', () => {
    expect(zoomAround(FULL_ZOOM, domain, 0).x).toEqual({ start: 0, end: 50 });
    expect(zoomAround(FULL_ZOOM, domain, 1000).x).toEqual({ start: 50, end: 100 });
  });

  it('stops at the narrowest span', () => {
    const deep = zoomAround({ ...FULL_ZOOM, x: { start: 50, end: 50.01 } }, domain, 500).x;
    expect(deep.end - deep.start).toBeCloseTo(MIN_ZOOM_SPAN);
  });

  it('leaves the y zoom alone', () => {
    const zoom = { x: FULL_ZOOM.x, y: { start: 10, end: 20 } };
    expect(zoomAround(zoom, domain, null).y).toEqual({ start: 10, end: 20 });
  });
});

describe('applyCursor', () => {
  it('shows the tip at the pixel of the time, which moves the linked pointers', () => {
    const chart = { convertToPixel: vi.fn(() => 250), dispatchAction: vi.fn() };
    applyCursor(chart, 1234, 80);
    expect(chart.convertToPixel).toHaveBeenCalledWith({ xAxisIndex: 0 }, 1234);
    expect(chart.dispatchAction).toHaveBeenCalledWith({ type: 'showTip', x: 250, y: 80 });
  });

  it('hides the tip and the pointer on clear', () => {
    const chart = { convertToPixel: vi.fn(), dispatchAction: vi.fn() };
    applyCursor(chart, null, 80);
    expect(chart.dispatchAction.mock.calls.map(c => c[0].type)).toEqual(['hideTip', 'updateAxisPointer']);
  });

  it('does nothing when the time has no pixel', () => {
    const chart = { convertToPixel: vi.fn(() => NaN), dispatchAction: vi.fn() };
    applyCursor(chart, 1234, 80);
    expect(chart.dispatchAction).not.toHaveBeenCalled();
  });
});
