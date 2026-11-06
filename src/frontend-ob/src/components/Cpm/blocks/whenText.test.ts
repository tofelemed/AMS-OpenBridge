import { describe, expect, it, vi } from 'vitest';
import { fmtWhen } from './whenText';

vi.mock('../../../cpa/siteTime', () => ({ siteZone: () => 'Asia/Dubai' }));

describe('fmtWhen', () => {
  it('prints a time once, short, in the site zone', () => {
    expect(fmtWhen('2026-11-05T10:15:00Z')).toBe('5 Nov · 14:15');
  });

  it('crosses midnight in the site zone, not the browser', () => {
    expect(fmtWhen('2026-11-05T21:00:00Z')).toBe('6 Nov · 01:00');
  });

  it('prints a dash for a missing or broken time, never a false date', () => {
    expect(fmtWhen(null)).toBe('—');
    expect(fmtWhen(undefined)).toBe('—');
    expect(fmtWhen('')).toBe('—');
    expect(fmtWhen('not a time')).toBe('—');
  });

  it('takes a number too', () => {
    expect(fmtWhen(Date.UTC(2026, 10, 5, 10, 15))).toBe('5 Nov · 14:15');
  });
});
