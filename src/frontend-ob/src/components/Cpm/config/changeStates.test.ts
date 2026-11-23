// Final review I2: one list of the states a change is on its way in, the settled ones and the step order, shared by every page.
import { describe, expect, it } from 'vitest';
import { CHANGE_STEPS, IN_PROGRESS, SETTLED } from './changeStates';
import { stepMarks } from './levelWords';

describe('changeStates', () => {
  it('a deployment that did not finish is still on its way; a settled version is not', () => {
    for (const s of ['DRAFT', 'VALIDATED', 'SHADOW_EVALUATED', 'REJECTED', 'APPROVED', 'EXPIRED', 'SCHEDULED', 'PREPARED', 'PARTIALLY_ACKNOWLEDGED', 'ACTIVATION_FAILED']) {
      expect(IN_PROGRESS.has(s)).toBe(true);
      expect(SETTLED.has(s)).toBe(false);
    }
    for (const s of ['ACTIVE_VERIFIED', 'SUPERSEDED', 'ROLLED_BACK']) expect([IN_PROGRESS.has(s), SETTLED.has(s)]).toEqual([false, true]);
  });
  it('the steps are in the step bar order, and every state on its way has a current step', () => {
    expect(CHANGE_STEPS).toEqual(['edit', 'check', 'try', 'approve', 'deploy']);
    for (const s of IN_PROGRESS) expect(Object.values(stepMarks(s))).toContain('current');
  });
});
