'use client';

/**
 * U7b — per-window RESULTS for the Window Inspector. The inspector previously
 * fetched every feature value on /kpis and rendered none of them (audit.md §4.3):
 * the finest-granularity calculations existed end-to-end and died one render
 * short of the screen. This panel shows what the selected window actually
 * carried — the metric values and, on the short tier, the per-window G0–G4/G2r
 * verdicts that fusion never covers (it fires on 12h/24h only).
 */
import React from 'react';
import type { CpmKpiRow } from '../../../api/cpmApi';
import { KvRow, PanelHead, TonePill, EmptyState } from '../shared';
import { gateTone, glyphFor } from '../gateStatus';

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

const LONG_METRICS: { field: string; label: string; pct?: boolean }[] = [
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

/**
 * Compact per-row gate glyph strip for the emitted-windows list (short tier
 * only — long windows carry G5–G11 in the payload, not as served columns yet).
 */
export const GateStrip: React.FC<{ row: CpmKpiRow }> = ({ row }) => {
  const spoken = SHORT_GATES
    .map(g => `${g.key} ${String(row[g.field] ?? 'not reported')}`).join(', ');
  return (
    <span className="cpm-mono" role="img" aria-label={`Gates: ${spoken}`}>
      {SHORT_GATES.map(g => {
        const status = row[g.field];
        const { glyph, tone } = glyphFor(typeof status === 'string' ? status : null);
        return (
          <span key={g.key} title={`${g.key} · ${g.name}: ${String(status ?? '—')}`}
            className={`cpm-tone-${tone}`}
            style={{ color: 'var(--cpm-tone, var(--element-neutral-color))', marginRight: 2 }}>
            {glyph}
          </span>
        );
      })}
    </span>
  );
};

export const WindowResultsPanel: React.FC<{
  row: CpmKpiRow | undefined;
  tier: 'short' | 'long';
  /** Embedded mode (e.g. inside an Explorer tab): no surface wrapper/head. */
  bare?: boolean;
}> = ({ row, tier, bare = false }) => {
  const Wrap: React.FC<{ children: React.ReactNode }> = bare
    ? ({ children }) => <div>{children}</div>
    : ({ children }) => <section className="cpm-surface">{children}</section>;
  if (!row) {
    return (
      <Wrap>
        {!bare && <PanelHead eyebrow="Window results" title="What the selected window carried" />}
        <EmptyState title="Select an emitted window above" />
      </Wrap>
    );
  }
  const declined = isDeclined(row, tier);
  const metrics = tier === 'short' ? SHORT_METRICS : LONG_METRICS;
  const half = Math.ceil(metrics.length / 2);
  return (
    <Wrap>
      {!bare && (
        <PanelHead eyebrow="Window results" title="What the selected window carried"
          right={declined ? (
            <TonePill tone="bad">
              {tier === 'short' ? 'DECLINED — insufficient data' : 'UNQUALIFIED — failed G0'}
            </TonePill>
          ) : undefined} />
      )}
      {bare && declined && (
        <p><TonePill tone="bad">
          {tier === 'short' ? 'DECLINED — insufficient data' : 'UNQUALIFIED — failed G0'}
        </TonePill></p>
      )}
      {declined && (
        <p className="cpm-copy">
          The engine declined to evaluate this window
          {tier === 'short'
            ? ' (G0 failed or fewer than 10 samples). Metric fields are “not computed”, not zero.'
            : ' fully (its aligned short slice failed G0). Values below are the exclusion’s decision inputs, not performance measurements.'}
        </p>
      )}
      {tier === 'short' && (
        <div className="cpm-filter-row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {SHORT_GATES.map(g => {
            const status = row[g.field];
            const label = typeof status === 'string' ? status.replace(/_/g, ' ') : '—';
            return (
              <span key={g.key} title={g.name}>
                <TonePill tone={gateTone(typeof status === 'string' ? status : null)}>
                  {g.key} {label}
                </TonePill>
              </span>
            );
          })}
        </div>
      )}
      <div className="cpm-grid-2">
        <div>
          {metrics.slice(0, half).map(m => (
            <KvRow key={m.field} label={m.label}>
              <span className="cpm-mono">{fmtVal(row[m.field], m.pct)}</span>
            </KvRow>
          ))}
        </div>
        <div>
          {metrics.slice(half).map(m => (
            <KvRow key={m.field} label={m.label}>
              <span className="cpm-mono">{fmtVal(row[m.field], m.pct)}</span>
            </KvRow>
          ))}
        </div>
      </div>
    </Wrap>
  );
};

export default WindowResultsPanel;
