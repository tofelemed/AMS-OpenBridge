// Task 19: a count is compared with what the window should hold, in words that never call 181 of 180 "full".
import { describe, expect, it } from 'vitest';
import type { CpmKpiRow } from '../../../api/cpmApi';
import { countCheck, nominalOf, runIdOf } from './windowMath';

const row = (o: Record<string, unknown>) => o as unknown as CpmKpiRow;

describe('countCheck', () => {
  it('labels counts honestly', () => {
    expect(countCheck(180, 180).label).toBe('Matches');
    expect(countCheck(181, 180).label).toBe('+1 sample');
    expect(countCheck(179, 180).label).toBe('−1 sample');
    expect(countCheck(150, 180).label).toBe('−30 samples');
  });
  it('gives the ratio and the difference', () => {
    expect(countCheck(90, 180)).toMatchObject({ ratio: 0.5, diff: -90 });
    expect(countCheck(181, 180).diff).toBe(1);
  });
});

describe('nominalOf', () => {
  it('is the served expected_sample_count, never derived from the sample period', () => {
    expect(nominalOf(row({ expected_sample_count: 180, sample_count: 170, sample_period_sec: 5 }))).toEqual({ value: 180, derived: false });
  });
  it('derives from sample_count and completeness on historian rows, and says so', () => {
    expect(nominalOf(row({ sample_count: 90, completeness: 0.5 }))).toEqual({ value: 180, derived: true });
  });
  it('is null when neither is known', () => {
    expect(nominalOf(row({ sample_count: 90, sample_period_sec: 5 }))).toBeNull();
    expect(nominalOf(row({ sample_count: 0, completeness: 0 }))).toBeNull();
  });
});

describe('runIdOf', () => {
  it('reads the decision run, else the first run, from method_run_ids', () => {
    expect(runIdOf(row({ method_run_ids: '{"G0":"a","G15":"b"}' }))).toEqual({ gate: 'G15', runId: 'b' });
    expect(runIdOf(row({ method_run_ids: '{"G0":"a"}' }))).toEqual({ gate: 'G0', runId: 'a' });
  });
  it('is null for rows written before v2.5', () => {
    expect(runIdOf(row({ method_run_ids: '{}' }))).toBeNull();
    expect(runIdOf(row({}))).toBeNull();
    expect(runIdOf(row({ method_run_ids: 'nope' }))).toBeNull();
  });
});
