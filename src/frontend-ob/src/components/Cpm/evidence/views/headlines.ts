/**
 * v2.5 workbench: the verdict card's key numbers per gate - read from the primary artifact's
 * provenance exactly as the engine wrote them (never derived here), formatted for reading.
 */
import type { GateArtifacts } from '../useGateArtifacts';
import type { DecodedArtifact } from '../artifactCodec';
import { fmtQuantity, labelForKey, unitForKey } from '../format';
import type { CpmTone } from '../../shared';
import { codeLabel, diagnosisLabel, methodLabel } from '../../vocabulary';

export interface Headline { label: string; value: string; unit?: string; tone?: CpmTone; raw?: string }

const P = (d: DecodedArtifact | undefined, key: string): string | undefined => {
  const v = d?.meta.provenance?.[key];
  return v == null || v === '' ? undefined : String(v);
};

/** A provenance value as a headline: value text without the unit, the unit apart (the card renders both). */
function fromKey(d: DecodedArtifact | undefined, key: string, label = labelForKey(key)): Headline | null {
  const raw = P(d, key);
  if (raw == null) return null;
  const unit = unitForKey(key);
  // CHG-051: a code value ("OSCILLATION_TUNING", "G8.XCORR_ASYMMETRY_V1") is shown as its label; the raw code
  // stays in `raw` (the tile's hover) — tiles no longer break a 20-letter token mid-word.
  if (/^[A-Z][A-Z0-9_.:]*$/.test(raw.trim()) && /[A-Z]{2}/.test(raw)) {
    const value = key === 'case_state' ? diagnosisLabel(raw) : key === 'method_id' ? methodLabel(raw) : codeLabel(raw);
    return { label, value, raw };
  }
  const text = fmtQuantity(raw, unit, key);
  if (unit && text.endsWith(` ${unit}`)) return { label, value: text.slice(0, -(unit.length + 1)), unit, raw };
  return { label, value: text, raw };
}

const first = (arts: GateArtifacts, kind: string) => arts.byKind[kind]?.[0];
const count = (arts: GateArtifacts, kind: string) => arts.byKind[kind]?.length ?? 0;
const listLength = (s: string | undefined) => (s ? s.split(/[;,]/).map(x => x.trim()).filter(Boolean).length : 0);

export function headlineOf(gate: string, arts: GateArtifacts): Headline[] {
  const pick = (...items: Array<Headline | null>) => items.filter((h): h is Headline => h != null).slice(0, 5);
  switch (gate) {
    case 'G0': {
      const roles = arts.byKind.role_qualification ?? [];
      const accepted = roles.reduce((n, d) => n + (d.mask ? d.mask.filter(Boolean).length : d.n), 0);
      const total = roles.reduce((n, d) => n + d.n, 0);
      return roles.length ? [{ label: 'Accepted samples', value: `${accepted} of ${total}` }, { label: 'Roles', value: String(roles.length) }] : [];
    }
    case 'G1': { const d = first(arts, 'mode_authority'); return pick(fromKey(d, 'selected'), fromKey(d, 'tracking'), fromKey(d, 'selector_id')); }
    case 'G2': { const d = first(arts, 'sp_events'); return pick(fromKey(d, 'trigger_threshold'), fromKey(d, 'trigger_threshold_source')); }
    case 'G2r': { const d = first(arts, 'operating_region'); return pick(fromKey(d, 'operating_regime_id')); }
    case 'G3': { const d = first(arts, 'objective_error'); return pick(fromKey(d, 'tolerance_band'), fromKey(d, 'eligible_duration'), fromKey(d, 'objective_id')); }
    case 'G4': { const d = first(arts, 'control_activity'); return pick(fromKey(d, 'command_total_variation'), fromKey(d, 'sigma_u_norm'), fromKey(d, 'sigma_pv_norm'), fromKey(d, 'baseline_activity')); }
    case 'G5': { const d = first(arts, 'acf_series'); return pick(fromKey(d, 'period_s'), fromKey(d, 'regularity'), fromKey(d, 'accepted_cycles')); }
    case 'G6': { const d = first(arts, 'psd'); return pick(fromKey(d, 'ordinate_kind'), fromKey(d, 'resolution_hz'), { label: 'Peak bins', value: String(listLength(P(d, 'peak_indices'))) }, fromKey(d, 'noise_reference')); }
    case 'G7': {
      const cycles = arts.byKind.cycle_fit ?? [];
      if (!cycles.length) return [];
      return [{ label: 'Accepted cycles', value: `${cycles.filter(c => P(c, 'accepted') === 'true').length} of ${cycles.length}` }];
    }
    case 'G8': { const d = first(arts, 'lag_structure'); return pick(fromKey(d, 'method_id'), fromKey(d, 'bicoherence'), fromKey(d, 'capability_reason')); }
    case 'G9': {
      const polys = arts.byKind.cycle_polygon ?? [];
      if (!polys.length) return [];
      const areas = polys.map(p => Number(P(p, 'area'))).filter(Number.isFinite);
      const mean = areas.length ? areas.reduce((a, b) => a + b, 0) / areas.length : NaN;
      return [{ label: 'Cycle polygons', value: String(polys.length) }, { label: 'Mean area', value: fmtQuantity(mean, 'fraction') }];
    }
    case 'G10': { const d = first(arts, 'actuator_limits'); return pick(fromKey(d, 'limit_reason'), { label: 'Dwell events', value: String(count(arts, 'DWELL_EVENTS') || listLength(P(d, 'dwell_events'))) }, fromKey(d, 'limit_dwell_warn_s')); }
    case 'G11': { const d = first(arts, 'measurement'); return pick(fromKey(d, 'noise_band'), fromKey(d, 'quantization'), { label: 'Freeze events', value: String(count(arts, 'FREEZE_EVENTS') || listLength(P(d, 'freeze_events'))) }); }
    case 'G12': { const d = first(arts, 'response_event'); return pick(fromKey(d, 'event_type'), fromKey(d, 'capture_state'), fromKey(d, 'censor_reason'), fromKey(d, 'input_sequence_count')); }
    case 'G13': { const d = first(arts, 'interaction'); return pick(fromKey(d, 'state'), { label: 'Peers', value: String(listLength(P(d, 'peer_ids'))) }, fromKey(d, 'lag_s'), fromKey(d, 'coherence')); }
    case 'G14': { const d = first(arts, 'confirmation_record'); return pick(fromKey(d, 'state'), fromKey(d, 'claim_type'), fromKey(d, 'non_following_dwell_s'), fromKey(d, 'scope')); }
    case 'G15': { const d = first(arts, 'decision_record'); return pick(fromKey(d, 'leading_hypothesis', 'Leading cause'), fromKey(d, 'case_state', 'Case'), fromKey(d, 'condition_state', 'Open condition'), fromKey(d, 'availability', 'Availability')); }
    default: return [];
  }
}
