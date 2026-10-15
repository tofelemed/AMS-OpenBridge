/**
 * v2.5 workbench: ONE formatter for every quantity the workbench prints and ONE label map for the
 * engine's provenance keys. Presentation only - nothing is derived here; the raw value and the raw
 * key stay available (tooltips, CSV) for anyone who needs the exact bytes.
 */

import { codeLabel, diagnosisLabel } from '../vocabulary';
import { fmtDuration } from '../shared';

const SECONDS = /(^|[._])(period|lag|dwell|duration|age|delay|settle|dead_time|time_constant|tau|theta)(_s)?$|_s$/i;
const FRACTION = /(^|[._])(regularity|coherence|score|ratio|fraction|overlap|coverage|confidence|damping)/i;
const COUNT = /(_count|_no|cycles|samples|indices|segments|size|revision|_id|bins|events|peaks|polygons)$/i;

function rule(unit: string | null | undefined, key: string | undefined): 'seconds' | 'fraction' | 'pp' | 'count' | 'hz' | 'eu' {
  const u = (unit ?? '').trim();
  if (u === 's' || u === 'seconds') return 'seconds';
  if (u === '1' || u === 'fraction' || u === 'ratio') return 'fraction';
  if (u === 'pp' || u === '%' || u === 'percent') return 'pp';
  if (u === 'count' || u === 'n' || u === 'samples') return 'count';
  if (u.toLowerCase() === 'hz') return 'hz';
  if (!u && key) {
    if (SECONDS.test(key)) return 'seconds';
    if (/_hz$/i.test(key)) return 'hz';
    if (COUNT.test(key)) return 'count';
    if (FRACTION.test(key) || /_norm$/i.test(key)) return 'fraction';
  }
  return 'eu';
}

function unitSuffix(unit: string | null | undefined, r: ReturnType<typeof rule>): string {
  const u = (unit ?? '').trim();
  if (u && u !== '1' && u !== 'fraction' && u !== 'count' && u !== 'n' && u !== 'ratio') return ` ${u}`;
  if (!u) {
    if (r === 'seconds') return ' s';
    if (r === 'hz') return ' Hz';
  }
  return '';
}

/** The display text of a quantity; `key` (the provenance key) supplies the rule when the unit is absent. */
export function fmtQuantity(value: unknown, unit?: string | null, key?: string): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') return '—';
    const asNumber = Number(t);
    if (t !== '' && Number.isFinite(asNumber) && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return fmtQuantity(asNumber, unit, key);
    // CHG-051: a lone engine code reads as its label; numbers inside a list are rounded (SME #15) — the exact
    // string stays in the run's artifacts and the Advanced engine trace.
    if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(t)) return key && /(^|\.)case_state$/.test(key) ? diagnosisLabel(t) : codeLabel(t);
    // a composite engine list ("STICTION:DISQUALIFIED:0.0;OSCILLATION_TUNING:QUALIFIED:1.0") is a record, not a value:
    // its readable form is the gate's evidence view; here it is counted (the exact string is on hover / Advanced)
    if (t.includes(';') && /[A-Z][A-Z0-9_]{2,}[:=]/.test(t)) {
      const n = t.split(';').filter(x => x.trim()).length;
      return `${n} entr${n === 1 ? 'y' : 'ies'} — read them in the evidence view`;
    }
    const worded = t.replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, c => codeLabel(c));
    const joined = (worded.includes(';') ? worded.split(';').map(p => p.trim()).filter(Boolean).join(' · ') : worded)
      .replace(/-?\d+\.\d{4,}/g, m => readable(Number(m)));   // CHG-098 (SME 2 #23)
    return joined.length > 160 ? joined.slice(0, 160) + '…' : joined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  // SME #15: a duration in milliseconds reads in s / min / h
  if (key && /(_ms|qualified_support)$/i.test(key)) return fmtDuration(value);
  const r = rule(unit, key);
  const suffix = unitSuffix(unit, r);
  switch (r) {
    case 'seconds': return `${round(value, 1)}${suffix}`;
    case 'fraction': return `${value.toFixed(2)}${suffix}`;   // CHG-098 (SME 2 #23): 2 dp for a 0–1 fraction
    case 'pp': return `${round(value, 1)}${suffix}`;
    case 'count': return `${Math.round(value)}${suffix}`;
    // engineering values keep 4 significant figures (141.2 m3/h), grouped from 1,000
    case 'hz': return `${readable(value, 4)}${suffix}`;
    default: return `${readable(value, 4)}${suffix}`;
  }
}

function round(v: number, places: number): string {
  const f = 10 ** places;
  const r = Math.round(v * f) / f;
  return r.toFixed(places).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/** Labels for the engine's provenance keys (the artifact-kind prefix is stripped before lookup). */
export const PROVENANCE_LABELS: Record<string, string> = {
  period_s: 'ACF period', regularity: 'Regularity', accepted_cycles: 'Accepted cycles', regularity_method: 'Regularity method',
  preprocessing: 'Preprocessing', basis: 'Signal basis', tolerance_band: 'Tolerance band', objective_id: 'Objective',
  eligible_duration: 'Eligible duration', benchmark_interval: 'Benchmark interval', trigger_threshold: 'Trigger threshold',
  trigger_threshold_source: 'Threshold source', region_vertices_or_bounds: 'Region bounds', operating_regime_id: 'Operating regime',
  command_total_variation: 'Command total variation', measured_travel_variation: 'Measured travel variation',
  sigma_u_norm: 'σ(u) normalised', sigma_pv_norm: 'σ(PV) normalised', baseline_activity: 'Baseline activity', activity_basis: 'Activity basis',
  ordinate_kind: 'Ordinate', spectral_window: 'Spectral window', fft_size: 'FFT size', resolution_hz: 'Frequency resolution',
  noise_reference: 'Noise reference', peak_indices: 'Peak bins', harmonic_indices: 'Harmonic bins', detrend: 'Detrend',
  segment_samples: 'Segment length', overlap_fraction: 'Overlap', segments: 'Segments', limit_reason: 'Limit source',
  supply_pressure: 'Supply pressure', actuator_pressure: 'Actuator pressure', noise_band: 'Noise band', quantization: 'Quantisation',
  absence_semantics: 'Absence semantics', method_id: 'Method', capability_state: 'Capability', capability_reason: 'Capability reason',
  bicoherence: 'Bicoherence', qualification_steps: 'Qualification steps', cycle_id: 'Cycle', accepted: 'Accepted', reject_reason: 'Reject reason',
  sse_sine: 'SSE sine', sse_triangle: 'SSE triangle', cycle_score: 'Cycle score', amplitudes: 'Amplitude', phases: 'Phase',
  area: 'Area', bbox_area: 'Bounding-box area', peer_ids: 'Peers', peer_states: 'Peer states', lag_s: 'Lag', coherence: 'Coherence',
  frequency_hz: 'Frequency', relationship_revision: 'Relationship revision', alternative_explanations: 'Alternative explanations',
  claim_type: 'Claim', state: 'State', reason: 'Reason', scope: 'Scope', confirmed_at: 'Confirmed at', non_following_dwell_s: 'Non-following dwell',
  positive_evidence_ids: 'Positive evidence', contradictions: 'Contradictions', source_validity: 'Source validity', observations: 'Observations',
  hypotheses: 'Hypotheses', leading_hypothesis: 'Leading hypothesis', evidence_groups: 'Evidence groups', score_semantics: 'Score semantics',
  selection_rule: 'Selection rule', qualified_support: 'Qualified support', condition_state: 'Condition', availability: 'Availability',
  case_state: 'Case state', selector_id: 'Selector', selected: 'Selected', tracking: 'Tracking', window_start_ms: 'Window start',
  grid_seconds: 'Acquisition grid', sample_period_sec: 'Sample period', freeze_events: 'Freeze events', dwell_events: 'Dwell events',
};

const bareKey = (key: string) => key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;

export function labelForKey(key: string): string {
  const k = bareKey(key);
  const known = PROVENANCE_LABELS[k];
  if (known) return known;
  const words = k.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A unit inferred from the key suffix, for artifacts that declare none. */
export function unitForKey(key: string): string | undefined {
  const k = bareKey(key);
  if (/_s$/i.test(k) || SECONDS.test(k)) return 's';
  if (/_hz$/i.test(k)) return 'Hz';
  if (/_pp$/i.test(k)) return 'pp';
  if (/_norm$/i.test(k) || FRACTION.test(k)) return '1';
  return undefined;
}

/** The first `n` characters of an id for display ('—' for none); the full id belongs in a title / copy action. */
/** CHG-098 (SME review 2 #23): a number for reading — `digits` significant figures (3 by default), thousands grouped. */
export const readable = (v: number, digits = 3): string =>
  !Number.isFinite(v) ? '—' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-GB') : String(Number(v.toPrecision(digits)));

export const shortId = (id: string | null | undefined, n = 8): string => (id && id.length > 0 ? id.slice(0, n) : '—');
