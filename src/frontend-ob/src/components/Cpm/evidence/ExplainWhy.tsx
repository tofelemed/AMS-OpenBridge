/**
 * SME review #19 (CHG-055): "Why this result" in four parts — the result in one sentence, each measured value
 * against the threshold that applied when the run happened, the evidence behind it, and what remains open.
 * For the decision gate the evidence is split into observed symptoms and possible causes (CauseBreakdown).
 * The fused row of the window and the effective configuration at the run's time are fetched only while
 * this section is open.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EvidenceManifest, MethodRun } from '../../../api/cpm/evidence';
import { getGateHistory } from '../../../api/cpm/gates';
import { getEffectiveConfig } from '../../../api/cpm/config';
import { gateMark } from '../gateStatus';
import { codeLabel, diagnosisLabel, lowerFirst } from '../vocabulary';
import { limitationOf } from '../explorer/summary/summaryText';
import { CauseBreakdownRows } from '../CauseBreakdown';
import { whyRows } from './whyRules';
import { reasonSentence } from './verdictCopy';
import { fmtInstant } from '../context/LoopContextBar';
import type { InputContext } from '../optionalInputs';
import { INPUT_LIMITS_GATE, effectiveInputFlags } from '../inputLimits';

/** Which window flags limit which gate's claim: the missing inputs (shared, CHG-064) plus the method limits. */
const LIMITS_GATE: Record<string, string[]> = {
  ...INPUT_LIMITS_GATE, NO_VALID_CYCLE: ['G5', 'G7', 'G8', 'G9', 'G15'],
  INSUFFICIENT_SAMPLES: ['*'], QUALITY_UNKNOWN: ['*'], AREA_OUT_OF_BAND: ['G9'], PERIOD_OUT_OF_BAND: ['G5', 'G6'],
};

export const ExplainWhy: React.FC<{
  gate: string; name: string; run: MethodRun | undefined; manifest: EvidenceManifest | undefined;
  status: string | null; reason: string | null; eligibilityDetail: string | null; timeZone?: string;
  /** CHG-059: the loop's optional-input context (VP / peers applicability). */
  inputs?: InputContext;
}> = ({ gate, name, run, manifest, status, reason, eligibilityDetail, timeZone, inputs }) => {
  const endIso = run ? new Date(run.support.toMs).toISOString() : undefined;
  const row = useQuery({
    queryKey: ['cpm', 'why-row', run?.loopId, run?.windowKind, endIso],
    queryFn: ({ signal }) => getGateHistory(run!.loopId, run!.windowKind, endIso, endIso, 1, signal, true),
    enabled: !!run && run.tier === 'fusion', staleTime: 5 * 60_000,
  });
  const cfg = useQuery({
    queryKey: ['cpm', 'why-config', run?.loopId, endIso],
    queryFn: ({ signal }) => getEffectiveConfig(run!.loopId, endIso, signal),
    enabled: !!run, staleTime: 5 * 60_000,
  });
  const fused = row.data?.windows?.[0];
  const prov = (kind: string, key: string) => {
    const a = manifest?.artifacts.find(x => x.gate === gate && x.kind === kind);
    const v = a?.provenance?.[key];
    return v == null || v === '' ? undefined : String(v);
  };
  const rows = whyRows(gate, { prov, row: fused, cfg: p => cfg.data?.properties?.[p], eligibilityDetail });

  const mark = gateMark(status, gate, effectiveInputFlags(fused?.observabilityFlags, inputs));
  const result = status
    ? `${gate} ${name}: ${mark.meaning === 'none' ? lowerFirst(codeLabel(status)) : mark.label}${reason ? ` — ${reasonSentence(reason, { gate, eligibilityDetail })}` : ''}.`
    : `${gate} ${name}: no verdict recorded for this run.`;
  const flags = fused?.observabilityFlags ?? [];
  const open = [...new Set(flags.filter(f => (LIMITS_GATE[f] ?? []).some(g => g === '*' || g === gate)).map(f => limitationOf(f, inputs)))];
  const d = (fused?.diagnosis ?? '').toUpperCase();
  if (d.startsWith('INSUFFICIENT') || d.startsWith('EXCLUDED')) open.unshift(`The whole window: ${lowerFirst(diagnosisLabel(fused?.diagnosis))} — no gate on it carries a verdict.`);
  if (gate === 'G15' || gate === 'G14') open.push('Evidence scores rank the explanations; they are not probabilities.');

  return (
    <div className="cpm-why" data-testid="explain-why">
      <p className="cpm-copy cpm-why__result">{result}</p>

      <h4 className="cpm-eyebrow">Measured vs required</h4>
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
      {cfg.data && (
        <p className="cpm-why__source">Thresholds: {cfg.data.profileId} profile{cfg.data.bundle ? ` · bundle v${cfg.data.bundle.version}` : ' · factory / profile layers'}, as in force at {fmtInstant(run?.support.toMs, timeZone)}.</p>
      )}

      <h4 className="cpm-eyebrow">Evidence behind it</h4>
      {gate === 'G15' && fused ? (
        <CauseBreakdownRows verdict={fused.verdictV2} flags={flags} inputs={inputs} />
      ) : (
        <p className="cpm-copy">
          {run?.support.sampleCount != null ? `${run.support.sampleCount.toLocaleString('en-GB')} samples` : 'The samples'} of this run's {run?.windowKind ?? ''} window
          {manifest ? `, ${manifest.artifacts.filter(a => a.gate === gate).length} retained artifact(s) — shown in the evidence section` : ''}.
        </p>
      )}

      <h4 className="cpm-eyebrow">What remains open</h4>
      {open.length > 0
        ? <ul className="cpm-why__open">{open.map(o => <li key={o}>{o}</li>)}</ul>
        : <p className="cpm-copy">Nothing this window flags limits this gate's claim.</p>}
    </div>
  );
};

export default ExplainWhy;
