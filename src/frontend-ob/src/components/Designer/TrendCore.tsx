'use client';

// Phase J — the trend engine, extracted from Phase C's TrendChart so it can be driven by a plain
// list of tags instead of a CanvasItem. Same machinery as Phase C (historian fetch + MQTT live tail,
// time-bar with live/historical stepping, echarts cross-cursor, dataZoom, --ams-pen-* tokens); the
// only additions are PI-Vision presentation: per-pen Y-axes and a legend that reads each pen's value
// at the cursor. Consumed by: TrendChart (canvas symbol), TrendDialog (ad-hoc), TrendPage (/trend).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useMqttStore, getLiveSeries } from '../../store/mqttStore';
import { useDisplayTimeStore, formatInZone } from '../../store/timeStore';

export interface PenSpec {
  /** UNS path, e.g. houston/crude1/pump101.speed */
  path: string;
  label?: string;
  // Phase 6 — per-trace styling (E1.2–E1.4). All optional; defaults reproduce the prior look exactly.
  color?: string;                                   // overrides the auto-assigned pen token
  lineWidth?: number;                               // default 1.5
  lineStyle?: 'solid' | 'dashed' | 'dotted';        // default solid
  showMarkers?: boolean;                            // default false
  hidden?: boolean;                                 // initial hidden state (clickable legend, E1.17)
  /** Authoritative unit from the asset catalog / per-item UOM override; falls back to the name guess. */
  unitOverride?: string;
}

interface Pen extends PenSpec {
  label: string;
  unit: string;
  iotSeries?: string;    // root.<site>.<unit>.<device>
  measurement?: string;  // metric
  liveKey?: string;      // device/metric (matches the mqtt ring-buffer key)
}

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

/** Least-squares fit over [ts,value] points → the two window-spanning endpoints, or null if degenerate. */
function regressionLine(pts: Array<{ ts: number; value: number }>): Array<[number, number]> | null {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of pts) { sx += p.ts; sy += p.value; sxy += p.ts * p.value; sxx += p.ts * p.ts; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const x0 = pts[0].ts, x1 = pts[n - 1].ts;
  return [[x0, slope * x0 + intercept], [x1, slope * x1 + intercept]];
}

// Phase H tokens — echarts renders to canvas and can't consume var(), so resolve to a concrete
// color (this also resolves the nested --ams-pen-1 → --ams-crit, so ONE token drives alarms and pen 1).
const PEN_TOKENS = ['--ams-pen-1', '--ams-pen-2', '--ams-pen-3', '--ams-pen-4', '--ams-pen-5', '--ams-pen-6'];
function resolveColor(cssColor: string): string {
  if (typeof document === 'undefined') return cssColor;
  const el = document.createElement('span');
  el.style.color = cssColor;
  el.style.display = 'none';
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c || cssColor;
}

/** The active OpenBridge theme (data-obc-theme). Changing it must re-resolve the chart's colors. */
function useObcTheme(): string {
  const [theme, setTheme] = useState(() =>
    (typeof document === 'undefined' ? 'day' : document.documentElement.getAttribute('data-obc-theme') ?? 'day'));
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setTheme(root.getAttribute('data-obc-theme') ?? 'day'));
    obs.observe(root, { attributes: true, attributeFilter: ['data-obc-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

// Test marker: lets automated checks confirm which build of this module the page actually loaded.
(globalThis as unknown as { __trendCoreBuild?: string }).__trendCoreBuild = 'J1';

export const RANGES = [
  { label: '15m', ms: 15 * 60_000 },
  { label: '1h', ms: 60 * 60_000 },
  { label: '8h', ms: 8 * 60 * 60_000 },
  { label: '1d', ms: 24 * 60 * 60_000 },
  { label: '1w', ms: 7 * 24 * 60 * 60_000 },
];

/** Engineering unit for a measurement (the UNS catalog carries no unit field today). */
const UNITS: Array<[RegExp, string]> = [
  [/level|position|opening|pct|percent/i, '%'],
  [/speed|rpm/i, 'RPM'],
  [/press/i, 'PSI'],
  [/temp/i, '°C'],
  [/current|amp/i, 'A'],
  [/flow/i, 'm³/h'],
  [/vibration/i, 'mm/s'],
];
function unitFor(measurement?: string): string {
  if (!measurement) return '';
  return UNITS.find(([re]) => re.test(measurement))?.[1] ?? '';
}

function splitIoTPath(iotDbPath?: string): { series?: string; measurement?: string } {
  if (!iotDbPath) return {};
  const dot = iotDbPath.lastIndexOf('.');
  if (dot < 0) return { series: iotDbPath };
  return { series: iotDbPath.slice(0, dot), measurement: iotDbPath.slice(dot + 1) };
}

const CLOCK_OPTS: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
// Axis ticks are terser (no date) when the visible window is under a day.
const AXIS_OPTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };

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

  const [rangeMs, setRangeMs] = useState(initialRangeMs);
  const [live, setLive] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [endTs, setEndTs] = useState(() => 0); // 0 = "now"; set when paused/scrubbed
  const [cursorTs, setCursorTs] = useState<number | null>(null);
  const [zoomPct, setZoomPct] = useState({ start: 0, end: 100 });
  // "Now" for the live window. It only moves on the 2s tick (below) — deriving it from Date.now() in
  // the render body made the window jump on every mousemove.
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [, forceTick] = useState(0);

  const fetchTrend = useMqttStore(s => s.fetchTrend);
  const connect = useMqttStore(s => s.connect);
  const histRef = useRef<Record<string, { ts: number; value: number }[]>>({});
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

  // The window end must only advance on a LIVE TICK — not on every render.
  //
  // It used to be `live && !endTs ? Date.now() : …`, recomputed in the render body and baked into
  // xAxis.min/max. Every render (a mousemove over the chart, a zoom event, the 2s tick) produced a new
  // option, which <ReactECharts notMerge> re-applied with setOption(…, /*notMerge*/ true) — discarding
  // the chart's internal state. Two visible bugs: zooming into a spike snapped straight back to
  // 0–100%, and ⏸ Pause didn't freeze anything (the window still scrolled on mouse movement).
  // Follow "now" only while live AND playing; otherwise the window is pinned (paused or scrubbed).
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
      } catch { return []; }
    })).then(results => {
      if (cancelled) return;
      const map: Record<string, { ts: number; value: number }[]> = {};
      pens.forEach((pen, i) => { map[pen.path] = results[i]; });
      histRef.current = map;
      forceTick(t => t + 1);
    });
    return () => { cancelled = true; };
    // re-fetch when the window span/bounds change (fetchKey), the pens change, or fetchTrend changes
  }, [pens, fetchKey, fetchTrend]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live tick — advance the window and pull fresh samples from the MQTT ring-buffer.
  // Skipped when an external window drives the chart: that window advances on its own cadence and its
  // change re-renders this component (which re-reads the ring buffer for the tail).
  useEffect(() => {
    if (isControlled || !live || !playing) return;
    const id = setInterval(() => { setNowTs(Date.now()); forceTick(t => t + 1); }, 2000);
    return () => clearInterval(id);
  }, [isControlled, live, playing]);

  // Theme colors: resolved ONCE per theme, not 9× per render.
  // resolveColor() appends a span, forces a style flush via getComputedStyle, then removes it. It used
  // to run in the render body — i.e. on every 2s tick, every mousemove over the chart and every zoom
  // event, for 6 pens + 3 chrome tokens.
  const theme = useObcTheme();
  const { penColors, cText, cBorder, cGrid } = useMemo(() => ({
    penColors: PEN_TOKENS.map(t => resolveColor(`var(${t})`)),
    cText: resolveColor('var(--ams-text-dim)'),
    cBorder: resolveColor('var(--ams-border)'),
    cGrid: resolveColor('var(--ams-grid-line)'),
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

  // Manual Y scale (E1.8/E1.10): when scale.auto === false, pin the axis bounds (either bound may be
  // left undefined to keep that side auto).
  const manualScale = !!scale && scale.auto === false;
  const yBounds = manualScale ? { min: scale!.min, max: scale!.max, scale: false } : { scale: true };

  // Per-pen Y-axis (PI Vision) when units differ, unless explicitly overridden.
  const distinctUnits = new Set(pens.map(p => p.unit));
  const perAxis = multiAxis ?? (pens.length > 1 && distinctUnits.size > 1);

  const yAxis = perAxis
    // Per-pen axes carry different units, so a single manual min/max can't apply to all of them — keep
    // autoscale for the multi-axis case; manual scale only makes sense on the single shared axis.
    ? pens.map((_pen, i) => ({
        type: 'value' as const, scale: true, position: 'left' as const, offset: i * 44,
        axisLabel: { color: penColor(i), fontSize: 10 },
        axisLine: { show: true, lineStyle: { color: penColor(i) } },
        splitLine: { show: i === 0, lineStyle: { color: cGrid } },
      }))
    : [{
        type: 'value' as const, ...yBounds,
        axisLabel: { color: cText, fontSize: 10 },
        splitLine: { lineStyle: { color: cGrid } },
      }];

  const dashFor = (s?: string) => (s === 'dashed' ? 'dashed' : s === 'dotted' ? 'dotted' : 'solid');
  const series = pens.map((pen, i) => ({
    name: pen.label,
    type: 'line' as const,
    // Markers per-trace (E1.3); default off — same as before.
    showSymbol: pen.showMarkers ?? false,
    symbolSize: 4,
    smooth: false,
    // Stepped plotting (E1.22) applies chart-wide.
    step: stepped ? ('end' as const) : (false as const),
    lineStyle: { width: pen.lineWidth ?? 1.5, type: dashFor(pen.lineStyle) },
    color: penColor(i),
    yAxisIndex: perAxis ? i : 0,
    // Clickable-legend hide (E1.17): a hidden pen draws nothing but keeps its legend row.
    data: hiddenPens.has(pen.path) ? [] : penData[i].map(p => [p.ts, p.value]),
  }));

  // Phase 8 (E1.12) — one dashed least-squares regression line per visible pen.
  const regressionSeries = regression ? pens.flatMap((pen, i) => {
    if (hiddenPens.has(pen.path)) return [];
    const line = regressionLine(penData[i]);
    if (!line) return [];
    return [{
      name: `${pen.label} (fit)`,
      type: 'line' as const,
      showSymbol: false,
      lineStyle: { width: 1, type: 'dashed' as const, opacity: 0.75 },
      color: penColor(i),
      yAxisIndex: perAxis ? i : 0,
      data: line,
      silent: true,
      z: 1,
    }];
  }) : [];

  const option = {
    animation: false,
    grid: { left: perAxis ? 30 + pens.length * 44 : 52, right: 14, top: 12, bottom: 48 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', label: { backgroundColor: cBorder } },
      valueFormatter: (v: number) => (typeof v === 'number' ? v.toFixed(2) : v),
    },
    xAxis: {
      type: 'time', min: windowStart, max: windowEnd,
      axisLabel: {
        color: cText, fontSize: 10,
        // Render ticks in the display timezone (echarts defaults to the client's local zone).
        formatter: (value: number) => formatInZone(value, tz, AXIS_OPTS),
      },
      axisLine: { lineStyle: { color: cBorder } },
    },
    yAxis,
    // Carry the current zoom window in the option. <ReactECharts notMerge> re-applies the option on
    // every change, which resets any component state that isn't in it — so without start/end here the
    // user's zoom was thrown away the moment anything re-rendered.
    dataZoom: [
      { type: 'inside', filterMode: 'none', start: zoomPct.start, end: zoomPct.end },
      {
        type: 'slider', height: 16, bottom: 6, filterMode: 'none',
        start: zoomPct.start, end: zoomPct.end,
        textStyle: { color: cText, fontSize: 9 },
      },
    ],
    series: [...series, ...regressionSeries],
  };

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
      {/* Legend — pen name + value-at-cursor + unit (PI Vision reads the cursor, not just the last point) */}
      <div className="trend-core__legend" data-testid="trend-legend">
        {pens.map((pen, i) => {
          const v = valueAt(i);
          const isHidden = hiddenPens.has(pen.path);
          return (
            <div
              key={pen.path}
              className="trend-core__pen"
              data-pen={pen.path}
              data-hidden={isHidden || undefined}
              title={`${pen.path} — click to ${isHidden ? 'show' : 'hide'}`}
              // Clickable legend: toggle this trace's visibility (E1.17).
              onClick={() => toggleHidden(pen.path)}
              style={{ cursor: 'pointer', opacity: isHidden ? 0.4 : 1 }}
            >
              <span className="trend-core__swatch" style={{ background: penColor(i) }} />
              <span className="trend-core__pen-label" style={isHidden ? { textDecoration: 'line-through' } : undefined}>{pen.label}</span>
              <span className="trend-core__pen-value" data-testid="pen-value">
                {v === undefined ? '--' : v.toFixed(2)}
              </span>
              <span className="trend-core__pen-unit">{pen.unit}</span>
              {onRemovePen && (
                <button className="trend-core__pen-x" onClick={(e) => { e.stopPropagation(); onRemovePen(pen.path); }} title="Remove pen">×</button>
              )}
            </div>
          );
        })}
        {pens.length === 0 && <div className="trend-core__pen-empty">No tags selected</div>}
      </div>

      <div
        ref={canvasRef}
        className="trend-core__canvas"
        data-axes={yAxis.length}
        data-pens={pens.length}
        data-zoom={`${zoomPct.start.toFixed(1)}-${zoomPct.end.toFixed(1)}`}
        // Double-click clears a retained cursor and returns the legend to the latest sample.
        onDoubleClick={() => setCursorTs(null)}
      >
        <ReactECharts
          option={option}
          style={{ width: '100%', height: '100%' }}
          notMerge
          lazyUpdate
          // Debug/test hook (mirrors window.__designer): lets automated checks read the live chart
          // option — axis count, dataZoom window — without reaching into echarts internals.
          onChartReady={(inst: unknown) => {
            (window as unknown as { __trend?: unknown }).__trend = inst;
          }}
          onEvents={{
            updateAxisPointer: (e: { axesInfo?: Array<{ axisDim?: string; value?: number }> }) => {
              const t = e.axesInfo?.find(a => a.axisDim === 'x')?.value;
              if (typeof t === 'number') setCursorTs(t);
            },
            // E1.13/E1.14 — the cursor is RETAINED when the pointer leaves the plot (was discarded on
            // globalout, so the legend snapped back to the latest sample the instant you moved away).
            // Double-click clears it (below) to return to "latest".
            datazoom: (e: { start?: number; end?: number; batch?: Array<{ start?: number; end?: number }> }) => {
              const z = e.batch?.[0] ?? e;
              if (typeof z.start === 'number' && typeof z.end === 'number') setZoomPct({ start: z.start, end: z.end });
            },
          }}
        />
      </div>

      {showTimeBar && (
        <div className="trend-core__bar" data-testid="trend-timebar">
          <span className="trend-core__clock">{fmtClock(windowStart)}</span>
          {RANGES.map(r => (
            <button
              key={r.ms}
              className={`trend-core__rbtn ${rangeMs === r.ms ? 'active' : ''}`}
              data-testid={`range-${r.label}`}
              // A new range means a new window — an old zoom selection no longer means anything.
              onClick={() => { setRangeMs(r.ms); setZoomPct({ start: 0, end: 100 }); }}
            >{r.label}</button>
          ))}
          <span className="trend-core__sep" />
          <button className="trend-core__rbtn" data-testid="trend-back" onClick={() => step(-1)} title="Step back">◀</button>
          <button className="trend-core__rbtn" data-testid="trend-play" onClick={togglePlay} title="Play/Pause" disabled={!live}>
            {playing && live ? '⏸' : '▶'}
          </button>
          <button className="trend-core__rbtn" data-testid="trend-fwd" onClick={() => step(1)} title="Step forward">▶▶</button>
          <button
            className={`trend-core__rbtn trend-core__now ${live ? 'active' : ''}`}
            data-testid="trend-now"
            onClick={() => { setLive(true); setPlaying(true); setEndTs(0); setZoomPct({ start: 0, end: 100 }); }}
            title="Jump to live"
          >Now</button>
          <span className="trend-core__clock" data-testid="trend-end">{fmtClock(windowEnd)}</span>
          <span className="trend-core__mode" data-testid="trend-mode">
            {live ? (playing ? 'LIVE' : 'PAUSED') : 'HISTORICAL'}
          </span>
        </div>
      )}
    </div>
  );
};

export default TrendCore;
