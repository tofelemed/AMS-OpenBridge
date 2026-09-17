// 2026-09-17 audit F11: the fleet capability tiles spoke v1 ("confidence-capped (no VP) - cannot reach
// CONFIRMED", "no peer links"). Under fusion v2 a missing positioner signal means valve faults can only
// be confirmed from an approved test record, and missing peers mean G13's interaction analysis is
// unavailable - the tiles say exactly that, with the count.
import { describe, expect, it } from 'vitest';
import { diagnosticCapabilityCopy, peersCopy, positionerCopy } from './capabilityCopy';

describe('capability copy', () => {
  it('states what a missing positioner signal means under fusion v2', () => {
    expect(positionerCopy(224)).toEqual({ caption: 'Without positioner feedback', sub: 'valve faults confirmable only from an approved test record (G14)' });
    expect(positionerCopy(0)).toEqual({ caption: 'Without positioner feedback', sub: 'every loop has VP: non-following evidence can confirm a valve fault' });
  });
  it('states what missing peers mean for G13', () => {
    expect(peersCopy(228).sub).toBe('interaction analysis unavailable (G13) until peers are configured');
    expect(peersCopy(0).sub).toBe('every loop has configured peers for G13');
  });
  it('the Performance tile counts loops that can confirm from evidence, and names the remedy', () => {
    expect(diagnosticCapabilityCopy(230, 224)).toEqual({ value: '6/230', sub: '224 loop(s) without VP — valve faults there need an approved test record to be confirmed' });
    expect(diagnosticCapabilityCopy(230, 0).sub).toBe('every loop can confirm a valve fault from non-following evidence');
    expect(diagnosticCapabilityCopy(null, null)).toEqual({ value: '—', sub: 'fleet capability unavailable' });
  });
});
