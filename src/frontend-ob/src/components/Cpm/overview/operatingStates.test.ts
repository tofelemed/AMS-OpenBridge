import { describe, expect, it } from 'vitest';
import { operatingStates, shareText } from './operatingStates';

const LAB = { poor: 161, healthy: 0, excluded: 0, stale: 3, insufficientData: 1, noResult: 65, unclassified: 0, staleAfterSeconds: 86_400 };

describe('operatingStates', () => {
  it('lists the five states in the SME order and adds up to the monitored total', () => {
    const states = operatingStates(LAB);
    expect(states.map(s => s.key)).toEqual(['healthy', 'poor', 'excluded', 'stale', 'notEvaluated']);
    expect(states.reduce((n, s) => n + s.count, 0)).toBe(230);
  });

  it('keeps a finding apart from excluded and missing data', () => {
    const [, poor, excluded, stale, notEval] = operatingStates(LAB);
    expect(poor).toMatchObject({ count: 161, tone: 'bad', rows: 'attention' });
    expect(excluded.tone).toBe('muted');
    expect(excluded.rows).toBeUndefined();
    expect(stale).toMatchObject({ count: 3, tone: 'warn', sub: 'no verdict in the last 24 h' });
    expect(notEval).toMatchObject({ count: 66, tone: 'muted', rows: 'notEvaluated', sub: 'insufficient data 1 · no result yet 65' });
  });

  it('folds unclassified loops into not evaluated and names them', () => {
    const notEval = operatingStates({ ...LAB, insufficientData: 0, noResult: 0, unclassified: 2 })[4];
    expect(notEval).toMatchObject({ count: 2, sub: 'unclassified 2' });
    expect(operatingStates({ ...LAB, insufficientData: 0, noResult: 0 })[4].sub).toBe('every loop has a verdict');
  });

  it('states a sub-hour stale window in minutes', () => {
    expect(operatingStates({ ...LAB, staleAfterSeconds: 900 })[3].sub).toBe('no verdict in the last 15 min');
  });
});

describe('shareText', () => {
  it('gives count, total and rounded percent', () => {
    expect(shareText(161, 230)).toBe('161 of 230 (70%)');
    expect(shareText(0, 0)).toBe('0');
  });
});
