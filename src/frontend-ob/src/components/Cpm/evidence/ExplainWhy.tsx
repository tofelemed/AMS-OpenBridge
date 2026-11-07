/**
 * SME review #19 (CHG-055) + Task 16: "Why this result" on the Proof tab — each measured value against the threshold that
 * applied when the run happened, for the decision gate the observed symptoms and possible causes (CauseBreakdown), and what
 * remains open. The result sentence is the verdict card's and the thresholds' source line is on Rules & parameters, so
 * neither is said here again.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFusedRow } from './useFusedRow';
import type { EvidenceManifest, MethodRun } from '../../../api/cpm/evidence';
import { getEffectiveConfig } from '../../../api/cpm/config';
import { diagnosisLabel, lowerFirst } from '../vocabulary';
import { conditionOf, limitationOf } from '../explorer/summary/summaryText';
import { CauseBreakdownRows } from '../CauseBreakdown';
import { whyRows } from './whyRules';
import type { InputContext } from '../optionalInputs';
import { INPUT_LIMITS_GATE } from '../inputLimits';
import { flagsForLoop } from '../optionalInputs';
import { useAuthStore } from '../../../store/authStore';

/** Which window flags limit which gate's claim: the missing inputs (shared, CHG-064) plus the method limits. */
const LIMITS_GATE: Record<string, string[]> = {
  ...INPUT_LIMITS_GATE, NO_VALID_CYCLE: ['G5', 'G7', 'G8', 'G9', 'G15'],
  INSUFFICIENT_SAMPLES: ['*'], QUALITY_UNKNOWN: ['*'], AREA_OUT_OF_BAND: ['G9'], PERIOD_OUT_OF_BAND: ['G5', 'G6'],
};

export const ExplainWhy: React.FC<{
  gate: string; run: MethodRun | undefined; manifest: EvidenceManifest | undefined; eligibilityDetail: string | null;
  /** CHG-059: the loop's optional-input context (VP / peers applicability). */
  inputs?: InputContext;
}> = ({ gate, run, manifest, eligibilityDetail, inputs }) => {
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
  if (gate === 'G15' || gate === 'G14') open.push('Evidence scores rank the explanations; they are not probabilities.');

  return (
    <div className="cpm-why" data-testid="explain-why">
      <h3 className="cpm-eyebrow">Measured vs required</h3>
      {rows.length > 0 ? (
        <dl className="cpm-why__rows">
          {rows.map(r => (
            <React.Fragment key={r.label}>
              <dt>{r.label}</dt>
              <dd>
                {r.ok != null && <span className={`cpm-why__mark cpm-matrix__cell--${r.ok ? 'good' : 'bad'}`} aria-label={r.ok ? 'met' : 'not met'}>{r.ok ? '✓' : '✕'}</span>}
                <span>{r.value}</span>
                {r.against && <span className="cpm-why__against">{r.against}</span>}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : (
        <p className="cpm-metric-na">{cfg.isLoading || row.isLoading ? 'Loading the thresholds that applied…' : 'This gate reports a state, not a measured value against a threshold.'}</p>
      )}

      {gate === 'G15' && fused && (
        <>
          <h3 className="cpm-eyebrow">Evidence behind it</h3>
          <CauseBreakdownRows verdict={fused.verdictV2} flags={flags} inputs={inputs} />
        </>
      )}

      <h3 className="cpm-eyebrow">What remains open</h3>
      {open.length > 0
        ? <ul className="cpm-why__open">{open.map(o => <li key={o}>{o}</li>)}</ul>
        : <p className="cpm-copy">Nothing this window flags limits this gate's claim.</p>}
    </div>
  );
};

export default ExplainWhy;
