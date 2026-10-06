/**
 * SME review #24 (CHG-064): which missing INPUT limits which gate's claim, from the window's observability flags.
 * A gate that passed while one of its inputs was missing passed "on available data" — it is not the same fact as a
 * pass on full inputs (NAMUR NE107: absent diagnostics are not OK; ISA-101: green only for a confirmed normal).
 * Moved from evidence/ExplainWhy (CHG-055), which keeps its wider method-limit table on top of this.
 */
import { optionalInputLimitation, type InputContext } from './optionalInputs';

/** Missing inputs → the gates whose result they limit. */
export const INPUT_LIMITS_GATE: Record<string, string[]> = {
  NO_VP: ['G10', 'G14', 'G15'],
  HEALTH_NOT_CONFIGURED: ['G11', 'G15'],
  HEALTH_LIMITED: ['G11', 'G15'],
  NO_UPSTREAM_LINKS: ['G13', 'G15'],
  NO_PEER_LINKS: ['G13', 'G15'],
  NO_STEP_TEST: ['G12', 'G15'],
};

/** What is missing, as a short noun phrase for "on available data — …". */
export const MISSING_INPUT: Record<string, string> = {
  NO_VP: 'no valve position',
  HEALTH_NOT_CONFIGURED: 'no transmitter health source',
  HEALTH_LIMITED: 'limited transmitter health',
  NO_UPSTREAM_LINKS: 'no peer links',
  NO_PEER_LINKS: 'no peer links',
  NO_STEP_TEST: 'no approved step test',
};

/**
 * The flags that are real gaps on THIS loop (CHG-059): a NO_VP on a loop without a valve, or a peer flag on a loop
 * without interacting loops, does not limit anything — the input does not apply there.
 */
export function effectiveInputFlags(flags: readonly string[] | null | undefined, inputs?: InputContext): string[] {
  return (flags ?? []).filter(f => f in INPUT_LIMITS_GATE && !optionalInputLimitation(f, inputs)?.includes('does not apply'));
}

/** The missing inputs that limit this gate, as phrases ("no transmitter health source"); [] when none. */
export function gateLimits(gate: string | null | undefined, flags: readonly string[] | null | undefined): string[] {
  const g = (gate ?? '').toUpperCase();
  if (!g) return [];
  const hits = (flags ?? []).filter(f => INPUT_LIMITS_GATE[f]?.includes(g)).map(f => MISSING_INPUT[f]);
  return [...new Set(hits)];
}
