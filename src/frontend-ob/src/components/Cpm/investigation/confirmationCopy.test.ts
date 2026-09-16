// v2.5 Task 1E.2 — the G14 prose is rendered from the SERVED confirmation, never from a
// hard-coded cap, and a pre-v2.5 row is named as a legacy flag rather than read as a verdict.
import { describe, it, expect } from 'vitest';
import type { CpmConfirmation } from '../../../api/cpm/verdict';
import { confirmationProse, confirmationLabel, noVpFleetCopy, NO_VP_COPY } from './confirmationCopy';

const conf = (over: Partial<CpmConfirmation>): CpmConfirmation => ({
  claimType: 'FINAL_ELEMENT_NON_FOLLOWING', state: 'NOT_CONFIRMED', reason: 'NO_POSITIVE_EVIDENCE',
  positiveEvidenceIds: [], contradictions: [], scope: 'VP tracking', nonFollowingDwellS: 0,
  trackingErrorP95Pp: 1.2, confirmedAtMs: 0, ...over,
});

describe('confirmationProse', () => {
  it('names the measured dwell when confirmed', () => {
    const s = confirmationProse(conf({ state: 'CONFIRMED', reason: 'NON_FOLLOWING_DWELL', nonFollowingDwellS: 120, trackingErrorP95Pp: 8.4 }));
    expect(s).toContain('2.0 min');
    expect(s).toContain('8.4 pp');
    expect(s).toContain('confirmed');
  });

  it('says a contradiction holds the verdict at DETECTED', () => {
    expect(confirmationProse(conf({ state: 'CONTRADICTED', reason: 'VP_TRACKING_HEALTHY' }))).toContain('DETECTED');
  });

  it('distinguishes no VP from VP with no evidence', () => {
    expect(confirmationProse(conf({ state: 'NOT_CONFIRMED', reason: 'NO_VP' }))).toBe(NO_VP_COPY);
    expect(confirmationProse(conf({ state: 'NOT_CONFIRMED', reason: 'NO_POSITIVE_EVIDENCE' }))).toContain('no non-following dwell');
  });

  it('says confirmation does not apply to a symptom family', () => {
    expect(confirmationProse(conf({ state: 'NOT_APPLICABLE', reason: 'NOT_A_FINAL_ELEMENT_CLAIM' }))).toContain('does not apply');
  });

  it('names a pre-v2.5 row as a legacy flag and never as a confirmation', () => {
    expect(confirmationProse(undefined, true)).toContain('LEGACY_FLAG_ONLY');
    expect(confirmationProse(conf({ state: 'LEGACY_FLAG_ONLY', reason: 'PRE_V25_ROW' }))).toContain('LEGACY_FLAG_ONLY');
    expect(confirmationLabel(undefined, true)).toBe('LEGACY FLAG');
  });

  it('never mentions a numeric cap anywhere', () => {
    const all = [
      confirmationProse(conf({ state: 'CONFIRMED' })), confirmationProse(conf({ state: 'CONTRADICTED' })),
      confirmationProse(conf({ state: 'NOT_CONFIRMED', reason: 'NO_VP' })), confirmationProse(conf({ state: 'NOT_APPLICABLE' })),
      confirmationProse(undefined, true), noVpFleetCopy(3), NO_VP_COPY,
    ].join(' ');
    expect(all).not.toContain('0.89');
  });
});
