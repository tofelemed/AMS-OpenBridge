// Phase 4 — renders a collection: its template cell repeated once per matching asset (§I).
// Each cell substitutes {{element}} in its items' bindings with that asset's contextual path, so a
// single authored cell serves every matching asset (the "one card per asset" pattern).
import React from 'react';
import type { CanvasItem } from './types';
import { SymbolRenderer } from './SymbolRenderer';
import { useAssetSearch } from '../../hooks/useAssetSearch';

/** Substitute {{element}} in an item's bindings with a concrete asset path. */
function withElement(item: CanvasItem, element: string): CanvasItem {
  if (!item.bindings) return item;
  const bindings: Record<string, string> = {};
  for (const [k, v] of Object.entries(item.bindings)) {
    bindings[k] = v.replace(/\{\{element\}\}/g, element);
  }
  return { ...item, bindings };
}

const Cell: React.FC<{ items: CanvasItem[]; mode: 'design' | 'preview'; element?: string }> = ({ items, mode, element }) => (
  <>
    {items.map(ci => {
      const it = element ? withElement(ci, element) : ci;
      return (
        <div
          key={ci.id}
          style={{ position: 'absolute', left: ci.position.x, top: ci.position.y, width: ci.size.width, height: ci.size.height }}
        >
          <SymbolRenderer item={it} mode={mode} />
        </div>
      );
    })}
  </>
);

export const CollectionRenderer: React.FC<{ item: CanvasItem; mode: 'design' | 'preview' }> = ({ item, mode }) => {
  const cfg = item.collectionConfig;
  const { data: assets } = useAssetSearch(cfg?.criteria ?? {}, mode === 'preview' && !!cfg);

  if (!cfg) {
    return <div className="symbol-collection symbol-collection--empty">Collection — configure criteria</div>;
  }

  const { cell } = cfg;
  const cols = Math.max(1, cfg.columns);
  const gap = cfg.gap;

  // Design mode shows the template cell once (editing the template in place is a follow-up — I3/I4).
  if (mode !== 'preview') {
    return (
      <div className="symbol-collection symbol-collection--design">
        <div className="symbol-collection__badge">Collection · {cfg.criteria.template || cfg.criteria.root || 'assets'} × N</div>
        <div style={{ position: 'relative', width: cell.width, height: cell.height }}>
          <Cell items={cfg.items} mode="design" />
        </div>
      </div>
    );
  }

  const sorted = [...(assets ?? [])];
  if (cfg.sort) {
    const key = cfg.sort.by === 'path' ? 'contextualPath' : 'name';
    sorted.sort((a, b) => String(a[key]).localeCompare(String(b[key])));
    if (cfg.sort.dir === 'desc') sorted.reverse();
  }
  const list = sorted.slice(0, cfg.maxInstances ?? 100);
  if (list.length === 0) {
    return <div className="symbol-collection symbol-collection--empty">No matching assets</div>;
  }

  return (
    <div className="symbol-collection" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'auto' }}>
      {list.map((asset, idx) => {
        const col = idx % cols, row = Math.floor(idx / cols);
        const left = col * (cell.width + gap), top = row * (cell.height + gap);
        return (
          <div key={asset.id} style={{ position: 'absolute', left, top, width: cell.width, height: cell.height }}>
            <Cell items={cfg.items} mode="preview" element={asset.contextualPath} />
          </div>
        );
      })}
    </div>
  );
};

export default CollectionRenderer;
