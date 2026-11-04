/**
 * The keyboard model, as pure steps. On the plot an arrow moves one sample point; on a lane it moves
 * one segment, because a day of points is too many key presses to reach the next verdict.
 */
import type { ZoomState } from '../../components/charts/boxZoom';
import type { Interval } from './trendTypes';

/** Points moved by Shift with an arrow. */
export const SHIFT_JUMP = 10;
/** Narrowest zoom, in percent of the window, that Zoom in will reach. */
export const MIN_ZOOM_SPAN = 0.05;

const FORWARD = new Set(['ArrowRight', 'ArrowUp']);
const BACKWARD = new Set(['ArrowLeft', 'ArrowDown']);

/**
 * The position after a key, or null when the key does not move the cursor. With no cursor yet,
 * forward starts at the first position and backward at the last.
 */
export function nextIndex(key: string, shift: boolean, index: number | null, count: number): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const clamp = (i: number) => Math.min(last, Math.max(0, i));
  const step = shift ? SHIFT_JUMP : 1;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  if (FORWARD.has(key)) return index == null ? 0 : clamp(index + step);
  if (BACKWARD.has(key)) return index == null ? last : clamp(index - step);
  return null;
}

/** Half the visible x span, around the cursor when there is one and the middle when there is not. */
export function zoomAround(zoom: ZoomState, domain: Interval, at: number | null): ZoomState {
  const { start, end } = zoom.x;
  const width = Math.max((end - start) / 2, MIN_ZOOM_SPAN);
  const centre = at == null ? (start + end) / 2 : ((at - domain.from) / (domain.to - domain.from)) * 100;
  const from = Math.min(100 - width, Math.max(0, centre - width / 2));
  return { ...zoom, x: { start: from, end: from + width } };
}
