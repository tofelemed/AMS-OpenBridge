// CHG-098 (SME review 2 #25): the Calculations catalogue sorts by id, name and
// status (needs attention first), with ties kept in catalogue order in both directions.
import { describe, expect, it } from 'vitest';
import type { MetricDef } from './calcCatalogue';
import { DEFAULT_CALC_SORT, calcOrderText, nextCalcSort, sortMetrics, type Tone } from './calcSort';

const m = (id: string, name: string, gate: string): MetricDef =>
  ({ id, field: id, name, gate, category: 'Actuator', unit: '', source: 'long', description: '' });
const list = [m('CPLM-001', 'Sample completeness', 'G0'), m('CPLM-090', 'Zeta', 'G10'), m('CPLM-010', 'Mean error', 'G3'), m('CPLM-011', 'Alpha', 'G3')];
const tones: Record<string, Tone> = { 'CPLM-001': 'good', 'CPLM-090': 'muted', 'CPLM-010': 'bad', 'CPLM-011': 'bad' };
const ids = (xs: MetricDef[]) => xs.map(x => x.id);

describe('sortMetrics', () => {
  it('defaults to catalogue (id) order', () => {
    expect(ids(sortMetrics(list, DEFAULT_CALC_SORT, x => tones[x.id]))).toEqual(['CPLM-001', 'CPLM-010', 'CPLM-011', 'CPLM-090']);
  });
  it('sorts status by severity, not by label text', () => {
    expect(ids(sortMetrics(list, { key: 'status', dir: 'asc' }, x => tones[x.id]))).toEqual(['CPLM-010', 'CPLM-011', 'CPLM-001', 'CPLM-090']);
  });
  it('sorts names case-insensitively and does not mutate the input', () => {
    const before = ids(list);
    expect(ids(sortMetrics(list, { key: 'name', dir: 'asc' }, x => tones[x.id]))).toEqual(['CPLM-011', 'CPLM-010', 'CPLM-001', 'CPLM-090']);
    expect(ids(list)).toEqual(before);
  });
});

describe('nextCalcSort / calcOrderText', () => {
  it('flips the active column and starts a new one ascending', () => {
    expect(nextCalcSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(nextCalcSort({ key: 'name', dir: 'desc' }, 'status')).toEqual({ key: 'status', dir: 'asc' });
    expect(calcOrderText({ key: 'status', dir: 'asc' })).toBe('needs attention first');
  });
});
