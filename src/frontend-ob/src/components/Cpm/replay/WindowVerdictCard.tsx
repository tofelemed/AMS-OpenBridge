/**
 * Task 17: the evidence check being read in the open window. Reads only: choosing a check or seeking the cursor never changes
 * the saved verdict. The check's question sits behind a ?, its metric values behind a disclosure. CHG-163 (owner review): the
 * window's result is in the window dropdown, so the panel is the evidence check; the band's Workbench ↗ opens the check's run,
 * so the panel has no proof link of its own; Re-run sits at its foot (what the page puts under it).
 */
import React from 'react';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmKpiRow } from '../../../api/cpmApi';
import { Toggletip } from '../../../ui/Toggletip';
import { GateBadge } from '../../../ui/GateBadge';
import { KvRow, PanelHead } from '../shared';
import { codeLabel } from '../vocabulary';
import { gateName } from '../gateStatus';
import { GATE_METRICS, formatMetric, metricValue } from './gateMetrics';

export const WindowVerdictCard: React.FC<{
  row: CpmGateMatrix;
  gateKey: string;
  gateOptions: { key: string; name: string }[];
  kpiRow: CpmKpiRow | undefined;
  /** What the selected check asks, from the gate catalogue. */
  question?: string | null;
  onGate: (gate: string) => void;
  /** At the panel's foot (Re-run). */
  children?: React.ReactNode;
}> = ({ row, gateKey, gateOptions, kpiRow, question, onGate, children }) => {
  const cell = row.gates.find(g => g.key === gateKey);
  const reason = row.insufficientEvidenceReason ?? row.familyDisqualifiers[0] ?? row.narrative?.statusReason ?? null;
  const autoPct = metricValue(row, kpiRow, 'auto_pct');
  return (
    <section className="cpm-surface cpm-replay-check-panel">
      <PanelHead title="Evidence check" />
      {reason && <p className="cpm-copy cpm-replay-reason">{codeLabel(reason)}</p>}
      <label className="cpm-field cpm-field--compact">
        <select className="cpm-select" aria-label="Evidence check" value={gateKey} disabled={gateOptions.length === 0} onChange={e => onGate(e.target.value)}>
          {gateOptions.length === 0 && <option value="">Gate list unavailable</option>}
          {gateOptions.map(g => <option key={g.key} value={g.key}>{g.key} · {g.name}</option>)}
        </select>
      </label>
      <KvRow label="Check result">
        <span className="cpm-replay-check">
          <GateBadge status={cell?.status ?? 'NOT_EVALUATED'} gate={gateKey} />
          {question && <Toggletip variant="how-to" label={`${gateKey} · ${gateName(gateKey)}`}><p>{question}</p></Toggletip>}
        </span>
      </KvRow>
      {cell?.reason && <KvRow label="Reason">{codeLabel(cell.reason)}</KvRow>}
      <KvRow label="Time in AUTO">{formatMetric(autoPct, true)}</KvRow>
      {(GATE_METRICS[gateKey] ?? []).length > 0 && (
        <details className="cpm-replay-metrics">
          <summary>{gateKey} metric values</summary>
          {GATE_METRICS[gateKey].map(m => <KvRow key={m.field} label={m.label}>{formatMetric(metricValue(row, kpiRow, m.field), m.pct)}</KvRow>)}
        </details>
      )}
      {children && <div className="cpm-replay-check-panel__foot">{children}</div>}
    </section>
  );
};
