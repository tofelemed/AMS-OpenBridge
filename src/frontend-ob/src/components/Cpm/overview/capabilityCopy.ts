/**
 * 2026-09-17 audit F11: the words of the fleet capability tiles under fusion v2 (spec v6 R02): a
 * valve fault is confirmed only by positive non-following evidence (VP tracking) or an approved test
 * record - never by VP presence, and never capped at a number; peer interaction (G13) needs configured
 * peers. The registry counts are the same; what they MEAN changed.
 */

export function positionerCopy(loopsExpectedUnmapped: number): { caption: string; sub: string } {
  // CHG-059 (SME #23): only loops where a VP is EXPECTED count — a drive has no valve, a valve without a positioner is a fact
  return {
    caption: 'Valve position expected but not mapped',
    sub: loopsExpectedUnmapped > 0
      ? 'map the VP tag so non-following evidence can confirm a valve fault (G14)'
      : 'every loop that should report a valve position does',
  };
}

export function peersCopy(loopsExpectedMissing: number): { caption: string; sub: string } {
  return {
    caption: 'Peer links expected but missing',
    sub: loopsExpectedMissing > 0
      ? 'interaction analysis unavailable (G13) until peers are configured'
      : 'every loop that should have peers has them (G13)',
  };
}

/** CHG-059: the plant facts beside the gaps — counted, never presented as configuration errors. */
export function plantFactsCopy(c: { vpNotInstalled?: number; vpNotApplicable?: number; peersNotApplicable?: number }): string | null {
  const parts = [
    c.vpNotInstalled ? `${c.vpNotInstalled} without positioner feedback installed (valve cause suspected, not confirmed)` : null,
    c.vpNotApplicable ? `${c.vpNotApplicable} without a valve (valve diagnosis does not apply)` : null,
    c.peersNotApplicable ? `${c.peersNotApplicable} without interacting loops (G13 does not apply)` : null,
  ].filter(Boolean);
  return parts.length ? `Plant facts, nothing to fix: ${parts.join(' · ')}.` : null;
}

/** Loops that can confirm a valve fault from VP, out of the loops that HAVE a valve (CHG-059). */
export function diagnosticCapabilityCopy(fleetTotal: number | null, expectedUnmapped: number | null,
  facts: { vpNotInstalled?: number; vpNotApplicable?: number } = {}): { value: string; sub: string } {
  if (fleetTotal == null || expectedUnmapped == null) return { value: '—', sub: 'fleet capability unavailable' };
  const valves = fleetTotal - (facts.vpNotApplicable ?? 0);
  const withVp = Math.max(0, valves - expectedUnmapped - (facts.vpNotInstalled ?? 0));
  return {
    value: `${withVp}/${valves}`,
    sub: expectedUnmapped > 0
      ? `${expectedUnmapped} valve loop(s) with VP expected but not mapped — valve faults there need an approved test record to be confirmed`
      : withVp < valves ? `${valves - withVp} valve loop(s) without positioner feedback installed` : 'every valve loop can confirm a valve fault from non-following evidence',
  };
}
