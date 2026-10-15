// SME review #17 (CHG-053): a measured zero stays a number; a placeholder zero, an excluded window and an
// insufficient window read as their status, with the reason.
import { describe, expect, it } from 'vitest';
import { contextOfMatrix, contextOfRow, metricAvailability } from './metricAvailability';
import type { CpmKpiRow } from '../../api/cpm/kpis';

const matrix = (over: Partial<{ diagnosis: string; gates: Array<{ key: string; status: string }>; observabilityFlags: string[]; familyDisqualifiers: string[] }> = {}) =>
  contextOfMatrix({
    diagnosis: over.diagnosis ?? 'CONFIRMED_OSCILLATION',
    gates: (over.gates ?? [{ key: 'G0', status: 'WARN' }, { key: 'G4', status: 'PASS' }, { key: 'G5', status: 'PASS' }, { key: 'G7', status: 'NOT_EVALUATED' }, { key: 'G11', status: 'PASS' }])
      .map(g => ({ ...g, name: g.key, tier: 'long', reason: null })) as never,
    observabilityFlags: over.observabilityFlags ?? ['NO_VALID_CYCLE'],
    familyDisqualifiers: over.familyDisqualifiers ?? ['stiction:NO_SHAPE_EVIDENCE'],
  });

describe('metricAvailability', () => {
  it('keeps a measured zero as a measurement', () => {
    expect(metricAvailability(matrix(), 'freeze_index_s', 0).state).toBe('measured');
    expect(metricAvailability(matrix(), 'effort_ratio', 2.49).state).toBe('measured');
  });

  it('reads the placeholder zeros of methods that did not qualify', () => {
    expect(metricAvailability(matrix(), 'acf_period_s', 0)).toEqual({ state: 'not-calculated', short: 'Not calculated', reason: 'no clean oscillation cycle' });
    expect(metricAvailability(matrix({ observabilityFlags: [] }), 'acf_period_s', 0).reason).toBe('no oscillation period found');
    expect(metricAvailability(matrix(), 'triangularity', 0)).toMatchObject({ short: 'Not calculated', reason: 'G7 not evaluated' });
    expect(metricAvailability(matrix(), 'stiction_score', 0)).toMatchObject({ short: 'Not scored', reason: 'stiction ruled out: no stiction-shaped cycles' });
  });

  it('marks a computed value of a gate that did not evaluate as not qualified', () => {
    const ctx = matrix({ gates: [{ key: 'G4', status: 'NOT_EVALUATED' }] });
    expect(metricAvailability(ctx, 'effort_ratio', 2.49)).toMatchObject({ state: 'not-calculated', short: 'Not qualified' });
  });

  it('puts every metric of an excluded or insufficient window out of play', () => {
    expect(metricAvailability(matrix({ diagnosis: 'EXCLUDED_MODE' }), 'good_error_pct', 1)).toMatchObject({ state: 'not-applicable', short: 'N/A' });
    expect(metricAvailability(matrix({ diagnosis: 'INSUFFICIENT_DATA' }), 'effort_ratio', 3)).toMatchObject({ state: 'insufficient' });
    expect(metricAvailability(matrix({ gates: [{ key: 'G0', status: 'FAIL' }] }), 'mae', 0.2)).toMatchObject({ state: 'insufficient', reason: 'the window failed data qualification' });
  });

  it('reads raw KPI rows: declines, qualification flags and period status', () => {
    const short = { sufficient_data: false, mae: 0 } as unknown as CpmKpiRow;
    expect(metricAvailability(contextOfRow(short, 'short'), 'mae', 0).state).toBe('insufficient');
    const long = { long_metrics_qualified: true, effort_qualified: false, effort_ratio: 4, period_status: 'NO_VALID_CYCLE', acf_period_s: 0 } as unknown as CpmKpiRow;
    expect(metricAvailability(contextOfRow(long, 'long'), 'effort_ratio', 4).short).toBe('Not qualified');
    expect(metricAvailability(contextOfRow(long, 'long'), 'acf_period_s', 0).reason).toBe('no clean oscillation cycle');
  });
});

describe('no-result gate marks keep a value from reading as measured (CHG-098 review)', () => {
  it('not applicable, disabled and pending are not results; an excluded G0 is not a usable window', () => {
    for (const st of ['NOT_APPLICABLE', 'DISABLED', 'PENDING'])
      expect(metricAvailability(matrix({ gates: [{ key: 'G4', status: st }] }), 'effort_ratio', 2).state).toBe('not-calculated');
    expect(metricAvailability(matrix({ gates: [{ key: 'G0', status: 'EXCLUDED_MODE' }] }), 'mae', 0.2).state).toBe('insufficient');
  });
});
