// CHG-065: display consistency across CPA pages — one evidence-score scale, a confirmed finding never labelled
// "Suspected", an excluded window grey everywhere, one age format, and no invented sample grid.
import { describe, expect, it } from 'vitest';
import { diagnosisBand, toneFor } from './shared';
import { ageText } from './verdictAge';
import { ageText as summaryAge } from './explorer/summary/summaryText';
import { stageLabels } from './replay/TransformationStepper';
import { PRIORITY_RULE } from './overview/priorityReason';

describe('display consistency (CHG-065)', () => {
  it('the Historical verdict lane names a confirmed finding as confirmed, and an unjudged window in grey', () => {
    expect(diagnosisBand('CONFIRMED_OSCILLATION')).toEqual({ label: 'Confirmed', tone: 'bad' });
    // CHG-092 (SME 2 #6): suspected is amber like its G15 mark; red only for confirmed (ISA-101)
    expect(diagnosisBand('SUSPECTED_FINAL_ELEMENT_NONLINEARITY')).toEqual({ label: 'Suspected', tone: 'warn' });
    expect(diagnosisBand('DETECTED_OSCILLATION')).toEqual({ label: 'Detected', tone: 'warn' });
    expect(diagnosisBand('NO_CALL')).toEqual({ label: 'No fault identified', tone: 'muted' });
    expect(diagnosisBand('EXCLUDED_MODE').tone).toBe('muted');
  });
  it('an excluded window is grey, not amber, wherever toneFor colours it', () => {
    expect(toneFor('EXCLUDED_MODE')).toBe('muted');
    expect(toneFor('DETECTED_OSCILLATION')).toBe('warn');
  });
  it('one age format everywhere', () => {
    expect(summaryAge).toBe(ageText);
    expect(ageText(45_000)).toBe('45 s ago');
    expect(ageText(30 * 3_600_000)).toBe('30 h ago');
    expect(ageText(2 * 86_400_000)).toBe('2 days ago');
  });
  it('a missing or zero sample grid is "not reported", never 0 s or an assumed 5 s', () => {
    expect(stageLabels(0)[1]).toBe('Normalize (grid not reported)');
    expect(stageLabels(null)[1]).toBe('Normalize (grid not reported)');
    expect(stageLabels(5.1)[1]).toBe('Normalize (5.1 s grid)');
  });
  it('the queue rule names all four ranking keys', () => {
    expect(PRIORITY_RULE).toMatch(/then evidence score/);
  });
});
