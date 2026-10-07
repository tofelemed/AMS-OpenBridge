/**
 * The words of the Loop summary card (SME review 2026-10-05, point 4): the
 * served gates/latest row turned into engineering language — condition,
 * leading cause, the evidence that was seen, the limitations that remain and
 * the next thing to check. Pure functions, so every phrase is unit-tested.
 *
 * Nothing here judges the loop; the engine did. An unknown token is humanised,
 * never hidden.
 */
import type { CpmGateMatrix } from '../../../../api/cpm/gates';
import { HYPOTHESIS_LABEL, OBSERVATION_LABEL } from '../../../../api/cpm/verdict';
import { toneFor, type CpmTone } from '../../shared';
import { codeLabel, diagnosisLabel } from '../../vocabulary';
import { optionalInputLimitation, type InputContext } from '../../optionalInputs';


export type ConditionKind = 'finding' | 'healthy' | 'excluded' | 'insufficient' | 'not-evaluated';

export interface Condition { kind: ConditionKind; label: string; tone: CpmTone }

/** `CONFIRMED_OSCILLATION` → "Oscillation confirmed"; the not-judged states say why. */
export function conditionOf(diagnosis: string | null | undefined): Condition {
  const d = (diagnosis ?? '').toUpperCase();
  if (!d || d === 'NOT_EVALUATED' || d === 'NO_CALL')
    return { kind: 'not-evaluated', label: 'Not evaluated yet', tone: 'muted' };
  if (d.startsWith('INSUFFICIENT'))
    return { kind: 'insufficient', label: 'Not evaluated: not enough data', tone: 'muted' };
  if (d.startsWith('EXCLUDED'))
    return { kind: 'excluded', label: 'Excluded: loop not in automatic', tone: 'muted' };
  if (d === 'NORMAL' || d === 'NONE' || d === 'HEALTHY')
    return { kind: 'healthy', label: 'No problem found', tone: 'good' };
  return { kind: 'finding', label: diagnosisLabel(d), tone: toneFor(d) };
}

/** Observability flags as limitations, each with what it costs the diagnosis. */
const LIMITATION: Record<string, string> = {
  NO_VP: 'No valve position mapped: a valve cause cannot be confirmed',
  NO_VALID_CYCLE: 'No clean oscillation cycle: period and waveform shape not measured',
  HEALTH_NOT_CONFIGURED: 'Instrument health not configured: transmitter faults are not checked',
  NO_UPSTREAM_LINKS: 'No upstream or peer links: interaction with other loops not assessed',
  NO_PEER_LINKS: 'No upstream or peer links: interaction with other loops not assessed',
  NO_STEP_TEST: 'No approved step test: no process model to compare against',
  INSUFFICIENT_SAMPLES: 'Too few samples in the window',
  QUALITY_UNKNOWN: 'Source quality unknown for the window',
};

/** CHG-059: with the loop's optional-input context, NO_VP / NO_UPSTREAM_LINKS read as what is true for THIS loop. */
export const limitationOf = (flag: string, inputs?: InputContext): string =>
  optionalInputLimitation(flag, inputs) ?? LIMITATION[flag] ?? codeLabel(flag);

/** Distinct limitations in served order (two flags can mean the same thing). */
export function limitationsOf(flags: string[] | null | undefined, inputs?: InputContext): string[] {
  return [...new Set((flags ?? []).map(f => limitationOf(f, inputs)))];
}

export interface EvidenceItem { label: string; main: boolean }

/** What was SEEN: present observations, main (PRIMARY) first, then by evidence score. */
export function evidenceOf(matrix: Pick<CpmGateMatrix, 'verdictV2'>, max = 3): EvidenceItem[] {
  const obs = matrix.verdictV2?.observations ?? {};
  return Object.entries(obs)
    .filter(([, o]) => o.present)
    .sort(([, a], [, b]) => Number(b.role === 'PRIMARY') - Number(a.role === 'PRIMARY') || b.score - a.score)
    .slice(0, max)
    .map(([id, o]) => ({ label: OBSERVATION_LABEL[id] ?? codeLabel(id), main: o.role === 'PRIMARY' }));
}

/** The leading explanation, or null when no mechanism qualified (a symptom is not a cause). */
export function leadingCauseOf(matrix: Pick<CpmGateMatrix, 'verdictV2'>): string | null {
  const lh = matrix.verdictV2?.leadingHypothesis;
  if (!lh || lh === 'NONE') return null;
  return HYPOTHESIS_LABEL[lh] ?? codeLabel(lh);
}

/** The engine's recommendation, else a sensible next check for the state. */
export function nextCheckOf(matrix: Pick<CpmGateMatrix, 'narrative'>, condition: Condition): string {
  const rec = matrix.narrative?.recommendation?.trim();
  if (rec) return rec;
  switch (condition.kind) {
    case 'insufficient': return 'Check that the loop’s signals are arriving: the Window Inspector shows the samples each window received.';
    case 'excluded': return 'Nothing to assess while the loop is out of automatic; Historical shows when it ran in AUT or CASCADE.';
    case 'not-evaluated': return 'Wait for the next evaluation window, or check the loop’s readiness if none arrives.';
    case 'healthy': return 'No action needed.';
    default: return 'Open the investigation to review the evidence behind this result.';
  }
}

/** CHG-065: one age format across the CPA pages ("45 s ago" / "12 min ago" / "3 h ago" / "57 d ago"). */
export { ageText } from '../../verdictAge';

export interface SummaryAction { label: string; target: 'investigation' | 'windows' | 'historical' }

/** The primary action matches the next check: you are sent where the check is done. */
export function primaryActionOf(condition: Condition): SummaryAction {
  switch (condition.kind) {
    case 'insufficient': return { label: 'Open Window Inspector ›', target: 'windows' };
    case 'excluded': return { label: 'Open Historical ›', target: 'historical' };
    default: return { label: 'Open investigation ›', target: 'investigation' };
  }
}

/**
 * A window is shown with its age once it ended longer ago than its own size
 * (a 24h window more than 24 h old): the summary must not read old evidence as
 * current, nor flag a normal latest window. Unknown kinds use 24 h.
 */
export function staleAfterMs(windowKind: string): number {
  const m = windowKind.match(/^(\d+)\s*(m|h|d)$/i);
  if (!m) return 24 * 3600_000;
  const unit = m[2].toLowerCase() === 'm' ? 60_000 : m[2].toLowerCase() === 'h' ? 3600_000 : 86_400_000;
  return Number(m[1]) * unit;
}
