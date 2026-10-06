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
    expect(optionalInputLimitation('NO_VP', ctx(null, 'OP_TO_VFD'))).toMatch(/^No valve on this loop/);
    expect(optionalInputLimitation('NO_VP', ctx({ vpApplicability: 'NOT_INSTALLED' }, null))).toMatch(/^No positioner feedback installed/);
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
    expect(vpCellLabel(loop({ vpApplicability: 'NOT_INSTALLED' }, null))).toBe('Not installed');
    expect(vpCellLabel(loop(null, 'OP_TO_VFD'))).toBe('No valve');
    expect(vpDetail(loop(null, null))).toMatch(/^Expected but not mapped/);
    expect(peerDetail(loop({ peerApplicability: 'NOT_APPLICABLE' }, null))).toMatch(/does not apply/);
    expect(peerDetail(loop(null, null))).toMatch(/expected/);
  });
});
