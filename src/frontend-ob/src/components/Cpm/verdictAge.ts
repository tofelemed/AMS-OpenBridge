import { diagnosisLabel } from './vocabulary';
import { hasVerdict } from './metricAvailability';
import { evidenceScoreText } from './evidenceScore';
import { ageText } from './ageText';
export { ageText };
/**
 * 2026-09-17 audit F4: the page shows the loop's NEWEST evaluated window; a verdict from an older
 * window is named beside it with its age - stated as older, never presented as current.
 */

export interface VerdictReference {
  diagnosis: string | null;
  confidence: number | null;
  ageMs: number | null;
}

/**
 * CHG-156: true when the last verdict is the result already on screen (same diagnosis and score), so a page names it
 * once instead of beside itself as "last verdict".
 */
export const isSameVerdict = (current: { diagnosis: string | null; confidence: number | null }, ref: VerdictReference | null | undefined): boolean =>
  !!ref?.diagnosis && ref.diagnosis === current.diagnosis && (ref.confidence ?? null) === (current.confidence ?? null);

/** "last verdict SUSPECTED FINAL ELEMENT NONLINEARITY 89% · 15 d ago", or null without a reference. */
export function staleVerdictLine(ref: VerdictReference | null | undefined): string | null {
  if (!ref || !ref.diagnosis) return null;
  const conf = ref.confidence != null && hasVerdict(ref.diagnosis) ? ` · ${evidenceScoreText(ref.confidence)}` : ''; // CHG-053 / CHG-056: an evidence score, and none without a verdict
  const age = ageText(ref.ageMs);
  return `last verdict ${diagnosisLabel(ref.diagnosis)}${conf}${age ? ` · ${age}` : ''}`;
}
