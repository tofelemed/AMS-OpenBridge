// v2.5 workbench: the verdict card says in one sentence what the gate found and why, from the cell's
// status / reason and the view's headline numbers - never "BANDWIDTH" alone, never filler like
// "read the artifacts; every value is the run's own" (2026-09-17 audit, F16).
import { describe, expect, it } from 'vitest';
import { reasonSentence, statusWord, verdictSentence, whyParagraphs } from './verdictCopy';
import type { GateState } from './GateResultState';

const ready: GateState = { kind: 'READY', title: 'Ready', detail: '', stillValid: '', action: 'NONE', tone: 'good' };

describe('verdict copy', () => {
  it('turns a reason token into a sentence fragment, using the grid from the eligibility detail when it names one', () => {
    expect(reasonSentence('BANDWIDTH', { gate: 'G5', eligibilityDetail: '3.4 samples per 17 s period < 4 (declared 5 s)' })).toBe('limited by the 5 s acquisition grid');
    expect(reasonSentence('BANDWIDTH', { gate: 'G5', eligibilityDetail: '2.0 samples per 10.0 s period < 8 (observed grid 5.0 s)' })).toBe('limited by the 5 s acquisition grid');
    expect(reasonSentence('BANDWIDTH', { gate: 'G5' })).toBe('limited by the acquisition grid');
    expect(reasonSentence('NO_VP', { gate: 'G14' })).toBe('no valve-position signal is mapped');
    expect(reasonSentence('INSUFFICIENT_SAMPLES', { gate: 'G5' })).toBe('too few qualified samples in the window');
    expect(reasonSentence('SOME_NEW_TOKEN', { gate: 'G5' })).toBe('some new token');
    expect(reasonSentence(null, { gate: 'G5' })).toBeNull();
  });

  it('writes the one-sentence verdict from status, headline numbers and reason', () => {
    const s = verdictSentence({
      gate: 'G5', name: 'Oscillation (ACF)', status: 'WARN', reason: 'BANDWIDTH',
      headline: [{ label: 'ACF period', value: '290.2', unit: 's' }, { label: 'Regularity', value: '1.000' }, { label: 'Accepted cycles', value: '33' }],
      eligibilityDetail: '3.4 samples per 17 s period < 4 (declared 5 s)',
    });
    expect(s).toBe('G5 Oscillation (ACF): Warning — ACF period 290.2 s, regularity 1.000, accepted cycles 33; limited by the 5 s acquisition grid.');
  });

  it('states a verdict without numbers or reason plainly', () => {
    expect(verdictSentence({ gate: 'G0', name: 'Data quality', status: 'PASS', reason: null, headline: [] })).toBe('G0 Data quality: Pass.');
    expect(verdictSentence({ gate: 'G3', name: 'Base performance', status: null, reason: null, headline: [] })).toBe('G3 Base performance: no verdict recorded for this run.');
    expect(statusWord('NOT_EVALUATED')).toBe('not evaluated');
  });

  it('explains why in paragraphs that end with the next valid action', () => {
    const p = whyParagraphs({ gate: 'G5', name: 'Oscillation (ACF)', status: 'WARN', reason: 'BANDWIDTH', state: ready });
    expect(p[0]).toMatch(/^The engine judged G5 Oscillation \(ACF\) warning/);
    expect(p.join(' ')).toMatch(/limited by the acquisition grid/);
    expect(p[p.length - 1]).toMatch(/Read the evidence below/);
    const notEval: GateState = { kind: 'NOT_EVALUATED', title: 'NOT_EVALUATED - the engine looked and declined', detail: 'Reason: G0_FAIL.', stillValid: 'This is a verdict, not missing data.', action: 'NONE', tone: 'warn' };
    const q = whyParagraphs({ gate: 'G5', name: 'Oscillation (ACF)', status: 'NOT_EVALUATED', reason: 'G0_FAIL', state: notEval });
    expect(q[q.length - 1]).toMatch(/Meet the prerequisite/);
  });
});
