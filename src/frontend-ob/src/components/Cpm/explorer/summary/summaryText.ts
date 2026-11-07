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
import { bandOf, codeLabel, diagnosisLabel, exclusionLabel } from '../../vocabulary';
import { ageText as verdictAgeText } from '../../ageText';
import { optionalInputLimitation, type InputContext } from '../../optionalInputs';
import { flagsForLoop } from '../../optionalInputs';


export type ConditionKind = 'finding' | 'no-fault' | 'healthy' | 'excluded' | 'insufficient' | 'not-evaluated';

export interface Condition { kind: ConditionKind; label: string; tone: CpmTone }

/** The engine weighed the window: a finding, no fault, or healthy. The other kinds say why it did not. */
export const isJudged = (kind: ConditionKind): boolean => kind === 'finding' || kind === 'no-fault' || kind === 'healthy';

/**
 * What a window's result is. The words are `diagnosisLabel`'s, so one vocabulary serves every page, and an exclusion names
 * its real reason. CHG-092: NO_CALL and INSUFFICIENT_EVIDENCE are verdicts, the engine's only no-fault results: judged, and
 * no fault reached the evidence threshold. That is `no-fault`, not `insufficient` (INSUFFICIENT_DATA: too few samples) and
 * not `healthy`: it is a diagnostic statement, not a performance one, so it stays grey, never green (SME 2 #12).
 */
export function conditionOf(diagnosis: string | null | undefined): Condition {
  const label = diagnosisLabel(diagnosis);
  const d = (diagnosis ?? '').trim().toUpperCase();
  const band = bandOf(d);
  if (band === 'NOT_EVALUATED') return { kind: 'not-evaluated', label, tone: 'muted' };
  if (band === 'NO_FAULT') return { kind: 'no-fault', label, tone: 'muted' };
  if (d.startsWith('INSUFFICIENT')) return { kind: 'insufficient', label, tone: 'muted' };
  if (band === 'EXCLUDED') return { kind: 'excluded', label, tone: 'muted' };
  if (d === 'NORMAL' || d === 'NONE' || d === 'HEALTHY') return { kind: 'healthy', label, tone: 'good' };
  return { kind: 'finding', label, tone: toneFor(d) };
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
  // CHG-077: an input this loop does not have (no valve position, no interacting loops) limits nothing
  return [...new Set(flagsForLoop(flags, inputs).map(f => limitationOf(f, inputs)))];
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
    case 'excluded': return condition.label === exclusionLabel('EXCLUDED_MODE')
      ? 'Nothing to assess while the loop is out of automatic; Historical shows when it ran in AUT or CASCADE.'
      : 'Nothing to assess on an excluded window; Historical shows what the loop was doing.';
    case 'not-evaluated': return 'Wait for the next evaluation window, or check the loop’s readiness if none arrives.';
    case 'no-fault': return 'No fault reached the evidence threshold; review the signals if the loop still performs poorly.';
    case 'healthy': return 'No action needed.';
    default: return 'Open the investigation to review the evidence behind this result.';
  }
}

/** CHG-065: one age format across the CPA pages ("45 s ago" / "12 min ago" / "3 h ago" / "57 d ago"). */
export { ageText } from '../../ageText';

export interface SummaryAction { label: string; target: 'investigation' | 'windows' | 'historical' }

/** The primary action matches the next check: you are sent where the check is done. */
export function primaryActionOf(condition: Condition): SummaryAction {
  switch (condition.kind) {
    case 'insufficient': return { label: 'Open Window Inspector →', target: 'windows' };
    case 'excluded': return { label: 'Open Historical →', target: 'historical' };
    // CHG-098 (SME review 2 #21): the Explorer gives the quick condition; the why and the action are the Investigation's
    default: return { label: 'Why and what to do → Investigation', target: 'investigation' };
  }
}

/** "26 days ago" once the row's window is older than its own cadence, else null. Shared by the card and its one-line row. */
export function windowAgeOf(matrix: { windowEnd?: string | null }, windowKind: string, now = Date.now()): string | null {
  const end = matrix.windowEnd ? Date.parse(matrix.windowEnd) : NaN;
  return Number.isFinite(end) && now - end > staleAfterMs(windowKind) ? verdictAgeText(now - end) : null;
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
