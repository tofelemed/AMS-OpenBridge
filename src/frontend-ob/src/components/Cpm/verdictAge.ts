import { diagnosisLabel } from './vocabulary';
import { hasVerdict } from './metricAvailability';
import { evidenceScoreText } from './evidenceScore';
/**
 * 2026-09-17 audit F4: the page shows the loop's NEWEST evaluated window; a verdict from an older
 * window is named beside it with its age - stated as older, never presented as current.
 */

export interface VerdictReference {
  diagnosis: string | null;
  confidence: number | null;
  ageMs: number | null;
}

export function ageText(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  if (ms < 60_000) return `${Math.round(ms / 1000)} s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 36 * 3_600_000) return `${Math.round(ms / 3_600_000)} h ago`;
  const d = Math.round(ms / 86_400_000);
  return `${d} day${d === 1 ? '' : 's'} ago`;   // CHG-065: the one CPA age format (words for days)
}

/** "last verdict SUSPECTED FINAL ELEMENT NONLINEARITY 89% · 15 d ago", or null without a reference. */
export function staleVerdictLine(ref: VerdictReference | null | undefined): string | null {
  if (!ref || !ref.diagnosis) return null;
  const conf = ref.confidence != null && hasVerdict(ref.diagnosis) ? ` · ${evidenceScoreText(ref.confidence)}` : ''; // CHG-053 / CHG-056: an evidence score, and none without a verdict
  const age = ageText(ref.ageMs);
  return `last verdict ${diagnosisLabel(ref.diagnosis)}${conf}${age ? ` · ${age}` : ''}`;
}
