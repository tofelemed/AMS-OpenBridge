/**
 * SME review #20 (CHG-056): the fused "confidence" is an EVIDENCE SCORE — how fully the observed symptoms match
 * the selected fault family's signature, capped by the engine (0.89 for a valve claim without valve-position
 * confirmation, 0.54 for a single window not yet persistent). It is uncalibrated: no statistical model stands
 * behind it, so it is never shown as a percentage or called confidence (GUM, ISO/IEC Guide 98: "confidence"
 * implies a stated probability / coverage). One name, one format, one explanation — everywhere.
 */

export const EVIDENCE_SCORE_HELP =
  'Evidence score: how fully the observed symptoms match this finding’s signature (0–100). ' +
  'Not a probability, and not a priority — the queue ranks by criticality, severity and persistence.';

/** 0..1 → 0..100, or null. */
export function evidenceScore(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? Math.round(v * 100) : null;
}

/** "evidence score 97" — '' without a value. */
export function evidenceScoreText(v: number | null | undefined): string {
  const n = evidenceScore(v);
  return n == null ? '' : `evidence score ${n}`;
}

/**
 * Why the score stops where it does, from the engine's own reason string ("… G14_cap=0.89 …",
 * "…; persistence_cap agree=1/3"): only when the score sits at that cap.
 */
export function evidenceScoreCap(statusReason: string | null | undefined, v: number | null | undefined): string | null {
  const n = evidenceScore(v);
  const r = statusReason ?? '';
  if (n == null || !r) return null;
  const persist = r.match(/persistence_cap agree=(\d+)\/(\d+)/);
  if (persist && n <= 54) return `capped at 54: not yet persistent (${persist[1]} of ${persist[2]} windows agree)`;
  const g14 = r.match(/G14_cap=([\d.]+)/);
  const cap = g14 ? Math.round(Number(g14[1]) * 100) : null;
  if (cap != null && cap < 100 && n === cap && /selected_family=(stiction|geometry)/.test(r))
    return `capped at ${cap}: a valve cause cannot be confirmed without valve position (G14)`;
  return null;
}
