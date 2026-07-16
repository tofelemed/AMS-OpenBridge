// Phase 3 — the `chart.sparkline` symbol, bound to real data (replaces the former hardcoded polyline).
// Draws a mini line from the live sample ring-buffer of the `value` binding, exactly like the trend and
// XY plot read `getLiveSeries`. Colour stays neutral unless the latest sample is abnormal (ISA-101).
import React, { useMemo } from 'react';
import type { CanvasItem } from './types';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useMqttStore, getLiveSeries } from '../../store/mqttStore';
import { getValueColor, OBC } from './openBridgeTheme';

const MAX_POINTS = 80;

export const Sparkline: React.FC<{ item: CanvasItem; mode: 'design' | 'preview' }> = ({ item, mode }) => {
  const path = item.bindings?.value;
  const paths = useMemo(() => (mode === 'preview' && path ? [path] : []), [path, mode]);
  const { data: batch } = useBatchBindingResolver(paths, 'live');
  // Re-render as new live samples land.
  const metrics = useMqttStore(s => s.metrics);
  void metrics;

  if (!path) {
    return <div className="symbol symbol-sparkline symbol-sparkline--empty">〰️ bind a tag</div>;
  }
  if (mode !== 'preview') {
    // Design mode: a representative (grey) line so the symbol reads as a sparkline on the canvas.
    return (
      <div className="symbol symbol-sparkline">
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" width="100%" height="100%">
          <polyline points="0,20 15,18 30,22 45,15 60,20 75,12 90,18 100,10" fill="none"
            stroke={OBC.textInactive} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    );
  }

  const resolved = (batch?.bindings ?? []) as Array<{ live?: { sparkplugDevice?: string; sparkplugMetric?: string } }>;
  const dev = resolved[0]?.live?.sparkplugDevice, met = resolved[0]?.live?.sparkplugMetric;
  const key = dev && met ? `${dev}/${met}` : undefined;
  const pts = (key ? getLiveSeries(key) : []).slice(-MAX_POINTS);

  if (pts.length < 2) {
    return <div className="symbol symbol-sparkline symbol-sparkline--empty">〰️ waiting…</div>;
  }

  const ys = pts.map(p => p.v);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const ySpan = yMax - yMin || 1;
  const last = ys[ys.length - 1];
  const color = getValueColor(last, item.alarmLimits);
  const poly = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * 100;
    const y = 28 - ((p.v - yMin) / ySpan) * 26;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="symbol symbol-sparkline" title={`${path.split('/').pop()}: ${last}`}>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" width="100%" height="100%">
        <polyline points={poly} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
};

export default Sparkline;
