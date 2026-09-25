'use client';

// Phase J — the trend engine, extracted from Phase C's TrendChart so it can be driven by a plain
// list of tags instead of a CanvasItem. Same machinery as Phase C (historian fetch + MQTT live tail,
// time-bar with live/historical stepping, echarts cross-cursor, dataZoom, --ams-pen-* tokens); the
// only additions are PI-Vision presentation: per-pen Y-axes and a legend that reads each pen's value
// at the cursor. Consumed by: TrendChart (canvas symbol), TrendDialog (ad-hoc), TrendPage (/trend).
//
// 2026-09-20 (cpa-ui-fix-plan Phase 5): split into ./trend/* (support, option, legend, time bar)
// and given rectangle zoom. While "Zoom area" is on, the cursor readout and the live tick hold
// still, because each of them re-applies the option and would cancel the drag in progress.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useMqttStore, getLiveSeries } from '../../store/mqttStore';
import { useDisplayTimeStore, formatInZone } from '../../store/timeStore';
import { useObcTheme } from '../../hooks/useObcTheme';
import { useBoxZoom, useKeepSelecting } from '../charts/useBoxZoom';
import {
  AXIS_OPTS, CLOCK_OPTS, FETCH_FAILED, PEN_TOKENS, resolveColor, splitIoTPath, unitFor,
  type Pen, type PenSpec, type TrendPoint,
} from './trend/trendSupport';
import { buildTrendOption } from './trend/trendOption';
import { TrendLegend } from './trend/TrendLegend';
import { TrendTimeBar } from './trend/TrendTimeBar';

export type { PenSpec } from './trend/trendSupport';
export { RANGES } from './trend/trendSupport';

interface TrendCoreProps {
  pens: PenSpec[];
  /** Show the range/live time-bar. */
  showTimeBar?: boolean;
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
}

// Test marker: lets automated checks confirm which build of this module the page actually loaded.
(globalThis as unknown as { __trendCoreBuild?: string }).__trendCoreBuild = 'J1';

export const TrendCore: React.FC<TrendCoreProps> = ({
  pens: penSpecs,
  showTimeBar = true,
  multiAxis,
  initialRangeMs = 15 * 60_000,
  className = '',
  onRemovePen,
  controlledWindow,
  scale,
  stepped,
  regression,
}) => {
  const paths = useMemo(() => penSpecs.map(p => p.path), [penSpecs]);
  const { data: batch } = useBatchBindingResolver(paths, 'all');

  const pens: Pen[] = useMemo(() => {
    const resolved = (batch?.bindings ?? []) as Array<Record<string, unknown>>;
    return penSpecs.map((spec, i) => {
      const b = resolved[i] as
        | { live?: { sparkplugDevice?: string; sparkplugMetric?: string }; history?: { ioTDbPath?: string } }
        | undefined;
      const { series, measurement } = splitIoTPath(b?.history?.ioTDbPath);
      const dev = b?.live?.sparkplugDevice;
      const met = b?.live?.sparkplugMetric ?? measurement;
      return {
        ...spec,
        label: spec.label ?? spec.path.split('/').pop() ?? spec.path,
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

  // Display timezone (K18/M15) — reformats the clock labels AND the echarts time axis, so the trend
  // agrees with the time bar / time-series table instead of always showing the client's local zone.
  const tz = useDisplayTimeStore(s => s.tz);
  const fmtClock = React.useCallback((ms: number) => formatInZone(ms, tz, CLOCK_OPTS), [tz]);
  const fmtAxis = React.useCallback((ms: number) => formatInZone(ms, tz, AXIS_OPTS), [tz]);

  const [rangeMs, setRangeMs] = useState(initialRangeMs);
  const [live, setLive] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [endTs, setEndTs] = useState(() => 0); // 0 = "now"; set when paused/scrubbed
  const [cursorTs, setCursorTs] = useState<number | null>(null);
  // FE-04: the axis-pointer event fires per mousemove; each setCursorTs re-render
  // rebuilds the option object and re-applies it with setOption(notMerge). Coalesce
  // cursor updates to one per animation frame (last position wins).
  const cursorFrameRef = useRef(0);
  const pendingCursorTsRef = useRef<number | null>(null);
  // Rectangle / slider / wheel zoom, carried in the option (see ./trend/trendOption).
  const box = useBoxZoom({ hasY: true });
  // "Now" for the live window. It only moves on the 2s tick (below) — deriving it from Date.now() in
  // the render body made the window jump on every mousemove.
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [, forceTick] = useState(0);

  const fetchTrend = useMqttStore(s => s.fetchTrend);
  const connect = useMqttStore(s => s.connect);
  const histRef = useRef<Record<string, TrendPoint[]>>({});
  /** P2-23 - pens whose history fetch failed this cycle (shown as a warning). */
  const failedPensRef = useRef<string[]>([]);
  // Plot pixel width → historian decimation is sized to it (U9). Kept in a ref so a resize doesn't
  // trigger a refetch; the next window-change fetch simply uses the current width.
  const canvasRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(500);

  useEffect(() => { connect(); }, [connect]);

  // Track the plot's pixel width for decimation.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => { widthRef.current = Math.max(50, Math.round(el.clientWidth)) || 500; };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The window end must only advance on a LIVE TICK — not on every render (a mousemove over the
  // chart, a zoom event, the 2s tick all produce a new option, which <ReactECharts notMerge>
  // re-applies). Follow "now" only while live AND playing; otherwise the window is pinned.
  // When an external window is supplied it wins; otherwise the internal live/paused logic applies.
  const isControlled = !!controlledWindow;
  const controlledLive = controlledWindow?.live ?? false;
  const windowEnd = controlledWindow
    ? controlledWindow.end
    : ((live && playing) ? nowTs : (endTs || nowTs));
  const windowStart = controlledWindow ? controlledWindow.start : windowEnd - rangeMs;
  // History refetch key. In live mode the END advances continually and the ring-buffer tail fills the
  // leading edge, so we refetch only when the SPAN changes; in fixed mode either bound triggers it.
  const fetchKey = controlledWindow
    ? (controlledLive ? `cspan:${controlledWindow.end - controlledWindow.start}` : `cfix:${controlledWindow.start}:${controlledWindow.end}`)
    : (live ? `live:${rangeMs}` : `fix:${rangeMs}:${endTs}`);

  // Historical fetch per pen, on window/pen change (identical to Phase C).
  useEffect(() => {
    if (pens.length === 0) return;
    let cancelled = false;
    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    Promise.all(pens.map(async pen => {
      if (!pen.iotSeries || !pen.measurement) return [];
      try {
        const pts = await fetchTrend(pen.iotSeries, start, end, widthRef.current, pen.measurement);
        // The historian returns `null` for buckets with no samples. Number(null) === 0 (and 0 is
        // finite), so a plain Number() cast plotted every gap as a zero — drop empty buckets first.
        return pts
          .map(p => ({ ts: Number(p.ts), raw: (p as Record<string, unknown>)[pen.measurement!] }))
          .filter(p => p.raw !== null && p.raw !== undefined && p.raw !== '')
          .map(p => ({ ts: p.ts, value: Number(p.raw) }))
          .filter(p => Number.isFinite(p.value));
      } catch {
        // P2-23 - swallowing this made a failed pen render as an empty series,
        // indistinguishable from "no data": one pen silently vanished while its
        // siblings plotted. Mark it so the chart can say so.
        return FETCH_FAILED;
      }
    })).then(results => {
      if (cancelled) return;
      const map: Record<string, TrendPoint[]> = {};
      const failed: string[] = [];
      pens.forEach((pen, i) => {
        if (results[i] === FETCH_FAILED) {
          map[pen.path] = [];
          failed.push(pen.label || pen.measurement || pen.path);
        } else {
          map[pen.path] = results[i] as TrendPoint[];
        }
      });
      histRef.current = map;
      failedPensRef.current = failed;
      forceTick(t => t + 1);
    });
    return () => { cancelled = true; };
    // re-fetch when the window span/bounds change (fetchKey), the pens change, or fetchTrend changes
  }, [pens, fetchKey, fetchTrend]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live tick — advance the window and pull fresh samples from the MQTT ring-buffer.
  // Skipped when an external window drives the chart, and while a zoom rectangle is being drawn
  // (the re-applied option would cancel the drag).
  useEffect(() => {
    if (isControlled || !live || !playing || box.selecting) return;
    const id = setInterval(() => { setNowTs(Date.now()); forceTick(t => t + 1); }, 2000);
    return () => clearInterval(id);
  }, [isControlled, live, playing, box.selecting]);

  // Theme colors: resolved ONCE per theme, not 9× per render.
  const theme = useObcTheme();
  const { penColors, cText, cBorder, cGrid } = useMemo(() => ({
    penColors: PEN_TOKENS.map(t => resolveColor(`var(${t})`)),
    cText: resolveColor('var(--ams-text-dim)'),
    cBorder: resolveColor('var(--ams-border)'),
    cGrid: resolveColor('var(--ams-grid-line)'),
    // theme is intentionally a dep: chart colors re-derive on theme change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [theme]);

  // Merged (history + live tail) data per pen — also what the legend reads at the cursor.
  // Tail while live: internally live, or externally live when a window is driving us.
  const tailing = isControlled ? controlledLive : live;
  const penData = pens.map(pen => {
    const hist = histRef.current[pen.path] ?? [];
    const lastHistTs = hist.length ? hist[hist.length - 1].ts : 0;
    const liveTail = tailing && pen.liveKey
      ? getLiveSeries(pen.liveKey, windowStart).filter(p => p.ts > lastHistTs).map(p => ({ ts: p.ts, value: p.v }))
      : [];
    return hist.concat(liveTail);
  });

  // Effective per-pen colour: an explicit per-trace colour (E1.2) wins over the auto-assigned token.
  const penColor = (i: number) => {
    const c = pens[i]?.color;
    return c ? resolveColor(c) : penColors[i % penColors.length];
  };

  // Per-pen Y-axis (PI Vision) when units differ, unless explicitly overridden.
  const distinctUnits = new Set(pens.map(p => p.unit));
  const perAxis = multiAxis ?? (pens.length > 1 && distinctUnits.size > 1);
  const manualScale = scale && scale.auto === false ? { min: scale.min, max: scale.max } : null;

  const option = buildTrendOption({
    pens, penData, hiddenPens, penColor, colors: { cText, cBorder, cGrid }, perAxis, manualScale,
    stepped, regression, windowStart, windowEnd, fmtAxis, zoom: box.zoom,
  });
  useKeepSelecting(box, option);
  const hasData = penData.some(d => d.length > 0);

  /** value of a pen at the cursor timestamp (nearest sample), else its latest sample */
  const valueAt = (i: number): number | undefined => {
    const data = penData[i];
    if (!data.length) return undefined;
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

  return (
    <div className={`trend-core ${className}`} data-testid="trend-core">
      <TrendLegend pens={pens} hiddenPens={hiddenPens} penColor={penColor} valueAt={valueAt}
        onToggle={toggleHidden} onRemovePen={onRemovePen} />

      <div
        ref={canvasRef}
        className="trend-core__canvas"
        data-axes={Array.isArray(option.yAxis) ? option.yAxis.length : 1}
        data-pens={pens.length}
        data-zoom={`${box.zoom.x.start.toFixed(1)}-${box.zoom.x.end.toFixed(1)}`}
        // Double-click clears a retained cursor and returns the legend to the latest sample.
        onDoubleClick={() => setCursorTs(null)}
      >
        {failedPensRef.current.length > 0 && (
          <div style={{
            color: 'var(--alert-caution-color)',
            fontSize: '0.75rem',
            padding: '2px 8px',
          }}>
            {/* P2-23 - a failed history fetch used to render as an empty series,
                indistinguishable from real emptiness. */}
            {failedPensRef.current.length} pen(s) failed to load:{' '}
            {failedPensRef.current.join(', ')} - values shown may be incomplete
          </div>
        )}
        <ReactECharts
          option={option}
          style={{ width: '100%', height: '100%' }}
          notMerge
          lazyUpdate
          // Debug/test hook (mirrors window.__designer): lets automated checks read the live chart
          // option — axis count, dataZoom window — without reaching into echarts internals.
          onChartReady={(inst: unknown) => {
            (window as unknown as { __trend?: unknown }).__trend = inst;
            box.onChartReady(inst as Parameters<typeof box.onChartReady>[0]);
          }}
          onEvents={{
            updateAxisPointer: (e: { axesInfo?: Array<{ axisDim?: string; value?: number }> }) => {
              // A cursor re-render would re-apply the option and cancel a zoom rectangle in progress.
              if (box.selecting) return;
              const t = e.axesInfo?.find(a => a.axisDim === 'x')?.value;
              if (typeof t !== 'number') return;
              // rAF-throttled (see cursorFrameRef note above).
              pendingCursorTsRef.current = t;
              if (!cursorFrameRef.current) {
                cursorFrameRef.current = requestAnimationFrame(() => {
                  cursorFrameRef.current = 0;
                  if (pendingCursorTsRef.current != null) setCursorTs(pendingCursorTsRef.current);
                });
              }
            },
            // E1.13/E1.14 — the cursor is RETAINED when the pointer leaves the plot; double-click
            // clears it (above) to return to "latest".
            datazoom: box.onDataZoom,
          }}
        />
      </div>

      {showTimeBar && (
        <TrendTimeBar
          windowStart={windowStart} windowEnd={windowEnd} fmtClock={fmtClock}
          rangeMs={rangeMs} live={live} playing={playing}
          onRange={ms => { setRangeMs(ms); box.reset(); }}
          onStep={step}
          onTogglePlay={togglePlay}
          onNow={() => { setLive(true); setPlaying(true); setEndTs(0); box.reset(); }}
          box={box} hasData={hasData}
        />
      )}
    </div>
  );
};

export default TrendCore;
