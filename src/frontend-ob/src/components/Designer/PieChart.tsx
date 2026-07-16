// Phase 3 — the `chart.pie` symbol, bound to real data (replaces the former hardcoded wedges).
// One slice per bound numeric tag, sized proportional to its share of the total. A pie is a poor
// process-monitoring primitive under ISA-101, so slices use a single-hue opacity ramp (no spurious
// alarm colour); colour stays reserved for the abnormal surfaces.
import React, { useMemo } from 'react';
import type { CanvasItem } from './types';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useMqttStore } from '../../store/mqttStore';
import { OBC } from './openBridgeTheme';

interface Slice { label: string; value: number; }

function sourcesFromItem(item: CanvasItem): { slot: string; path: string; label: string }[] {
  return Object.entries(item.bindings ?? {})
    .filter(([, p]) => typeof p === 'string' && (p as string).includes('/'))
    .map(([slot, path]) => ({ slot, path: path as string, label: (path as string).split('/').pop() ?? slot }));
}

// Describe an SVG arc wedge from `a0` to `a1` radians on a unit circle centred at (50,50), r=46.
function wedgePath(a0: number, a1: number): string {
  const r = 46, cx = 50, cy = 50;
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

export const PieChart: React.FC<{ item: CanvasItem; mode: 'design' | 'preview' }> = ({ item, mode }) => {
  const sources = useMemo(() => sourcesFromItem(item), [item]);
  const paths = useMemo(() => (mode === 'preview' ? sources.map(s => s.path) : []), [sources, mode]);
  const { data: batch } = useBatchBindingResolver(paths, 'live');
  const metrics = useMqttStore(s => s.metrics);

  if (mode !== 'preview') {
    return (
      <div className="symbol symbol-pie symbol-pie--design">
        <div className="symbol-pie__design-label">🥧 Pie</div>
        <div className="symbol-pie__design-pens">{sources.map(s => s.label).join(' · ') || 'bind tag(s)'}</div>
      </div>
    );
  }
  if (sources.length === 0) {
    return <div className="symbol symbol-pie symbol-pie--empty">🥧 Pie — bind one or more tags</div>;
  }

  const resolved = (batch?.bindings ?? []) as Array<{ live?: { sparkplugDevice?: string; sparkplugMetric?: string } }>;
  const slices: Slice[] = sources.map((src, i) => {
    const b = resolved[i];
    const dev = b?.live?.sparkplugDevice, met = b?.live?.sparkplugMetric;
    const key = dev && met ? `${dev}/${met}` : undefined;
    const raw = key ? metrics.get(key)?.value : undefined;
    const v = typeof raw === 'number' ? raw : Number(raw);
    return { label: src.label, value: Number.isFinite(v) && v > 0 ? v : 0 };
  });

  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return <div className="symbol symbol-pie symbol-pie--empty">🥧 waiting for values…</div>;
  }

  let a = -Math.PI / 2; // start at 12 o'clock
  const wedges = slices.map((s, i) => {
    const frac = s.value / total;
    const a0 = a, a1 = a + frac * Math.PI * 2;
    a = a1;
    // Single-hue opacity ramp — distinguishes slices without introducing alarm colour.
    const opacity = 0.35 + 0.6 * (slices.length > 1 ? i / (slices.length - 1) : 1);
    return { d: wedgePath(a0, a1), opacity, pct: Math.round(frac * 100), label: s.label };
  });

  return (
    <div className="symbol symbol-pie">
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        {wedges.map((w, i) => (
          <path key={i} d={w.d} fill={OBC.advisory} fillOpacity={w.opacity} stroke={OBC.bg} strokeWidth="0.8">
            <title>{`${w.label}: ${w.pct}%`}</title>
          </path>
        ))}
      </svg>
    </div>
  );
};

export default PieChart;
