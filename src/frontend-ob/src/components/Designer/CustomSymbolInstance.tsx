// Phase 7 — renders a placed custom symbol (item.type === "custom:<id>") from its registered definition.
// Live slot values are resolved through the UNS (useBatchBindingResolver + MQTT snapshot), exactly like
// the built-in data symbols, so a custom symbol is a first-class citizen — no special binding path.
import React, { useMemo } from 'react';
import type { CanvasItem } from './types';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useMqttStore } from '../../store/mqttStore';
import { getCustomSymbol, renderTemplate } from './customSymbolRegistry';
import { formatValue } from './openBridgeTheme';

export const CustomSymbolInstance: React.FC<{ item: CanvasItem; mode: 'design' | 'preview' }> = ({ item, mode }) => {
  const def = getCustomSymbol(item.type);

  // Slot → bound path, for every slot the definition declares.
  const bound = useMemo(() => {
    const out: Array<{ slot: string; path: string }> = [];
    for (const s of def?.slots ?? []) {
      const p = item.bindings?.[s.name];
      if (typeof p === 'string' && p.includes('/')) out.push({ slot: s.name, path: p });
    }
    return out;
  }, [def, item.bindings]);

  const paths = useMemo(() => (mode === 'preview' ? bound.map(b => b.path) : []), [bound, mode]);
  const { data: batch } = useBatchBindingResolver(paths, 'all');
  const metrics = useMqttStore(s => s.metrics);

  if (!def) {
    return <div className="symbol symbol-custom symbol-custom--missing">⚠ Unknown custom symbol</div>;
  }

  const resolved = (batch?.bindings ?? []) as Array<{ live?: { sparkplugDevice?: string; sparkplugMetric?: string } }>;
  const values: Record<string, string | number | undefined> = {};
  bound.forEach((b, i) => {
    const dev = resolved[i]?.live?.sparkplugDevice, met = resolved[i]?.live?.sparkplugMetric;
    const key = dev && met ? `${dev}/${met}` : undefined;
    const raw = mode === 'preview' && key ? metrics.get(key)?.value : undefined;
    values[b.slot] = typeof raw === 'number'
      ? Number(formatValue(raw, item.formatting?.decimals ?? 1))
      : (raw as string | undefined) ?? (mode === 'preview' ? undefined : `{${b.slot}}`);
  });

  const svg = renderTemplate(def, values, item.style as Record<string, unknown> | undefined);
  return (
    <div
      className="symbol symbol-custom"
      style={{ width: '100%', height: '100%' }}
      // The template was sanitised (no script/handlers) at registration time.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export default CustomSymbolInstance;
