/**
 * Task 17: the evidence check being read in the open window. Reads only: choosing a check or seeking the cursor never changes
 * the saved verdict. The check's question sits behind a ?. CHG-163 (owner review): the window's result is in the window
 * dropdown, so the panel is the evidence check; the band's Workbench ↗ opens the check's run, so the panel has no proof link of
 * its own; Re-run sits at its foot (what the page puts under it).
 * CHG-189 (owner review item 12): the window's verdict line is a headline, not a box that looks like a field; then the check
 * selector, and the check result, reason, time in AUTO and the check's metric values as even label / value rows (the metric
 * values were behind a disclosure). G1's own metric is the time in AUTO, which the panel already shows, so it is shown once.
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
  const metrics = (GATE_METRICS[gateKey] ?? []).filter(m => m.field !== 'auto_pct');
  return (
    <section className="cpm-surface cpm-replay-check-panel">
      <PanelHead title="Evidence check" />
      {reason && <p className="cpm-replay-verdict">{codeLabel(reason)}</p>}
      <label className="cpm-field cpm-field--compact cpm-replay-check-panel__gate">
        <select className="cpm-select" aria-label="Evidence check" value={gateKey} disabled={gateOptions.length === 0} onChange={e => onGate(e.target.value)}>
          {gateOptions.length === 0 && <option value="">Gate list unavailable</option>}
          {gateOptions.map(g => <option key={g.key} value={g.key}>{g.key} · {g.name}</option>)}
        </select>
      </label>
      <div className="cpm-replay-check-panel__rows">
        <KvRow label="Check result">
          <span className="cpm-replay-check">
            <GateBadge status={cell?.status ?? 'NOT_EVALUATED'} gate={gateKey} />
            {question && <Toggletip variant="how-to" label={`${gateKey} · ${gateName(gateKey)}`}><p>{question}</p></Toggletip>}
          </span>
        </KvRow>
        {cell?.reason && <KvRow label="Reason">{codeLabel(cell.reason)}</KvRow>}
        <KvRow label="Time in Auto">{formatMetric(autoPct, true)}</KvRow>
        {metrics.map(m => <KvRow key={m.field} label={m.label}>{formatMetric(metricValue(row, kpiRow, m.field), m.pct)}</KvRow>)}
      </div>
      {children && <div className="cpm-replay-check-panel__foot">{children}</div>}
    </section>
  );
};
