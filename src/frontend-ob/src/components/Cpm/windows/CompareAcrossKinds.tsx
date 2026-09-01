'use client';

/**
 * U7c — same loop, same metric, every short window size side by side. The only
 * multi-window view in the product was single-size; there was no way to see
 * how a calculation reads at 1m vs 5m vs 60m (audit.md §6 rec. 8). Values are
 * per-window statistics over the latest emitted windows of each kind — never
 * summed across kinds: all short kinds except 1m are SLIDING windows whose
 * samples overlap, so aggregation across kinds double-counts by construction.
 */
import React, { useState } from 'react';
import type { CpmWindowSpec } from '../../../api/cpmApi';
import { useCpmKpis } from '../../../hooks/useCpm';
import { PanelHead, TonePill, fmtWindowShape } from '../shared';
import { fmtVal, isDeclined } from './WindowResults';

const METRIC_OPTIONS: { field: string; label: string; pct?: boolean }[] = [
  { field: 'mae', label: 'MAE' },
  { field: 'rmse', label: 'RMSE' },
  { field: 'iae', label: 'IAE' },
  { field: 'good_error_pct', label: 'Good-error time', pct: true },
  { field: 'effort_ratio', label: 'Effort ratio' },
  { field: 'auto_pct', label: 'In AUTO', pct: true },
  { field: 'completeness', label: 'Completeness', pct: true },
  { field: 'travel_per_day', label: 'OP travel / day' },
  { field: 'reversals_per_hour', label: 'Reversals / h' },
];

const KindRow: React.FC<{
  loopId: string;
  spec: CpmWindowSpec;
  field: string;
  pct: boolean;
  active: boolean;
  onPick: (kind: string) => void;
}> = ({ loopId, spec, field, pct, active, onPick }) => {
  const kpis = useCpmKpis(loopId, spec.kind, 12);
  const rows = kpis.data?.samples ?? [];
  const qualified = rows.filter(r => !isDeclined(r, 'short') && typeof r[field] === 'number');
  const declinedCount = rows.filter(r => isDeclined(r, 'short')).length;
  const values = qualified.map(r => r[field] as number);
  const latest = values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : undefined;
  return (
    <tr aria-current={active ? 'true' : undefined}
      className={active ? 'cpm-event-row--selected' : undefined}
      style={{ cursor: 'pointer' }}
      onClick={() => onPick(spec.kind)}>
      <td>
        <span className="cpm-mono">{spec.kind}</span>
        <div className="cpm-event-row__sub">{fmtWindowShape(spec)}</div>
      </td>
      <td className="cpm-mono">
        {kpis.isLoading ? '…' : fmtVal(latest, pct)}
      </td>
      <td className="cpm-mono">{fmtVal(median, pct)}</td>
      <td className="cpm-mono">
        {sorted.length > 1 ? `${fmtVal(sorted[0], pct)} – ${fmtVal(sorted[sorted.length - 1], pct)}` : '—'}
      </td>
      <td>
        {values.length}
        {declinedCount > 0 && (
          <span title={`${declinedCount} of the latest windows were declined (insufficient data) and are excluded`}>
            {' '}<TonePill tone="muted">{declinedCount} declined</TonePill>
          </span>
        )}
      </td>
    </tr>
  );
};

export const CompareAcrossKinds: React.FC<{
  loopId: string;
  shortSpecs: CpmWindowSpec[];
  activeKind: string;
  onPickKind: (kind: string) => void;
}> = ({ loopId, shortSpecs, activeKind, onPickKind }) => {
  const [field, setField] = useState('mae');
  const metric = METRIC_OPTIONS.find(m => m.field === field) ?? METRIC_OPTIONS[0];
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="Across window sizes" title="Same loop, every short granularity"
        right={
          <label className="cpm-field">
            <span className="cpm-field__label">Metric</span>
            <select className="cpm-select" value={field} onChange={e => setField(e.target.value)}>
              {METRIC_OPTIONS.map(m => <option key={m.field} value={m.field}>{m.label}</option>)}
            </select>
          </label>
        } />
      <div style={{ overflowX: 'auto' }}>
        <table className="cpm-signal-table">
          <thead>
            <tr>
              <th scope="col">Window</th>
              <th scope="col">Latest {metric.label}</th>
              <th scope="col">Median (last 12)</th>
              <th scope="col">Range (last 12)</th>
              <th scope="col">Windows</th>
            </tr>
          </thead>
          <tbody>
            {shortSpecs.map(spec => (
              <KindRow key={spec.kind} loopId={loopId} spec={spec}
                field={metric.field} pct={metric.pct ?? false}
                active={spec.kind === activeKind} onPick={onPickKind} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="cpm-copy">
        Statistics are per window kind over its latest 12 emitted windows; declined
        windows are excluded. Kinds other than 1m are sliding windows whose samples
        overlap — values are comparable side by side but must never be summed across
        rows. Click a row to inspect that granularity.
      </p>
    </section>
  );
};

export default CompareAcrossKinds;
