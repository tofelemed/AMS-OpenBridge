// Phase 8 (E8.1–E8.6) — the `table.timeseries` symbol: a grid of timestamped values over the display
// time range. Rows are evenly-spaced sample times; columns are the bound tags. History is read from the
// historian (config-only, CQRS-safe) via the same UNS binding path as the trend + summary symbols.
import React, { useEffect, useMemo, useState } from 'react';
import type { CanvasItem } from './types';
import { useBatchBindingResolver } from '../../hooks/useBindingResolver';
import { useMqttStore, type TrendPoint } from '../../store/mqttStore';
import { useDisplayTimeStore, formatInZone } from '../../store/timeStore';
import { formatValue } from './openBridgeTheme';

interface Col { slot: string; path: string; label: string; }

function splitIoT(p?: string): { series?: string; measurement?: string } {
  if (!p) return {};
  const dot = p.lastIndexOf('.');
  return dot < 0 ? { series: p } : { series: p.slice(0, dot), measurement: p.slice(dot + 1) };
}

/** Value of a tag's series nearest a target timestamp. */
function nearest(points: TrendPoint[], measurement: string | undefined, targetTs: number): number | undefined {
  if (!points.length) return undefined;
  let best = points[0], bestD = Math.abs(points[0].ts - targetTs);
  for (const p of points) {
    const d = Math.abs(p.ts - targetTs);
    if (d < bestD) { best = p; bestD = d; }
  }
  const v = measurement ? best[measurement] : best.value;
  return typeof v === 'number' ? v : undefined;
}

export const TimeSeriesTable: React.FC<{ item: CanvasItem; mode: 'design' | 'preview' }> = ({ item, mode }) => {
  const cols = useMemo<Col[]>(() =>
    Object.entries(item.bindings ?? {})
      .filter(([, p]) => typeof p === 'string' && p.includes('/'))
      .map(([slot, path]) => ({ slot, path: path as string, label: (path as string).split('/').pop() ?? slot })),
    [item],
  );
  const paths = useMemo(() => (mode === 'preview' ? cols.map(c => c.path) : []), [cols, mode]);
  const { data: batch } = useBatchBindingResolver(paths, 'history');
  const fetchTrend = useMqttStore(s => s.fetchTrend);
  const tStart = useDisplayTimeStore(s => s.start);
  const tEnd = useDisplayTimeStore(s => s.end);
  const tz = useDisplayTimeStore(s => s.tz);

  const rowCount = 15;
  const decimals = item.formatting?.decimals ?? 1;

  const resolved = (batch?.bindings ?? []) as Array<{ history?: { ioTDbPath?: string } }>;
  const [series, setSeries] = useState<Record<string, TrendPoint[]>>({});

  useEffect(() => {
    if (mode !== 'preview' || cols.length === 0 || !batch) return;
    let cancelled = false;
    const start = new Date(tStart), end = new Date(tEnd);
    Promise.all(cols.map(async (c, i) => {
      const { series: s, measurement } = splitIoT(resolved[i]?.history?.ioTDbPath);
      if (!s) return [c.path, [] as TrendPoint[]] as const;
      const pts = await fetchTrend(s, start, end, rowCount * 4, measurement);
      return [c.path, pts] as const;
    })).then(entries => { if (!cancelled) setSeries(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, batch, tStart, tEnd, cols.length]);

  if (cols.length === 0) {
    return <div className="symbol-table symbol-table--empty">🕑 Time-series table — bind tag(s)</div>;
  }
  if (mode !== 'preview') {
    return (
      <div className="symbol-table symbol-table--design">
        🕑 Time-series table
        <div className="symbol-table__design-pens">{cols.map(c => c.label).join(' · ')}</div>
      </div>
    );
  }

  // Evenly-spaced sample times across the display range (newest first).
  const times: number[] = [];
  const span = Math.max(1, tEnd - tStart);
  for (let i = 0; i < rowCount; i++) times.push(tEnd - (span * i) / (rowCount - 1));

  const measurements = cols.map((_, i) => splitIoT(resolved[i]?.history?.ioTDbPath).measurement);

  return (
    <div className="symbol-table symbol-table--timeseries">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            {cols.map(c => <th key={c.slot}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {times.map((ts, r) => (
            <tr key={r}>
              <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>
                {formatInZone(ts, tz, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </td>
              {cols.map((c, i) => {
                const v = nearest(series[c.path] ?? [], measurements[i], ts);
                return <td key={c.slot} className="symbol-table__val">{v == null ? '--' : formatValue(v, decimals)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TimeSeriesTable;
