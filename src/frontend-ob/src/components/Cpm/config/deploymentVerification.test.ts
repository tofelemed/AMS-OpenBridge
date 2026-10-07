// CHG-066: a deployment activated by the ACK-window fallback (no loop in scope produced a result) says so instead of
// claiming "a result carries this bundle hash".
import { describe, expect, it } from 'vitest';
import { deploymentStateText, deploymentStateTone } from './configSupport';

describe('deployment verification wording (CHG-066)', () => {
  it('verified by a result reads as verified', () => {
    const d = { state: 'ACTIVE_VERIFIED', kind: 'ACTIVATE', probeResults: { verifiedBy: 'RESULT', pinnedResults: 3 } };
    expect(deploymentStateText(d)).toBe('Active and verified - a result carries this bundle hash');
    expect(deploymentStateTone(d.state, d)).toBe('good');
  });
  it('verified only by the probe window reads as applied, not yet verified', () => {
    const d = { state: 'ACTIVE_VERIFIED', kind: 'ACTIVATE', probeResults: { verifiedBy: 'ACK_WINDOW', pinnedResults: 0 } };
    expect(deploymentStateText(d)).toMatch(/^Active - applied by every worker; not yet verified by a result/);
    expect(deploymentStateTone(d.state, d)).toBe('warn');
  });
  it('an older deployment without verifiedBy keeps its previous wording', () => {
    expect(deploymentStateText({ state: 'ACTIVE_VERIFIED', kind: 'ACTIVATE', probeResults: { pinnedResults: 2 } })).toMatch(/^Active and verified/);
  });
});
