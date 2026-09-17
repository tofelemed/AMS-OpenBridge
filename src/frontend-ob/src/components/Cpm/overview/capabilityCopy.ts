/**
 * 2026-09-17 audit F11: the words of the fleet capability tiles under fusion v2 (spec v6 R02): a
 * valve fault is confirmed only by positive non-following evidence (VP tracking) or an approved test
 * record - never by VP presence, and never capped at a number; peer interaction (G13) needs configured
 * peers. The registry counts are the same; what they MEAN changed.
 */

export function positionerCopy(loopsWithoutVp: number): { caption: string; sub: string } {
  return {
    caption: 'Without positioner feedback',
    sub: loopsWithoutVp > 0
      ? 'valve faults confirmable only from an approved test record (G14)'
      : 'every loop has VP: non-following evidence can confirm a valve fault',
  };
}

export function peersCopy(loopsWithoutPeers: number): { caption: string; sub: string } {
  return {
    caption: 'Without configured peers',
    sub: loopsWithoutPeers > 0
      ? 'interaction analysis unavailable (G13) until peers are configured'
      : 'every loop has configured peers for G13',
  };
}

export function diagnosticCapabilityCopy(fleetTotal: number | null, loopsWithoutVp: number | null): { value: string; sub: string } {
  if (fleetTotal == null || loopsWithoutVp == null) return { value: '—', sub: 'fleet capability unavailable' };
  return {
    value: `${fleetTotal - loopsWithoutVp}/${fleetTotal}`,
    sub: loopsWithoutVp > 0
      ? `${loopsWithoutVp} loop(s) without VP — valve faults there need an approved test record to be confirmed`
      : 'every loop can confirm a valve fault from non-following evidence',
  };
}
