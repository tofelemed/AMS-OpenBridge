// 2026-09-17 audit F11 + CHG-059 (SME #23): the fleet capability tiles say what a missing input MEANS, and
// count as a gap only the loops where the input is expected — a drive has no valve, a valve without a
// positioner is a plant fact, a stand-alone loop has no peers. Those are counted apart, never as errors.
import { describe, expect, it } from 'vitest';
import { diagnosticCapabilityCopy, peersCopy, plantFactsCopy, positionerCopy } from './capabilityCopy';

describe('capability copy', () => {
  it('names only the expected-but-unmapped valve position as the gap', () => {
    expect(positionerCopy(12)).toEqual({ caption: 'Valve position expected but not mapped', sub: 'map the VP tag so non-following evidence can confirm a valve fault (G14)' });
    expect(positionerCopy(0).sub).toBe('every loop that should report a valve position does');
  });
  it('names only expected-but-missing peers as the gap', () => {
    expect(peersCopy(228).sub).toBe('interaction analysis unavailable (G13) until peers are configured');
    expect(peersCopy(0).sub).toBe('every loop that should have peers has them (G13)');
  });
  it('lists plant facts as facts, and nothing when there are none', () => {
    expect(plantFactsCopy({ vpNotInstalled: 3, vpNotApplicable: 40, peersNotApplicable: 0 }))
      .toBe('Plant facts, nothing to fix: 3 without positioner feedback installed (valve cause suspected, not confirmed) · 40 without a valve (valve diagnosis does not apply).');
    expect(plantFactsCopy({})).toBeNull();
  });
  it('the Performance tile counts valve loops only and names the remedy', () => {
    expect(diagnosticCapabilityCopy(230, 180, { vpNotApplicable: 40, vpNotInstalled: 4 })).toEqual({
      value: '6/190', sub: '180 valve loop(s) with VP expected but not mapped — valve faults there need an approved test record to be confirmed' });
    expect(diagnosticCapabilityCopy(230, 0, { vpNotInstalled: 4 }).sub).toBe('4 valve loop(s) without positioner feedback installed');
    expect(diagnosticCapabilityCopy(10, 0).sub).toBe('every valve loop can confirm a valve fault from non-following evidence');
    expect(diagnosticCapabilityCopy(null, null)).toEqual({ value: '—', sub: 'fleet capability unavailable' });
  });
});
