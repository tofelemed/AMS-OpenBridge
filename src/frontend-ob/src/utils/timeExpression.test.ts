// Unit tests for the PI-Vision-style time-expression parser.
// Vitest-style (describe/it/expect). No runner is wired in this repo yet; add `vitest` and a
// `"test": "vitest"` script to execute. The suite is the executable spec for K10–K15.
import { describe, it, expect } from 'vitest';
import { parseTimeExpression, isRelativeExpression, isNowExpression } from './timeExpression';

// Fixed reference: Wed 2026-07-15 14:30:00 local.
const NOW = new Date(2026, 6, 15, 14, 30, 0, 0);
const parse = (s: string, anchor?: Date) => parseTimeExpression(s, { now: NOW, anchor });

describe('parseTimeExpression', () => {
  it('resolves * and now to the reference instant', () => {
    expect(parse('*').date?.getTime()).toBe(NOW.getTime());
    expect(parse('now').date?.getTime()).toBe(NOW.getTime());
  });

  it('applies relative offsets to now', () => {
    expect(parse('*-8h').date?.getTime()).toBe(NOW.getTime() - 8 * 3_600_000);
    expect(parse('*-30m').date?.getTime()).toBe(NOW.getTime() - 30 * 60_000);
    expect(parse('*+1d').date?.getTime()).toBe(NOW.getTime() + 86_400_000);
  });

  it('resolves offset-alone against the supplied anchor (else now)', () => {
    expect(parse('-8h').date?.getTime()).toBe(NOW.getTime() - 8 * 3_600_000);
    const anchor = new Date(2026, 6, 15, 10, 0, 0, 0);
    expect(parse('30m', anchor).date?.getTime()).toBe(anchor.getTime() + 30 * 60_000);
  });

  it('resolves t/today and y/yesterday to local midnight', () => {
    const today0 = new Date(2026, 6, 15, 0, 0, 0, 0);
    expect(parse('t').date?.getTime()).toBe(today0.getTime());
    expect(parse('today').date?.getTime()).toBe(today0.getTime());
    expect(parse('y').date?.getTime()).toBe(today0.getTime() - 86_400_000);
    expect(parse('t+9h').date?.getTime()).toBe(today0.getTime() + 9 * 3_600_000);
  });

  it('resolves weekday names to the most recent occurrence at midnight', () => {
    // 2026-07-15 is a Wednesday → "mon" is 2 days earlier.
    expect(parse('mon').date?.getTime()).toBe(new Date(2026, 6, 13, 0, 0, 0, 0).getTime());
    // "wed" including today → today midnight.
    expect(parse('wed').date?.getTime()).toBe(new Date(2026, 6, 15, 0, 0, 0, 0).getTime());
  });

  it('resolves month names to the 1st of that month this year', () => {
    expect(parse('jan').date?.getTime()).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).getTime());
    expect(parse('december').date?.getTime()).toBe(new Date(2026, 11, 1, 0, 0, 0, 0).getTime());
  });

  it('handles calendar month/year offsets', () => {
    expect(parse('*-1mo').date?.getMonth()).toBe(5); // July → June
    expect(parse('*-1y').date?.getFullYear()).toBe(2025);
  });

  it('parses absolute timestamps', () => {
    const iso = '2026-01-02T03:04:05';
    expect(parse(iso).date?.getTime()).toBe(new Date(iso).getTime());
  });

  it('reports errors for malformed input', () => {
    expect(parse('').date).toBeNull();
    expect(parse('  ').error).toBeTruthy();
    expect(parse('*-8q').date).toBeNull();       // bad unit
    expect(parse('bananas').date).toBeNull();     // unknown keyword
    expect(parse('t+').date).toBeNull();          // dangling offset
  });
});

describe('isRelativeExpression / isNowExpression', () => {
  it('flags relative expressions', () => {
    expect(isRelativeExpression('*')).toBe(true);
    expect(isRelativeExpression('*-8h')).toBe(true);
    expect(isRelativeExpression('-30m')).toBe(true);
    expect(isRelativeExpression('mon')).toBe(true);
    expect(isRelativeExpression('2026-01-02T03:04:05')).toBe(false);
  });

  it('flags now expressions', () => {
    expect(isNowExpression('*')).toBe(true);
    expect(isNowExpression('now')).toBe(true);
    expect(isNowExpression('*-8h')).toBe(false);
  });
});
