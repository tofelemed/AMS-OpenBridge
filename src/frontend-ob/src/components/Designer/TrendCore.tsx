'use client';

// Phase J — the trend engine, extracted from Phase C's TrendChart so it can be driven by a plain
// list of tags instead of a CanvasItem. Same machinery as Phase C (historian fetch + MQTT live tail,
// time-bar with live/historical stepping, echarts cross-cursor, dataZoom, the chart palette); the
// only additions are PI-Vision presentation: per-pen Y-axes and a legend that reads each pen's value
// at the cursor. Consumed by: TrendChart (canvas symbol), TrendDialog (ad-hoc), TrendPage (/trend).
//
// 2026-09-20 (cpa-ui-fix-plan Phase 5): split into ./trend/* (support, option, legend, time bar)
// and given rectangle zoom. While "Zoom area" is on, the cursor readout and the live tick hold
// still, because each of them re-applies the option and would cancel the drag in progress.
//
// CHG-175: the option keeps its identity until its inputs change, so a cursor move no longer
// re-applies it (that cleared the tooltip about 30 ms after the pointer stopped); every time is in
// one zone (the page's site zone, else the display zone); lines break where nothing was stored. The
// Trend page draws the engine in its frame: one head row and a foot strip (`frame`).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { ECharts } from 'echarts';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useDisplayTimeStore, formatInZone } from '../../store/timeStore';
import { chartPalette, penStyle, resolveColorLiteral, useChartTheme } from '../../charts/chartTheme';
import { useBoxZoom, useKeepSelecting } from '../charts/useBoxZoom';
import { CLOCK_OPTS, splitIoTPath, unitFor, type Pen, type PenSpec } from './trend/trendSupport';
import { buildTrendOption } from './trend/trendOption';
import { TrendLegend } from './trend/TrendLegend';
import { TrendTimeBar } from './trend/TrendTimeBar';
import { TrendFoot, type TrendState } from './trend/TrendFoot';
import { useTrendHistory } from './trend/useTrendHistory';
import { useStickyTip } from './trend/useStickyTip';
import { zoneOf } from './trend/trendTime';
import { ChartZoomBar } from '../charts/ChartZoomBar';

export type { PenSpec } from './trend/trendSupport';
export type { TrendState } from './trend/TrendFoot';
export { RANGES } from './trend/trendSupport';

/** CHG-175: the Trend page's frame around the plot. */
export interface TrendFrame {
  /** Controls in the head row after the legend, before the zoom tools (Signals ▾). */
  headTools?: React.ReactNode;
  /** The state the foot strip names; null shows no foot. */
  state: TrendState | null;
  /** The zone's short name for "times in …". */
  zoneName: string;
}

interface TrendCoreProps {
  pens: PenSpec[];
  /** Show the range/live time-bar. */
  showTimeBar?: boolean;
  /**
   * CHG-080: with the time-bar hidden (a pinned / controlled window), still show Zoom area / Undo / Reset —
   * they act on the chart's own zoom, not on the window. Opt-in, so the canvas trend symbol is unchanged.
   */
  showZoomBar?: boolean;
  /** One Y-axis per pen (PI Vision style). Defaults on when the pens carry different units. */
  multiAxis?: boolean;
  initialRangeMs?: number;
  className?: string;
  onRemovePen?: (path: string) => void;
  /**
   * External time window (e.g. the display time bar, K/E1.23). When provided it DRIVES the chart
   * window and the internal range/live controls are bypassed. Undefined/null = fully self-controlled
   * — the existing behaviour is unchanged, so this is a purely additive opt-in.
   */
  controlledWindow?: { start: number; end: number; live: boolean } | null;
  // Phase 6 — manual Y scale (E1.8/E1.10) and stepped plotting (E1.22). Both additive/optional.
  scale?: { auto?: boolean; min?: number; max?: number };
  stepped?: boolean;
  // Phase 8 (E1.12) — overlay a per-trace linear regression line.
  regression?: boolean;
  /** Read-only: how old the newest sample is against the window end (null when there is none), and the window's span. */
  onSampleAge?: (ageMs: number | null, rangeMs: number) => void;
  /** The page's verdict on the newest sample; the time bar reads LIVE only with it. Absent: the bar keeps its old rule. */
  sampleFresh?: boolean;
  /** Replaces the legend text shown with no pens; the default keeps the old words. */
  emptyLegendText?: string;
  /** CHG-175: every time on the chart in this zone (IANA or UTC). Absent: the display time bar's zone (the Designer). */
  timeZone?: string;
  /** CHG-175: the Trend page's head row and foot strip; replaces the time bar and the zoom bar. */
  frame?: TrendFrame;
  /** CHG-175: a new value resets the zoom (the page's new range, step, Custom or Now). */
  zoomResetKey?: string | number;
  /** CHG-175: shown in place of the plot while there are no pens. */
  emptyContent?: React.ReactNode;
}

// Test marker: lets automated checks confirm which build of this module the page actually loaded.
(globalThis as unknown as { __trendCoreBuild?: string }).__trendCoreBuild = 'J2';

export const TrendCore: React.FC<TrendCoreProps> = ({
  pens: penSpecs,
  showTimeBar = true,
  showZoomBar = false,
  multiAxis,
  initialRangeMs = 15 * 60_000,
  className = '',
  onRemovePen,
  controlledWindow,
  scale,
  stepped,
  regression,
  onSampleAge,
  sampleFresh,
  emptyLegendText,
  timeZone,
  frame,
  zoomResetKey,
  emptyContent,
}) => {
  const paths = useMemo(() => penSpecs.map(p => p.path), [penSpecs]);
  const { data: batch } = useBatchBindingResolver(paths, 'all');

  const pens: Pen[] = useMemo(() => {
    const resolved = (batch?.bindings ?? []) as Array<Record<string, unknown>>;
    return penSpecs.map((spec, i) => {
      const b = resolved[i] as
        | { resolved?: boolean; provenance?: string; live?: { sparkplugDevice?: string; sparkplugMetric?: string }; history?: { ioTDbPath?: string } }
        | undefined;
      const label = spec.label ?? spec.path.split('/').pop() ?? spec.path;
      // CHG-175: a loop's signal is never read from a binding the resolver only derived from the path, or could not make.
      if (spec.needsModelBinding && b && (b.resolved === false || b.provenance === 'fallback')) {
        return { ...spec, label, unit: spec.unitOverride || '', unread: true };
      }
      const { series, measurement } = splitIoTPath(b?.history?.ioTDbPath);
      const dev = b?.live?.sparkplugDevice;
      const met = b?.live?.sparkplugMetric ?? measurement;
      return {
        ...spec,
        label,
        // Prefer the authoritative unit (asset catalog / UOM override); the name guess is a last resort.
        unit: spec.unitOverride || unitFor(met ?? measurement),
        iotSeries: series,
        measurement,
        liveKey: dev && met ? `${dev}/${met}` : undefined,
      };
    });
  }, [batch, penSpecs]);

  // Clickable-legend hide/show (E1.17) — runtime interaction, seeded from each pen's default hidden flag.
  // Re-seed ONLY when the set of pen paths changes (add/remove pen), not on every penSpecs identity change
  // — otherwise an async metadata/trace update (which rebuilds penSpecs) would silently un-hide traces the
  // operator just hid.
  const pathsKey = penSpecs.map(p => p.path).join('|');
  const [hiddenPens, setHiddenPens] = useState<Set<string>>(
    () => new Set(penSpecs.filter(p => p.hidden).map(p => p.path)));
  useEffect(() => {
    setHiddenPens(new Set(penSpecs.filter(p => p.hidden).map(p => p.path)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey]);
  const toggleHidden = (path: string) => setHiddenPens(prev => {
    const next = new Set(prev);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  // Display timezone (K18/M15) for the Designer; CHG-175: the page's site zone wins. One zone for every time shown.
  const tz = useDisplayTimeStore(s => s.tz);
  const zone = zoneOf(timeZone ?? tz);
  const fmtClock = React.useCallback((ms: number) => formatInZone(ms, timeZone ?? tz, CLOCK_OPTS), [timeZone, tz]);

  const [rangeMs, setRangeMs] = useState(initialRangeMs);
  const [live, setLive] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [endTs, setEndTs] = useState(() => 0); // 0 = "now"; set when paused/scrubbed
  const [cursorTs, setCursorTs] = useState<number | null>(null);
  // FE-04: the axis-pointer event fires per mousemove. Coalesce cursor updates to one per animation frame.
  const cursorFrameRef = useRef(0);
  const pendingCursorTsRef = useRef<number | null>(null);
  // Rectangle / slider / wheel zoom, carried in the option (see ./trend/trendOption).
  const box = useBoxZoom({ hasY: true });
  // "Now" for the live window. It only moves on the 2s tick (below).
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  // Plot pixel width → historian decimation is sized to it (U9). Kept in a ref so a resize doesn't refetch.
  const canvasRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(500);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => { widthRef.current = Math.max(50, Math.round(el.clientWidth)) || 500; };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // CHG-175: while a zoom rectangle is drawn, a driven live window holds still (a moved window re-applies the option
  // and would cancel the drag), as the internal live tick already did.
  const heldRef = useRef(controlledWindow ?? null);
  if (!(box.selecting && controlledWindow?.live && heldRef.current)) heldRef.current = controlledWindow ?? null;
  const cw = heldRef.current;

  // The window end only advances on a LIVE TICK — follow "now" only while live AND playing; otherwise pinned.
  // When an external window is supplied it wins; otherwise the internal live/paused logic applies.
  const isControlled = !!cw;
  const controlledLive = cw?.live ?? false;
  const windowEnd = cw ? cw.end : ((live && playing) ? nowTs : (endTs || nowTs));
  const windowStart = cw ? cw.start : windowEnd - rangeMs;
  // History refetch key. In live mode the END advances continually and the ring-buffer tail fills the
  // leading edge, so we refetch only when the SPAN changes; in fixed mode either bound triggers it.
  const fetchKey = cw
    ? (controlledLive ? `cspan:${cw.end - cw.start}` : `cfix:${cw.start}:${cw.end}`)
    : (live ? `live:${rangeMs}` : `fix:${rangeMs}:${endTs}`);
  // CHG-080: a newly pinned window is a new range — a zoom selected on the previous one no longer means anything.
  // CHG-175: a caller with a reset key says itself when the period changed (pausing, for one, keeps the zoom).
  const { reset: resetZoom } = box;
  useEffect(() => {
    if (zoomResetKey === undefined && isControlled && !controlledLive) resetZoom();
  }, [fetchKey, isControlled, controlledLive, resetZoom, zoomResetKey]);
  useEffect(() => { if (zoomResetKey !== undefined) resetZoom(); }, [zoomResetKey, resetZoom]);

  // Tail while live: internally live, or externally live when a window is driving us.
  const tailing = isControlled ? controlledLive : live;
  const { penData, failed } = useTrendHistory({ pens, windowStart, windowEnd, fetchKey, tailing, tick, widthRef });

  // Live tick — advance the window and pull fresh samples from the MQTT ring-buffer. Skipped when an external window
  // drives the chart, and while a zoom rectangle is being drawn (the re-applied option would cancel the drag).
  useEffect(() => {
    if (isControlled || !live || !playing || box.selecting) return;
    const id = setInterval(() => { setNowTs(Date.now()); setTick(t => t + 1); }, 2000);
    return () => clearInterval(id);
  }, [isControlled, live, playing, box.selecting]);

  // Theme colors: resolved ONCE per theme, not on every render.
  const theme = useChartTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is a recompute trigger: the palette is read from CSS variables that change with it.
  const palette = useMemo(() => chartPalette(), [theme]);

  // Report the newest sample's age to a page that shows the state; only when it changes by a second or more.
  const newestTs = penData.reduce((m, d) => (d.length ? Math.max(m, d[d.length - 1].ts) : m), 0);
  const sampleAge = newestTs ? Math.max(0, windowEnd - newestTs) : null;
  const reportedAge = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (!onSampleAge) return;
    const key = sampleAge == null ? null : Math.round(sampleAge / 1000);
    if (reportedAge.current === key) return;
    reportedAge.current = key;
    onSampleAge(sampleAge, isControlled ? windowEnd - windowStart : rangeMs);
  });

  // Effective per-pen colour: an explicit per-trace colour (E1.2) wins over the auto-assigned pen. The palette changes
  // with the theme, so a var() colour is resolved again then.
  const penColor = useCallback((i: number) => {
    const c = pens[i]?.color;
    return c ? resolveColorLiteral(c) : penStyle(palette, i).color;
  }, [pens, palette]);

  // Per-pen Y-axis (PI Vision) when units differ, unless explicitly overridden.
  const perAxis = multiAxis ?? (pens.length > 1 && new Set(pens.map(p => p.unit)).size > 1);
  const manual = !!scale && scale.auto === false;
  const scaleMin = manual ? scale?.min : undefined;
  const scaleMax = manual ? scale?.max : undefined;

  const option = useMemo(() => buildTrendOption({
    pens, penData, hiddenPens, penColor, palette, perAxis, manualScale: manual ? { min: scaleMin, max: scaleMax } : null,
    stepped, regression, windowStart, windowEnd, zone, zoom: box.zoom,
  }), [pens, penData, hiddenPens, penColor, palette, perAxis, manual, scaleMin, scaleMax, stepped, regression, windowStart, windowEnd, zone, box.zoom]);
  useKeepSelecting(box, option);
  const attachTip = useStickyTip(option, box.selecting);
  const hasData = penData.some(d => d.length > 0);

  /** value of a pen at the cursor timestamp (nearest sample), else its latest sample */
  const valueAt = (i: number): number | undefined => {
    const data = penData[i];
    if (!data?.length) return undefined;
    if (cursorTs == null) return data[data.length - 1].value;
    let best = data[0], bestD = Math.abs(data[0].ts - cursorTs);
    for (const p of data) {
      const d = Math.abs(p.ts - cursorTs);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best.value;
  };

  const step = (dir: number) => {
    setLive(false);
    setPlaying(false);
    setEndTs(prev => (prev || Date.now()) + dir * rangeMs * 0.5);
  };

  /** ⏸ / ▶ — pausing must FREEZE the window at the current instant, not merely stop the interval. */
  const togglePlay = () => {
    setPlaying(p => {
      const next = !p;
      if (!next) setEndTs(Date.now());  // pause → pin the window end
      else setEndTs(0);                 // resume → follow "now" again
      return next;
    });
  };

  // Stable handlers: echarts-for-react rebinds its events whenever the object changes.
  const selectingRef = useRef(false);
  selectingRef.current = box.selecting;
  const { onChartReady: boxReady, onDataZoom } = box;
  const onEvents = useMemo(() => ({
    updateAxisPointer: (e: { axesInfo?: Array<{ axisDim?: string; value?: number }> }) => {
      // A cursor re-render would re-apply the option and cancel a zoom rectangle in progress.
      if (selectingRef.current) return;
      const t = e.axesInfo?.find(a => a.axisDim === 'x')?.value;
      if (typeof t !== 'number') return;
      pendingCursorTsRef.current = t;
      if (!cursorFrameRef.current) {
        cursorFrameRef.current = requestAnimationFrame(() => {
          cursorFrameRef.current = 0;
          if (pendingCursorTsRef.current != null) setCursorTs(pendingCursorTsRef.current);
        });
      }
    },
    // E1.13/E1.14 — the cursor is RETAINED when the pointer leaves the plot; double-click clears it.
    datazoom: onDataZoom,
  }), [onDataZoom]);
  const onChartReady = useCallback((inst: unknown) => {
    // Debug/test hook (mirrors window.__designer): lets automated checks read the live chart option.
    (window as unknown as { __trend?: unknown }).__trend = inst;
    boxReady(inst as ECharts);
    attachTip(inst as ECharts);
  }, [boxReady, attachTip]);

  const legend = (
    <TrendLegend emptyText={emptyLegendText} pens={pens} hiddenPens={hiddenPens} penColor={penColor} valueAt={valueAt}
      onToggle={toggleHidden} onRemovePen={onRemovePen} />
  );
  const showEmpty = pens.length === 0 && emptyContent !== undefined;

  return (
    <div className={`trend-core ${frame ? 'trend-core--framed ' : ''}${className}`} data-testid="trend-core">
      {frame ? (
        // CHG-175 (owner's design): the legend exactly as before, the page's tools, the zoom tools at the right end.
        <div className="trend-core__head" data-testid="trend-head">
          {legend}
          <div className="trend-core__head-end">
            {frame.headTools}
            {frame.headTools && <span className="cpm-hist-sep" aria-hidden="true" />}
            <ChartZoomBar box={box} hasData={hasData} />
          </div>
        </div>
      ) : legend}

      <div
        ref={canvasRef}
        className="trend-core__canvas"
        data-axes={Array.isArray(option.yAxis) ? option.yAxis.length : 1}
        data-pens={pens.length}
        data-zoom={`${box.zoom.x.start.toFixed(1)}-${box.zoom.x.end.toFixed(1)}`}
        // Double-click clears a retained cursor and returns the legend to the latest sample.
        onDoubleClick={() => setCursorTs(null)}
      >
        {!frame && failed.length > 0 && (
          <div style={{
            color: 'var(--alert-caution-color)',
            fontSize: '0.75rem',
            padding: '2px 8px',
          }}>
            {/* P2-23 - a failed history fetch used to render as an empty series,
                indistinguishable from real emptiness. */}
            {failed.length} pen(s) failed to load:{' '}
            {failed.join(', ')} - values shown may be incomplete
          </div>
        )}
        {showEmpty ? (
          <div className="trend-core__empty">{emptyContent}</div>
        ) : (
          <ReactECharts
            option={option}
            style={{ width: '100%', height: '100%' }}
            notMerge
            lazyUpdate
            onChartReady={onChartReady}
            onEvents={onEvents}
          />
        )}
      </div>

      {frame?.state && (
        <TrendFoot state={frame.state} zoneName={frame.zoneName} zoomed={box.zoomed} failed={failed} />
      )}
      {!frame && !showTimeBar && showZoomBar && (
        <div className="trend-core__bar" data-testid="trend-zoombar">
          <span className="trend-core__clock">{fmtClock(windowStart)}</span>
          <ChartZoomBar box={box} hasData={hasData} live={controlledLive} />
          <span className="trend-core__clock">{fmtClock(windowEnd)}</span>
        </div>
      )}
      {!frame && showTimeBar && (
        <TrendTimeBar
          windowStart={windowStart} windowEnd={windowEnd} fmtClock={fmtClock}
          rangeMs={rangeMs} live={live} playing={playing}
          onRange={ms => { setRangeMs(ms); box.reset(); }}
          onStep={step}
          onTogglePlay={togglePlay}
          onNow={() => { setLive(true); setPlaying(true); setEndTs(0); box.reset(); }}
          box={box} hasData={hasData} sampleFresh={sampleFresh} hasPens={pens.length > 0}
        />
      )}
    </div>
  );
};

export default TrendCore;
