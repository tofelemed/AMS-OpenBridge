/**
 * v2.5 Task 2E.4 - the long-tier views (G5 ACF, G6 PSD, G7 waveform fits, G8 lag structure, G9
 * cycle geometry, G10 actuator limits, G11 measurement) on their exact artifacts. Pure bodies on
 * decoded artifacts; the exported views resolve the selected run's artifacts. CHG-187 (owner review 11.2): no eyebrow over a
 * panel, no pill or row that repeats one of the gate's KPI cards, no build or capability wording; G5 and G8 speak plain words
 * on their charts (G5_SIGNAL_AXIS, g5SignalCaption, G8_LEGEND).
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
import { cycleTally } from './headlines';
import { codeLabel } from '../../vocabulary';

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

/** CHG-187: the centred signal's axis, in words ("EU_centred" read as a code). */
export const G5_SIGNAL_AXIS = 'Deviation (EU)';
const STEP_NOUN: Record<string, string> = { LINEAR_DETREND: 'linear trend', DETREND: 'trend', SUBTRACT_MEAN: 'mean' };

/** CHG-187: the signal chart's caption in plain words ("LINEAR_DETREND;SUBTRACT_MEAN" → "…with its linear trend and mean removed…"). */
export function g5SignalCaption(preprocessing: string | undefined): string {
  const steps = (preprocessing ?? '').split(';').map(x => x.trim()).filter(Boolean);
  if (steps.length === 0) return 'Signal and its zero crossings';
  if (steps.every(x => STEP_NOUN[x])) return `Signal with its ${steps.map(x => STEP_NOUN[x]).join(' and ')} removed, and its zero crossings`;
  return `Signal (${steps.map(x => codeLabel(x).toLowerCase()).join(', ')}) and its zero crossings`;
}

export const G5Body: React.FC<{ acf: DecodedArtifact; signal: DecodedArtifact | undefined; crossings: DecodedArtifact | undefined; timeZone: string }> = ({ acf, signal, crossings, timeZone }) => {
  const acfSeries = col(acf, 'y', 'Autocorrelation', 'overlay', { unit: '1', markers: false });
  const pairs = col(acf, 'acf_pair_count', 'Pairs per lag', 'neutral', { unit: 'count', dashed: true });
  // audit F17: the crossings are instants ON the centred signal (y = 0), not a chart of their own
  const instants = crossings ? crossingInstantsMs(crossings, signal?.columns.x[0]) : [];
  const signalSeries: CpmSeries[] = signal ? [col(signal, 'y', 'Signal', 'pv', { unit: G5_SIGNAL_AXIS })] : [];
  if (signal && instants.length) signalSeries.push(markersAt(instants, 0, 'crossings', 'Zero crossings', 'danger', G5_SIGNAL_AXIS));
  return (
    <section className="cpm-surface">
      <PanelHead title="Oscillation from the autocorrelation" />
      {signal && <CpmChart title={g5SignalCaption(P(signal, 'preprocessing'))} series={signalSeries} xKind="time" timeZone={timeZone} height={200} />}
      <CpmChart title="Autocorrelation versus lag; pair counts on their own axis" series={[acfSeries, pairs]} xKind="value" xLabel="Lag" xUnit="s" height={220} />
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
      {/* item 0: the method's name, not its version suffix */}
      <KvRow label="Regularity method">{P(acf, 'regularity_method') ? codeLabel(P(acf, 'regularity_method')!.replace(/_V\d+$/, '')) : '—'}</KvRow>
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
  const psd = col(d, 'y', `${kind} (${unit})`, 'overlay', { unit });
  const marked: CpmSeries = { id: 'peaks', label: 'peak / harmonic bins', unit, x: d.columns.x, y: Array.from(d.columns.y, (v, i) => (d.mask && d.mask[i] ? v : null)), pen: 'danger', markers: true };
  const noise = Number(P(d, 'noise_reference'));
  const noiseSeries: CpmSeries[] = Number.isFinite(noise) && noise > 0 ? [{ id: 'noise', label: 'noise_reference', unit, x: d.columns.x, y: Array.from(d.columns.x, () => noise), pen: 'neutral', bandMeaning: 'in-band median level' }] : [];
  return (
    <section className="cpm-surface">
      <PanelHead title={`Spectrum — ${kind}`} right={<TonePill tone="muted">{P(d, 'spectral_window') ?? '—'} · fft {P(d, 'fft_size') ?? '—'}</TonePill>} />
      <CpmChart title={`${kind} versus frequency (Hz), log ordinate`} series={[psd, marked, ...noiseSeries]} xKind="value" xLabel="frequency_hz" xUnit="Hz" logY height={260} />
      <KvRow label="detrend / segment / overlap / segments">{P(d, 'detrend') ?? '—'} / {P(d, 'segment_samples') ?? '—'} samples / {P(d, 'overlap_fraction') ?? '—'} / {P(d, 'segments') ?? '—'}</KvRow>
      <KvRow label="peak_indices / harmonic_indices">{P(d, 'peak_indices') ?? '—'} / {P(d, 'harmonic_indices') ?? '—'}</KvRow>
      <div className="cpm-filter-row">
        {onOpenG5 && <ObcButton variant="normal" onClick={onOpenG5}>ACF of the same support (G5) →</ObcButton>}
        {onOpenG7 && <ObcButton variant="normal" onClick={onOpenG7}>Waveform fits (G7) →</ObcButton>}
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
export const G7Body: React.FC<{ cycles: DecodedArtifact[]; scores?: DecodedArtifact }> = ({ cycles, scores }) => {
  const accepted = cycles.filter(c => P(c, 'accepted') === 'true');
  // CHG-049: the per-cycle fits are capped; the counts come from cycle_scores (every cycle) when present
  const tally = cycleTally(scores, cycles);
  const showing = `showing ${tally.shown} of ${tally.total} cycles`;
  // one series id per cycle: `col` ids a series by its column name, and twelve overlays named 'y' made echarts
  // throw "id duplicates: y" (the error boundary then blanked the whole workbench - 2026-09-17 UI audit)
  const overlays: CpmSeries[] = accepted.slice(0, 12).map(c => ({ ...col(c, 'y', `cycle ${P(c, 'cycle_id')} measured`, 'pv', { unit: c.units.y ?? 'EU_centred' }), id: `y:${P(c, 'cycle_id')}` }));
  const fits: CpmSeries[] = accepted.length > 0 ? [col(accepted[0], 'sine_fit', 'sine_fit (first accepted cycle)', 'overlay', { dashed: true }), col(accepted[0], 'triangle_fit', 'triangle_fit (first accepted cycle)', 'vp', { dashed: true })] : [];
  return (
    <section className="cpm-surface">
      <PanelHead title="Per-cycle sine versus triangle fits" />
      {accepted.length > 0
        ? <CpmChart title={`measured cycles in phase coordinates with the sine and triangle predictions (${showing})`} series={[...overlays, ...fits]} xKind="value" xLabel="phase" xUnit="cycle fraction" height={260} />
        : tally.accepted > 0
          ? <p className="cpm-copy">{tally.accepted} accepted of {tally.total} cycles; none is among the per-cycle fits kept for this run ({showing}).</p>
          : <p className="cpm-copy">No accepted cycle: the classifier result is not displayed when the method did not reproduce a cycle.</p>}
      <table className="cpm-table" aria-label={`Per-cycle fits, ${showing}`}>
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
  return <RequireKinds arts={arts} kinds={['cycle_fit']}><G7Body cycles={[...(arts.byKind.cycle_fit ?? [])].sort((a, b) => Number(P(a, 'cycle_id')) - Number(P(b, 'cycle_id')))} scores={first(arts, 'cycle_scores')} /></RequireKinds>;
};

// ── G8 ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * CHG-187 (owner review 11.2): plain names. phi_positive / phi_negative are the PV–OP cross-correlation at a positive and at a
 * negative lag of the same size, both drawn over |lag|: an odd, asymmetric pair is the lag asymmetry this gate looks for. The
 * method pill and the bicoherence and capability wording went (item 0); the measure is the gate's KPI card, whose ? tip holds
 * the "not an odd-harmonic spectrum" note.
 */
export const G8_LEGEND = { positive: 'At positive lag', negative: 'At negative lag', odd: 'Odd part', even: 'Even part' } as const;
export const G8Body: React.FC<{ d: DecodedArtifact }> = ({ d }) => (
  <section className="cpm-surface">
    <PanelHead title="Lag asymmetry" />
    <CpmChart title="PV–OP cross-correlation at positive and negative lag" series={[col(d, 'y', G8_LEGEND.positive, 'pv', { unit: '1' }), col(d, 'phi_negative', G8_LEGEND.negative, 'op', { unit: '1' })]} xKind="value" xLabel="Lag" xUnit="s" height={220} />
    <CpmChart title="Odd and even parts" series={[col(d, 'odd_contribution', G8_LEGEND.odd, 'overlay', { unit: '1' }), col(d, 'even_contribution', G8_LEGEND.even, 'neutral', { unit: '1', dashed: true })]} xKind="value" xLabel="Lag" xUnit="s" height={180} />
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
      <PanelHead title="Cycle geometry" />
      {firstPoly && <Trajectory title={`${firstPoly.meta.roleOrPath}: PV versus applied input, sample order, corners highlighted`} x={firstPoly.columns.y} y={firstPoly.columns.x}
        xLabel="u_applied" xUnit={firstPoly.units.y ?? 'pp'} yLabel="pv" yUnit={firstPoly.units.x ?? 'EU'} highlight={Array.from(firstPoly.columns.corners ?? [], v => v !== 0)} highlightLabel="corners" />}
      {firstPairs && <Trajectory title={`${firstPairs.meta.roleOrPath}: normalized_pairs (fraction of cycle range)`} x={firstPairs.columns.y} y={firstPairs.columns.x} xLabel="u_norm" xUnit="fraction" yLabel="pv_norm" yUnit="fraction" height={240} />}
      {corners && <CpmChart title="turning angle per sample (corner mask as markers)" series={[col(corners, 'y', 'turning_angle', 'overlay', { unit: 'rad' }), markersWhere(corners, 'mask', 'y', 'corners', 'danger', 'rad')]} xKind="time" timeZone={timeZone} height={160} />}
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
      <PanelHead title="Actuator limits" />
      <CpmChart title={`u_requested / u_applied${vpMapped ? ' / vp' : ''} (pp)`} series={[col(d, 'u_requested', 'u_requested', 'op', { unit: 'pp', dashed: true }), col(d, 'y', 'u_applied', 'overlay', { unit: 'pp' }), ...(vpMapped ? [col(d, 'vp', 'vp', 'vp', { unit: 'pp' })] : [])]} xKind="time" timeZone={timeZone} height={200} />
      {vpMapped && <CpmChart title="tracking_error (u_requested − vp)" series={[col(d, 'tracking_error', 'tracking_error', 'danger', { unit: 'pp' })]} xKind="time" timeZone={timeZone} height={130} />}
      <IntervalLane heading title="Active limits" intervals={lanes} fromMs={d.columns.x[0]} toMs={d.columns.x[d.n - 1]} timeZone={timeZone} empty="No sample at a limit in this window." />
      <TimelineTable title="Dwell episodes" rows={episodes(dwell, i => (dwell?.mask?.[i] ? 'HIGH dwell' : 'LOW dwell'))} timeZone={timeZone} empty="No limit dwell episode retained for this run." />
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
  const bandSeries: CpmSeries[] = Number.isFinite(noise) ? [{ id: 'noise+', label: 'noise_band', unit: d.units.delta_pv ?? 'EU', x: d.columns.x, y: Array.from(d.columns.x, () => noise), pen: 'neutral', bandMeaning: '3 × std of ΔPV' }] : [];
  const healthRows: LaneInterval[] = health ? Array.from(health.columns.x, (start, i) => ({
    startMs: Number.isFinite(start) ? start : 0, endMs: Number.isFinite(start) ? start + (health.columns.y[i] ?? 0) * 1000 : 0,
    label: `${labelsOf(health, 'role')[i] ?? '?'}: ${labelsOf(health, 'eligibility')[i] ?? '?'} (${['F', 'C', 'S', 'M'].filter(f => health.columns[f]?.[i]).join('') || 'no flag'})`,
    tone: ((labelsOf(health, 'eligibility')[i] === 'ELIGIBLE') ? 'good' : labelsOf(health, 'eligibility')[i] === 'INELIGIBLE' ? 'bad' : labelsOf(health, 'eligibility')[i] === 'LIMITED' ? 'warn' : 'muted') as LaneInterval['tone'],
  })).filter(r => r.endMs > r.startMs) : [];
  return (
    <section className="cpm-surface">
      <PanelHead title="Measurement health" />
      <CpmChart title="PV" series={[col(d, 'y', 'pv', 'pv')]} xKind="time" timeZone={timeZone} height={160} />
      <CpmChart title="delta_pv with the noise band; spikes marked" series={[col(d, 'delta_pv', 'delta_pv', 'overlay', { unit: d.units.delta_pv ?? 'EU' }), markersWhere(d, 'spikes', 'delta_pv', 'spikes', 'danger'), ...bandSeries]} xKind="time" timeZone={timeZone} height={160} />
      <TimelineTable title="Freeze episodes" rows={episodes(freeze, () => 'PV frozen')} timeZone={timeZone} empty="No freeze episode retained for this run." />
      <IntervalLane heading title="Eligibility per role (F / C / S / M)" intervals={healthRows} fromMs={d.columns.x[0]} toMs={d.columns.x[d.n - 1]} timeZone={timeZone}
        empty={health ? (P(health, 'absence_semantics') ?? 'No health lanes.') : 'Health lanes not retained — absence of health is NOT OK (NOT_CONFIGURED).'} />
    </section>
  );
};
export const G11Measurement: React.FC<GateViewProps> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'measurement');
  return <RequireKinds arts={arts} kinds={['measurement']}>{d && <G11Body d={d} freeze={first(arts, 'FREEZE_EVENTS') ?? first(arts, 'freeze_events')} health={first(arts, 'eligibility_intervals')} timeZone={timeZone} />}</RequireKinds>;
};
