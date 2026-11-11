/**
 * CHG-175: the cursor tooltip stays where the pointer rests. A live tick brings new data, and <ReactECharts notMerge>
 * re-applies the whole option, which clears the tooltip; when that happens with the pointer still over the plot, the
 * tooltip is shown again at the same place (the next frame, after the option is drawn). Nothing changes in its look.
 * A cursor move alone no longer re-applies anything (TrendCore keeps the option until its inputs change).
 */
import { useCallback, useEffect, useRef } from 'react';
import type { ECharts } from 'echarts';

interface PointerEvent_ { offsetX: number; offsetY: number }

/** Returns the callback that wires a chart; `dep` changes whenever the option is re-applied. */
export function useStickyTip(dep: unknown, hold: boolean): (chart: ECharts) => void {
  const chartRef = useRef<ECharts | null>(null);
  const at = useRef<{ x: number; y: number } | null>(null);

  const attach = useCallback((chart: ECharts) => {
    chartRef.current = chart;
    const zr = chart.getZr();
    zr.on('mousemove', (e: PointerEvent_) => { at.current = { x: e.offsetX, y: e.offsetY }; });
    zr.on('globalout', () => { at.current = null; });
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const p = at.current;
    // While a zoom rectangle is drawn the tooltip stays off, as ECharts has it.
    if (!chart || !p || hold) return undefined;
    const frame = requestAnimationFrame(() => chart.dispatchAction({ type: 'showTip', x: p.x, y: p.y }));
    return () => cancelAnimationFrame(frame);
  }, [dep, hold]);

  return attach;
}
