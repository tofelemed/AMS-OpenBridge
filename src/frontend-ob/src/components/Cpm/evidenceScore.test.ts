// SME review #20 (CHG-056): the fused "confidence" is an evidence score — named so, shown 0–100 without "%",
// and its engine caps explained when they bind.
import { describe, expect, it } from 'vitest';
import { evidenceScore, evidenceScoreCap, evidenceScoreText } from './evidenceScore';

describe('evidence score', () => {
  it('formats 0..1 as a 0–100 score, never a percentage', () => {
    expect(evidenceScore(0.974)).toBe(97);
    expect(evidenceScoreText(1)).toBe('evidence score 100');
    expect(evidenceScoreText(null)).toBe('');
    expect(evidenceScoreText(0.89)).not.toMatch(/%/);
  });

  it('explains the G14 cap on a valve claim and the persistence cap on a single window', () => {
    const valve = 'selected_family=stiction, family_score=1.000, weighted=0.4, confidence=0.890, G14_cap=0.89, class=TIC';
    expect(evidenceScoreCap(valve, 0.89)).toBe('capped at 89: a valve cause cannot be confirmed without valve position (G14)');
    expect(evidenceScoreCap('selected_family=oscillation, family_score=1.000, confidence=1.000, G14_cap=0.89', 1)).toBeNull();
    expect(evidenceScoreCap('selected_family=oscillation, confidence=0.540, G14_cap=0.89; persistence_cap agree=1/3', 0.54))
      .toBe('capped at 54: not yet persistent (1 of 3 windows agree)');
  });
});
