// 2026-09-17 audit F4: a verdict older than the window on screen is shown AS an older verdict, with its
// age - never as "the latest 24h window". One helper writes that line for the matrix, the inspector,
// the Investigation card and the attention list.
import { describe, expect, it } from 'vitest';
import { ageText, staleVerdictLine } from './verdictAge';

describe('verdictAge', () => {
  it('writes ages in the unit a reader thinks in', () => {
    expect(ageText(30_000)).toBe('30 s ago');
    expect(ageText(20 * 60_000)).toBe('20 min ago');
    expect(ageText(5 * 3_600_000)).toBe('5 h ago');
    expect(ageText(14.6 * 86_400_000)).toBe('15 d ago');
    expect(ageText(null)).toBe('');
  });

  it('states an older verdict with its diagnosis, confidence and age', () => {
    expect(staleVerdictLine({ diagnosis: 'SUSPECTED_FINAL_ELEMENT_NONLINEARITY', confidence: 0.89, ageMs: 15 * 86_400_000 }))
      .toBe('last verdict Valve nonlinearity (stiction) suspected · evidence score 89 · 15 d ago');
    expect(staleVerdictLine({ diagnosis: 'HEALTHY', confidence: null, ageMs: 3_600_000 })).toBe('last verdict No problem found · 1 h ago');
    expect(staleVerdictLine(null)).toBeNull();
    expect(staleVerdictLine(undefined)).toBeNull();
  });
});
