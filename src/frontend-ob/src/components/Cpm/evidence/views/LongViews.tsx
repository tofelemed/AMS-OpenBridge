/**
 * v2.5 Task 2E.4 - the long-tier views (G5 ACF, G6 PSD, G7 waveform fits, G8 lag structure, G9
 * cycle geometry, G10 actuator limits, G11 measurement) on their exact artifacts. Pure bodies on
 * decoded artifacts; the exported views resolve the selected run's artifacts.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill } from '../../shared';
import { CpmChart, type CpmSeries } from '../CpmChart';
import { labelsOf, type DecodedArtifact } from '../artifactCodec';
import { useGateArtifacts } from '../useGateArtifacts';
import type { GateViewProps } from '../EvidenceArtifactRenderer';
import { IntervalLane, type LaneInterval } from './primitives/IntervalLane';
import { Trajectory } from './primitives/Trajectory';
import { TimelineTable, type TimelineRow } from './primitives/TimelineTable';
import { RequireKinds, col, first, markersAt, markersWhere } from './viewSupport';
import { fmtQuantity } from '../format';
import { formatInZone } from '../timezone';

const P = (d: DecodedArtifact, k: string) => d.meta.provenance?.[k];

/** Episode-table artifacts (dwell_events / freeze_events / state_intervals): x = start ms, y = duration s. */
export function episodes(d: DecodedArtifact | undefined, labelOf: (i: number) => string): TimelineRow[] {
  if (!d) return [];
  return Array.from(d.columns.x, (start, i) => ({ startMs: start, endMs: start + d.columns.y[i] * 1000, durationS: d.columns.y[i], label: labelOf(i) }));
}

// ── G5 ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * crossing_times: x = sample index x sample period of the preprocessed signal (OscillationMath.crossingTimesS),
 * i.e. seconds from the signal's FIRST SAMPLE - which is the accepted support, not necessarily the window start
 * (lab: the signal held the last 2.5 h of a 24 h window). The window start is only the fallback without a signal.
 */
export function crossingInstantsMs(crossings: DecodedArtifact, signalStartMs: number | undefined): number[] {
  const windowStart = Number(P(crossings, 'window_start_ms'));
  const base = signalStartMs != null && Number.isFinite(signalStartMs) ? signalStartMs : Number.isFinite(windowStart) ? windowStart : NaN;
  return Number.isFinite(base) ? Array.from(crossings.columns.x, s => base + s * 1000) : [];
}

export const G5Body: React.FC<{ acf: DecodedArtifact; signal: DecodedArtifact | undefined; crossings: DecodedArtifact | undefined; timeZone: string }> = ({ acf, signal, crossings, timeZone }) => {
  const acfSeries = col(acf, 'y', 'acf_value', 'accent', { unit: '1', markers: false });
  const pairs = col(acf, 'acf_pair_count', 'acf_pair_count', 'grey', { unit: 'count', dashed: true });
  // audit F17: the crossings are instants ON the centred signal (y = 0), not a chart of their own
  const instants = crossings ? crossingInstantsMs(crossings, signal?.columns.x[0]) : [];
  const signalUnit = signal?.units.y ?? 'EU_centred';
  const signalSeries: CpmSeries[] = signal ? [col(signal, 'y', 'preprocessed_signal', 'good', { unit: signalUnit })] : [];
  if (signal && instants.length) signalSeries.push(markersAt(instants, 0, 'crossings', 'zero crossings', 'bad', signalUnit));
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G5" title="Oscillation from the autocorrelation"
        right={<TonePill tone="muted">period {fmtQuantity(P(acf, 'period_s'), 's')} · regularity {fmtQuantity(P(acf, 'regularity'), '1')}</TonePill>} />
      {signal && <CpmChart title={`preprocessed signal (${P(signal, 'preprocessing')?.replace(/;/g, ' · ') ?? 'basis not declared'}) with the zero crossings`} series={signalSeries} xKind="time" timeZone={timeZone} height={200} />}
      <CpmChart title="ACF versus lag (s); pair counts on their own axis" series={[acfSeries, pairs]} xKind="value" xLabel="acf_lag_s" xUnit="s" height={220} />
      {crossings && instants.length > 0 && (
        <details className="cpm-chart__more">
          <summary>{instants.length} zero crossings</summary>
          <table className="cpm-table" aria-label="Zero crossings" data-table="crossings">
            <thead><tr><th>#</th><th>t from window start</th><th>instant</th><th>Δ to previous</th></tr></thead>
            <tbody>
              {Array.from(crossings.columns.x).slice(0, 500).map((s, i, all) => (
                <tr key={i}><td>{i + 1}</td><td>{fmtQuantity(s, 's')}</td><td>{formatInZone(instants[i], timeZone)}</td><td>{i > 0 ? fmtQuantity(s - all[i - 1], 's') : '—'}</td></tr>
              ))}
            </tbody>
          </table>
          {crossings.columns.x.length > 500 && <p className="cpm-copy">First 500 of {crossings.columns.x.length}; the CSV of the signal chart carries every instant.</p>}
        </details>
      )}
      <KvRow label="Accepted cycles / regularity method">{fmtQuantity(P(acf, 'accepted_cycles'), 'count')} / {P(acf, 'regularity_method') ?? '—'} — too few cycles or inadequate sampling reject the estimate</KvRow>
    </section>
  );
};
export const G5Oscillation: React.FC<GateViewProps> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  const acf = first(arts, 'acf_series');
  return <RequireKinds arts={arts} kinds={['acf_series']}>{acf && <G5Body acf={acf} signal={first(arts, 'preprocessed_signal')} crossings={first(arts, 'crossing_times')} timeZone={timeZone} />}</RequireKinds>;
};

// ── G6 ─────────────────────────────────────────────────────────────────────────────────────────
export const G6Body: React.FC<{ d: DecodedArtifact; onOpenG5?: () => void; onOpenG7?: () => void }> = ({ d, onOpenG5, onOpenG7 }) => {
  const kind = P(d, 'ordinate_kind') ?? 'PSD';
  const unit = d.units.y ?? d.meta.y.unit ?? 'signal^2/Hz';
  const psd = col(d, 'y', `${kind} (${unit})`, 'accent', { unit });
  const marked: CpmSeries = { id: 'peaks', label: 'peak / harmonic bins', unit, x: d.columns.x, y: Array.from(d.columns.y, (v, i) => (d.mask && d.mask[i] ? v : null)), pen: 'bad', markers: true };
  const noise = Number(P(d, 'noise_reference'));
  const noiseSeries: CpmSeries[] = Number.isFinite(noise) && noise > 0 ? [{ id: 'noise', label: 'noise_reference', unit, x: d.columns.x, y: Array.from(d.columns.x, () => noise), pen: 'grey', bandMeaning: 'in-band median level' }] : [];
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G6" title={`Spectrum — ${kind}`} right={<TonePill tone="muted">{P(d, 'spectral_window') ?? '—'} · fft {P(d, 'fft_size') ?? '—'} · Δf {P(d, 'resolution_hz') ?? '—'} Hz</TonePill>} />
      <CpmChart title={`${kind} versus frequency (Hz), log ordinate`} series={[psd, marked, ...noiseSeries]} xKind="value" xLabel="frequency_hz" xUnit="Hz" logY height={260} />
      <KvRow label="ordinate_kind / unit">{kind} / {unit} — an amplitude is never relabelled as a density</KvRow>
      <KvRow label="detrend / segment / overlap / segments">{P(d, 'detrend') ?? '—'} / {P(d, 'segment_samples') ?? '—'} samples / {P(d, 'overlap_fraction') ?? '—'} / {P(d, 'segments') ?? '—'}</KvRow>
      <KvRow label="peak_indices / harmonic_indices">{P(d, 'peak_indices') ?? '—'} / {P(d, 'harmonic_indices') ?? '—'}</KvRow>
      <div className="cpm-filter-row">
        {onOpenG5 && <ObcButton variant="normal" onClick={onOpenG5}>ACF of the same support (G5) ›</ObcButton>}
        {onOpenG7 && <ObcButton variant="normal" onClick={onOpenG7}>Waveform fits (G7) ›</ObcButton>}
      </div>
    </section>
  );
};
export const G6Spectrum: React.FC<GateViewProps> = ({ manifest, gate, onNavigateGate }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'psd');
  return <RequireKinds arts={arts} kinds={['psd']}>{d && <G6Body d={d} onOpenG5={onNavigateGate && (() => onNavigateGate('G5'))} onOpenG7={onNavigateGate && (() => onNavigateGate('G7'))} />}</RequireKinds>;
};

// ── G7 ─────────────────────────────────────────────────────────────────────────────────────────
export const G7Body: React.FC<{ cycles: DecodedArtifact[] }> = ({ cycles }) => {
  const accepted = cycles.filter(c => P(c, 'accepted') === 'true');
  // one series id per cycle: `col` ids a series by its column name, and twelve overlays named 'y' made echarts
  // throw "id duplicates: y" (the error boundary then blanked the whole workbench - 2026-09-17 UI audit)
  const overlays: CpmSeries[] = accepted.slice(0, 12).map(c => ({ ...col(c, 'y', `cycle ${P(c, 'cycle_id')} measured`, 'good', { unit: c.units.y ?? 'EU_centred' }), id: `y:${P(c, 'cycle_id')}` }));
  const fits: CpmSeries[] = accepted.length > 0 ? [col(accepted[0], 'sine_fit', 'sine_fit (first accepted cycle)', 'accent', { dashed: true }), col(accepted[0], 'triangle_fit', 'triangle_fit (first accepted cycle)', 'pink', { dashed: true })] : [];
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G7" title="Per-cycle sine versus triangle fits" right={<TonePill tone={accepted.length > 0 ? 'good' : 'warn'}>{accepted.length} accepted of {cycles.length}</TonePill>} />
      {accepted.length > 0
        ? <CpmChart title="measured cycles in phase coordinates with the sine and triangle predictions" series={[...overlays, ...fits]} xKind="value" xLabel="phase" xUnit="cycle fraction" height={260} />
        : <p className="cpm-copy">No accepted cycle: the classifier result is not displayed when the method did not reproduce a cycle.</p>}
      <table className="cpm-table">
        <thead><tr><th>cycle_id</th><th>accepted</th><th>sse_sine</th><th>sse_triangle</th><th>cycle_score</th><th>amplitude</th><th>phase (rad)</th><th>reject_reason</th></tr></thead>
        <tbody>
          {cycles.map(c => (
            <tr key={c.meta.artifactId} data-accepted={P(c, 'accepted')}>
              <td>{P(c, 'cycle_id')}</td><td>{P(c, 'accepted')}</td><td>{fmtQuantity(P(c, 'sse_sine'), 'EU')}</td><td>{fmtQuantity(P(c, 'sse_triangle'), 'EU')}</td>
              <td>{fmtQuantity(P(c, 'cycle_score'), 'fraction')}</td><td>{fmtQuantity(P(c, 'amplitudes'), 'EU')}</td><td>{fmtQuantity(P(c, 'phases'), 'fraction')}</td><td>{P(c, 'reject_reason') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
export const G7WaveformFits: React.FC<GateViewProps> = ({ manifest, gate }) => {
  const arts = useGateArtifacts(manifest, gate);
  return <RequireKinds arts={arts} kinds={['cycle_fit']}><G7Body cycles={[...(arts.byKind.cycle_fit ?? [])].sort((a, b) => Number(P(a, 'cycle_id')) - Number(P(b, 'cycle_id')))} /></RequireKinds>;
};

// ── G8 ─────────────────────────────────────────────────────────────────────────────────────────
export const G8Body: React.FC<{ d: DecodedArtifact }> = ({ d }) => (
  <section className="cpm-surface">
    <PanelHead eyebrow="G8" title="Lag asymmetry" right={<TonePill tone="muted">{P(d, 'method_id') ?? 'method not declared'}</TonePill>} />
    <CpmChart title="phi_positive / phi_negative versus lag (s)" series={[col(d, 'y', 'phi_positive', 'good', { unit: '1' }), col(d, 'phi_negative', 'phi_negative', 'amber', { unit: '1' })]} xKind="value" xLabel="lag_s" xUnit="s" height={220} />
    <CpmChart title="odd / even contributions" series={[col(d, 'odd_contribution', 'odd_contribution', 'accent', { unit: '1' }), col(d, 'even_contribution', 'even_contribution', 'grey', { unit: '1', dashed: true })]} xKind="value" xLabel="lag_s" xUnit="s" height={180} />
    <p className="cpm-copy">This is a lag asymmetry index, not an odd-harmonic spectrum; it is supporting evidence and never decisive on its own.</p>
    <KvRow label="bicoherence">{P(d, 'bicoherence') ?? 'NOT_INSTALLED'} — {P(d, 'capability_reason') ?? 'no bicoherence picture is shown for an uncomputed method'}</KvRow>
  </section>
);
export const G8LagStructure: React.FC<GateViewProps> = ({ manifest, gate }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'lag_structure');
  return <RequireKinds arts={arts} kinds={['lag_structure']}>{d && <G8Body d={d} />}</RequireKinds>;
};

// ── G9 ─────────────────────────────────────────────────────────────────────────────────────────
export const G9Body: React.FC<{ polygons: DecodedArtifact[]; pairs: DecodedArtifact[]; corners: DecodedArtifact | undefined; timeZone: string }> = ({ polygons, pairs, corners, timeZone }) => {
  const firstPoly = polygons[0];
  const firstPairs = pairs.find(p => p.meta.roleOrPath === firstPoly?.meta.roleOrPath) ?? pairs[0];
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G9" title="Cycle geometry" right={<TonePill tone="muted">{polygons.length} cycle polygon(s)</TonePill>} />
      {firstPoly && <Trajectory title={`${firstPoly.meta.roleOrPath}: PV versus applied input, sample order, corners highlighted`} x={firstPoly.columns.y} y={firstPoly.columns.x}
        xLabel="u_applied" xUnit={firstPoly.units.y ?? 'pp'} yLabel="pv" yUnit={firstPoly.units.x ?? 'EU'} highlight={Array.from(firstPoly.columns.corners ?? [], v => v !== 0)} highlightLabel="corners" />}
      {firstPairs && <Trajectory title={`${firstPairs.meta.roleOrPath}: normalized_pairs (fraction of cycle range)`} x={firstPairs.columns.y} y={firstPairs.columns.x} xLabel="u_norm" xUnit="fraction" yLabel="pv_norm" yUnit="fraction" height={240} />}
      {corners && <CpmChart title="turning angle per sample (corner mask as markers)" series={[col(corners, 'y', 'turning_angle', 'accent', { unit: 'rad' }), markersWhere(corners, 'mask', 'y', 'corners', 'bad', 'rad')]} xKind="time" timeZone={timeZone} height={160} />}
      <table className="cpm-table">
        <thead><tr><th>cycle_id</th><th>area</th><th>bbox_area</th><th>points scored</th></tr></thead>
        <tbody>{polygons.map(p => <tr key={p.meta.artifactId}><td>{P(p, 'cycle_id')}</td><td>{fmtQuantity(P(p, 'area'), 'fraction')}</td><td>{fmtQuantity(P(p, 'bbox_area'), 'fraction')}</td><td>{p.n}</td></tr>)}</tbody>
      </table>
      <KvRow label="qualification_steps">{firstPoly ? P(firstPoly, 'qualification_steps') ?? '—' : '—'} — geometry stays supporting under the correct policy</KvRow>
    </section>
  );
};
export const G9CycleGeometry: React.FC<GateViewProps> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  return <RequireKinds arts={arts} kinds={['cycle_polygon']}><G9Body polygons={arts.byKind.cycle_polygon ?? []} pairs={arts.byKind.normalized_pairs ?? []} corners={first(arts, 'corners')} timeZone={timeZone} /></RequireKinds>;
};

// ── G10 ────────────────────────────────────────────────────────────────────────────────────────
export const G10Body: React.FC<{ d: DecodedArtifact; dwell: DecodedArtifact | undefined; timeZone: string }> = ({ d, dwell, timeZone }) => {
  const vpMapped = Array.from(d.columns.vp ?? []).some(v => Number.isFinite(v));
  const lanes: LaneInterval[] = [];
  for (const [colName, label, tone] of [['active_low', 'at LOW limit', 'warn'], ['active_high', 'at HIGH limit', 'warn']] as const) {
    const flags = d.columns[colName];
    if (!flags) continue;
    let start: number | null = null;
    for (let i = 0; i <= d.n; i++) {
      const on = i < d.n && flags[i] !== 0;
      if (on && start == null) start = d.columns.x[i];
      if (!on && start != null) { lanes.push({ startMs: start, endMs: d.columns.x[Math.min(i, d.n - 1)], label, tone }); start = null; }
    }
  }
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G10" title="Actuator limits" right={<TonePill tone="muted">limit source: {P(d, 'limit_reason') ?? '—'}</TonePill>} />
      <CpmChart title={`u_requested / u_applied${vpMapped ? ' / vp' : ''} (pp)`} series={[col(d, 'u_requested', 'u_requested', 'amber', { unit: 'pp', dashed: true }), col(d, 'y', 'u_applied', 'accent', { unit: 'pp' }), ...(vpMapped ? [col(d, 'vp', 'vp', 'pink', { unit: 'pp' })] : [])]} xKind="time" timeZone={timeZone} height={200} />
      {vpMapped && <CpmChart title="tracking_error (u_requested − vp)" series={[col(d, 'tracking_error', 'tracking_error', 'bad', { unit: 'pp' })]} xKind="time" timeZone={timeZone} height={130} />}
      <IntervalLane title="active limits" intervals={lanes} fromMs={d.columns.x[0]} toMs={d.columns.x[d.n - 1]} timeZone={timeZone} empty="No sample at a limit in this window." />
      <TimelineTable title="dwell_events" rows={episodes(dwell, i => (dwell?.mask?.[i] ? 'HIGH dwell' : 'LOW dwell'))} timeZone={timeZone} empty="No limit dwell episode retained for this run." />
      <KvRow label="supply_pressure / actuator_pressure">{P(d, 'supply_pressure') ?? 'NOT_MAPPED'} / {P(d, 'actuator_pressure') ?? 'NOT_MAPPED'} — VP presence is not confirmation; windup is unavailable without controller evidence</KvRow>
    </section>
  );
};
export const G10Actuator: React.FC<GateViewProps> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'actuator_limits');
  return <RequireKinds arts={arts} kinds={['actuator_limits']}>{d && <G10Body d={d} dwell={first(arts, 'DWELL_EVENTS') ?? first(arts, 'dwell_events')} timeZone={timeZone} />}</RequireKinds>;
};

// ── G11 ────────────────────────────────────────────────────────────────────────────────────────
export const G11Body: React.FC<{ d: DecodedArtifact; freeze: DecodedArtifact | undefined; health: DecodedArtifact | undefined; timeZone: string }> = ({ d, freeze, health, timeZone }) => {
  const noise = Number(P(d, 'noise_band'));
  const bandSeries: CpmSeries[] = Number.isFinite(noise) ? [{ id: 'noise+', label: 'noise_band', unit: d.units.delta_pv ?? 'EU', x: d.columns.x, y: Array.from(d.columns.x, () => noise), pen: 'grey', bandMeaning: '3 × std of ΔPV' }] : [];
  const healthRows: LaneInterval[] = health ? Array.from(health.columns.x, (start, i) => ({
    startMs: Number.isFinite(start) ? start : 0, endMs: Number.isFinite(start) ? start + (health.columns.y[i] ?? 0) * 1000 : 0,
    label: `${labelsOf(health, 'role')[i] ?? '?'}: ${labelsOf(health, 'eligibility')[i] ?? '?'} (${['F', 'C', 'S', 'M'].filter(f => health.columns[f]?.[i]).join('') || 'no flag'})`,
    tone: ((labelsOf(health, 'eligibility')[i] === 'ELIGIBLE') ? 'good' : labelsOf(health, 'eligibility')[i] === 'INELIGIBLE' ? 'bad' : labelsOf(health, 'eligibility')[i] === 'LIMITED' ? 'warn' : 'muted') as LaneInterval['tone'],
  })).filter(r => r.endMs > r.startMs) : [];
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G11" title="Measurement health" />
      <CpmChart title="PV" series={[col(d, 'y', 'pv', 'good')]} xKind="time" timeZone={timeZone} height={160} />
      <CpmChart title="delta_pv with the noise band; spikes marked" series={[col(d, 'delta_pv', 'delta_pv', 'accent', { unit: d.units.delta_pv ?? 'EU' }), markersWhere(d, 'spikes', 'delta_pv', 'spikes', 'bad'), ...bandSeries]} xKind="time" timeZone={timeZone} height={160} />
      <TimelineTable title="freeze_events" rows={episodes(freeze, () => 'PV frozen')} timeZone={timeZone} empty="No freeze episode retained for this run." />
      <IntervalLane title="F / C / S / M eligibility intervals (per role)" intervals={healthRows} fromMs={d.columns.x[0]} toMs={d.columns.x[d.n - 1]} timeZone={timeZone}
        empty={health ? (P(health, 'absence_semantics') ?? 'No health lanes.') : 'Health lanes not retained — absence of health is NOT OK (NOT_CONFIGURED).'} />
      <KvRow label="quantization">{P(d, 'quantization') ?? '—'} — quality and device status remain separate; no biased-sensor diagnosis from one PV</KvRow>
    </section>
  );
};
export const G11Measurement: React.FC<GateViewProps> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'measurement');
  return <RequireKinds arts={arts} kinds={['measurement']}>{d && <G11Body d={d} freeze={first(arts, 'FREEZE_EVENTS') ?? first(arts, 'freeze_events')} health={first(arts, 'eligibility_intervals')} timeZone={timeZone} />}</RequireKinds>;
};
