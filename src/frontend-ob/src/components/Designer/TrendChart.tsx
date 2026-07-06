'use client';

// Phase C — interactive trend. Renders one or more bound tags (pens) as live+historical
// time-series with a shared time-bar (range presets, live "now", play/pause, back/forward),
// cursor value-at-time readout, zoom/pan, legend and autoscale. Historical comes from the
// historian (IoTDB via /api/hist/trend); live is appended from the MQTT ring-buffer.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { CanvasItem } from './types';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useMqttStore, getLiveSeries } from '../../store/mqttStore';

interface TrendChartProps {
  item: CanvasItem;
  mode: 'design' | 'preview';
}

interface Pen {
  slot: string;
  path: string;
  label: string;
  iotSeries?: string;    // root.<site>.<unit>.<device>
  measurement?: string;  // metric
  liveKey?: string;      // device/metric (matches mqtt buffer key)
}

const PEN_COLORS = ['#4f9cff', '#40c057', '#fab005', '#e64980', '#7048e8', '#20c997'];
const RANGES = [
  { label: '5m', ms: 5 * 60_000 },
  { label: '15m', ms: 15 * 60_000 },
  { label: '1h', ms: 60 * 60_000 },
  { label: '6h', ms: 6 * 60 * 60_000 },
];

function splitIoTPath(iotDbPath?: string): { series?: string; measurement?: string } {
  if (!iotDbPath) return {};
  const dot = iotDbPath.lastIndexOf('.');
  if (dot < 0) return { series: iotDbPath };
  return { series: iotDbPath.slice(0, dot), measurement: iotDbPath.slice(dot + 1) };
}

export const TrendChart: React.FC<TrendChartProps> = ({ item, mode }) => {
  // Pens = every binding slot that carries a UNS path.
  const bindings = item.bindings ?? {};
  const penPaths = useMemo(
    () => Object.entries(bindings).filter(([, p]) => typeof p === 'string' && p.includes('/')),
    [bindings],
  );
  const paths = penPaths.map(([, p]) => p);
  const { data: batch } = useBatchBindingResolver(paths, 'all');

  const pens: Pen[] = useMemo(() => {
    const resolved = (batch?.bindings ?? []) as Array<Record<string, unknown>>;
    return penPaths.map(([slot, path], i) => {
      const b = resolved[i] as { live?: { sparkplugDevice?: string; sparkplugMetric?: string }; history?: { ioTDbPath?: string } } | undefined;
      const { series, measurement } = splitIoTPath(b?.history?.ioTDbPath);
      const dev = b?.live?.sparkplugDevice;
      const met = b?.live?.sparkplugMetric ?? measurement;
      return {
        slot, path,
        label: path.split('/').pop() ?? slot,
        iotSeries: series,
        measurement,
        liveKey: dev && met ? `${dev}/${met}` : undefined,
      };
    });
  }, [batch, penPaths]);

  const [rangeMs, setRangeMs] = useState(15 * 60_000);
  const [live, setLive] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [endTs, setEndTs] = useState(() => 0); // 0 = "now"; set when paused/scrubbed
  const [, forceTick] = useState(0);

  const fetchTrend = useMqttStore(s => s.fetchTrend);
  const connect = useMqttStore(s => s.connect);
  const histRef = useRef<Record<string, { ts: number; value: number }[]>>({});

  useEffect(() => { if (mode === 'preview') connect(); }, [mode, connect]);

  const windowEnd = live && !endTs ? Date.now() : (endTs || Date.now());
  const windowStart = windowEnd - rangeMs;

  // Fetch historical for each pen when the window/pens change.
  useEffect(() => {
    if (mode !== 'preview' || pens.length === 0) return;
    let cancelled = false;
    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    Promise.all(pens.map(async pen => {
      if (!pen.iotSeries || !pen.measurement) return [];
      try {
        const pts = await fetchTrend(pen.iotSeries, start, end, 300, pen.measurement);
        return pts.map(p => ({ ts: Number(p.ts), value: Number((p as Record<string, unknown>)[pen.measurement!]) }))
                  .filter(p => Number.isFinite(p.value));
      } catch { return []; }
    })).then(results => {
      if (cancelled) return;
      const map: Record<string, { ts: number; value: number }[]> = {};
      pens.forEach((pen, i) => { map[pen.slot] = results[i]; });
      histRef.current = map;
      forceTick(t => t + 1);
    });
    return () => { cancelled = true; };
    // re-fetch when range, pens, or (in historical/paused) the fixed end changes
  }, [mode, pens, rangeMs, live ? 0 : endTs, fetchTrend]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live tick: advance the window and pull fresh samples from the MQTT buffer.
  useEffect(() => {
    if (mode !== 'preview' || !live || !playing) return;
    const id = setInterval(() => forceTick(t => t + 1), 2000);
    return () => clearInterval(id);
  }, [mode, live, playing]);

  const series = pens.map((pen, i) => {
    const hist = histRef.current[pen.slot] ?? [];
    const lastHistTs = hist.length ? hist[hist.length - 1].ts : 0;
    const liveTail = live && pen.liveKey
      ? getLiveSeries(pen.liveKey, windowStart).filter(p => p.ts > lastHistTs).map(p => ({ ts: p.ts, value: p.v }))
      : [];
    const data = hist.concat(liveTail).map(p => [p.ts, p.value]);
    return {
      name: pen.label,
      type: 'line' as const,
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 1.5 },
      color: PEN_COLORS[i % PEN_COLORS.length],
      data,
    };
  });

  const option = {
    animation: false,
    grid: { left: 46, right: 12, top: 30, bottom: 46 },
    legend: { top: 2, textStyle: { color: '#cbd5e1', fontSize: 11 }, itemHeight: 8 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', label: { backgroundColor: '#334155' } },
      valueFormatter: (v: number) => (typeof v === 'number' ? v.toFixed(2) : v),
    },
    xAxis: {
      type: 'time', min: windowStart, max: windowEnd,
      axisLabel: { color: '#94a3b8', fontSize: 10 }, axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis: {
      type: 'value', scale: true,
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
    },
    dataZoom: [
      { type: 'inside', filterMode: 'none' },
      { type: 'slider', height: 16, bottom: 6, filterMode: 'none',
        textStyle: { color: '#94a3b8', fontSize: 9 } },
    ],
    series,
  };

  if (mode !== 'preview') {
    return (
      <div className="trend-chart trend-chart--design">
        <div className="trend-chart__design-label">📈 Trend</div>
        <div className="trend-chart__design-pens">{pens.map(p => p.label).join(' · ') || 'bind tag(s)'}</div>
      </div>
    );
  }

  const step = (dir: number) => {
    setLive(false);
    setPlaying(false);
    setEndTs(prev => (prev || Date.now()) + dir * rangeMs * 0.5);
  };

  return (
    <div className="trend-chart">
      <div className="trend-chart__bar">
        {RANGES.map(r => (
          <button
            key={r.ms}
            className={`trend-chart__rbtn ${rangeMs === r.ms ? 'active' : ''}`}
            onClick={() => setRangeMs(r.ms)}
          >{r.label}</button>
        ))}
        <span className="trend-chart__sep" />
        <button className="trend-chart__rbtn" onClick={() => step(-1)} title="Back">◀</button>
        <button
          className={`trend-chart__rbtn ${live ? 'active' : ''}`}
          onClick={() => { setLive(true); setPlaying(true); setEndTs(0); }}
          title="Jump to live"
        >Live</button>
        <button className="trend-chart__rbtn" onClick={() => setPlaying(p => !p)} title="Play/Pause" disabled={!live}>
          {playing && live ? '⏸' : '▶'}
        </button>
        <button className="trend-chart__rbtn" onClick={() => step(1)} title="Forward">▶▶</button>
      </div>
      <div className="trend-chart__canvas">
        <ReactECharts option={option} style={{ width: '100%', height: '100%' }} notMerge lazyUpdate />
      </div>
    </div>
  );
};

export default TrendChart;
