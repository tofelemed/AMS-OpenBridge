// Phase 3/4 — the `table.value` symbol. One row per bound tag: Name / Value / Units, plus optional
// summary columns (Min/Max/Avg over the display time range, E4.5–E4.7/E4.14) served by /summary.
import React, { useEffect, useMemo, useState } from 'react';
import type { CanvasItem } from './types';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useMqttStore, type TrendSummary } from '../../store/mqttStore';
import { useDisplayTimeStore } from '../../store/timeStore';
import { formatValue } from './openBridgeTheme';

interface Row { slot: string; path: string; label: string; }

/** Split an IoTDB path (root.a.b.c.metric) into series + measurement. */
function splitIoT(p?: string): { series?: string; measurement?: string } {
  if (!p) return {};
  const dot = p.lastIndexOf('.');
  return dot < 0 ? { series: p } : { series: p.slice(0, dot), measurement: p.slice(dot + 1) };
}

const SUMMARY_LABEL: Record<string, string> = { min: 'Min', max: 'Max', avg: 'Avg' };

export const TableSymbol: React.FC<{ item: CanvasItem; mode: 'design' | 'preview' }> = ({ item, mode }) => {
  const sources = useMemo<Row[]>(() =>
    Object.entries(item.bindings ?? {})
      .filter(([, p]) => typeof p === 'string' && p.includes('/'))
      .map(([slot, path]) => ({ slot, path: path as string, label: (path as string).split('/').pop() ?? slot })),
    [item],
  );
  const paths = useMemo(() => (mode === 'preview' ? sources.map(s => s.path) : []), [sources, mode]);
  const { data: batch } = useBatchBindingResolver(paths, 'all');
  const metrics = useMqttStore(s => s.metrics);
  const fetchSummary = useMqttStore(s => s.fetchSummary);
  const tStart = useDisplayTimeStore(s => s.start);
  const tEnd = useDisplayTimeStore(s => s.end);

  const summaryCols = item.summaryColumns ?? [];
  const showUnit = item.formatting?.showUnit !== false;
  const unit = item.formatting?.unit ?? '';
  const decimals = item.formatting?.decimals ?? 1;

  const resolved = (batch?.bindings ?? []) as Array<{
    live?: { sparkplugDevice?: string; sparkplugMetric?: string };
    history?: { ioTDbPath?: string };
  }>;

  const [summaries, setSummaries] = useState<Record<string, TrendSummary | null>>({});
  useEffect(() => {
    if (mode !== 'preview' || summaryCols.length === 0 || !batch) return;
    let cancelled = false;
    const start = new Date(tStart), end = new Date(tEnd);
    Promise.all(sources.map(async (src, i) => {
      const { series, measurement } = splitIoT(resolved[i]?.history?.ioTDbPath);
      if (!series || !measurement) return [src.path, null] as const;
      return [src.path, await fetchSummary(series, start, end, measurement)] as const;
    })).then(entries => { if (!cancelled) setSummaries(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, summaryCols.length, batch, tStart, tEnd]);

  if (sources.length === 0) {
    return <div className="symbol-table symbol-table--empty">▦ Table — bind tag(s)</div>;
  }
  if (mode !== 'preview') {
    return (
      <div className="symbol-table symbol-table--design">
        ▦ Table
        <div className="symbol-table__design-pens">{sources.map(s => s.label).join(' · ')}</div>
      </div>
    );
  }

  const rows = sources.map((src, i) => {
    const b = resolved[i];
    const dev = b?.live?.sparkplugDevice, met = b?.live?.sparkplugMetric;
    const key = dev && met ? `${dev}/${met}` : undefined;
    const value = key ? metrics.get(key)?.value : undefined;
    return { ...src, value };
  });

  const summaryVal = (path: string, col: 'min' | 'max' | 'avg'): number | null => {
    const s = summaries[path];
    if (!s) return null;
    return col === 'min' ? s.min : col === 'max' ? s.max : s.avg;
  };

  const fmtCell = (v: number | string | boolean | undefined) =>
    v === undefined ? '--' : formatValue(v, decimals);

  // Phase 8 (E4.16) — transposed: tags across the top, attributes (Value/Units/summaries) down the side.
  if (item.transpose) {
    const attrRows: Array<{ label: string; get: (r: typeof rows[number]) => string }> = [
      { label: 'Value', get: r => fmtCell(r.value) },
      ...(showUnit ? [{ label: 'Units', get: () => unit }] : []),
      ...summaryCols.map(c => ({ label: SUMMARY_LABEL[c], get: (r: typeof rows[number]) => {
        const v = summaryVal(r.path, c); return v == null ? '--' : formatValue(v, decimals);
      } })),
    ];
    return (
      <div className="symbol-table">
        <table>
          <thead>
            <tr>
              <th></th>
              {rows.map((r, i) => <th key={i}>{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {attrRows.map((ar, ri) => (
              <tr key={ri}>
                <td>{ar.label}</td>
                {rows.map((r, i) => <td key={i} className="symbol-table__val">{ar.get(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="symbol-table">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
            {showUnit && <th>Units</th>}
            {summaryCols.map(c => <th key={c}>{SUMMARY_LABEL[c]}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.label}</td>
              <td className="symbol-table__val">{r.value === undefined ? '--' : formatValue(r.value, decimals)}</td>
              {showUnit && <td>{unit}</td>}
              {summaryCols.map(c => {
                const v = summaryVal(r.path, c);
                return <td key={c} className="symbol-table__val">{v == null ? '--' : formatValue(v, decimals)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TableSymbol;
