// v2.5 Task 2E.4 (spec §3.1 per-gate views; NR-034, NR-035): every view renders from the exact
// artifacts with its axis units, never connects nulls, states a band's meaning, and degrades to a
// stated state - not an empty chart - when its artifacts are missing.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { decoded, times, T0 } from './fixtures';
import { G0Body, G2rBody, G3Body, parseBounds } from './ShortViews';
import { G5Body, G6Body, G7Body, G10Body, G11Body, episodes } from './LongViews';
import { G14Body, G15Body, rankedHypotheses } from './FusionViews';
import { G13Body, peerRows } from './G13Interaction';
import { RequireKinds } from './viewSupport';
import type { GateArtifacts } from '../useGateArtifacts';

// echarts needs a real canvas; the option is what we assert on, so capture it instead of drawing
const captured: unknown[] = [];
vi.mock('echarts-for-react', () => ({ default: (props: { option: unknown }) => { captured.push(props.option); return React.createElement('div', { 'data-testid': 'echarts' }); } }));

afterEach(() => { cleanup(); captured.length = 0; });

const arts = (byKind: Record<string, ReturnType<typeof decoded>[]>): GateArtifacts => ({ byKind, loading: false, errors: [], unavailable: [] });
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

  it('G5: crossing_times are markers on the preprocessed signal and a table, never a y = 0 chart of their own (audit F17)', () => {
    // the signal is the accepted support: it starts 2 h after the window start, and the crossing seconds count from ITS first sample
    const t = times(6, 1000).map(ms => ms + 7_200_000);
    const signal = decoded({ gate: 'G5', kind: 'preprocessed_signal', x: t, y: [1, -1, 1, -1, 1, -1], yUnit: 'EU_centred', provenance: { preprocessing: 'LINEAR_DETREND;SUBTRACT_MEAN' } });
    const acf = decoded({ gate: 'G5', kind: 'acf_series', x: [0, 1, 2], y: [1, 0.5, 0.1], xQuantity: 'acf_lag_s', xUnit: 's', columns: { acf_pair_count: [6, 5, 4] }, provenance: { period_s: '290.23199999999997', regularity: '1.0', accepted_cycles: '33', regularity_method: 'ACF_PEAK_REGULARITY_V1' } });
    const crossings = decoded({ gate: 'G5', kind: 'crossing_times', x: [0.5, 1.5, 2.5], y: [0, 1, 2], xQuantity: 'crossing_times', xUnit: 's', provenance: { window_start_ms: String(T0) } });
    render(<G5Body acf={acf} signal={signal} crossings={crossings} timeZone="UTC" />);
    expect(captured).toHaveLength(2);                                                              // signal + ACF; no crossing_times chart
    const signalSeries = seriesOf(captured[0]);
    const marks = signalSeries.find(s => s.name === 'zero crossings')!;
    expect(marks).toBeTruthy();
    const points = marks.data as Array<[number, number | null]>;
    expect(points.filter(p => p[1] != null)).toHaveLength(3);
    expect(points[0][0]).toBe(T0 + 7_200_000 + 500);                                            // from the signal's first sample, not the window start
    expect(points.every(p => p[1] === 0)).toBe(true);
    expect(screen.getByText(/period 290.2 s/)).toBeTruthy();                                        // formatted, not 290.23199999999997
    expect(screen.getByRole('table', { name: /crossings/i }).querySelectorAll('tbody tr')).toHaveLength(3);
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

  it('G7: every accepted cycle overlay carries its own series id (echarts refuses duplicate ids and the page would blank)', () => {
    const cycle = (id: string) => decoded({ gate: 'G7', kind: 'cycle_fit', role: `CYCLE_${id}`, x: [0, 0.5, 1], y: [0, 1, 0], xQuantity: 'phase', xUnit: 'cycle_fraction',
      columns: { sine_fit: [0, 1, 0], triangle_fit: [0, 1, 0], original_indices: [0, 1, 2] },
      provenance: { cycle_id: id, accepted: 'true', reject_reason: '', sse_sine: '0.1', sse_triangle: '0.4', cycle_score: '0.8', amplitudes: '1', phases: '0' } });
    render(<G7Body cycles={[cycle('0'), cycle('1'), cycle('2')]} />);
    const ids = (seriesOf(captured[0]) as Array<{ id?: string }>).map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(5);                                                                  // 3 overlays + sine + triangle
  });

  // CHG-049 (final review I1): the per-cycle fits are capped; the counts come from cycle_scores (all N cycles)
  const g7Cycle = (id: string, accepted: boolean) => decoded({ gate: 'G7', kind: 'cycle_fit', role: `CYCLE_${id}`, x: [0, 0.5, 1], y: [0, 1, 0], xQuantity: 'phase', xUnit: 'cycle_fraction',
    columns: { sine_fit: [0, 1, 0], triangle_fit: [0, 1, 0], original_indices: [0, 1, 2] },
    provenance: { cycle_id: id, accepted: String(accepted), reject_reason: accepted ? '' : 'LOW_SCORE', sse_sine: '0.1', sse_triangle: '0.4', cycle_score: '0.8', amplitudes: '1', phases: '0' } });
  const g7Scores = (n: number, acceptedIds: number[]) => decoded({ gate: 'G7', kind: 'cycle_scores', role: 'ALL_CYCLES', x: Array.from({ length: n }, (_, i) => i), y: Array.from({ length: n }, () => 0.5),
    xQuantity: 'cycle_id', xUnit: 'ordinal', columns: { accepted: Array.from({ length: n }, (_, i) => (acceptedIds.includes(i) ? 1 : 0)) }, provenance: { cycles_total: String(n) } });

  it('G7: with cycle_scores the counts cover every cycle and the chart says how many it shows', () => {
    render(<G7Body cycles={[g7Cycle('0', true), g7Cycle('99', false)]} scores={g7Scores(100, [0, 10, 20])} />);
    expect(screen.getByText(/3 accepted of 100/)).toBeTruthy();
    expect(screen.getByText(/showing 2 of 100 cycles/)).toBeTruthy();
  });

  it('G7: never "No accepted cycle" when cycle_scores has accepted cycles', () => {
    render(<G7Body cycles={[g7Cycle('0', false), g7Cycle('99', false)]} scores={g7Scores(100, [40])} />);
    expect(screen.queryByText(/No accepted cycle/)).toBeNull();
    expect(screen.getByText(/1 accepted of 100 cycles; none is among the per-cycle fits kept for this run/)).toBeTruthy();
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

  it('G13: a legacy row is a stated UNSUPPORTED_METHOD; an analysed run draws the record, the graph and each peer pane', () => {
    const legacy = arts({ interaction: [decoded({ gate: 'G13', kind: 'interaction', x: [], y: [], provenance: { capability_state: 'UNAVAILABLE', capability_reason: 'INTERACTION_NOT_ANALYSED_BY_LONG_TIER', legacy_link_flag: 'HAS_PEER_LINKS' } })] });
    render(<G13Body arts={legacy} loopId="FIC10302" timeZone="UTC" />);
    expect(screen.getByText(/UNSUPPORTED METHOD/)).toBeTruthy();
    expect(screen.getByText(/INTERACTION_NOT_ANALYSED_BY_LONG_TIER/)).toBeTruthy();
    expect(captured).toHaveLength(0);                                                           // never a picture of an uncomputed method
    cleanup();
    const record = decoded({ gate: 'G13', kind: 'interaction', x: [], y: [], provenance: {
      method_id: 'G13.ALIGNED_PEER_ANALYSIS_V1', capability_state: 'INTERACTION_DETECTED', capability_reason: 'ASSOCIATED_PEERS:TIC10305',
      peer_ids: 'TIC10305;LIC10320', peer_states: 'TIC10305:ANALYSED:ASSOCIATED:PEER_LEADS_LOOP;LIC10320:PEER_UNOBSERVED', lag_s: 'TIC10305:-60.0;LIC10320:NA', coherence: 'TIC10305:0.94;LIC10320:NA',
      frequency_hz: '0.000277;0.0166', relationship_revision: '3', alternative_explanations: 'COMMON_UPSTREAM_DISTURBANCE_DRIVES_BOTH;PAIRWISE_ASSOCIATION_IS_NOT_CAUSAL_DIRECTION' } });
    const t = times(4);
    const aligned = decoded({ gate: 'G13', kind: 'aligned_series', role: 'TIC10305', x: t, y: [10, 11, 12, 13], yUnit: 'peer_EU', mask: [true, true, false, true], columns: { own_pv: [1, 2, 3, 4] }, units: { own_pv: 'EU' }, provenance: { peer_id: 'TIC10305', support_s: '900' } });
    const xc = decoded({ gate: 'G13', kind: 'cross_correlation', role: 'TIC10305', x: [-10, -5, 0, 5, 10], y: [0.1, 0.9, 0.5, 0.2, 0.1], xQuantity: 'lag_s', xUnit: 's', yQuantity: 'xcorr', yUnit: '1', provenance: { peer_id: 'TIC10305', peak_xcorr: '0.9', lag_at_peak_s: '-5', lag_sign_convention: 'POSITIVE_WHEN_PEER_FOLLOWS_LOOP' } });
    const coh = decoded({ gate: 'G13', kind: 'coherence', role: 'TIC10305', x: [0, 0.001, 0.002], y: [0.1, 0.94, 0.2], xQuantity: 'frequency_hz', xUnit: 'Hz', yQuantity: 'coherence', yUnit: '1', provenance: { peer_id: 'TIC10305', band_low_hz: '0.000277', band_high_hz: '0.0166', coherence_band_max: '0.94' } });
    render(<G13Body arts={arts({ interaction: [record], aligned_series: [aligned], cross_correlation: [xc], coherence: [coh] })} loopId="FIC10302" timeZone="UTC" />);
    expect(screen.getByText('INTERACTION_DETECTED')).toBeTruthy();
    expect(screen.getByText('PEER_UNOBSERVED')).toBeTruthy();                                     // the unobserved peer is stated, not drawn
    expect(screen.getByText(/graph relation is not proof/i)).toBeTruthy();
    expect(peerRows(record)[0]).toMatchObject({ id: 'TIC10305', associated: true, direction: 'PEER_LEADS_LOOP', lagS: -60, coherence: 0.94 });
    const graph = captured[0] as { series: Array<{ type: string; data: unknown[]; links: Array<{ source: string; target: string }> }> };
    expect(graph.series[0].type).toBe('graph');
    expect(graph.series[0].data).toHaveLength(3);
    expect(graph.series[0].links[0]).toMatchObject({ source: 'TIC10305', target: 'FIC10302' });      // the peer leads: arrow into the loop
    const pane = captured[1] as { series: Array<{ name: string; connectNulls: boolean; data: Array<[number, number | null]> }>; yAxis: Array<{ name: string }> };
    expect(pane.yAxis.map(a => a.name)).toEqual(['EU', 'peer_EU']);                                // each signal keeps its unit
    expect(pane.series[1].connectNulls).toBe(false);
    expect(pane.series[1].data[2][1]).toBeNull();                                                  // unsupported sample is a gap
    const lag = captured[2] as { xAxis: { name: string } };
    expect(lag.xAxis.name).toBe('lag (s)');
    const cohOpt = captured[3] as { xAxis: { name: string } };
    expect(cohOpt.xAxis.name).toBe('frequency (Hz)');
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
