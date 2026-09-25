/**
 * The React side of rectangle zoom (see boxZoom.ts for the ECharts side).
 *
 * One hook per chart: it owns the zoom state, a bounded undo history and the
 * "Zoom area" mode, and hands the chart the two callbacks it needs
 * (`onChartReady`, `onDataZoom`). Nothing here fetches, recomputes or routes:
 * a zoom only changes which part of the already loaded data is drawn.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ECharts } from 'echarts';
import { FULL_ZOOM, isZoomed, readZoom, sameZoom, zoomBatch, type ZoomState } from './boxZoom';

const HISTORY_MAX = 20;

export interface BoxZoom {
  zoom: ZoomState;
  selecting: boolean;
  zoomed: boolean;
  canUndo: boolean;
  /** Turn the rectangle-selection cursor on or off (Escape turns it off). */
  toggleSelect: (on?: boolean) => void;
  undo: () => void;
  reset: () => void;
  onChartReady: (chart: ECharts) => void;
  /** Wire to the chart's `datazoom` event; reads the box components after ECharts applied the action. */
  onDataZoom: () => void;
  /** Re-arm the selection cursor after the option was re-applied (see useKeepSelecting). */
  rearm: () => void;
}

export function useBoxZoom(opts: { hasY?: boolean } = {}): BoxZoom {
  const hasY = opts.hasY ?? true;
  const chartRef = useRef<ECharts | null>(null);
  const [zoom, setZoom] = useState<ZoomState>(FULL_ZOOM);
  const [history, setHistory] = useState<ZoomState[]>([]);
  const [selecting, setSelecting] = useState(false);
  const selectingRef = useRef(false);
  // The last state the chart is known to be at; compared before pushing history so
  // an action that changes nothing (our own reset echo) leaves the stack alone.
  const lastRef = useRef<ZoomState>(FULL_ZOOM);

  const arm = useCallback((on: boolean) => {
    chartRef.current?.dispatchAction({ type: 'takeGlobalCursor', key: 'dataZoomSelect', dataZoomSelectActive: on });
  }, []);

  const onChartReady = useCallback((chart: ECharts) => {
    chartRef.current = chart;
    if (selectingRef.current) arm(true);
  }, [arm]);

  const onDataZoom = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // ECharts has applied the action by now; the linked box components carry the new ranges.
    const next = readZoom(chart.getOption() as Parameters<typeof readZoom>[0]);
    if (sameZoom(next, lastRef.current)) return;
    const prev = lastRef.current;
    lastRef.current = next;
    setHistory(h => [...h.slice(-(HISTORY_MAX - 1)), prev]);
    setZoom(next);
  }, []);

  const apply = useCallback((next: ZoomState) => {
    lastRef.current = next;
    setZoom(next);
    chartRef.current?.dispatchAction({ type: 'dataZoom', batch: zoomBatch(next, hasY) });
  }, [hasY]);

  const undo = useCallback(() => {
    setHistory(h => {
      const prev = h[h.length - 1];
      if (prev) apply(prev);
      return h.slice(0, -1);
    });
  }, [apply]);

  const reset = useCallback(() => {
    setHistory([]);
    apply(FULL_ZOOM);
  }, [apply]);

  const toggleSelect = useCallback((on?: boolean) => {
    const next = on ?? !selectingRef.current;
    selectingRef.current = next;
    setSelecting(next);
    arm(next);
  }, [arm]);

  const rearm = useCallback(() => { if (selectingRef.current) arm(true); }, [arm]);

  // Escape leaves the selection mode without zooming.
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') toggleSelect(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selecting, toggleSelect]);

  return useMemo(() => ({
    zoom, selecting, zoomed: isZoomed(zoom), canUndo: history.length > 0,
    toggleSelect, undo, reset, onChartReady, onDataZoom, rearm,
  }), [zoom, selecting, history.length, toggleSelect, undo, reset, onChartReady, onDataZoom, rearm]);
}

/**
 * A re-applied option (`notMerge` on a live tick or a data refresh) rebuilds the
 * toolbox and drops the selection cursor; re-arm it after every render while the
 * mode is on. `dep` is whatever identity changes when the option is rebuilt.
 */
export function useKeepSelecting(box: BoxZoom, dep: unknown) {
  const { selecting, rearm } = box;
  useEffect(() => { if (selecting) rearm(); }, [selecting, rearm, dep]);
}
