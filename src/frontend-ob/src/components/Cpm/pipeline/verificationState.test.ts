// CHG-170 (owner answer 3a): Verified only when the run actually wrote results. The replay status already carries gateResults
// (the rows the run wrote); a finished run with none reads as not verified, and says so. The head says the state once, in words
// (no VERIFIED / FAILED (state) / STATE UNKNOWN codes).
import { describe, expect, it } from 'vitest';
import { resultsText, verificationHead } from './verificationState';

const status = (over: Partial<{ state: string; finished: boolean; succeeded: boolean; gateResults: number }>) => ({
  replayId: 'rp', jobId: 'j', state: 'RUNNING', finished: false, succeeded: false, ...over,
});

describe('verificationHead', () => {
  it('reads Not run before any run and Running while one goes', () => {
    expect(verificationHead({ started: false, pending: false, status: null })).toEqual({ tone: 'muted', glyph: '○', word: 'Not run' });
    expect(verificationHead({ started: false, pending: true, status: null })).toEqual({ tone: 'warn', glyph: '◐', word: 'Running' });
    expect(verificationHead({ started: true, pending: false, status: status({}) })).toEqual({ tone: 'warn', glyph: '◐', word: 'Running' });
  });

  it('says Verified only when the finished run wrote results', () => {
    expect(verificationHead({ started: true, pending: false, status: status({ state: 'FINISHED', finished: true, succeeded: true, gateResults: 2 }) }))
      .toEqual({ tone: 'good', glyph: '✓', word: 'Verified' });
    expect(verificationHead({ started: true, pending: false, status: status({ state: 'FINISHED', finished: true, succeeded: true, gateResults: 0 }) }))
      .toEqual({ tone: 'bad', glyph: '✕', word: 'Not verified' });
    expect(verificationHead({ started: true, pending: false, status: status({ state: 'FINISHED', finished: true, succeeded: true }) }))
      .toEqual({ tone: 'bad', glyph: '✕', word: 'Not verified' });
  });

  it('words a failed or cancelled run and an unreadable state', () => {
    expect(verificationHead({ started: true, pending: false, status: status({ state: 'FAILED', finished: true }) }).word).toBe('Failed');
    expect(verificationHead({ started: true, pending: false, status: status({ state: 'CANCELED', finished: true }) }).word).toBe('Cancelled');
    expect(verificationHead({ started: true, pending: false, status: status({ state: 'ARCHIVED', finished: true }) }).word).toBe('Not verified');
    expect(verificationHead({ started: true, pending: false, status: null })).toEqual({ tone: 'warn', glyph: '?', word: 'Unknown' });
  });
});

describe('resultsText', () => {
  it('counts the results the run wrote, and says when it wrote none', () => {
    expect(resultsText(status({ finished: true, succeeded: true, gateResults: 2 }))).toBe('2 written');
    expect(resultsText(status({ finished: true, succeeded: true, gateResults: 1 }))).toBe('1 written');
    expect(resultsText(status({ finished: true, succeeded: true, gateResults: 0 }))).toBe('None written: no verdict reached the database');
    expect(resultsText(status({ finished: true, succeeded: true }))).toBe('Not reported by the analysis service');
    expect(resultsText(status({ finished: false }))).toBeNull();
    expect(resultsText(null)).toBeNull();
  });
});
