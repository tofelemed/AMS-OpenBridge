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

export interface PenSpec {
  /** UNS path, e.g. houston/crude1/pump101.speed */
  path: string;
  label?: string;
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

const fmtClock = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const TrendCore: React.FC<TrendCoreProps> = ({
  pens: penSpecs,
  showTimeBar = true,
  multiAxis,
  initialRangeMs = 15 * 60_000,
  className = '',
  onRemovePen,
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
        unit: unitFor(met ?? measurement),
        iotSeries: series,
        measurement,
        liveKey: dev && met ? `${dev}/${met}` : undefined,
      };
    });
  }, [batch, penSpecs]);

  const [rangeMs, setRangeMs] = useState(initialRangeMs);
  const [live, setLive] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [endTs, setEndTs] = useState(() => 0); // 0 = "now"; set when paused/scrubbed
  const [cursorTs, setCursorTs] = useState<number | null>(null);
  const [zoomPct, setZoomPct] = useState({ start: 0, end: 100 });
  const [, forceTick] = useState(0);

  const fetchTrend = useMqttStore(s => s.fetchTrend);
  const connect = useMqttStore(s => s.connect);
  const histRef = useRef<Record<string, { ts: number; value: number }[]>>({});

  useEffect(() => { connect(); }, [connect]);

  const windowEnd = live && !endTs ? Date.now() : (endTs || Date.now());
  const windowStart = windowEnd - rangeMs;

  // Historical fetch per pen, on window/pen change (identical to Phase C).
  useEffect(() => {
    if (pens.length === 0) return;
    let cancelled = false;
    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    Promise.all(pens.map(async pen => {
      if (!pen.iotSeries || !pen.measurement) return [];
      try {
        const pts = await fetchTrend(pen.iotSeries, start, end, 500, pen.measurement);
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
    // re-fetch when range, pens, or (paused/historical) the fixed end changes
  }, [pens, rangeMs, live ? 0 : endTs, fetchTrend]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live tick — advance the window and pull fresh samples from the MQTT ring-buffer.
  useEffect(() => {
    if (!live || !playing) return;
    const id = setInterval(() => forceTick(t => t + 1), 2000);
    return () => clearInterval(id);
  }, [live, playing]);

  const penColors = PEN_TOKENS.map(t => resolveColor(`var(${t})`));
  const cText = resolveColor('var(--ams-text-dim)');
  const cBorder = resolveColor('var(--ams-border)');
  const cGrid = resolveColor('var(--ams-grid-line)');

  // Merged (history + live tail) data per pen — also what the legend reads at the cursor.
  const penData = pens.map(pen => {
    const hist = histRef.current[pen.path] ?? [];
    const lastHistTs = hist.length ? hist[hist.length - 1].ts : 0;
    const liveTail = live && pen.liveKey
      ? getLiveSeries(pen.liveKey, windowStart).filter(p => p.ts > lastHistTs).map(p => ({ ts: p.ts, value: p.v }))
      : [];
    return hist.concat(liveTail);
  });

  // Per-pen Y-axis (PI Vision) when units differ, unless explicitly overridden.
  const distinctUnits = new Set(pens.map(p => p.unit));
  const perAxis = multiAxis ?? (pens.length > 1 && distinctUnits.size > 1);

  const yAxis = perAxis
    ? pens.map((_pen, i) => ({
        type: 'value' as const, scale: true, position: 'left' as const, offset: i * 44,
        axisLabel: { color: penColors[i % penColors.length], fontSize: 10 },
        axisLine: { show: true, lineStyle: { color: penColors[i % penColors.length] } },
        splitLine: { show: i === 0, lineStyle: { color: cGrid } },
      }))
    : [{
        type: 'value' as const, scale: true,
        axisLabel: { color: cText, fontSize: 10 },
        splitLine: { lineStyle: { color: cGrid } },
      }];

  const series = pens.map((pen, i) => ({
    name: pen.label,
    type: 'line' as const,
    showSymbol: false,
    smooth: false,
    lineStyle: { width: 1.5 },
    color: penColors[i % penColors.length],
    yAxisIndex: perAxis ? i : 0,
    data: penData[i].map(p => [p.ts, p.value]),
  }));

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
      axisLabel: { color: cText, fontSize: 10 }, axisLine: { lineStyle: { color: cBorder } },
    },
    yAxis,
    dataZoom: [
      { type: 'inside', filterMode: 'none' },
      { type: 'slider', height: 16, bottom: 6, filterMode: 'none', textStyle: { color: cText, fontSize: 9 } },
    ],
    series,
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

  return (
    <div className={`trend-core ${className}`} data-testid="trend-core">
      {/* Legend — pen name + value-at-cursor + unit (PI Vision reads the cursor, not just the last point) */}
      <div className="trend-core__legend" data-testid="trend-legend">
        {pens.map((pen, i) => {
          const v = valueAt(i);
          return (
            <div key={pen.path} className="trend-core__pen" data-pen={pen.path} title={pen.path}>
              <span className="trend-core__swatch" style={{ background: penColors[i % penColors.length] }} />
              <span className="trend-core__pen-label">{pen.label}</span>
              <span className="trend-core__pen-value" data-testid="pen-value">
                {v === undefined ? '--' : v.toFixed(2)}
              </span>
              <span className="trend-core__pen-unit">{pen.unit}</span>
              {onRemovePen && (
                <button className="trend-core__pen-x" onClick={() => onRemovePen(pen.path)} title="Remove pen">×</button>
              )}
            </div>
          );
        })}
        {pens.length === 0 && <div className="trend-core__pen-empty">No tags selected</div>}
      </div>

      <div
        className="trend-core__canvas"
        data-axes={yAxis.length}
        data-pens={pens.length}
        data-zoom={`${zoomPct.start.toFixed(1)}-${zoomPct.end.toFixed(1)}`}
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
              setCursorTs(typeof t === 'number' ? t : null);
            },
            globalout: () => setCursorTs(null),
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
              onClick={() => setRangeMs(r.ms)}
            >{r.label}</button>
          ))}
          <span className="trend-core__sep" />
          <button className="trend-core__rbtn" data-testid="trend-back" onClick={() => step(-1)} title="Step back">◀</button>
          <button className="trend-core__rbtn" onClick={() => setPlaying(p => !p)} title="Play/Pause" disabled={!live}>
            {playing && live ? '⏸' : '▶'}
          </button>
          <button className="trend-core__rbtn" data-testid="trend-fwd" onClick={() => step(1)} title="Step forward">▶▶</button>
          <button
            className={`trend-core__rbtn trend-core__now ${live ? 'active' : ''}`}
            data-testid="trend-now"
            onClick={() => { setLive(true); setPlaying(true); setEndTs(0); }}
            title="Jump to live"
          >Now</button>
          <span className="trend-core__clock" data-testid="trend-end">{fmtClock(windowEnd)}</span>
          <span className="trend-core__mode" data-testid="trend-mode">{live ? 'LIVE' : 'HISTORICAL'}</span>
        </div>
      )}
    </div>
  );
};

export default TrendCore;
