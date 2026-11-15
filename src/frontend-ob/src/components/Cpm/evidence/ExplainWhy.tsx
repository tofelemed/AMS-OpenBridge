/**
 * SME review #19 (CHG-055) + Task 16: "Why this result" — each measured value against the threshold that applied when the run
 * happened, for the decision gate the observed symptoms and possible causes, and what remains open. CHG-187 (owner review 11.1):
 * it left the foot of the Proof tab for the "Measured vs required" dialog the gate's head opens (MeasuredCheck): a table of
 * measure · measured · required · pass / fail, then the evidence behind the decision and what remains open, each only when it
 * holds something. `useWhy` gathers the facts once for the head (button or "State check") and the dialog.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { useFusedRow } from './useFusedRow';
import type { EvidenceManifest, MethodRun } from '../../../api/cpm/evidence';
import { getEffectiveConfig } from '../../../api/cpm/config';
import { diagnosisLabel, lowerFirst } from '../vocabulary';
import { conditionOf, limitationOf } from '../explorer/summary/summaryText';
import { causeBreakdown } from '../causeAnalysis';
import { NO_THRESHOLD, whyRows, type WhyRow } from './whyRules';
import type { InputContext } from '../optionalInputs';
import { INPUT_LIMITS_GATE } from '../inputLimits';
import { flagsForLoop } from '../optionalInputs';
import { useAuthStore } from '../../../store/authStore';
import { DataTable, type Column } from '../../../ui/DataTable';
import { StatusBadge } from '../../../ui/StatusBadge';

/** Which window flags limit which gate's claim: the missing inputs (shared, CHG-064) plus the method limits. */
const LIMITS_GATE: Record<string, string[]> = {
  ...INPUT_LIMITS_GATE, NO_VALID_CYCLE: ['G5', 'G7', 'G8', 'G9', 'G15'],
  INSUFFICIENT_SAMPLES: ['*'], QUALITY_UNKNOWN: ['*'], AREA_OUT_OF_BAND: ['G9'], PERIOD_OUT_OF_BAND: ['G5', 'G6'],
};

export interface WhyInput {
  gate: string; run: MethodRun | undefined; manifest: EvidenceManifest | undefined; eligibilityDetail: string | null;
  /** CHG-059: the loop's optional-input context (VP / peers applicability). */
  inputs?: InputContext;
}

export interface Why {
  rows: WhyRow[];
  open: string[];
  causes: ReturnType<typeof causeBreakdown> | null;
  /** The thresholds or the window's row are still loading. */
  loading: boolean;
}

export function useWhy({ gate, run, manifest, eligibilityDetail, inputs }: WhyInput): Why {
  const endIso = run ? new Date(run.support.toMs).toISOString() : undefined;
  const row = useFusedRow(run?.loopId, run);
  const canReadConfig = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const cfg = useQuery({
    queryKey: ['cpm', 'why-config', run?.loopId, endIso],
    queryFn: ({ signal }) => getEffectiveConfig(run!.loopId, endIso, signal),
    // CHG-081: only for whoever may read the configuration (SuperAdmin) - the rows fall back to the run's provenance
    enabled: !!run && canReadConfig, staleTime: 5 * 60_000,
  });
  const fused = row.row;
  const prov = (kind: string, key: string) => {
    const a = manifest?.artifacts.find(x => x.gate === gate && x.kind === kind);
    const v = a?.provenance?.[key];
    return v == null || v === '' ? undefined : String(v);
  };
  const rows = whyRows(gate, { prov, row: fused, cfg: p => cfg.data?.properties?.[p], eligibilityDetail });
  const flags = fused?.observabilityFlags ?? [];
  const open = [...new Set(flagsForLoop(flags, inputs).filter(f => (LIMITS_GATE[f] ?? []).some(g => g === '*' || g === gate)).map(f => limitationOf(f, inputs)))];
  // Only a window the engine did not judge. NO_CALL and INSUFFICIENT_EVIDENCE are verdicts (conditionOf: no-fault), and the gates
  // of a short window read Insufficient evidence, so "no verdict" is never said.
  const cond = conditionOf(fused?.diagnosis);
  if (cond.kind === 'insufficient' || cond.kind === 'excluded') open.unshift(`The whole window: ${lowerFirst(diagnosisLabel(fused?.diagnosis))}.`);
  const causes = gate === 'G15' ? causeBreakdown(fused?.verdictV2, flags, inputs) : null;
  return { rows, open, causes, loading: (canReadConfig && cfg.isLoading) || row.isLoading };
}

/** A requirement passes or fails; a detection threshold has a position; a figure with no threshold has neither. */
const Result: React.FC<{ r: WhyRow }> = ({ r }) => {
  if (r.ok === true) return <StatusBadge tone="success">Pass</StatusBadge>;
  if (r.ok === false) return <StatusBadge tone="warning">Fail</StatusBadge>;
  return <>{r.position ?? '—'}</>;
};

/** Under a "Required" heading the word itself is not repeated ("≥ 5 required" → "≥ 5"). */
export const requiredText = (against: string): string =>
  against === NO_THRESHOLD ? 'No threshold configured' : against ? against.replace(/ required to /, ' to ').replace(/ required$/, '') : '—';

const COLUMNS: Array<Column<WhyRow>> = [
  { key: 'measure', header: 'Measure', cell: r => r.label },
  { key: 'measured', header: 'Measured', cell: r => r.value, align: 'end' },
  { key: 'required', header: 'Required', cell: r => requiredText(r.against) },
  { key: 'result', header: 'Pass / fail', cell: r => <Result r={r} /> },
];

export const hasCauses = (why: Why) => !!why.causes && (why.causes.observed.length > 0 || why.causes.possible.length > 0);

/** The dialog's body: each section only when it holds something. */
export const ExplainWhy: React.FC<{ why: Why; gate: string; onHypotheses?: () => void }> = ({ why, gate, onHypotheses }) => (
  <div className="cpm-why" data-testid="explain-why">
    {why.rows.length > 0 && <DataTable caption={`Measured vs required, ${gate}`} columns={COLUMNS} rows={why.rows} rowKey={r => r.label} />}
    {hasCauses(why) && (
      <section className="cpm-why__section">
        <h3 className="cpm-why__heading">Evidence behind it</h3>
        <dl className="cpm-why__rows">
          {why.causes!.observed.length > 0 && (
            <>
              <dt>Observed</dt>
              <dd>{why.causes!.observed.map(o => (o.detail ? `${o.label} (${o.detail})` : o.label)).join(' · ')}</dd>
            </>
          )}
          {why.causes!.possible.length > 0 && (
            <>
              <dt>Possible cause</dt>
              <dd>
                <span>{why.causes!.possible.map(c => `${c.label}${c.leading ? ' (leading)' : ''}${c.confirmed ? ' (confirmed)' : ''}`).join(' · ')}</span>
                {onHypotheses && <ObcButton className="ui-link" variant="flat" onClick={onHypotheses}>Hypotheses ↗</ObcButton>}
              </dd>
            </>
          )}
        </dl>
      </section>
    )}
    {why.open.length > 0 && (
      <section className="cpm-why__section">
        {/* alone in the dialog, the dialog's own title says it */}
        {(why.rows.length > 0 || hasCauses(why)) && <h3 className="cpm-why__heading">What remains open</h3>}
        <ul className="cpm-why__open">{why.open.map(o => <li key={o}>{o}</li>)}</ul>
      </section>
    )}
  </div>
);

export default ExplainWhy;
