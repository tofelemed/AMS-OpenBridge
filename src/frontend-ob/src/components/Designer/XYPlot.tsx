// Phase 3 — the `chart.xy` symbol, bound to real data (replaces the former hardcoded points).
// Correlates the X binding against the Y binding using the live sample ring-buffers: recent samples
// are paired by index into a scatter. Design mode shows a placeholder.
import React, { useMemo } from 'react';
import type { CanvasItem } from './types';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useMqttStore, getLiveSeries } from '../../store/mqttStore';
import { OBC } from './openBridgeTheme';

const MAX_POINTS = 60;

function liveKeyOf(b: { live?: { sparkplugDevice?: string; sparkplugMetric?: string } } | undefined): string | undefined {
  const dev = b?.live?.sparkplugDevice, met = b?.live?.sparkplugMetric;
  return dev && met ? `${dev}/${met}` : undefined;
}

export const XYPlot: React.FC<{ item: CanvasItem; mode: 'design' | 'preview' }> = ({ item, mode }) => {
  const xPath = item.bindings?.x;
  const yPath = item.bindings?.y;
  const paths = useMemo(
    () => (mode === 'preview' ? [xPath, yPath].filter((p): p is string => !!p) : []),
    [xPath, yPath, mode],
  );
  const { data: batch } = useBatchBindingResolver(paths, 'live');
  // Re-render as new live samples land.
  const metrics = useMqttStore(s => s.metrics);
  void metrics;

  if (!xPath || !yPath) {
    return <div className="symbol-xyplot symbol-xyplot--empty">📉 XY plot — bind X and Y tags</div>;
  }
  if (mode !== 'preview') {
    return (
      <div className="symbol-xyplot symbol-xyplot--design">
        <div className="symbol-xyplot__design-label">📉 XY plot</div>
        <div className="symbol-xyplot__design-pens">{`${xPath.split('/').pop()} × ${yPath.split('/').pop()}`}</div>
      </div>
    );
  }

  const resolved = (batch?.bindings ?? []) as Array<{ live?: { sparkplugDevice?: string; sparkplugMetric?: string } }>;
  const xKey = liveKeyOf(resolved[0]);
  const yKey = liveKeyOf(resolved[1]);
  const xs = xKey ? getLiveSeries(xKey) : [];
  const ys = yKey ? getLiveSeries(yKey) : [];
  const n = Math.min(xs.length, ys.length);
  const pts: { x: number; y: number }[] = [];
  for (let i = Math.max(0, n - MAX_POINTS); i < n; i++) pts.push({ x: xs[i].v, y: ys[i].v });

  if (pts.length === 0) {
    return <div className="symbol-xyplot symbol-xyplot--empty">📉 Waiting for X/Y samples…</div>;
  }

  const xMin = Math.min(...pts.map(p => p.x)), xMax = Math.max(...pts.map(p => p.x));
  const yMin = Math.min(...pts.map(p => p.y)), yMax = Math.max(...pts.map(p => p.y));
  const xSpan = xMax - xMin || 1, ySpan = yMax - yMin || 1;
  const sx = (x: number) => 4 + ((x - xMin) / xSpan) * 92;
  const sy = (y: number) => 96 - ((y - yMin) / ySpan) * 92;

  return (
    <div className="symbol-xyplot">
      <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none">
        <line x1="4" y1="96" x2="96" y2="96" stroke={OBC.textInactive} strokeWidth="0.5" />
        <line x1="4" y1="4" x2="4" y2="96" stroke={OBC.textInactive} strokeWidth="0.5" />
        {pts.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="1.4" fill={OBC.advisory} opacity={0.4 + 0.6 * (i / pts.length)} />
        ))}
      </svg>
    </div>
  );
};

export default XYPlot;
