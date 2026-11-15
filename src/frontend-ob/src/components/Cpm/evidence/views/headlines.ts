/**
 * v2.5 workbench: the gate's key numbers per gate - read from the primary artifact's provenance exactly as the engine wrote
 * them (never derived here), formatted for reading. CHG-187 (owner review 11.2): they are the gate's KPI cards, each with a
 * ? tip, and the sentence that repeated them went. A tile that is also a stored calculation names its field, so the Proof
 * table does not list it again; G5's period and regularity and G8's Horch oddness read the run's own calculation when no
 * artifact is held. No artifact, no artifact tile: a missing record is never a 0.
 */
import type { GateArtifacts } from '../useGateArtifacts';
import type { DecodedArtifact } from '../artifactCodec';
import { fmtQuantity, labelForKey, unitForKey } from '../format';
import type { CpmTone } from '../../shared';
import { codeLabel, diagnosisLabel, methodLabel } from '../../vocabulary';
import { G14_STATE_TIP, TILE_TIPS } from './tileTips';

export interface Headline {
  label: string; value: string; unit?: string; tone?: CpmTone; raw?: string;
  /** The ? tip: what the tile means. */
  tip?: string;
  /** The stored calculation this tile shows (a metric field), so the Proof table leaves it out. */
  field?: string;
}

/** The run's stored calculations (its result, else its window's fused row), for tiles that are calculations. */
export type MetricOf = (field: string) => unknown;

const P = (d: DecodedArtifact | undefined, key: string): string | undefined => {
  const v = d?.meta.provenance?.[key];
  return v == null || v === '' ? undefined : String(v);
};

/** A provenance value as a headline: value text without the unit, the unit apart (the card renders both). */
function fromKey(d: DecodedArtifact | undefined, key: string, label = labelForKey(key)): Headline | null {
  const raw = P(d, key);
  if (raw == null) return null;
  const unit = unitForKey(key);
  const tip = TILE_TIPS[key];
  // CHG-051: a code value ("OSCILLATION_TUNING") is shown as its label; the raw code stays in `raw`
  if (/^[A-Z][A-Z0-9_.:]*$/.test(raw.trim()) && /[A-Z]{2}/.test(raw)) {
    const value = key === 'case_state' ? diagnosisLabel(raw) : key === 'method_id' ? methodLabel(raw) : codeLabel(raw);
    return { label, value, raw, tip };
  }
  const text = fmtQuantity(raw, unit, key);
  if (unit && text.endsWith(` ${unit}`)) return { label, value: text.slice(0, -(unit.length + 1)), unit, raw, tip };
  return { label, value: text, raw, tip };
}

/** A stored calculation as a tile (G8's measure; G5's when its artifact is not held). */
function fromMetric(metric: MetricOf | undefined, field: string, label: string, unit: 's' | '1' | 'score', tipKey: string): Headline | null {
  const v = metric?.(field);
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const value = unit === 's' ? fmtQuantity(n, 's').replace(/ s$/, '') : n.toFixed(2);
  return { label, value, unit: unit === '1' ? undefined : unit, tip: TILE_TIPS[tipKey], field };
}

const counted = (label: string, value: number): Headline => ({ label, value: String(value), tip: TILE_TIPS[label] });
const withField = (h: Headline | null, field: string): Headline | null => (h ? { ...h, field } : null);
const withTip = (h: Headline | null, tip: string): Headline | null => (h ? { ...h, tip } : null);

const first = (arts: GateArtifacts, kind: string) => arts.byKind[kind]?.[0];
const count = (arts: GateArtifacts, kind: string) => arts.byKind[kind]?.length ?? 0;
const listLength = (s: string | undefined) => (s ? s.split(/[;,]/).map(x => x.trim()).filter(Boolean).length : 0);

/**
 * CHG-049 (final review I1): the G7 tally. The per-cycle cycle_fit artifacts are capped (accepted first, ends kept),
 * so the accepted / total counts come from the cycle_scores artifact (one row per cycle, all N) when it is present.
 */
export function cycleTally(scores: DecodedArtifact | undefined, cycles: DecodedArtifact[]): { accepted: number; total: number; shown: number } {
  const acceptedCol = scores?.columns.accepted;
  if (scores && acceptedCol) return { accepted: Array.from(acceptedCol).filter(v => v !== 0).length, total: scores.n, shown: cycles.length };
  return { accepted: cycles.filter(c => P(c, 'accepted') === 'true').length, total: cycles.length, shown: cycles.length };
}

export function headlineOf(gate: string, arts: GateArtifacts, metric?: MetricOf): Headline[] {
  const pick = (...items: Array<Headline | null>) => items.filter((h): h is Headline => h != null).slice(0, 5);
  switch (gate) {
    case 'G0': {
      const roles = arts.byKind.role_qualification ?? [];
      const accepted = roles.reduce((n, d) => n + (d.mask ? d.mask.filter(Boolean).length : d.n), 0);
      const total = roles.reduce((n, d) => n + d.n, 0);
      return roles.length ? [{ label: 'Accepted samples', value: `${accepted} of ${total}`, tip: TILE_TIPS['Accepted samples'] }, counted('Roles', roles.length)] : [];
    }
    case 'G1': { const d = first(arts, 'mode_authority'); return pick(fromKey(d, 'selected'), fromKey(d, 'tracking'), fromKey(d, 'selector_id')); }
    case 'G2': { const d = first(arts, 'sp_events'); return pick(fromKey(d, 'trigger_threshold'), fromKey(d, 'trigger_threshold_source')); }
    case 'G2r': { const d = first(arts, 'operating_region'); return pick(fromKey(d, 'operating_regime_id')); }
    case 'G3': { const d = first(arts, 'objective_error'); return pick(fromKey(d, 'tolerance_band'), fromKey(d, 'eligible_duration'), fromKey(d, 'objective_id')); }
    case 'G4': { const d = first(arts, 'control_activity'); return pick(fromKey(d, 'command_total_variation'), fromKey(d, 'sigma_u_norm'), fromKey(d, 'sigma_pv_norm'), fromKey(d, 'baseline_activity')); }
    case 'G5': {
      const d = first(arts, 'acf_series');
      return pick(
        withField(fromKey(d, 'period_s'), 'acf_period_s') ?? fromMetric(metric, 'acf_period_s', 'ACF period', 's', 'period_s'),
        withField(fromKey(d, 'regularity'), 'acf_regularity') ?? fromMetric(metric, 'acf_regularity', 'Regularity', '1', 'regularity'),
        fromKey(d, 'accepted_cycles'));
    }
    case 'G6': {
      const d = first(arts, 'psd');
      return d ? pick(fromKey(d, 'ordinate_kind'), fromKey(d, 'resolution_hz'), counted('Peak bins', listLength(P(d, 'peak_indices'))), fromKey(d, 'noise_reference')) : [];
    }
    case 'G7': {
      const t = cycleTally(first(arts, 'cycle_scores'), arts.byKind.cycle_fit ?? []);
      return t.total ? [{ label: 'Accepted cycles', value: `${t.accepted} of ${t.total}`, tip: TILE_TIPS['Accepted cycles'] }] : [];
    }
    // CHG-187: the measure itself, in place of the method, bicoherence and capability tiles
    case 'G8': return pick(fromMetric(metric, 'horch_oddness', 'Horch oddness', 'score', 'horch_oddness'));
    case 'G9': {
      const polys = arts.byKind.cycle_polygon ?? [];
      if (!polys.length) return [];
      const areas = polys.map(p => Number(P(p, 'area'))).filter(Number.isFinite);
      const mean = areas.length ? areas.reduce((a, b) => a + b, 0) / areas.length : NaN;
      return [counted('Cycle polygons', polys.length), { label: 'Mean area', value: fmtQuantity(mean, 'fraction'), tip: TILE_TIPS['Mean area'] }];
    }
    case 'G10': {
      const d = first(arts, 'actuator_limits');
      return d ? pick(fromKey(d, 'limit_reason'), counted('Dwell events', count(arts, 'DWELL_EVENTS') || listLength(P(d, 'dwell_events'))), fromKey(d, 'limit_dwell_warn_s')) : [];
    }
    case 'G11': {
      const d = first(arts, 'measurement');
      return d ? pick(fromKey(d, 'noise_band'), fromKey(d, 'quantization'), counted('Freeze events', count(arts, 'FREEZE_EVENTS') || listLength(P(d, 'freeze_events')))) : [];
    }
    case 'G12': { const d = first(arts, 'response_event'); return pick(fromKey(d, 'event_type'), fromKey(d, 'capture_state'), fromKey(d, 'censor_reason'), fromKey(d, 'input_sequence_count')); }
    case 'G13': {
      const d = first(arts, 'interaction');
      return d ? pick(withTip(fromKey(d, 'state'), 'The interaction result for this window.'), counted('Peers', listLength(P(d, 'peer_ids'))), fromKey(d, 'lag_s'), fromKey(d, 'coherence')) : [];
    }
    // CHG-187: the confirmation decision as cards; the record view keeps only what the cards do not say
    case 'G14': {
      const d = first(arts, 'confirmation_record');
      return pick(withTip(fromKey(d, 'state'), G14_STATE_TIP), fromKey(d, 'claim_type'), fromKey(d, 'reason'), fromKey(d, 'scope'), fromKey(d, 'non_following_dwell_s'));
    }
    case 'G15': {
      const d = first(arts, 'decision_record');
      return pick(fromKey(d, 'leading_hypothesis', 'Possible cause'), fromKey(d, 'case_state', 'Case'), fromKey(d, 'condition_state', 'Open condition'),
        fromKey(d, 'availability', 'Availability'), fromKey(d, 'qualified_support', 'Qualified support'));
    }
    default: return [];
  }
}
