/**
 * SME review #19 (CHG-055): "Why this result" as measured value against the threshold that applied. Each gate
 * names its measured quantities (the run's artifact provenance, else the fused row's metrics) and the governed
 * threshold for each (the engine's own copy in the row when it carries one, else the effective configuration
 * at the run's time). A requirement (enough cycles, enough samples) gets ✓ / ✕; a detection threshold gets
 * a position ("below the attention level") — crossing it is a symptom, not a failure. A threshold the
 * profile does not configure is said so, never invented.
 */
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { contextOfMatrix, hasVerdict, metricAvailability } from '../metricAvailability';
import { fmtDuration } from '../shared';
import { evidenceScore, evidenceScoreCap } from '../evidenceScore';

export interface WhyRow {
  label: string;
  value: string;
  /** What it is compared with ("≥ 5 required", "attention at 3.0 · high at 8.0"). */
  against: string;
  /** Requirements: true / false. Detection thresholds and figures without a threshold: null. */
  ok: boolean | null;
}

export interface WhySources {
  /** Provenance of this gate's artifacts: kind + key → value. */
  prov: (kind: string, key: string) => string | undefined;
  /** The fused row of the run's window (metrics, gates, flags), when loaded. */
  row?: CpmGateMatrix;
  /** The effective configuration property at the run's time. */
  cfg: (property: string) => unknown;
  eligibilityDetail?: string | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const f2 = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, '') || '0');
const NONE = 'no threshold configured for this profile';

/** A value the row may hold as a placeholder: shown as its availability, never as a number (CHG-053). */
function metric(src: WhySources, field: string): { n: number | null; text: string | null } {
  const v = src.row?.metrics?.[field];
  if (!src.row) return { n: null, text: null };
  const a = metricAvailability(contextOfMatrix(src.row), field, v);
  return a.state === 'measured' ? { n: num(v), text: null } : { n: null, text: `${a.short} (${a.reason})` };
}

function requirement(label: string, value: number | null, min: number | null, fmt: (n: number) => string = f2, unit = ''): WhyRow | null {
  if (value == null) return null;
  return min == null
    ? { label, value: `${fmt(value)}${unit}`, against: NONE, ok: null }
    : { label, value: `${fmt(value)}${unit}`, against: `≥ ${fmt(min)}${unit} required`, ok: value >= min };
}

function detection(label: string, value: number | null, warn: number | null, high: number | null, missing: string | null): WhyRow | null {
  if (value == null) return missing ? { label, value: missing, against: '', ok: null } : null;
  if (warn == null && high == null) return { label, value: f2(value), against: NONE, ok: null };
  const parts = [warn != null ? `attention at ${f2(warn)}` : null, high != null ? `high at ${f2(high)}` : null].filter(Boolean).join(' · ');
  const where = high != null && value >= high ? 'above the high level' : warn != null && value >= warn ? 'above the attention level' : 'below the attention level';
  return { label, value: `${f2(value)} — ${where}`, against: parts, ok: null };
}

export function whyRows(gate: string, src: WhySources): WhyRow[] {
  const c = (p: string) => num(src.cfg(p));
  const m = (k: string) => num(src.row?.metrics?.[k]);
  const rows: Array<WhyRow | null> = [];
  switch (gate) {
    case 'G4': {
      // the quantity the engine compared (ShortFeatureCalculator): the activity ratio normalised to the declared PV
      // span when the loop has one, else the observed effort ratio
      const norm = m('activity_ratio_norm');
      const e = norm != null ? { n: norm, text: null } : metric(src, 'effort_ratio');
      rows.push(detection(norm != null ? 'Actuator activity (normalised to the PV span)' : 'Actuator activity (effort ratio)', e.n,
        m('gate4_warn_ratio') ?? c('G4.activity_warn_ratio'), m('gate4_high_ratio') ?? c('G4.activity_high_ratio'), e.text));
      break;
    }
    case 'G5': {
      rows.push(requirement('Accepted cycles', num(src.prov('acf_series', 'accepted_cycles')), c('G5.min_complete_cycles'), n => n.toFixed(0)));
      rows.push(requirement('Regularity', num(src.prov('acf_series', 'regularity')) ?? m('acf_regularity'), c('G5.regularity_min')));
      const period = num(src.prov('acf_series', 'period_s')) ?? m('acf_period_s');
      const lo = c('G5.period_min_s'), hi = c('G5.period_max_s');
      if (period != null && period > 0)
        rows.push({ label: 'Oscillation period', value: fmtDuration(period * 1000), against: lo != null && hi != null ? `${fmtDuration(lo * 1000)} – ${fmtDuration(hi * 1000)} resolvable` : NONE, ok: lo != null && hi != null ? period >= lo && period <= hi : null });
      else rows.push({ label: 'Oscillation period', value: metric(src, 'acf_period_s').text ?? 'not found', against: '', ok: null });
      if (src.eligibilityDetail) {
        const min = c('G5.min_samples_per_period');
        rows.push({ label: 'Sampling', value: src.eligibilityDetail, against: min != null ? `≥ ${min} samples per period required` : NONE, ok: /</.test(src.eligibilityDetail) ? false : null });
      }
      break;
    }
    case 'G6': {
      const p = metric(src, 'fft_peak_to_median');
      rows.push(p.n == null ? (p.text ? { label: 'Spectral peak vs background', value: p.text, against: '', ok: null } : null)
        : requirement('Spectral peak vs background', p.n, c('G6.peak_to_background_min'), f2, '×'));
      break;
    }
    case 'G7': {
      rows.push(requirement('Valid cycles', m('valid_cycles'), c('G7.min_accepted_cycles'), n => n.toFixed(0)));
      const t = metric(src, 'triangularity');
      rows.push(detection('Triangular OP waveform (shape score)', t.n, c('G7.shape_score_warn'), c('G7.shape_score_high'), t.text));
      break;
    }
    case 'G10': {
      const d = m('sat_limit_dwell_s');
      const warn = c('G10.limit_dwell_warn_s');
      if (d != null) rows.push({ label: 'Time at an output limit', value: fmtDuration(d * 1000), against: warn != null ? `attention at ${fmtDuration(warn * 1000)}` : NONE, ok: null });
      const s = m('saturation_pct');
      if (s != null) rows.push({ label: 'Saturated samples', value: `${(s * 100).toFixed(1)} %`, against: '', ok: null });
      break;
    }
    case 'G11': {
      const fr = metric(src, 'freeze_index_s');
      if (fr.n != null || fr.text) rows.push({ label: 'PV freeze', value: fr.text ?? fmtDuration(fr.n! * 1000), against: '', ok: null });
      const nb = src.prov('measurement', 'noise_band');
      if (nb) rows.push({ label: 'Noise band', value: nb, against: '', ok: null });
      break;
    }
    case 'G3': {
      const g = metric(src, 'good_error_pct');
      if (g.n != null || g.text) rows.push({ label: 'Time within the error band', value: g.text ?? `${(g.n! * 100).toFixed(1)} %`, against: src.prov('objective_error', 'tolerance_band') ? `band ${src.prov('objective_error', 'tolerance_band')}` : '', ok: null });
      break;
    }
    case 'G15': {
      // SME #20 (CHG-056): the fused score by its real name, with the engine cap that stopped it, if any
      const score = evidenceScore(src.row?.confidence);
      if (score != null && hasVerdict(src.row?.diagnosis))
        rows.push({ label: 'Evidence score (selected family)', value: `${score} of 100`, against: evidenceScoreCap(src.row?.narrative?.statusReason, src.row?.confidence) ?? 'uncalibrated — it ranks evidence; it is not a probability', ok: null });
      const agree = m('persistence_agree_count'), need = m('persistence_windows_required');
      if (agree != null && need != null)
        rows.push({ label: 'Agreeing windows (persistence)', value: agree.toFixed(0), against: `≥ ${need.toFixed(0)} required to persist`, ok: agree >= need });
      break;
    }
  }
  return rows.filter((r): r is WhyRow => r != null);
}
