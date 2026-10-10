// CHG-059 (SME #23): optional inputs read by applicability — same rule as cplm-api OptionalInputs.
import { describe, expect, it } from 'vitest';
import type { CpmLoop } from '../../api/cpmApi';
import { inputContextOf, optionalInputLimitation, peerApplicabilityOf, vpApplicabilityOf } from './optionalInputs';

const loop = (engineering: Record<string, unknown> | null, commandPath: string | null, tags: Record<string, string> = {}) =>
  ({ engineering, model: commandPath ? { commandPath } : null, tags } as unknown as CpmLoop);

describe('optional inputs', () => {
  it('derives VP applicability from the command path; a declared value wins', () => {
    expect(vpApplicabilityOf(loop(null, 'OP_TO_VFD'))).toBe('NOT_APPLICABLE');
    expect(vpApplicabilityOf(loop(null, 'op_to_pv'))).toBe('NOT_APPLICABLE');
    expect(vpApplicabilityOf(loop(null, 'OP_TO_VALVE'))).toBe('EXPECTED');
    expect(vpApplicabilityOf(loop(null, null))).toBe('EXPECTED');
    expect(vpApplicabilityOf(loop({ vpApplicability: 'not_installed' }, 'OP_TO_VFD'))).toBe('NOT_INSTALLED');
    expect(vpApplicabilityOf(loop({ vpApplicability: 'nonsense' }, 'OP_TO_VFD'))).toBe('NOT_APPLICABLE');
    expect(peerApplicabilityOf(loop(null, null))).toBe('EXPECTED');
    expect(peerApplicabilityOf(loop({ peerApplicability: 'NOT_APPLICABLE' }, null))).toBe('NOT_APPLICABLE');
  });
  it('turns NO_VP into the sentence true for this loop', () => {
    const ctx = (e: Record<string, unknown> | null, cp: string | null, tags = {}) => inputContextOf(loop(e, cp, tags));
    // CHG-077: declared without a valve position (either value) = a fact that does not apply, never a gap
    expect(optionalInputLimitation('NO_VP', ctx(null, 'OP_TO_VFD'))).toMatch(/^This loop has no valve position.*does not apply/);
    expect(optionalInputLimitation('NO_VP', ctx({ vpApplicability: 'NOT_INSTALLED' }, null))).toMatch(/does not apply/);
    expect(optionalInputLimitation('NO_VP', ctx(null, null, { VP: 'a/b/c.vp' }))).toMatch(/^Valve position mapped but no samples/);
    expect(optionalInputLimitation('NO_VP', ctx(null, null))).toMatch(/^Valve position expected but not mapped/);
  });
  it('peer flags read as "does not apply" only when peers are not expected; other flags pass through', () => {
    expect(optionalInputLimitation('NO_UPSTREAM_LINKS', inputContextOf(loop({ peerApplicability: 'NOT_APPLICABLE' }, null))))
      .toBe('No interacting loops: peer interaction (G13) does not apply');
    expect(optionalInputLimitation('NO_UPSTREAM_LINKS', inputContextOf(loop(null, null)))).toBeNull();
    expect(optionalInputLimitation('LOW_EXCITATION', inputContextOf(loop(null, null)))).toBeNull();
    expect(optionalInputLimitation('NO_VP', undefined)).toBeNull();
  });
});

describe('registry labels', () => {
  it('one word per VP state; the peer row says whether peers are expected', async () => {
    const { vpCellLabel, vpDetail, peerDetail } = await import('./optionalInputs');
    expect(vpCellLabel(loop(null, null, { VP: 'a/b.vp' }))).toBe('Mapped');
    expect(vpCellLabel(loop(null, null))).toBe('Not mapped');
    expect(vpCellLabel(loop({ vpApplicability: 'NOT_INSTALLED' }, null))).toBe('No VP');
    expect(vpCellLabel(loop(null, 'OP_TO_VFD'))).toBe('No VP');
    expect(vpDetail(loop({ vpApplicability: 'NOT_APPLICABLE' }, null))).toMatch(/does not apply/);
    expect(vpDetail(loop(null, null))).toMatch(/^Expected but not mapped/);
    expect(peerDetail(loop({ peerApplicability: 'NOT_APPLICABLE' }, null))).toMatch(/does not apply/);
    expect(peerDetail(loop(null, null))).toMatch(/expected/);
  });
});

describe('wizard labels', () => {
  it('names a fact state and summarises the declared applicability', async () => {
    const { factStateLabel, applicabilitySummary } = await import('./optionalInputs');
    expect(factStateLabel('NOT_APPLICABLE')).toBe('Not applicable');
    expect(factStateLabel('AVAILABLE')).toBeNull();
    expect(applicabilitySummary('', 'NOT_APPLICABLE')).toBe('Valve position derived · peers not applicable');
    expect(applicabilitySummary('EXPECTED', '')).toBe('Valve position yes · peers derived');
    expect(applicabilitySummary('NOT_APPLICABLE', '')).toBe('Valve position none on this loop · peers derived');
  });
});

describe('CHG-077: a loop without a valve position is never missing one', () => {
  it('drops NO_VP from the flags only where the loop has no valve position', async () => {
    const { flagsForLoop, vpAbsent } = await import('./optionalInputs');
    const none = inputContextOf(loop({ vpApplicability: 'NOT_APPLICABLE' }, null));
    const has = inputContextOf(loop({ vpApplicability: 'EXPECTED' }, null));
    expect(flagsForLoop(['NO_VP', 'NO_STEP_TEST'], none)).toEqual(['NO_STEP_TEST']);
    expect(flagsForLoop(['NO_VP', 'NO_STEP_TEST'], has)).toEqual(['NO_VP', 'NO_STEP_TEST']);
    expect(flagsForLoop(['NO_VP'], undefined)).toEqual(['NO_VP']);
    expect(vpAbsent(none)).toBe(true);
    expect(vpAbsent(has)).toBe(false);
    expect(vpAbsent(undefined)).toBe(false);
  });
  it('the registry state is not Degraded for a loop declared without a valve position', async () => {
    const { stateOf } = await import('./registryShared');
    const base = { isActive: true, monitoringEnabled: true, observabilityFlags: ['NO_VP'], tags: {}, model: null };
    expect(stateOf({ ...base, engineering: { vpApplicability: 'NOT_APPLICABLE' } } as unknown as CpmLoop).label).toBe('Active');
    expect(stateOf({ ...base, engineering: { vpApplicability: 'EXPECTED' } } as unknown as CpmLoop).label).toBe('Degraded');
  });
});
