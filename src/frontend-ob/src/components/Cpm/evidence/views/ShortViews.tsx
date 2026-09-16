/**
 * v2.5 Task 2E.4 - the short-tier views (G0, G1, G2, G2r, G3, G4) on their exact artifacts
 * (2C.1c field names). Each view has a pure body that takes decoded artifacts, so tests render
 * it on fixtures; the exported view resolves the artifacts of the selected run.
 */
import React from 'react';
import { KvRow, PanelHead, TonePill } from '../../shared';
import { CpmChart, type CpmSeries } from '../CpmChart';
import { labelsOf, type DecodedArtifact } from '../artifactCodec';
import { useGateArtifacts, type GateArtifacts } from '../useGateArtifacts';
import type { GateViewProps } from '../EvidenceArtifactRenderer';
import { IntervalLane } from './primitives/IntervalLane';
import { Trajectory } from './primitives/Trajectory';
import { TimelineTable } from './primitives/TimelineTable';
import { RequireKinds, col, first, markersWhere } from './viewSupport';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

const counts = (labels: string[]) => { const m = new Map<string, number>(); for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1); return Array.from(m.entries()).map(([k, v]) => `${k}: ${v}`).join(' · '); };

// ── G0 ─────────────────────────────────────────────────────────────────────────────────────────
export const G0Body: React.FC<{ roles: DecodedArtifact[]; timeZone: string }> = ({ roles, timeZone }) => (
  <>
    {roles.map(d => {
      const role = d.meta.roleOrPath ?? '?';
      const excl = labelsOf(d, 'exclusion_reason');
      const value = col(d, 'y', `${role} value`, role === 'PV' ? 'good' : role === 'SP' ? 'grey' : role === 'OP' ? 'amber' : 'pink', { masked: true, held: labelsOf(d, 'hold_kind').some(h => h !== 'NONE') });
      const rejected: CpmSeries = { id: 'rejected', label: `${role} rejected`, unit: value.unit, x: d.columns.x, y: Array.from(d.columns.y, (v, i) => (d.mask && !d.mask[i] ? v : null)), pen: 'bad', markers: true };
      const age = col(d, 'age_s', 'age', 'accent', { unit: 's' });
      const dt = col(d, 'delta_t_s', 'interval', 'grey', { unit: 's', dashed: true });
      return (
        <section key={role} className="cpm-surface" data-role={role}>
          <PanelHead eyebrow="G0 role ribbon" title={`${role} — ${d.meta.provenance?.role ?? role}`}
            right={<TonePill tone={d.mask && d.mask.every(Boolean) ? 'good' : 'warn'}>{counts(excl)}</TonePill>} />
          <CpmChart title={`${role} value (accepted; rejected samples marked)`} series={[value, rejected]} xKind="time" timeZone={timeZone} height={180} />
          <CpmChart title={`${role} source age and sample interval (separate axis)`} series={[age, dt]} xKind="time" timeZone={timeZone} height={140} />
          <KvRow label="quality">{counts(labelsOf(d, 'quality_normalized'))} (native: {counts(labelsOf(d, 'quality_native'))})</KvRow>
          <KvRow label="hold kind">{counts(labelsOf(d, 'hold_kind'))}</KvRow>
        </section>
      );
    })}
  </>
);
export const G0DataQualification: React.FC<GateViewProps> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  return <RequireKinds arts={arts} kinds={['role_qualification']}><G0Body roles={arts.byKind.role_qualification ?? []} timeZone={timeZone} /></RequireKinds>;
};

// ── G1 ─────────────────────────────────────────────────────────────────────────────────────────
export const G1Body: React.FC<{ mode: DecodedArtifact; intervals: DecodedArtifact | undefined; timeZone: string; fromMs: number; toMs: number }> = ({ mode, intervals, timeZone, fromMs, toMs }) => {
  const lane = intervals ? Array.from(intervals.columns.x, (start, i) => ({ startMs: start, endMs: start + intervals.columns.y[i] * 1000, label: labelsOf(intervals, 'state')[i] ?? '—', tone: (['AUT', 'CAS'].includes(labelsOf(intervals, 'state')[i]) ? 'good' : labelsOf(intervals, 'state')[i] === 'MAN' ? 'warn' : 'muted') as 'good' | 'warn' | 'muted' })) : [];
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G1" title="Mode, authority and the applied input" />
      <IntervalLane title="mode_normalized (state intervals)" intervals={lane} fromMs={fromMs} toMs={toMs} timeZone={timeZone} empty="No state_intervals artifact retained." />
      <CpmChart title="op_requested vs u_applied (pp lane)" series={[col(mode, 'op_requested', 'op_requested', 'amber', { unit: 'pp' }), col(mode, 'u_applied', 'u_applied', 'pink', { unit: 'pp' })]} xKind="time" timeZone={timeZone} height={180} />
      <KvRow label="controlling_authority">{counts(labelsOf(mode, 'controlling_authority'))}</KvRow>
      <KvRow label="mode_native → normalized">{counts(labelsOf(mode, 'mode_native'))} → {counts(labelsOf(mode, 'mode_normalized'))}</KvRow>
      <KvRow label="selector / selected / tracking">{mode.meta.provenance?.selector_id ?? '—'} / {mode.meta.provenance?.selected ?? '—'} / {mode.meta.provenance?.tracking ?? '—'} (unknown mapping stays unknown)</KvRow>
    </section>
  );
};
export const G1ModeAuthority: React.FC<GateViewProps & { fromMs?: number; toMs?: number }> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  const mode = first(arts, 'mode_authority');
  const from = mode ? mode.columns.x[0] : 0, to = mode ? mode.columns.x[mode.n - 1] : 0;
  return <RequireKinds arts={arts} kinds={['mode_authority']}>{mode && <G1Body mode={mode} intervals={first(arts, 'state_intervals')} timeZone={timeZone} fromMs={from} toMs={to} />}</RequireKinds>;
};

// ── G2 ─────────────────────────────────────────────────────────────────────────────────────────
export const G2Body: React.FC<{ d: DecodedArtifact; timeZone: string; onOpenG12?: () => void }> = ({ d, timeZone, onOpenG12 }) => {
  const events = markersWhere(d, 'event_id', 'y', 'SP change events', 'bad', d.units.y);
  const eventCount = Array.from(d.columns.event_id ?? []).filter(v => v > 0).length;
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G2" title="Set-point activity" right={<TonePill tone={eventCount > 0 ? 'warn' : 'good'}>{eventCount} event(s)</TonePill>} />
      <CpmChart title="SP / PV (shared EU pane) with event markers" series={[col(d, 'y', 'SP', 'grey'), col(d, 'pv', 'PV', 'good'), events]} xKind="time" timeZone={timeZone} height={200} />
      <CpmChart title="d_sp_dt (SP rate pane)" series={[col(d, 'd_sp_dt', 'd_sp_dt', 'accent', { unit: d.units.d_sp_dt ?? 'EU/s' })]} xKind="time" timeZone={timeZone} height={140} />
      <KvRow label="trigger_threshold">{d.meta.provenance?.trigger_threshold ?? '—'} ({d.meta.provenance?.trigger_threshold_source ?? 'source not declared'})</KvRow>
      <KvRow label="event_type">{counts(labelsOf(d, 'event_type'))} — no step metrics are computed here; a ramp is not a step</KvRow>
      {onOpenG12 && eventCount > 0 && <ObcButton variant="normal" onClick={onOpenG12}>Open the response analysis of this support (G12) ›</ObcButton>}
    </section>
  );
};
export const G2SpEvents: React.FC<GateViewProps> = ({ manifest, gate, timeZone, onNavigateGate }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'sp_events');
  return <RequireKinds arts={arts} kinds={['sp_events']}>{d && <G2Body d={d} timeZone={timeZone} onOpenG12={onNavigateGate ? () => onNavigateGate('G12') : undefined} />}</RequireKinds>;
};

// ── G2r ────────────────────────────────────────────────────────────────────────────────────────
export function parseBounds(s: string | undefined): { xMin?: number; xMax?: number; yMin?: number; yMax?: number } {
  // "pv:[a,b];u:[c,d]" -> y = pv, x = u
  const m = /pv:\[([^,]+),([^\]]+)\];u:\[([^,]+),([^\]]+)\]/.exec(s ?? '');
  if (!m) return {};
  const n = (v: string) => { const f = Number(v); return Number.isFinite(f) ? f : undefined; };
  return { yMin: n(m[1]), yMax: n(m[2]), xMin: n(m[3]), xMax: n(m[4]) };
}
export const G2rBody: React.FC<{ d: DecodedArtifact; timeZone: string; fromMs: number; toMs: number }> = ({ d, timeZone, fromMs, toMs }) => {
  const out = d.mask ? d.mask.map(m => !m) : [];
  const lane = [];
  for (let i = 0; i < d.n; i++) {
    const next = i + 1 < d.n ? d.columns.x[i + 1] : d.columns.x[i] + 1000;
    lane.push({ startMs: d.columns.x[i], endMs: next, label: d.mask && !d.mask[i] ? 'OUT OF REGION' : 'in region', tone: (d.mask && !d.mask[i] ? 'bad' : 'good') as 'bad' | 'good' });
  }
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G2r" title="Operating region" right={<TonePill tone={out.some(Boolean) ? 'warn' : 'good'}>{out.filter(Boolean).length} of {d.n} out of region</TonePill>} />
      <Trajectory title="PV versus applied input, in sample order (region bounds shaded)" x={d.columns.u_applied} y={d.columns.y} xLabel="u_applied" xUnit={d.units.u_applied ?? 'pp'} yLabel="pv" yUnit={d.units.y ?? 'EU'}
        highlight={out} highlightLabel="out of region" bounds={parseBounds(d.meta.provenance?.region_vertices_or_bounds)} />
      <IntervalLane title="domain_mask (in / out)" intervals={lane} fromMs={fromMs} toMs={toMs} timeZone={timeZone} />
      <KvRow label="region_vertices_or_bounds">{d.meta.provenance?.region_vertices_or_bounds ?? '—'}</KvRow>
      <KvRow label="operating_regime_id">{d.meta.provenance?.operating_regime_id ?? '—'} — out of the model domain is not a healthy process</KvRow>
    </section>
  );
};
export const G2rOperatingRegion: React.FC<GateViewProps> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'operating_region');
  return <RequireKinds arts={arts} kinds={['operating_region']}>{d && <G2rBody d={d} timeZone={timeZone} fromMs={d.columns.x[0]} toMs={d.columns.x[d.n - 1]} />}</RequireKinds>;
};

// ── G3 ─────────────────────────────────────────────────────────────────────────────────────────
export const G3Body: React.FC<{ d: DecodedArtifact; timeZone: string }> = ({ d, timeZone }) => {
  const band = Number(d.meta.provenance?.tolerance_band);
  const bandSeries: CpmSeries[] = Number.isFinite(band) ? [
    { id: 'band+', label: 'tolerance band', unit: d.units.y ?? 'EU', x: d.columns.x, y: Array.from(d.columns.x, () => band), pen: 'grey', bandMeaning: `|error| <= ${band} EU (${d.meta.provenance?.objective_id ?? 'objective'})` },
    { id: 'band-', label: 'tolerance band (−)', unit: d.units.y ?? 'EU', x: d.columns.x, y: Array.from(d.columns.x, () => -band), pen: 'grey', bandMeaning: `|error| <= ${band} EU` },
  ] : [];
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G3" title="Error against the objective" />
      <CpmChart title="error and tolerance band (samples outside the band are unmasked)" series={[col(d, 'y', 'error', 'good'), ...bandSeries]} xKind="time" timeZone={timeZone} height={200} />
      <CpmChart title="cumulative_iae" series={[col(d, 'cumulative_iae', 'cumulative IAE', 'accent')]} xKind="time" timeZone={timeZone} height={130} />
      <CpmChart title="cumulative_ise" series={[col(d, 'cumulative_ise', 'cumulative ISE', 'accent')]} xKind="time" timeZone={timeZone} height={130} />
      <CpmChart title="cumulative_itae" series={[col(d, 'cumulative_itae', 'cumulative ITAE', 'accent')]} xKind="time" timeZone={timeZone} height={130} />
      <KvRow label="eligible_duration">{d.meta.provenance?.eligible_duration ?? '—'} s</KvRow>
      <KvRow label="objective_id / benchmark_interval">{d.meta.provenance?.objective_id ?? '—'} / {d.meta.provenance?.benchmark_interval ?? '—'} — no objective means performance without a health pass</KvRow>
    </section>
  );
};
export const G3ObjectiveError: React.FC<GateViewProps> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'objective_error');
  return <RequireKinds arts={arts} kinds={['objective_error']}>{d && <G3Body d={d} timeZone={timeZone} />}</RequireKinds>;
};

// ── G4 ─────────────────────────────────────────────────────────────────────────────────────────
export const G4Body: React.FC<{ d: DecodedArtifact; timeZone: string; onOpenG10?: () => void }> = ({ d, timeZone, onOpenG10 }) => {
  const reversals: CpmSeries = { id: 'reversals', label: 'reversal markers', unit: d.units.y ?? 'pp', x: d.columns.x, y: Array.from(d.columns.y, (v, i) => (d.mask && d.mask[i] ? v : null)), pen: 'bad', markers: true };
  const vpMapped = Array.from(d.columns.vp ?? []).some(v => Number.isFinite(v));
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G4" title="Control activity" right={<TonePill tone="muted">{Array.from(reversals.y).filter(v => v != null).length} reversals</TonePill>} />
      <CpmChart title={`u_applied${vpMapped ? ' and vp' : ''} (pp lane) with reversal markers`} series={[col(d, 'y', 'u_applied', 'amber'), ...(vpMapped ? [col(d, 'vp', 'vp', 'pink', { unit: 'pp' })] : []), reversals]} xKind="time" timeZone={timeZone} height={200} />
      <CpmChart title="delta_u per sample" series={[col(d, 'delta_u', 'delta_u', 'accent', { unit: 'pp' })]} xKind="time" timeZone={timeZone} height={130} />
      <KvRow label="command_total_variation / measured_travel_variation">{d.meta.provenance?.command_total_variation ?? '—'} pp / {d.meta.provenance?.measured_travel_variation ?? '—'} — OP travel is not valve travel</KvRow>
      <KvRow label="sigma_u_norm / sigma_pv_norm">{d.meta.provenance?.sigma_u_norm ?? '—'} / {d.meta.provenance?.sigma_pv_norm ?? '—'} ({d.meta.provenance?.activity_basis ?? 'basis not declared'})</KvRow>
      <KvRow label="baseline_activity (warn ratio)">{d.meta.provenance?.baseline_activity ?? '—'} — high activity cannot directly confirm friction</KvRow>
      {onOpenG10 && <ObcButton variant="normal" onClick={onOpenG10}>Actuator limits of this window (G10) ›</ObcButton>}
    </section>
  );
};
export const G4ControlActivity: React.FC<GateViewProps> = ({ manifest, gate, timeZone, onNavigateGate }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'control_activity');
  return <RequireKinds arts={arts} kinds={['control_activity']}>{d && <G4Body d={d} timeZone={timeZone} onOpenG10={onNavigateGate ? () => onNavigateGate('G10') : undefined} />}</RequireKinds>;
};

export const ShortTimelineTable = TimelineTable;
export type { GateArtifacts };
