// Phase 3 — the `chart.bar` symbol, bound to real data (replaces the former hardcoded mock array).
// One bar per bound data source (every binding slot that carries a UNS path), exactly like the trend
// derives one pen per bound path. Values are live (MQTT snapshot/DDATA); colour follows alarm limits.
import React, { useMemo } from 'react';
import type { CanvasItem } from './types';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useAssetSearch } from '../../hooks/useAssetSearch';
import { useMqttStore } from '../../store/mqttStore';
import { getValueColor, OBC } from './openBridgeTheme';

interface Source { slot: string; path: string; label: string; }

function sourcesFromItem(item: CanvasItem): Source[] {
  return Object.entries(item.bindings ?? {})
    .filter(([, p]) => typeof p === 'string' && p.includes('/'))
    .map(([slot, path]) => ({ slot, path: path as string, label: (path as string).split('/').pop() ?? slot }));
}

export const BarChart: React.FC<{ item: CanvasItem; mode: 'design' | 'preview' }> = ({ item, mode }) => {
  const staticSources = useMemo(() => sourcesFromItem(item), [item]);

  // Dynamic search criteria (§J): when a criteria + attribute is set, one bar per matching asset.
  const cfg = item.comparison;
  const attr = cfg?.attributes?.[0] ?? '';
  const dynamic = !!cfg && attr.length > 0;
  const { data: assets } = useAssetSearch(cfg?.criteria ?? {}, mode === 'preview' && dynamic);

  const sources = useMemo<Source[]>(() => (
    dynamic
      ? (assets ?? []).map(a => ({ slot: a.id, path: `${a.contextualPath}.${attr}`, label: a.name }))
      : staticSources
  ), [dynamic, assets, attr, staticSources]);

  const paths = useMemo(() => (mode === 'preview' ? sources.map(s => s.path) : []), [sources, mode]);
  const { data: batch } = useBatchBindingResolver(paths, 'live');
  const metrics = useMqttStore(s => s.metrics);

  if (mode !== 'preview') {
    return (
      <div className="symbol-barchart symbol-barchart--design">
        <div className="symbol-barchart__design-label">📊 Bar chart{dynamic ? ' · search' : ''}</div>
        <div className="symbol-barchart__design-pens">
          {dynamic ? `${cfg?.criteria.template || cfg?.criteria.root || 'assets'} · ${attr}` : staticSources.map(s => s.label).join(' · ')}
        </div>
      </div>
    );
  }

  if (sources.length === 0) {
    return <div className="symbol-barchart symbol-barchart--empty">📊 Bar chart — {dynamic ? 'no matching assets' : 'bind tag(s) or set a search'}</div>;
  }

  const resolved = (batch?.bindings ?? []) as Array<{ live?: { sparkplugDevice?: string; sparkplugMetric?: string } }>;
  const bars = sources.map((src, i) => {
    const b = resolved[i];
    const dev = b?.live?.sparkplugDevice, met = b?.live?.sparkplugMetric;
    const key = dev && met ? `${dev}/${met}` : undefined;
    const raw = key ? metrics.get(key)?.value : undefined;
    const value = typeof raw === 'number' ? raw : Number(raw);
    return { ...src, value: Number.isFinite(value) ? value : NaN };
  });

  const finite = bars.map(b => (Number.isFinite(b.value) ? b.value : 0));
  const max = Math.max(1, ...finite);
  const min = Math.min(0, ...finite);
  const span = max - min || 1;

  return (
    <div className="symbol-barchart">
      <div className="symbol-barchart__plot">
        {bars.map((b, i) => {
          const h = Number.isFinite(b.value) ? Math.max(2, ((b.value - min) / span) * 100) : 0;
          const color = Number.isFinite(b.value) ? getValueColor(b.value, item.alarmLimits) : OBC.textInactive;
          return (
            <div key={i} className="symbol-barchart__col" title={`${b.label}: ${Number.isFinite(b.value) ? b.value : '--'}`}>
              <div className="symbol-barchart__bar" style={{ height: `${h}%`, background: color }} />
              <span className="symbol-barchart__value">{Number.isFinite(b.value) ? b.value.toFixed(1) : '--'}</span>
              <span className="symbol-barchart__label">{b.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BarChart;
