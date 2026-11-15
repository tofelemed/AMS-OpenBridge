/**
 * CHG-187 (owner review 9, 11): the Workbench says whether this run's evidence is kept with ONE label in the gate's head, its
 * detail in a ? tip. It replaces "Proof retained · COMPLETE", the "Retained proof · The live engine's own arrays…" line
 * under it and the "Evidence not retained for this run · The verdict and every value of this run stand." note in the Proof
 * tab. A rebuilt or reconstructed set is named by the evidence-basis line instead, so the head says nothing for it.
 * CHG-188 (owner review 10.3): a window evaluated on request is "Re-evaluated" in the same place; its tip says when, from the
 * historian, and that it is kept 3 days. It replaces the "Evaluated from the historian" note and the EVALUATE pill. Pure.
 */
import type { BadgeTone } from '../../../ui/statusTones';
import type { BasisKind } from './evidenceBasis';
import type { GateState } from './GateResultState';
import { formatInZone } from './timezone';

export interface RetentionLabel { text: string; tone: BadgeTone; tip: string[] }

const KEPT = 'The live engine\'s own arrays for this run, kept by the retention policy.';
const NOT_KEPT = 'No arrays are held for this run. The verdict and every value of this run stand.';

export function retentionLabel(readiness: string | undefined, basis: BasisKind | undefined, state: GateState): RetentionLabel | null {
  if (!readiness) return null;
  // a failed or expired set names that state itself (Task 15), never "kept · FAILED"
  if (readiness === 'FAILED') return { text: 'Reconstruction failed', tone: 'danger', tip: [state.detail, state.stillValid].filter(Boolean) };
  if (readiness === 'EXPIRED') return { text: 'Reconstruction expired', tone: 'unknown', tip: [state.detail, state.stillValid].filter(Boolean) };
  if (basis === 'REBUILT_LOST' || basis === 'RECONSTRUCTION' || basis === 'EVALUATED') return null;
  if (readiness === 'NONE') {
    return { text: 'Evidence not kept', tone: 'unknown', tip: state.kind === 'NOT_RETAINED' ? [state.detail, state.stillValid].filter(Boolean) : [NOT_KEPT] };
  }
  if (readiness === 'PENDING' || readiness === 'PARTIAL') {
    return { text: 'Evidence arriving', tone: 'info', tip: ['Some of the arrays are not stored yet. The verdict and its values are valid.'] };
  }
  return { text: 'Evidence kept', tone: 'info', tip: [KEPT] };
}

/** The label of a window evaluated on request; the time as the workbench prints every time (formatInZone). */
export function reEvaluatedLabel(ranAtMs: number | null, timeZone: string): RetentionLabel {
  const when = ranAtMs != null ? ` ${formatInZone(ranAtMs, timeZone)}` : '';
  return {
    text: 'Re-evaluated', tone: 'info',
    tip: [`Evaluated on request${when}, from the historian, with the engine the live verdicts use.`, 'Kept 3 days.'],
  };
}
