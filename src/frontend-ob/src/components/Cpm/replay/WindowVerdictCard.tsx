/**
 * Task 17: the stored result of the open window, and the evidence check being read. Reads only: choosing a check or seeking the
 * cursor never changes the saved verdict. The check's question sits behind a ?, its metric values behind a disclosure.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmKpiRow } from '../../../api/cpmApi';
import { Toggletip } from '../../../ui/Toggletip';
import { GateBadge } from '../../../ui/GateBadge';
import { KvRow, PanelHead, TonePill } from '../shared';
import { codeLabel } from '../vocabulary';
import { gateName } from '../gateStatus';
import { conditionOf } from '../explorer/summary/summaryText';
import { workbenchHref } from '../evidence/selection';
import { GATE_METRICS, formatMetric, metricValue } from './gateMetrics';

export const WindowVerdictCard: React.FC<{
  row: CpmGateMatrix;
  loopId: string;
  gateKey: string;
  gateOptions: { key: string; name: string }[];
  kpiRow: CpmKpiRow | undefined;
  /** What the selected check asks, from the gate catalogue. */
  question?: string | null;
  onGate: (gate: string) => void;
}> = ({ row, loopId, gateKey, gateOptions, kpiRow, question, onGate }) => {
  const navigate = useNavigate();
  const condition = conditionOf(row.diagnosis);
  const cell = row.gates.find(g => g.key === gateKey);
  const reason = row.insufficientEvidenceReason ?? row.familyDisqualifiers[0] ?? row.narrative?.statusReason ?? null;
  const proofRun = row.methodRunIds?.[gateKey] ?? null;
  const autoPct = metricValue(row, kpiRow, 'auto_pct');
  return (
    <section className="cpm-surface" aria-label="Window verdict">
      <PanelHead title="Window verdict" right={<TonePill tone={condition.tone}>{condition.label}</TonePill>} />
      {reason && <p className="cpm-copy cpm-replay-reason">{codeLabel(reason)}</p>}
      <label className="cpm-field cpm-field--compact">
        <span className="cpm-field__label">Evidence check</span>
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
      <ObcButton variant="flat" disabled={!proofRun}
        onClick={() => { if (proofRun) navigate(workbenchHref(loopId, proofRun, gateKey)); }}>Open retained proof ↗</ObcButton>
    </section>
  );
};
