'use client';

// Phase C — the `chart.trend` canvas symbol. Phase J moved the engine into TrendCore (pens-driven,
// so a dialog/page can use the same chart); this file is now just the CanvasItem adapter:
// item.bindings → pens, plus the design-mode placeholder.
import React, { useMemo } from 'react';
import type { CanvasItem } from './types';
import TrendCore, { type PenSpec } from './TrendCore';

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
  const pens = useMemo(() => pensFromItem(item), [item]);

  if (mode !== 'preview') {
    return (
      <div className="trend-chart trend-chart--design">
        <div className="trend-chart__design-label">📈 Trend</div>
        <div className="trend-chart__design-pens">{pens.map(p => p.label).join(' · ') || 'bind tag(s)'}</div>
      </div>
    );
  }

  return <TrendCore pens={pens} className="trend-chart" />;
};

export default TrendChart;
