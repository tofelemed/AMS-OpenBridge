'use client';

// Phase C — the `chart.trend` canvas symbol. Phase J moved the engine into TrendCore (pens-driven,
// so a dialog/page can use the same chart); this file is now just the CanvasItem adapter:
// item.bindings → pens, plus the design-mode placeholder.
import React, { useMemo } from 'react';
import type { CanvasItem } from './types';
import TrendCore, { type PenSpec } from './TrendCore';
import { useDisplayTimeStore } from '../../store/timeStore';
import { useAssetMetadataBatch } from '../../hooks/useAssetMetadata';
import { canonicalUnit } from '../../utils/uom';

interface TrendChartProps {
  item: CanvasItem;
  mode: 'design' | 'preview';
}

/** Pens = every binding slot on the item that carries a UNS path. */
export function pensFromItem(item: CanvasItem): PenSpec[] {
  const bindings = item.bindings ?? {};
  return Object.entries(bindings)
    .filter(([, p]) => typeof p === 'string' && p.includes('/'))
    .map(([slot, path]) => ({ path: path as string, label: (path as string).split('/').pop() ?? slot }));
}

/** Pens for an arbitrary selection of symbols (Phase J: canvas selection → Trend action). Deduped. */
export function pensFromItems(items: CanvasItem[]): PenSpec[] {
  const seen = new Set<string>();
  const pens: PenSpec[] = [];
  for (const item of items) {
    for (const pen of pensFromItem(item)) {
      if (seen.has(pen.path)) continue;
      seen.add(pen.path);
      pens.push(pen);
    }
  }
  return pens;
}

export const TrendChart: React.FC<TrendChartProps> = ({ item, mode }) => {
  const basePens = useMemo(() => pensFromItem(item), [item]);

  // Follow the display time range by default (E1.23); 'own' keeps the trend's independent controls.
  const follow = item.timeMode !== 'own';
  const start = useDisplayTimeStore(s => s.start);
  const end = useDisplayTimeStore(s => s.end);
  const live = useDisplayTimeStore(s => s.live);

  // Phase 6 — authoritative units from the asset catalog (replaces TrendCore's name-guess) + per-trace
  // style pulled from item.trace, keyed by pen path.
  const paths = useMemo(() => basePens.map(p => p.path), [basePens]);
  const { data: meta } = useAssetMetadataBatch(paths, mode === 'preview');
  const pens = useMemo<PenSpec[]>(() => basePens.map(p => {
    const t = item.trace?.[p.path];
    const nativeUnit = canonicalUnit(meta?.[p.path]?.engineeringUnit);
    return {
      ...p,
      unitOverride: nativeUnit || undefined,
      color: t?.color,
      lineWidth: t?.width,
      lineStyle: t?.style,
      showMarkers: t?.showMarkers,
      hidden: t?.hidden,
    };
  }), [basePens, item.trace, meta]);

  if (mode !== 'preview') {
    return (
      <div className="trend-chart trend-chart--design">
        <div className="trend-chart__design-label">📈 Trend{follow ? ' · display time' : ' · own range'}</div>
        <div className="trend-chart__design-pens">{pens.map(p => p.label).join(' · ') || 'bind tag(s)'}</div>
      </div>
    );
  }

  const controlledWindow = follow ? { start, end, live } : null;
  // When following the display, the display time bar governs — hide the trend's own range controls.
  return (
    <TrendCore
      pens={pens}
      className="trend-chart"
      controlledWindow={controlledWindow}
      showTimeBar={!follow}
      scale={item.trendScale}
      stepped={item.steppedLines}
    />
  );
};

export default TrendChart;
