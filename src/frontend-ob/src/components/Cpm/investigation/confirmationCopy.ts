/**
 * v2.5 Task 1E.2 (spec v6 R02) — the ONE place that says what G14 means for a verdict.
 *
 * It replaces five copies of "confidence is capped at 0.89 and no diagnosis can reach
 * CONFIRMED" that hard-coded a number the engine no longer applies that way. The engine
 * decides; this module only renders the served confirmation state and reason. Nothing here
 * derives a verdict, a score or a cap.
 */
import type { CpmConfirmation } from '../../../api/cpm/verdict';

/** What a loop with no valve-position signal can and cannot get — for registry/wizard/aside copy. */
export const NO_VP_COPY =
  'Without a valve-position (VP) signal, G14 cannot confirm a final-element fault: such a verdict '
  + 'stops at SUSPECTED. Oscillation and effort verdicts are unaffected.';

/** Fleet-level version of the same fact, for a count of loops with no VP mapped. */
export function noVpFleetCopy(count: number): string {
  return `${count} loop(s) have no VP signal, so a final-element fault on them can be SUSPECTED at most, never CONFIRMED.`;
}

const fmtS = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(0)} s`);

/**
 * One sentence per served confirmation state. `legacy` rows (written before v2.5) are named
 * as such: G14 was then a VP-presence flag and must not be read as a confirmation.
 */
export function confirmationProse(c: CpmConfirmation | null | undefined, legacy = false): string {
  if (legacy || !c || c.state === 'LEGACY_FLAG_ONLY') {
    return 'This result predates v2.5: G14 was a VP-presence flag (LEGACY_FLAG_ONLY), not a confirmation.';
  }
  switch (c.state) {
    case 'CONFIRMED':
      return `Measured valve position did not follow the controller output for ${fmtS(c.nonFollowingDwellS)} `
        + `(p95 tracking error ${c.trackingErrorP95Pp.toFixed(1)} pp): the final-element claim is confirmed.`;
    case 'CONTRADICTED':
      return `Measured valve position tracked the demand within tolerance (p95 error ${c.trackingErrorP95Pp.toFixed(1)} pp): `
        + 'a final-element claim is contradicted and the verdict is held at DETECTED.';
    case 'NOT_CONFIRMED':
      return c.reason === 'NO_VP'
        ? NO_VP_COPY
        : 'VP is mapped but showed no non-following dwell: the final-element claim is not confirmed and stops at SUSPECTED.';
    case 'NOT_APPLICABLE':
      return 'The verdict is a symptom family (oscillation or effort): a final-element confirmation does not apply.';
    default:
      return `G14 confirmation state ${c.state} (${c.reason || 'no reason served'}).`;
  }
}

/** Short pill text for the G14 state. */
export function confirmationLabel(c: CpmConfirmation | null | undefined, legacy = false): string {
  if (legacy || !c || c.state === 'LEGACY_FLAG_ONLY') return 'LEGACY FLAG';
  return c.state.replace(/_/g, ' ');
}
