// Phase 4 — asset comparison table (§E5 / D7). One row per asset from a dynamic search, one column
// per selected attribute. Cell = live value of `{asset.contextualPath}.{attribute}`. Rows auto-update
// as assets enter/leave the search (via useAssetSearch's refetch).
import React, { useMemo } from 'react';
import type { CanvasItem } from './types';
import { useAssetSearch } from '../../hooks/useAssetSearch';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useMqttStore } from '../../store/mqttStore';
import { formatValue } from './openBridgeTheme';

export const AssetComparisonTable: React.FC<{ item: CanvasItem; mode: 'design' | 'preview' }> = ({ item, mode }) => {
  const cfg = item.comparison;
  const attributes = cfg?.attributes ?? [];
  const { data: assets } = useAssetSearch(cfg?.criteria ?? {}, mode === 'preview' && !!cfg && attributes.length > 0);
  const rows = assets ?? [];

  const paths = useMemo(
    () => (mode === 'preview' ? rows.flatMap(a => attributes.map(attr => `${a.contextualPath}.${attr}`)) : []),
    [rows, attributes, mode],
  );
  const { data: batch } = useBatchBindingResolver(paths, 'live');
  const metrics = useMqttStore(s => s.metrics);

  if (!cfg || attributes.length === 0) {
    return <div className="symbol-table symbol-table--empty">▦ Asset comparison — set criteria + attributes</div>;
  }
  if (mode !== 'preview') {
    return (
      <div className="symbol-table symbol-table--design">
        ▦ Asset comparison
        <div className="symbol-table__design-pens">{attributes.join(' · ')}</div>
      </div>
    );
  }

  const resolved = (batch?.bindings ?? []) as Array<{ live?: { sparkplugDevice?: string; sparkplugMetric?: string } }>;
  const cellValue = (rowIdx: number, attrIdx: number): unknown => {
    const b = resolved[rowIdx * attributes.length + attrIdx];
    const dev = b?.live?.sparkplugDevice, met = b?.live?.sparkplugMetric;
    const key = dev && met ? `${dev}/${met}` : undefined;
    return key ? metrics.get(key)?.value : undefined;
  };

  return (
    <div className="symbol-table">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            {attributes.map(a => <th key={a}>{a}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((asset, ri) => (
            <tr key={asset.id}>
              <td title={asset.contextualPath}>{asset.name}</td>
              {attributes.map((attr, ai) => {
                const v = cellValue(ri, ai);
                return <td key={attr} className="symbol-table__val">{v === undefined ? '--' : formatValue(v, 1)}</td>;
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={attributes.length + 1} style={{ opacity: 0.6 }}>No matching assets</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AssetComparisonTable;
