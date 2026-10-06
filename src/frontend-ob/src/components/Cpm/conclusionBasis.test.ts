// CHG-064 (SME #24): a verdict names what it rests on and what it was judged without; a pass without one of its
// inputs is "OK on available data", not a green OK.
import { describe, expect, it } from 'vitest';
import type { CpmGateMatrix } from '../../api/cpm/gates';
import { basisOf, notCheckedOf } from './conclusionBasis';
import { gateMark } from './gateStatus';
import { effectiveInputFlags, gateLimits } from './inputLimits';

const m = (diagnosis: string, flags: string[] = [], verdictV2: unknown = null) =>
  ({ diagnosis, observabilityFlags: flags, verdictV2 } as unknown as Pick<CpmGateMatrix, 'diagnosis' | 'verdictV2' | 'observabilityFlags'>);
const verdict = {
  legacy: false, observations: {
    SUSTAINED_OSCILLATION: { present: true, role: 'PRIMARY', score: 0.9, basis: 'G5,G7' },
    SATURATION: { present: false, role: 'SUPPORTING', score: 0, basis: 'G10' },
  }, hypotheses: {}, confirmation: { state: 'NOT_CONFIRMED' },
};

describe('conclusion basis', () => {
  it('a confirmed verdict says what confirmed it and that a sensor fault was not checked', () => {
    const b = basisOf(m('CONFIRMED_OSCILLATION', ['HEALTH_NOT_CONFIGURED'], verdict), { healthLabel: 'HEALTH NOT CONFIGURED' })!;
    expect(b.lead).toBe('Confirmed from');
    expect(b.from).toMatch(/\(G5, G7\)$/);
    expect(b.notChecked).toEqual(['Transmitter health: no NE107 health source is bound, so a sensor fault is not ruled out']);
  });
  it('"No problem found" also names the inputs it was judged without; no verdict → no basis', () => {
    const b = basisOf(m('NORMAL', ['NO_VP', 'NO_PEER_LINKS']))!;
    expect(b.lead).toBe('No problem found in');
    expect(b.notChecked).toHaveLength(2);
    expect(basisOf(m('INSUFFICIENT_DATA', ['NO_VP']))).toBeNull();
  });
  it('an input that does not apply on this loop is not "not checked" (CHG-059)', () => {
    const noValve = { vp: 'NOT_APPLICABLE' as const, vpMapped: false, peers: 'NOT_APPLICABLE' as const };
    expect(notCheckedOf(['NO_VP', 'NO_UPSTREAM_LINKS'], undefined, noValve)).toEqual([]);
    expect(notCheckedOf(['NO_VP'], undefined, { vp: 'NOT_INSTALLED', vpMapped: false, peers: 'EXPECTED' })[0]).toMatch(/no positioner feedback installed/);
  });
});

it('the basis cites only gates that saw the symptom on this window', () => {
  const mx = { ...m('CONFIRMED_OSCILLATION', [], verdict), gates: [{ key: 'G5', status: 'PASS' }, { key: 'G7', status: 'STRONG' }] } as never;
  expect(basisOf(mx)!.from).toBe('sustained oscillation (G7)');
});

describe('PASS on available data', () => {
  it('a pass judged without one of its inputs is grey and names the missing input', () => {
    const mk = gateMark('PASS', 'G12', ['NO_STEP_TEST']);
    expect(mk).toMatchObject({ meaning: 'ok-limited', tone: 'muted', word: 'OK on available data', limitedBy: ['no approved step test'] });
    expect(gateMark('PASS', 'G12', [])).toMatchObject({ meaning: 'ok', tone: 'good' });
    expect(gateMark('PASS', 'G11', ['HEALTH_NOT_CONFIGURED'])).toMatchObject({ meaning: 'not-seen-limited', word: 'Not seen on available data' });
    expect(gateMark('PASS', 'G3', ['HEALTH_NOT_CONFIGURED']).meaning).toBe('ok');   // flag does not limit G3
    expect(gateMark('PASS', 'G10', ['NO_VP']).meaning).toBe('not-seen-limited');      // diagnostic gate: "not seen"
    expect(gateMark('FAIL', 'G3', ['NO_VP']).meaning).toBe('failed');                 // only passes are qualified
  });
  it('flags filter to inputs and to what applies on the loop', () => {
    expect(effectiveInputFlags(['NO_VP', 'NO_VALID_CYCLE', 'HEALTH_LIMITED'])).toEqual(['NO_VP', 'HEALTH_LIMITED']);
    expect(effectiveInputFlags(['NO_VP'], { vp: 'NOT_APPLICABLE', vpMapped: false, peers: 'EXPECTED' })).toEqual([]);
    expect(gateLimits('g13', ['NO_UPSTREAM_LINKS', 'NO_PEER_LINKS'])).toEqual(['no peer links']);
  });
});
