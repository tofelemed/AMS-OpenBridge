/**
 * The cursor and band selection, shared by the keyboard, a click and a caller that controls the
 * cursor. Only keyboard moves are announced: the live region must not chatter under a mouse.
 */
import { useCallback, useMemo, useState } from 'react';
import type React from 'react';
import { windowText } from './trendFormat';
import { nextIndex } from './trendKeyboard';
import { nearestPosition, segmentAt, snapToPoint, snapshotAt, snapshotSentence, visibleSegments, windowTimes, type TrendModel } from './trendModel';
import type { Interval, TrendLane, TrendSegment } from './trendTypes';

/** The slice of the chart instance the cursor drives. */
export interface CursorChart {
  convertToPixel: (finder: { xAxisIndex: number }, value: number) => number;
  dispatchAction: (action: Record<string, unknown>) => void;
}

/** Shows the cursor on the chart at `at`, or clears it. Linked grids and grouped panels follow. */
export function applyCursor(chart: CursorChart, at: number | null, anchorY: number): void {
  if (at == null) {
    chart.dispatchAction({ type: 'hideTip' });
    chart.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' });
    return;
  }
  const x = chart.convertToPixel({ xAxisIndex: 0 }, at);
  if (Number.isFinite(x)) chart.dispatchAction({ type: 'showTip', x, y: anchorY });
}

export interface TrendCursorInput {
  model: TrendModel;
  plotted: Interval | null;
  zone: string;
  cursorAt?: number | null;
  onCursorChange?: (at: number | null) => void;
  selectedBandId?: string | null;
  onSelectBand?: (band: TrendSegment | null, lane: TrendLane | null) => void;
}

export interface TrendCursor {
  at: number | null;
  /** Position of the cursor in `points`, or null. */
  index: number | null;
  /** The sample points inside the plotted window. */
  points: Float64Array;
  announcement: string;
  /** Places the cursor at a click: on the sample there, or at the spot itself inside a gap. */
  placeNear: (at: number) => void;
  selectBand: (band: TrendSegment | null, lane: TrendLane | null) => void;
  onPlotKey: (e: React.KeyboardEvent) => void;
  onLaneKey: (lane: TrendLane, e: React.KeyboardEvent) => void;
}

export function useTrendCursor(input: TrendCursorInput): TrendCursor {
  const { model, plotted, zone, cursorAt, onCursorChange, selectedBandId, onSelectBand } = input;
  const controlled = cursorAt !== undefined;
  const [own, setOwn] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const at = controlled ? cursorAt : own;

  const points = useMemo(() => (plotted ? windowTimes(model.times, plotted) : model.times), [model.times, plotted]);
  const index = useMemo(() => {
    if (at == null) return null;
    const i = nearestPosition(points, at);
    return i < 0 ? null : i;
  }, [at, points]);

  // A zoom can leave the cursor outside the window; the next arrow continues from the nearest point.
  const set = useCallback((next: number | null) => {
    if (!controlled) setOwn(next);
    onCursorChange?.(next);
  }, [controlled, onCursorChange]);

  const announceAt = useCallback((t: number) => setAnnouncement(snapshotSentence(snapshotAt(model, t, zone))), [model, zone]);

  const selectBand = useCallback((band: TrendSegment | null, lane: TrendLane | null) => {
    onSelectBand?.(band, lane);
    if (band && lane) setAnnouncement(`Selected ${lane.label}: ${band.label}, ${windowText({ from: band.startMs, to: band.endMs }, zone)}.`);
  }, [onSelectBand, zone]);

  const clear = useCallback(() => {
    set(null);
    if (selectedBandId != null) onSelectBand?.(null, null);
    setAnnouncement('Cursor cleared.');
  }, [set, selectedBandId, onSelectBand]);

  const placeNear = useCallback((t: number) => set(snapToPoint(model, plotted, t)), [model, plotted, set]);

  const onEscape = useCallback((e: React.KeyboardEvent) => {
    if (at == null && selectedBandId == null) return;
    e.preventDefault();
    e.stopPropagation(); // a panel inside a drawer clears its cursor first
    clear();
  }, [at, selectedBandId, clear]);

  const enterOn = useCallback((lane: TrendLane | undefined) => {
    if (at == null || !lane) return;
    const band = segmentAt(lane, at);
    if (band) selectBand(band, lane);
    else setAnnouncement(`No ${lane.label.toLowerCase()} band at the cursor.`);
  }, [at, selectBand]);

  const onPlotKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onEscape(e);
    if (e.key === 'Enter') { e.preventDefault(); return enterOn(model.lanes.find(l => l.kind === 'verdict')); }
    const next = nextIndex(e.key, e.shiftKey, index, points.length);
    if (next == null) return;
    e.preventDefault();
    set(points[next]);
    announceAt(points[next]);
  }, [onEscape, enterOn, model.lanes, index, points, set, announceAt]);

  const onLaneKey = useCallback((lane: TrendLane, e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onEscape(e);
    if (e.key === 'Enter') {
      e.preventDefault();
      if (lane.kind === 'verdict') enterOn(lane);
      return;
    }
    if (!plotted) return;
    const shown = visibleSegments(lane, plotted);
    const current = at == null ? null : shown.findIndex(s => at >= s.startMs && at < s.endMs);
    const next = nextIndex(e.key, false, current == null || current < 0 ? null : current, shown.length);
    if (next == null) return;
    e.preventDefault();
    const segment = shown[next];
    const middle = (Math.max(segment.startMs, plotted.from) + Math.min(segment.endMs, plotted.to)) / 2;
    set(middle);
    announceAt(middle);
  }, [onEscape, enterOn, plotted, at, set, announceAt]);

  return { at, index, points, announcement, placeNear, selectBand, onPlotKey, onLaneKey };
}
