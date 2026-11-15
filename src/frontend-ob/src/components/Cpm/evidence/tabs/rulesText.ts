/**
 * CHG-187 (owner review 11.3): "Needs" in plain words. The catalogue's precondition text is the engine's; each plain sentence
 * here replaces exactly the text it was written from, so a changed precondition shows as the service serves it, never a stale
 * rewrite. Pure.
 */
const PLAIN_NEEDS: Record<string, { served: string; plain: string }> = {
  G0: { served: 'Samples on the window; per-role quality decoded under the source\'s declared protocol.',
    plain: 'Samples in the window, with each signal\'s quality read from its source.' },
  G1: { served: 'Mode role mapped and decoded.', plain: 'The loop\'s mode signal, mapped and readable.' },
  G2: { served: 'SP role; a stability band (EU objective or declared span) - otherwise NOT_EVALUATED, not PASS.',
    plain: 'The setpoint signal and a stability band (an error objective or a declared span). Without a band the gate is not evaluated; it does not pass.' },
  G2r: { served: 'Region bounds declared on the profile.', plain: 'Operating-region limits declared on the loop\'s profile.' },
  G3: { served: 'PV and SP; the tolerance band from the profile (a declared objective in Phase 3).', plain: 'PV and SP, and the error band from the profile.' },
  G4: { served: 'Applied input (VP when mapped and fresh, else OP); PV span for the dimensionless ratio.',
    plain: 'The applied input (the valve position when mapped and fresh, else the output) and the PV span.' },
  G5: { served: 'Enough cycles of the candidate period inside the window (>= 3) at >= 8 samples per period.',
    plain: 'At least 3 cycles of the oscillation inside the window, with at least 8 samples per cycle.' },
  G6: { served: 'The band the profile declares (tauMin..tauMax); a record long enough for the segment.',
    plain: 'The frequency band the profile declares, and a record long enough for the spectrum.' },
  G7: { served: 'A valid period from G5/G6 and complete cycles.', plain: 'A valid period from G5 or G6, and complete cycles.' },
  G8: { served: 'Applied input and PV over the same support.', plain: 'The applied input and the PV over the same stretch of time.' },
  G9: { served: 'Complete cycles from G5/G6.', plain: 'Complete cycles from G5 or G6.' },
  G10: { served: 'Applied input; engineering limits (or the flagged fallback).', plain: 'The applied input and its engineering limits (or the flagged default).' },
  G11: { served: 'PV; an instrument binding for the health lanes.', plain: 'The PV, and an instrument link for the health checks.' },
  G12: { served: 'A qualified reference or applied-input event with stable pre-support; VP fresh when it is the applied input.',
    plain: 'A qualified setpoint or input step with steady data before it; the valve position fresh when it is the applied input.' },
  G13: { served: 'Peer links in the registry; the peers\' samples over compatible support (min_compatible_support_s).',
    plain: 'Peer links in the loop registry, and the peers\' samples over a long enough shared stretch of time.' },
  G14: { served: 'VP mapped, fresh and GOOD over the qualifying interval.', plain: 'The valve position mapped, fresh and of good quality over the qualifying interval.' },
  G15: { served: 'The tier results of the same support.', plain: 'The results of the other gates over the same window.' },
};

export function plainNeeds(gate: string, served: string): string {
  const p = PLAIN_NEEDS[gate];
  return p && p.served === served ? p.plain : served;
}
