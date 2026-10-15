// SME review #16 (CHG-052): one symbol per MEANING. A rejected window, strong symptom evidence and a
// confirmed condition no longer share the red cross; a diagnostic gate's PASS is "not seen", not a green tick.
import { describe, expect, it } from 'vitest';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import { GATE_LEGEND, gateMark, gateName, gateRole, matrixViewOf, resultGates, reviewSeverity } from './gateStatus';

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
    // CHG-098 (SME review 2 #24): "—" is "not evaluated" only — N/A and pending have their own marks (was "—" for all three)
    expect(gateMark('NOT_APPLICABLE', 'G14')).toMatchObject({ glyph: 'n/a', word: 'N/A', meaning: 'not-applicable' });
    expect(gateMark('DISABLED', 'G12')).toMatchObject({ glyph: 'n/a', word: 'Disabled', meaning: 'not-applicable' });
    expect(gateMark('PENDING', 'G13')).toMatchObject({ glyph: '…', word: 'Pending', meaning: 'pending' });
    expect(gateMark('SUSPECTED', 'G15')).toMatchObject({ glyph: '△', tone: 'warn' });
    // CHG-098: "ruled out" no longer borrows the pass tick (was ✓)
    expect(gateMark('CONTRADICTED', 'G14')).toMatchObject({ glyph: '◇', word: 'Ruled out' });
    expect(gateMark(null)).toMatchObject({ glyph: '—', tone: 'muted', word: 'Not evaluated' });
  });

  it('tells an unusable window from a deliberate exclusion (CHG-098, both were ⊘)', () => {
    expect(gateMark('FAIL', 'G1')).toMatchObject({ glyph: '⊘', word: 'Not usable', meaning: 'unusable' });
    expect(gateMark('EXCLUDED_MODE', 'G1')).toMatchObject({ glyph: '⊖', word: 'Excluded', meaning: 'excluded' });
    expect(gateMark('EXCLUDED_REGION', 'G2r').glyph).not.toBe(gateMark('FAIL', 'G2r').glyph);
  });

  it('keys every mark in the legend, with one glyph per distinct meaning', () => {
    const shown = new Set(GATE_LEGEND.map(l => l.meaning));
    for (const m of ['ok', 'failed', 'unusable', 'excluded', 'strong', 'confirmed', 'ruled-out', 'none', 'not-applicable', 'pending']) {
      expect(shown.has(m as never)).toBe(true);
    }
    const byGlyph = new Map<string, string>();
    for (const l of GATE_LEGEND) {
      if (l.meaning === 'ok-limited') continue;                       // shares ✓ with OK on purpose; tone + word differ
      expect(byGlyph.get(l.glyph) ?? l.meaning).toBe(l.meaning);
      byGlyph.set(l.glyph, l.meaning);
    }
  });

  it('keeps the fleet review grouping unchanged so the Performance counts do not move', () => {
    expect(['FAIL', 'STRONG', 'EXCLUDED_MODE', 'CONFIRMED'].map(reviewSeverity)).toEqual(['bad', 'bad', 'bad', 'bad']);
    expect(['WARN', 'SUSPECTED'].map(reviewSeverity)).toEqual(['warn', 'warn']);
    expect(['PASS', 'NOT_EVALUATED', null].map(reviewSeverity)).toEqual([null, null, null]);
  });

  it('lists only the checks behind the current result, with readable names (CHG-098)', () => {
    const keys = ['G0', 'G1', 'G3', 'G5', 'G7', 'G14', 'G15'];
    const row = { loopId: 'FIC-1', displayName: 'x', diagnosis: 'SUSPECTED_STICTION',
      gates: { G0: 'PASS', G1: 'EXCLUDED_MODE', G3: 'FAIL', G5: 'PASS', G7: 'STRONG', G14: 'NOT_APPLICABLE', G15: 'SUSPECTED' } } as unknown as CpmHeatmapLoop;
    expect(resultGates(row, keys)).toEqual(['G1', 'G3', 'G7', 'G15']);
    const quiet = { ...row, gates: { G0: 'PASS', G15: 'NOT_EVALUATED' } } as unknown as CpmHeatmapLoop;
    expect(resultGates(quiet, keys)).toEqual(['G15']);
    expect(gateName('G7')).toBe('Stiction shape');
    expect(gateName('G99')).toBe('G99');
    expect([matrixViewOf(null), matrixViewOf('matrix'), matrixViewOf('junk')]).toEqual(['checks', 'matrix', 'checks']);
  });
});
