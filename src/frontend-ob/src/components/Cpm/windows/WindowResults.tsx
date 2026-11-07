'use client';

/**
 * U7b — per-window RESULTS for the Window Inspector: the metric values the selected window carried. The
 * short-tier flags (G0–G4, G2r) have their own dialog (FeatureFlagsDialog); fusion never covers them.
 */
import React from 'react';
import type { CpmKpiRow } from '../../../api/cpmApi';
import { KvRow } from '../shared';
import { contextOfRow, metricAvailability } from '../metricAvailability';
import { MetricValue } from '../MetricValue';

export const SHORT_GATES: { key: string; field: string; name: string }[] = [
  { key: 'G0', field: 'gate0_status', name: 'Data quality' },
  { key: 'G1', field: 'gate1_status', name: 'Mode / service' },
  { key: 'G2', field: 'gate2_status', name: 'Setpoint activity' },
  { key: 'G2r', field: 'gate2r_status', name: 'Operating region' },
  { key: 'G3', field: 'gate3_status', name: 'Base performance' },
  { key: 'G4', field: 'gate4_status', name: 'Control effort' },
];

const SHORT_METRICS: { field: string; label: string; pct?: boolean }[] = [
  { field: 'mae', label: 'MAE' },
  { field: 'rmse', label: 'RMSE' },
  { field: 'iae', label: 'IAE' },
  { field: 'ise', label: 'ISE' },
  { field: 'good_error_pct', label: 'Good-error time', pct: true },
  { field: 'effort_ratio', label: 'Effort ratio' },
  { field: 'travel_per_day', label: 'OP travel / day' },
  { field: 'reversals_per_hour', label: 'Reversals / h' },
  { field: 'auto_pct', label: 'In AUTO', pct: true },
  { field: 'completeness', label: 'Completeness', pct: true },
];

export const LONG_METRICS: { field: string; label: string; pct?: boolean }[] = [
  { field: 'acf_period_s', label: 'ACF period (s)' },
  { field: 'acf_regularity', label: 'ACF regularity' },
  { field: 'triangularity', label: 'Triangularity' },
  { field: 'horch_oddness', label: 'Horch oddness' },
  { field: 'corner_score', label: 'Corner score' },
  { field: 'harmonic_amplitude_ratio', label: 'Harmonic amp ratio' },
  { field: 'harmonic_energy_ratio', label: 'Harmonic energy ratio' },
  { field: 'effort_ratio', label: 'Effort ratio' },
  { field: 'freeze_fraction', label: 'Freeze fraction', pct: true },
  { field: 'travel_per_day', label: 'OP travel / day' },
];

/** 4-significant-digit display; % fields shown as percentages. */
export const fmtVal = (v: unknown, pct = false): string => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (pct) return `${(v * 100).toFixed(1)}%`;
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 10_000 || abs < 0.001)) return v.toExponential(2);
  return Number(v.toPrecision(4)).toLocaleString();
};

/** True when the engine DECLINED this window (metrics are nulls, not zeros). */
export const isDeclined = (row: CpmKpiRow, tier: 'short' | 'long'): boolean =>
  tier === 'short' ? row.sufficient_data === false : row.long_metrics_qualified === false;

/** The metric values of one window, in two columns. */
export const WindowResults: React.FC<{ row: CpmKpiRow; tier: 'short' | 'long' }> = ({ row, tier }) => {
  const metrics = tier === 'short' ? SHORT_METRICS : LONG_METRICS;
  const half = Math.ceil(metrics.length / 2);
  const ctx = contextOfRow(row, tier);
  const column = (list: typeof metrics) => (
    <div>
      {list.map(m => (
        <KvRow key={m.field} label={m.label}>
          <MetricValue a={metricAvailability(ctx, m.field, row[m.field])} className="cpm-mono" text={fmtVal(row[m.field], m.pct)} />
        </KvRow>
      ))}
    </div>
  );
  return <div className="cpm-grid-2">{column(metrics.slice(0, half))}{column(metrics.slice(half))}</div>;
};

export default WindowResults;
