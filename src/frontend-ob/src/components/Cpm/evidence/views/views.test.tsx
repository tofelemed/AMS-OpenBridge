// v2.5 Task 2E.4 (spec §3.1 per-gate views; NR-034, NR-035): every view renders from the exact
// artifacts with its axis units, never connects nulls, states a band's meaning, and degrades to a
// stated state - not an empty chart - when its artifacts are missing.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { decoded, times, T0 } from './fixtures';
import { G0Body, G2rBody, G3Body, parseBounds } from './ShortViews';
import { G6Body, G7Body, G10Body, G11Body, episodes } from './LongViews';
import { G13Body, G14Body, G15Body, rankedHypotheses } from './FusionViews';
import { RequireKinds } from './viewSupport';
import type { GateArtifacts } from '../useGateArtifacts';

// echarts needs a real canvas; the option is what we assert on, so capture it instead of drawing
const captured: unknown[] = [];
vi.mock('echarts-for-react', () => ({ default: (props: { option: unknown }) => { captured.push(props.option); return React.createElement('div', { 'data-testid': 'echarts' }); } }));

afterEach(() => { cleanup(); captured.length = 0; });

const seriesOf = (o: unknown) => (o as { series: Array<{ name: string; connectNulls?: boolean; step?: string; yAxisIndex?: number; data: unknown[] }> }).series;
const yAxesOf = (o: unknown) => (o as { yAxis: Array<{ name: string }> }).yAxis;

describe('gate views', () => {
  it('G0: one ribbon per role, rejected samples are gaps + markers, age on its own axis, legends summarised', () => {
    const pv = decoded({ gate: 'G0', kind: 'role_qualification', role: 'PV', x: times(4), y: [1, 2, 3, 4], yUnit: 't/h', mask: [true, true, false, true],
      columns: { age_s: [0, 0, 90, 0], delta_t_s: [0, 5, 5, 5], quality_normalized: [0, 0, 1, 0], hold_kind: [0, 0, 1, 0], exclusion_reason: [0, 0, 1, 0], quality_native: [0, 0, 0, 0] },
      units: { age_s: 's', delta_t_s: 's' },
      legends: { quality_normalized: ['GOOD', 'BAD'], hold_kind: ['NONE', 'HELD_PREVIOUS'], exclusion_reason: ['NONE', 'HELD_OVER_AGE'], quality_native: ['192'] } });
    render(<G0Body roles={[pv]} timeZone="UTC" />);
    expect(screen.getByText(/NONE: 3 · HELD_OVER_AGE: 1/)).toBeTruthy();
    const value = seriesOf(captured[0]);
    expect(value[0].connectNulls).toBe(false);
    expect((value[0].data as Array<[number, number | null]>)[2][1]).toBeNull();               // the rejected sample is a gap
    expect((value[1].data as Array<[number, number | null]>)[2][1]).toBe(3);                    // ...and a marker
    expect(value[0].step).toBe('end');                                                          // a held role steps
    expect(yAxesOf(captured[1]).map(a => a.name)).toEqual(['s']);                               // age / interval axis is seconds, separate chart
  });

  it('G2r: out-of-region samples are highlighted and the bounds are parsed from provenance', () => {
    const d = decoded({ gate: 'G2r', kind: 'operating_region', x: times(3), y: [50, 120, 55], yUnit: 'EU', mask: [true, false, true], columns: { u_applied: [40, 41, 42] }, units: { u_applied: 'pp' },
      provenance: { region_vertices_or_bounds: 'pv:[0.0,100.0];u:[0.0,100.0]', operating_regime_id: 'DEFAULT' } });
    render(<G2rBody d={d} timeZone="UTC" fromMs={T0} toMs={T0 + 10000} />);
    expect(screen.getByText(/1 of 3 out of region/)).toBeTruthy();
    expect(parseBounds('pv:[0.0,100.0];u:[0.0,100.0]')).toEqual({ yMin: 0, yMax: 100, xMin: 0, xMax: 100 });
    const traj = captured[0] as { series: Array<{ name: string; data: unknown[] }> };
    expect(traj.series.find(s => s.name === 'out of region')!.data).toHaveLength(1);
  });

  it('G3: the tolerance band carries its meaning (NR-035) and the integrals sit on separate panes', () => {
    const d = decoded({ gate: 'G3', kind: 'objective_error', x: times(3), y: [0.1, -0.7, 0.2], yUnit: 'EU', mask: [true, false, true],
      columns: { cumulative_iae: [0.5, 4, 5], cumulative_ise: [0.05, 2.5, 2.7], cumulative_itae: [0, 20, 40] }, units: { cumulative_iae: 'EU*s', cumulative_ise: 'EU^2*s', cumulative_itae: 'EU*s^2' },
      provenance: { tolerance_band: '0.5', objective_id: 'PROFILE_GOOD_ERROR_BAND', eligible_duration: '15', benchmark_interval: '60m' } });
    render(<G3Body d={d} timeZone="UTC" />);
    const errorChart = seriesOf(captured[0]);
    expect(errorChart.find(s => s.name.startsWith('tolerance band —'))!.name).toContain('|error| <= 0.5 EU');
    expect(yAxesOf(captured[1]).map(a => a.name)).toEqual(['EU*s']);
    expect(yAxesOf(captured[3]).map(a => a.name)).toEqual(['EU*s^2']);
  });

  it('G6: the ordinate kind and unit come from the artifact, the peak bins are markers, and the axis is log', () => {
    const d = decoded({ gate: 'G6', kind: 'psd', x: [0, 0.01, 0.02, 0.03], y: [1e-3, 5, 0.1, 0.02], xQuantity: 'frequency_hz', xUnit: 'Hz', yQuantity: 'psd_or_amplitude', yUnit: 'signal^2/Hz', mask: [false, true, false, false],
      provenance: { ordinate_kind: 'PSD', spectral_window: 'HANN', fft_size: '256', resolution_hz: '0.01', noise_reference: '0.05', peak_indices: '1', harmonic_indices: '2;3' } });
    render(<G6Body d={d} />);
    expect(screen.getByText(/Spectrum — PSD/)).toBeTruthy();
    const o = captured[0] as { yAxis: Array<{ type: string; name: string }>; xAxis: { name: string } };
    expect(o.yAxis[0].type).toBe('log');
    expect(o.yAxis[0].name).toBe('signal^2/Hz');
    expect(o.xAxis.name).toBe('frequency_hz (Hz)');
    expect((seriesOf(captured[0])[1].data as Array<[number, number | null]>).filter(p => p[1] != null)).toHaveLength(1);
  });

  it('G7: rejected cycles are listed with their reason and only accepted ones are overlaid', () => {
    const ok = decoded({ gate: 'G7', kind: 'cycle_fit', role: 'CYCLE_0', x: [0, 0.5, 1], y: [0, 1, 0], xQuantity: 'phase', xUnit: 'cycle_fraction', columns: { sine_fit: [0, 1, 0], triangle_fit: [0, 1, 0], original_indices: [0, 1, 2] },
      provenance: { cycle_id: '0', accepted: 'true', reject_reason: '', sse_sine: '0.1', sse_triangle: '0.4', cycle_score: '0.8', amplitudes: '1', phases: '0' } });
    const bad = decoded({ gate: 'G7', kind: 'cycle_fit', role: 'CYCLE_1', x: [0, 0.5, 1], y: [0, 0, 0], xQuantity: 'phase', xUnit: 'cycle_fraction', columns: { sine_fit: [0, 0, 0], triangle_fit: [0, 0, 0], original_indices: [3, 4, 5] },
      provenance: { cycle_id: '1', accepted: 'false', reject_reason: 'FLAT_CYCLE', sse_sine: '0', sse_triangle: '0', cycle_score: '0', amplitudes: '0', phases: '0' } });
    render(<G7Body cycles={[ok, bad]} />);
    expect(screen.getByText('FLAT_CYCLE')).toBeTruthy();
    expect(screen.getByText(/1 accepted of 2/)).toBeTruthy();
    expect(seriesOf(captured[0]).map(s => s.name)).toEqual(['cycle 0 measured', 'sine_fit (first accepted cycle)', 'triangle_fit (first accepted cycle)']);
  });

  it('G10 / G11: episodes come from the tables, limits and lanes are intervals, pressures are NOT_MAPPED', () => {
    const t = times(4);
    const lim = decoded({ gate: 'G10', kind: 'actuator_limits', x: t, y: [99, 100, 100, 50], yUnit: 'pp', columns: { u_requested: [99, 100, 100, 50], vp: [NaN, NaN, NaN, NaN], tracking_error: [NaN, NaN, NaN, NaN], active_low: [0, 0, 0, 0], active_high: [0, 1, 1, 0], validity: [1, 1, 1, 1] },
      provenance: { limit_reason: 'FALLBACK_0_100', supply_pressure: 'NOT_MAPPED', actuator_pressure: 'NOT_MAPPED' } });
    const dwell = decoded({ gate: 'G10', kind: 'DWELL_EVENTS', x: [t[1]], y: [10], xQuantity: 'start_time', yQuantity: 'duration', yUnit: 's', mask: [true] });
    render(<G10Body d={lim} dwell={dwell} timeZone="UTC" />);
    expect(screen.getByText(/NOT_MAPPED \/ NOT_MAPPED/)).toBeTruthy();
    expect(screen.getByText('HIGH dwell')).toBeTruthy();
    expect(episodes(dwell, () => 'x')[0].durationS).toBe(10);
    cleanup(); captured.length = 0;
    const m = decoded({ gate: 'G11', kind: 'measurement', x: t, y: [1, 1, 1, 1], columns: { delta_pv: [NaN, 0, 0, 0], spikes: [0, 0, 1, 0] }, units: { delta_pv: 'EU' }, provenance: { noise_band: '0.02', quantization: '3' } });
    render(<G11Body d={m} freeze={undefined} health={undefined} timeZone="UTC" />);
    expect(screen.getByText(/absence of health is NOT OK/)).toBeTruthy();
    expect(screen.getByText(/No freeze episode retained/)).toBeTruthy();
  });

  it('G13 / G14 / G15: capability, confirmation and decision records render as stated records', () => {
    render(<G13Body d={decoded({ gate: 'G13', kind: 'interaction', x: [], y: [], provenance: { capability_state: 'UNAVAILABLE', capability_reason: 'INTERACTION_METHOD_NOT_INSTALLED', legacy_link_flag: 'PASS' } })} />);
    expect(screen.getByText(/UNSUPPORTED METHOD/)).toBeTruthy();
    expect(screen.getByText(/INTERACTION_METHOD_NOT_INSTALLED/)).toBeTruthy();
    cleanup();
    render(<G14Body d={decoded({ gate: 'G14', kind: 'confirmation_record', x: [], y: [], provenance: { claim_type: 'FINAL_ELEMENT_NON_FOLLOWING', state: 'SUSPECTED', reason: 'VP_TRACKING_HEALTHY', positive_evidence_ids: '', contradictions: 'VP_TRACKING_HEALTHY', scope: 'VP tracking', confirmed_at: 'NOT_CONFIRMED', test_id: 'NONE', review_record: 'NONE' } })} timeZone="UTC" />);
    expect(screen.getByText('SUSPECTED')).toBeTruthy();
    expect(screen.getByText(/none — no positive non-following record/)).toBeTruthy();
    expect(screen.getByText('VP_TRACKING_HEALTHY', { selector: 'td' })).toBeTruthy();
    cleanup();
    const dec = decoded({ gate: 'G15', kind: 'decision_record', x: [], y: [], provenance: {
      observations: 'OSCILLATION:PRESENT:0.9:PRIMARY;EFFORT:ABSENT:0.1:SUPPORTING', hypotheses: 'TUNING:SUSPECTED:0.4;STICTION:DETECTED:0.7', leading_hypothesis: 'STICTION',
      evidence_groups: 'STICTION=OSCILLATION,EFFORT;TUNING=OSCILLATION', score_semantics: 'EVIDENCE_SCORE_UNCALIBRATED', selection_rule: 'ARGMAX_RANKED - not an additive waterfall',
      qualified_support: '86400000', condition_state: 'NONE_OPEN', availability: 'HEALTH_NOT_CONFIGURED', case_state: 'SUSPECTED_FINAL_ELEMENT_NONLINEARITY', result_revision: '1' } });
    expect(rankedHypotheses(dec).map(h => h.id)).toEqual(['STICTION', 'TUNING']);
    render(<G15Body d={dec} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('STICTION');
    expect(items[0].getAttribute('data-leading')).toBe('true');
    expect(screen.getByText(/not an additive waterfall/)).toBeTruthy();
  });

  it('a view whose artifact is missing states it (never an empty chart)', () => {
    const arts: GateArtifacts = { byKind: {}, loading: false, errors: [], unavailable: [{ kind: 'psd', roleOrPath: 'OP', readiness: 'EXPIRED', reason: 'RETENTION' }] };
    render(<RequireKinds arts={arts} kinds={['psd']}><div>chart</div></RequireKinds>);
    expect(screen.queryByText('chart')).toBeNull();
    expect(screen.getByText(/Artifact not available: psd/)).toBeTruthy();
    expect(screen.getByText(/EXPIRED \(RETENTION\)/)).toBeTruthy();
  });
});
