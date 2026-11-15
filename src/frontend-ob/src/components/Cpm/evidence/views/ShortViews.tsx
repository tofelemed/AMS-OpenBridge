/**
 * v2.5 Task 2E.4 - the short-tier views (G0, G1, G2, G2r, G3, G4) on their exact artifacts
 * (2C.1c field names). Each view has a pure body that takes decoded artifacts, so tests render
 * it on fixtures; the exported view resolves the artifacts of the selected run. CHG-187 (owner review 11.2): no eyebrow over a
 * panel (the gate head names the gate), and no row that repeats one of the gate's KPI cards (their notes are the cards' tips).
 * CHG-193 (owner decision 15 Nov 2026): chart titles, axes, legends and rows in words (PV / SP / OP / VP, "applied input");
 * units stay, and each renamed series keeps its key as the CSV column (`csv`).
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
      const value = col(d, 'y', `${role} value`, role === 'PV' ? 'pv' : role === 'SP' ? 'sp' : role === 'OP' ? 'op' : 'vp', { dashed: role === 'SP', masked: true, held: labelsOf(d, 'hold_kind').some(h => h !== 'NONE') });
      const rejected: CpmSeries = { id: 'rejected', label: `${role} rejected`, unit: value.unit, x: d.columns.x, y: Array.from(d.columns.y, (v, i) => (d.mask && !d.mask[i] ? v : null)), pen: 'danger', markers: true };
      const age = col(d, 'age_s', 'age', 'overlay', { unit: 's' });
      const named = d.meta.provenance?.role;
      const dt = col(d, 'delta_t_s', 'interval', 'neutral', { unit: 's', dashed: true });
      return (
        <section key={role} className="cpm-surface" data-role={role}>
          <PanelHead title={named && named !== role ? `${role} — ${named}` : role}
            right={<TonePill tone={d.mask && d.mask.every(Boolean) ? 'muted' : 'warn'}>{counts(excl)}</TonePill>} />
          <CpmChart title={`${role} value (accepted; rejected samples marked)`} series={[value, rejected]} xKind="time" timeZone={timeZone} height={180} />
          <CpmChart title={`${role} source age and sample interval (separate axis)`} series={[age, dt]} xKind="time" timeZone={timeZone} height={140} />
          <KvRow label="Quality">{counts(labelsOf(d, 'quality_normalized'))} (native: {counts(labelsOf(d, 'quality_native'))})</KvRow>
          <KvRow label="Hold kind">{counts(labelsOf(d, 'hold_kind'))}</KvRow>
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
      <PanelHead title="Mode, authority and the applied input" />
      <IntervalLane heading title="Mode (state intervals)" intervals={lane} fromMs={fromMs} toMs={toMs} timeZone={timeZone} empty="No mode intervals kept for this run." />
      <CpmChart title="Requested OP and applied input" series={[col(mode, 'op_requested', 'Requested OP', 'op', { unit: 'pp', csv: 'op_requested' }), col(mode, 'u_applied', 'Applied input', 'vp', { unit: 'pp', csv: 'u_applied' })]} xKind="time" timeZone={timeZone} height={180} />
      <KvRow label="Controlling authority">{counts(labelsOf(mode, 'controlling_authority'))}</KvRow>
      <KvRow label="Mode as stored → as read">{counts(labelsOf(mode, 'mode_native'))} → {counts(labelsOf(mode, 'mode_normalized'))}</KvRow>
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
  const events = markersWhere(d, 'event_id', 'y', 'SP change events', 'danger', d.units.y);
  const eventCount = Array.from(d.columns.event_id ?? []).filter(v => v > 0).length;
  return (
    <section className="cpm-surface">
      <PanelHead title="Set-point activity" right={<TonePill tone={eventCount > 0 ? 'warn' : 'good'}>{eventCount} event(s)</TonePill>} />
      <CpmChart title="SP and PV with the SP change events" series={[col(d, 'y', 'SP', 'sp', { dashed: true }), col(d, 'pv', 'PV', 'pv'), events]} xKind="time" timeZone={timeZone} height={200} />
      <CpmChart title="SP rate of change" series={[col(d, 'd_sp_dt', 'SP rate of change', 'overlay', { unit: d.units.d_sp_dt ?? 'EU/s', csv: 'd_sp_dt' })]} xKind="time" timeZone={timeZone} height={140} />
      <KvRow label="Event type">{counts(labelsOf(d, 'event_type'))} — no step metrics are computed here</KvRow>
      {onOpenG12 && eventCount > 0 && <ObcButton variant="normal" onClick={onOpenG12}>Open the response analysis of this support (G12) →</ObcButton>}
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
    lane.push({ startMs: d.columns.x[i], endMs: next, label: d.mask && !d.mask[i] ? 'Out of region' : 'In region', tone: (d.mask && !d.mask[i] ? 'bad' : 'muted') as 'bad' | 'muted' });
  }
  return (
    <section className="cpm-surface">
      <PanelHead title="Operating region" right={<TonePill tone={out.some(Boolean) ? 'warn' : 'good'}>{out.filter(Boolean).length} of {d.n} out of region</TonePill>} />
      <Trajectory title="PV versus applied input, in sample order (region bounds shaded)" x={d.columns.u_applied} y={d.columns.y} xLabel="Applied input" xUnit={d.units.u_applied ?? 'pp'} yLabel="PV" yUnit={d.units.y ?? 'EU'}
        highlight={out} highlightLabel="out of region" bounds={parseBounds(d.meta.provenance?.region_vertices_or_bounds)} />
      <IntervalLane heading title="In or out of the region" intervals={lane} fromMs={fromMs} toMs={toMs} timeZone={timeZone} />
      <KvRow label="Region bounds">{d.meta.provenance?.region_vertices_or_bounds ?? '—'}</KvRow>
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
    { id: 'band+', label: 'tolerance band', unit: d.units.y ?? 'EU', x: d.columns.x, y: Array.from(d.columns.x, () => band), pen: 'neutral', bandMeaning: `|error| <= ${band} EU (${d.meta.provenance?.objective_id ?? 'objective'})` },
    { id: 'band-', label: 'tolerance band (−)', unit: d.units.y ?? 'EU', x: d.columns.x, y: Array.from(d.columns.x, () => -band), pen: 'neutral', bandMeaning: `|error| <= ${band} EU` },
  ] : [];
  return (
    <section className="cpm-surface">
      <PanelHead title="Error against the objective" />
      <CpmChart title="error and tolerance band (samples outside the band are unmasked)" series={[col(d, 'y', 'error', 'pv'), ...bandSeries]} xKind="time" timeZone={timeZone} height={200} />
      <CpmChart title="Cumulative IAE" series={[col(d, 'cumulative_iae', 'cumulative IAE', 'overlay')]} xKind="time" timeZone={timeZone} height={130} />
      <CpmChart title="Cumulative ISE" series={[col(d, 'cumulative_ise', 'cumulative ISE', 'overlay')]} xKind="time" timeZone={timeZone} height={130} />
      <CpmChart title="Cumulative ITAE" series={[col(d, 'cumulative_itae', 'cumulative ITAE', 'overlay')]} xKind="time" timeZone={timeZone} height={130} />
      <KvRow label="Benchmark interval">{d.meta.provenance?.benchmark_interval ?? '—'}</KvRow>
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
  const reversals: CpmSeries = { id: 'reversals', label: 'reversal markers', unit: d.units.y ?? 'pp', x: d.columns.x, y: Array.from(d.columns.y, (v, i) => (d.mask && d.mask[i] ? v : null)), pen: 'danger', markers: true };
  const vpMapped = Array.from(d.columns.vp ?? []).some(v => Number.isFinite(v));
  return (
    <section className="cpm-surface">
      <PanelHead title="Control activity" right={<TonePill tone="muted">{Array.from(reversals.y).filter(v => v != null).length} reversals</TonePill>} />
      <CpmChart title={`Applied input${vpMapped ? ' and VP' : ''} (pp) with reversals`} series={[col(d, 'y', 'Applied input', 'op', { csv: 'u_applied' }), ...(vpMapped ? [col(d, 'vp', 'VP', 'vp', { unit: 'pp', csv: 'vp' })] : []), reversals]} xKind="time" timeZone={timeZone} height={200} />
      <CpmChart title="Change in applied input per sample" series={[col(d, 'delta_u', 'Change per sample', 'overlay', { unit: 'pp', csv: 'delta_u' })]} xKind="time" timeZone={timeZone} height={130} />
      <KvRow label="Measured travel">{d.meta.provenance?.measured_travel_variation ?? '—'} pp</KvRow>
      <KvRow label="Activity basis">{d.meta.provenance?.activity_basis ?? 'basis not declared'}</KvRow>
      {onOpenG10 && <ObcButton variant="normal" onClick={onOpenG10}>Actuator limits of this window (G10) →</ObcButton>}
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
