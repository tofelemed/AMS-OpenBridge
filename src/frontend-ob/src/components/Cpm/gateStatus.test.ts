// SME review #16 (CHG-052): one symbol per MEANING. A rejected window, strong symptom evidence and a
// confirmed condition no longer share the red cross; a diagnostic gate's PASS is "not seen", not a green tick.
import { describe, expect, it } from 'vitest';
import { gateMark, gateRole, reviewSeverity } from './gateStatus';

describe('gateMark', () => {
  it('reads the role from the gate tier', () => {
    expect(gateRole('G0')).toBe('eligibility');
    expect(gateRole('g2r')).toBe('eligibility');
    expect(gateRole('G4')).toBe('performance');
    expect(gateRole('G7')).toBe('diagnostic');
    expect(gateRole('G14')).toBe('confirmation');
    expect(gateRole('G15')).toBe('decision');
    expect(gateRole('G99')).toBe('unknown');
  });

  it('gives the three former red crosses three different marks', () => {
    expect(gateMark('FAIL', 'G0')).toMatchObject({ glyph: '⊘', tone: 'muted', word: 'Not usable' });
    expect(gateMark('STRONG', 'G7')).toMatchObject({ glyph: '⬤', tone: 'warn', word: 'Strong' });
    expect(gateMark('CONFIRMED', 'G15')).toMatchObject({ glyph: '▲', tone: 'bad', word: 'Confirmed' });
    expect(gateMark('FAIL', 'G3')).toMatchObject({ glyph: '✕', tone: 'bad', word: 'Failed' });
  });

  it('separates a check that passed from a symptom that was not seen', () => {
    expect(gateMark('PASS', 'G1')).toMatchObject({ glyph: '✓', tone: 'good', word: 'OK' });
    expect(gateMark('PASS', 'G5')).toMatchObject({ glyph: '◯', tone: 'muted', word: 'Not seen' });
    expect(gateMark('WARN', 'G5')).toMatchObject({ glyph: '◐', tone: 'warn', word: 'Seen' });
    expect(gateMark('WARN', 'G3')).toMatchObject({ glyph: '!', tone: 'warn', word: 'Attention' });
  });

  it('names the no-verdict states and the confirmation outcomes', () => {
    expect(gateMark('NOT_EVALUATED', 'G9')).toMatchObject({ glyph: '—', word: 'Not evaluated' });
    expect(gateMark('NOT_APPLICABLE', 'G14')).toMatchObject({ glyph: '—', word: 'N/A' });
    expect(gateMark('SUSPECTED', 'G15')).toMatchObject({ glyph: '△', tone: 'warn' });
    expect(gateMark('CONTRADICTED', 'G14')).toMatchObject({ glyph: '✓', word: 'Ruled out' });
    expect(gateMark(null)).toMatchObject({ glyph: '—', tone: 'muted' });
  });

  it('keeps the fleet review grouping unchanged so the Performance counts do not move', () => {
    expect(['FAIL', 'STRONG', 'EXCLUDED_MODE', 'CONFIRMED'].map(reviewSeverity)).toEqual(['bad', 'bad', 'bad', 'bad']);
    expect(['WARN', 'SUSPECTED'].map(reviewSeverity)).toEqual(['warn', 'warn']);
    expect(['PASS', 'NOT_EVALUATED', null].map(reviewSeverity)).toEqual([null, null, null]);
  });
});
