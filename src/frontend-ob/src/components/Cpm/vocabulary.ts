/**
 * SME review #14 (CHG-051): ONE vocabulary for every engine code the Loop Performance pages show.
 *
 * Before this, ~55 places turned codes into text on their own (`code.replace(/_/g, ' ')` → shouting
 * "SUSPECTED FINAL ELEMENT NONLINEARITY") and ten small label maps each covered a corner, so the same
 * code read differently from page to page. Every page now asks here. Labels are engineering language in
 * sentence case; health words follow NAMUR NE107. An unknown code is never hidden: it is humanised
 * ("SOME_NEW_CODE" → "Some new code") and the raw code stays available on hover (<CodeLabel>) and in the
 * Advanced sections.
 */
import { HYPOTHESIS_LABEL, OBSERVATION_LABEL } from '../../api/cpm/verdict';

/** Abbreviations that stay upper case when a code is humanised. */
const ACRONYMS = new Set(['op', 'pv', 'sp', 'vp', 'acf', 'fft', 'pid', 'vfd', 'eu', 'sse', 'dcs', 'opc', 'id', 'ne107', 'cpa', 'pem']);

/** "SOME_NEW_CODE" → "Some new code"; gate ids (G5, G2r) and acronyms (OP, PV, ACF) keep their case. */
export function humanise(code: string | null | undefined): string {
  const words = (code ?? '').trim().replace(/[_\s]+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return '';
  const out = words.map((w, i) => {
    const lw = w.toLowerCase();
    if (/^g\d+r?$/i.test(w)) return w.toUpperCase().replace(/R$/, 'r');
    if (ACRONYMS.has(lw)) return lw.toUpperCase();
    if (/^v\d+$/i.test(w)) return lw;
    return i === 0 ? lw.charAt(0).toUpperCase() + lw.slice(1) : lw;
  });
  return out.join(' ');
}

const STATUS: Record<string, string> = {
  PASS: 'Pass', WARN: 'Warning', FAIL: 'Fail', STRONG: 'Strong evidence', CONFIRMED: 'Confirmed',
  SUSPECTED: 'Suspected', DETECTED: 'Detected', CLASSIFIED: 'Classified', PENDING: 'Pending',
  NOT_EVALUATED: 'Not evaluated', NOT_APPLICABLE: 'Not applicable', INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
  INSUFFICIENT_DATA: 'Not enough data', NOT_CONFIRMED: 'Not confirmed', CONTRADICTED: 'Contradicted',
  QUALIFIED: 'Qualified', DISQUALIFIED: 'Ruled out', LEADING: 'Leading', PRESENT: 'Present', ABSENT: 'Absent',
  PRIMARY: 'Main evidence', SUPPORTING: 'Supporting', OBSERVED: 'Observed', UNAVAILABLE: 'Unavailable',
  READY: 'Ready', LOADING: 'Loading', NOT_RETAINED: 'Not retained', RECONSTRUCTING: 'Reconstructing', FAILED: 'Failed',
  COMPLETE: 'Complete', PARTIAL: 'Partial', EVALUATED: 'Evaluated', VALID: 'Valid', NONE: 'None', UNKNOWN: 'Unknown',
  ELIGIBLE: 'Eligible', INELIGIBLE: 'Not eligible', LIMITED: 'Limited', HEALTHY: 'Healthy', NORMAL: 'Normal',
  OPEN: 'Open', CLOSED: 'Closed', ACKNOWLEDGED: 'Acknowledged', UNACKNOWLEDGED: 'Unacknowledged', SHELVED: 'Shelved',
  INSTALLED: 'Installed', ACTIVE: 'Active', ACTIVE_VERIFIED: 'Active (verified)', CANDIDATE_MODEL: 'Candidate model',
  CANDIDATE: 'Candidate', VALIDATED: 'Validated', BASELINE: 'Baseline', SUPERSEDED: 'Superseded', ROLLED_BACK: 'Rolled back',
  DRAFT: 'Draft', APPROVED: 'Approved', REJECTED: 'Rejected', DEPLOYING: 'Deploying', SHADOW: 'Shadow', WAITING: 'Waiting',
  NO_ACTIVE_BUNDLE: 'No active bundle', CENSORED: 'Censored', ACCEPTED: 'Accepted', REVIEWED: 'Reviewed',
};

/** Reasons, flags and disqualifier codes: what the engine could not do, or why it ruled something out. */
const REASON: Record<string, string> = {
  NO_VP: 'No valve position mapped', NO_VALID_CYCLE: 'No clean oscillation cycle', NO_PV_SPAN: 'No PV span declared',
  HEALTH_NOT_CONFIGURED: 'Instrument health not configured', HEALTH_LIMITED: 'Instrument health limited',
  HEALTH_INELIGIBLE: 'Instrument health made the window ineligible',
  NO_UPSTREAM_LINKS: 'No peer links configured', NO_PEER_LINKS: 'No peer links configured', NO_STEP_TEST: 'No approved step test',
  INSUFFICIENT_SAMPLES: 'Too few samples', QUALITY_UNKNOWN: 'Source quality unknown', BANDWIDTH: 'Limited by the sampling rate',
  AREA_OUT_OF_BAND: 'Phase area outside the expected range', PERIOD_OUT_OF_BAND: 'Period outside the expected range',
  BUNDLE_MISMATCH_FUSION: 'Configuration changed between analysis steps', CORNER_NOISE_FLOOR: 'Waveform corners lost in noise',
  NO_SHAPE_EVIDENCE: 'No stiction-shaped cycles', FAMILY_DISQUALIFIED: 'Its own checks failed',
  LEGACY_FLAG_ONLY: 'Older result: a flag, not an analysis', NOT_A_FINAL_ELEMENT_CLAIM: 'Not a valve claim, nothing to confirm',
  NO_POSITIVE_EVIDENCE: 'No positive evidence', VP_TRACKING_HEALTHY: 'Valve position tracks its command',
  NON_FOLLOWING_DWELL: 'Valve did not follow its command', DISABLED_BY_CONFIG: 'Switched off in configuration',
  NO_OBJECTIVE: 'No control objective declared', NO_SPAN: 'No engineering span declared', PEER_UNOBSERVED: 'Peer loop has no samples',
  MODE_TRANSFER: 'Controller changed mode', SUPERSEDED_BY_EVENT: 'Superseded by a later event', CAPTURE_MAX: 'Capture reached its maximum length',
  INTERACTION_NOT_ANALYSED_BY_LONG_TIER: 'Peer interaction not analysed', G0_FAIL: 'Window failed data qualification',
  INSUFFICIENT_SAMPLES_FOR_METHOD: 'Too few samples for this method', EXCLUDED_MODE: 'Excluded: loop not in automatic',
  NO_CALL: 'Not evaluated', NONE_OPEN: 'No open condition', FREEZE_OPEN: 'Freeze condition open',
  HAS_PEER_LINKS: 'Peer links configured', HAS_STEP_TEST: 'Step test on record', HAS_VP: 'Valve position mapped',
  NOT_INSTALLED: 'Not installed', NOT_MAPPED: 'Not mapped', NOT_CONFIGURED: 'Not configured', UNSUPPORTED_METHOD: 'Unsupported method',
  EVIDENCE_SCORE_UNCALIBRATED: 'Evidence score (uncalibrated, not a probability)', ARGMAX: 'Highest evidence score leads',
  ARGMAX_RANKED: 'Highest evidence score leads', DECLARED_RANGE: 'Declared range', COMMISSIONED_SPAN_FRACTION: 'Fraction of commissioned span',
  LEGACY_DEFAULT: 'Default (older configuration)', FALLBACK_0_100: 'Default 0–100 %', MODEL_DOMAIN_ESTIMATE_NOT_A_SAFETY_GUARANTEE:
    'Model-domain estimate, not a safety guarantee',
};

/** Loop dynamics, gate profiles and the command path of the final element. */
const PROCESS: Record<string, string> = {
  FAST_SELF_REG: 'Fast self-regulating', SLOW_SELF_REG: 'Slow self-regulating', NEAR_INTEGRATING: 'Near-integrating',
  INTEGRATING: 'Integrating', GAS_INTEGRATING: 'Gas, integrating', LEVEL_INTEGRATING: 'Level, integrating',
  FLOW_FAST_SELF_REG: 'Flow, fast self-regulating', PRESSURE_LIQUID_FAST: 'Liquid pressure, fast',
  PRESSURE_GAS_INTEGRATING: 'Gas pressure, integrating', PRESSURE_VAPOUR_SLOW: 'Vapour pressure, slow',
  TEMP_SLOW_SELF_REG: 'Temperature, slow self-regulating',
  OP_TO_VALVE: 'Output drives a valve', OP_TO_VFD: 'Output drives a variable-speed drive', OP_TO_PV: 'Output acts on PV directly',
  VP_TO_PV: 'Valve position acts on PV', RESET_TO_INHERITED: 'Reset to the inherited value',
};

/** Method ids (with or without their gate prefix, "G5.ACF_OSCILLATION") → the method's name. */
const METHOD: Record<string, string> = {
  DATA_QUALIFICATION: 'Data qualification', DATA_QUALITY: 'Data qualification', MODE_AUTHORITY: 'Mode authority',
  SP_STABILITY_BAND: 'Setpoint stability band', OPERATING_REGION: 'Operating region', OBJECTIVE_ERROR: 'Control error vs objective',
  ACTUATOR_ACTIVITY: 'Actuator activity', ACTUATOR_EFFORT: 'Actuator effort', ACF_OSCILLATION: 'Autocorrelation (oscillation)',
  FFT_SPECTRAL: 'Spectrum (FFT)', SINE_TRIANGLE_SHAPE: 'Sine vs triangle shape', XCORR_ASYMMETRY_V1: 'Cross-correlation asymmetry',
  PHASE_GEOMETRY: 'Phase-portrait geometry', LIMIT_DWELL: 'Time at a limit', SATURATION: 'Saturation',
  VP_NONFOLLOWING_DWELL: 'Valve non-following', FREEZE_EPISODES: 'PV freeze episodes', SENSOR_FREEZE: 'Sensor freeze',
  STEP_TEST_FLAG: 'Step test on record', SYSTEM_RESPONSE: 'System response model', ALIGNED_PEER_ANALYSIS_V1: 'Aligned peer analysis',
  PEER_LINK_FLAG: 'Peer links declared', VP_NONFOLLOWING_CONFIRMATION: 'Valve non-following confirmation',
  EVIDENCE_FUSION: 'Evidence fusion', FUSION: 'Evidence fusion',
};

/** Mechanism families as the engine names them in disqualifiers ("stiction:NO_SHAPE_EVIDENCE"). */
const FAMILY: Record<string, string> = {
  stiction: 'Stiction', oscillation: 'Oscillation', geometry: 'Phase geometry', effort: 'Actuator effort',
  sensor: 'Sensor', freeze: 'PV freeze', limit: 'Actuator limit', interaction: 'Peer interaction', disturbance: 'External disturbance',
};

const DICTIONARIES = [STATUS, REASON, PROCESS, HYPOTHESIS_LABEL, OBSERVATION_LABEL];

/** The engineering label of any engine code; unknown codes are humanised, never hidden. */
export function codeLabel(code: string | null | undefined): string {
  const c = (code ?? '').trim();
  if (!c) return '—';
  for (const d of DICTIONARIES) if (d[c]) return d[c];
  if (FAMILY[c]) return FAMILY[c];
  if (/^(HIGH|MEDIUM|LOW|CRITICAL)$/.test(c)) return humanise(c);
  if (METHOD[bareMethod(c)]) return METHOD[bareMethod(c)];
  if (c.includes(':')) return disqualifierLabel(c);
  return /[A-Z_]/.test(c) && !/\s/.test(c) ? humanise(c) : c;
}

const bareMethod = (id: string) => id.replace(/^G\d+r?\./, '');

/** "G5.ACF_OSCILLATION" / "ACF_OSCILLATION" → "Autocorrelation (oscillation)"; an unknown id is humanised. */
export function methodLabel(id: string | null | undefined): string {
  const bare = bareMethod((id ?? '').trim());
  return bare ? METHOD[bare] ?? humanise(bare) : '—';
}

/** "stiction:NO_SHAPE_EVIDENCE" → "Stiction ruled out: no stiction-shaped cycles". */
export function disqualifierLabel(code: string): string {
  const i = code.indexOf(':');
  if (i < 0) return codeLabel(code);
  const family = FAMILY[code.slice(0, i).toLowerCase()] ?? humanise(code.slice(0, i));
  const why = codeLabel(code.slice(i + 1));
  return `${family} ruled out: ${lowerFirst(why)}`;
}

/** `CONFIRMED_OSCILLATION` → "Oscillation confirmed"; the not-judged states say why. */
export function diagnosisLabel(diagnosis: string | null | undefined): string {
  const d = (diagnosis ?? '').trim().toUpperCase();
  if (!d || d === 'NOT_EVALUATED' || d === 'NO_CALL') return 'Not evaluated yet';
  if (d.startsWith('INSUFFICIENT')) return 'Not evaluated: not enough data';
  if (d.startsWith('EXCLUDED')) return 'Excluded: loop not in automatic';
  if (d === 'NORMAL' || d === 'NONE' || d === 'HEALTHY') return 'No problem found';
  const m = d.match(/^(CONFIRMED|SUSPECTED|DETECTED|CLASSIFIED)_(.+)$/);
  if (m) {
    const what = humanise(m[2]).replace(/^Final element nonlinearity$/, 'Valve nonlinearity (stiction)');
    return `${what} ${m[1].toLowerCase()}`;
  }
  return codeLabel(d);
}

/** "Sustained oscillation" → "sustained oscillation" for use mid-sentence; "PV freeze" keeps its acronym. */
export const lowerFirst = (l: string): string => (/^[A-Z][a-z]/.test(l) ? l.charAt(0).toLowerCase() + l.slice(1) : l);

/** A code as words inside a sentence ("UPSTREAM_LEADS" → "upstream leads"). */
export const phrase = (code: string | null | undefined): string => {
  const l = codeLabel(code);
  return l === '—' ? l : lowerFirst(l);
};

/** A location slug ("u6002_pellet_homogenization_ii_silo_4_5") → "U6002 pellet homogenization II silo 4/5";
 *  a short site code ("hdpe") is an abbreviation → "HDPE". */
export function locationLabel(slug: string | null | undefined, opts: { site?: boolean } = {}): string {
  const s = (slug ?? '').trim();
  if (!s) return '';
  if (!/^[a-z0-9_]+$/.test(s)) return s;
  if (opts.site && /^[a-z]{2,5}$/.test(s)) return s.toUpperCase();
  const words = s.split('_').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // trailing digit pairs ("silo_4_5") read as "4/5"
    if (/^\d+$/.test(w) && /^\d+$/.test(words[i + 1] ?? '') && i + 2 === words.length) { out.push(`${w}/${words[i + 1]}`); break; }
    if (/^(i|ii|iii|iv|v|vi)$/.test(w)) out.push(w.toUpperCase());
    else if (/^[a-z]\d+$/.test(w)) out.push(w.toUpperCase());
    else out.push(i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w);
  }
  return out.join(' ');
}

/** The loop's plant location as readable text: "HDPE › Section 600 › U6002 pellet homogenization II silo 4/5". */
export const locationPath = (loop: { site?: string | null; area?: string | null; unit?: string | null }): string =>
  [locationLabel(loop.site, { site: true }), locationLabel(loop.area), locationLabel(loop.unit)].filter(Boolean).join(' › ');
