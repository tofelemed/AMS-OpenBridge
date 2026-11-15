/**
 * CHG-165 (owner review): the words of the System Response tabs. An event is named once in the band (time · type · path ·
 * state); an event row names the model it produced from the loop's models already loaded (no request per row). CHG-195: the
 * foot line went. Nothing here derives a number.
 */
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';
import { fmtInstantBare } from '../context/LoopContextBar';
import { codeLabel, humanise as words } from '../vocabulary';
import { plainNumber } from '../evidence/format';
import { eventRowView } from './responseCopy';
import { fmt } from './responseSupport';

/** "OP_TO_PV" → "OP → PV". */
export const pathLabel = (pathId: string | null | undefined): string => {
  const p = (pathId ?? '').trim().toUpperCase();
  return p ? p.split('_TO_').map(s => s.replace(/_/g, ' ')).join(' → ') : '—';
};

/** "INPUT_TEST" → "Input test". */
export const typeLabel = (eventType: string | null | undefined): string => codeLabel(eventType);

/** The band's option: "7 Oct 05:43 · Input test · OP → PV · Candidate". */
export const eventPick = (e: ResponseEventSummary, timeZone?: string): string =>
  `${fmtInstantBare(e.t0Ms, timeZone)} · ${typeLabel(e.eventType)} · ${pathLabel(e.pathId)} · ${codeLabel(eventRowView(e).state)}`;

/** The model an event produced; a reviewed model has later revisions, the newest is the one in force. */
export function modelOfEvent(models: SystemModel[] | undefined, eventId: string): SystemModel | undefined {
  let best: SystemModel | undefined;
  for (const m of models ?? []) if (m.createdFromEvent === eventId && (!best || m.revision > best.revision)) best = m;
  return best;
}

const BRIEF: Array<[string, string, boolean]> = [['process_gain', 'K', false], ['integrating_gain', 'Ki', false], ['dead_time', 'θ', true], ['time_constant', 'τ', true]];

/** "FOPDT · K 0.21 · θ 0.00 s · τ 0.50 s": the family and the parameters an engineer reads first. */
export function modelBrief(m: SystemModel): string {
  const parts = [m.family];
  for (const [id, symbol, timed] of BRIEF) {
    const p = m.parameters?.[id];
    if (p?.value != null) parts.push(`${symbol} ${fmt(p.value)}${timed && p.unit ? ` ${p.unit}` : ''}`);
  }
  return parts.join(' · ');
}

/** CHG-195 (owner review item 19): the plain names of a step's output keys; any other key is humanised below. */
const OUTPUT_LABEL: Record<string, string> = {
  path_id: 'Path', sample_grid_s: 'Sample interval (s)', u_applied_available: 'Applied OP available',
};
const UNIT_SUFFIX: Array<[RegExp, string]> = [[/_ms$/, 'ms'], [/_s$/, 's'], [/_pct$/, '%']];

/** "path_id" → "Path"; another key in sentence case without underscores, a unit suffix in brackets ("fit_ms" → "Fit (ms)"). */
export function outputLabel(key: string): string {
  if (OUTPUT_LABEL[key]) return OUTPUT_LABEL[key];
  for (const [suffix, unit] of UNIT_SUFFIX) if (suffix.test(key)) return `${words(key.replace(suffix, ''))} (${unit})`;
  return words(key);
}

/** A step output in words: a path with its arrow, a code in sentence case, Yes / No; free text and numbers as they are. */
export function outputValue(key: string, v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : plainNumber(v);
  if (typeof v === 'object') return JSON.stringify(v);
  const t = String(v);
  if (key === 'path_id' || /^[A-Z]+(_[A-Z]+)*_TO_[A-Z_]+$/.test(t)) return pathLabel(t);
  return /^[A-Z][A-Z0-9_]*$/.test(t) ? codeLabel(t) : t;
}

/** CHG-197 (owner rule: no technical text): the model families of the engine's model bank in words. */
const FAMILY_LABEL: Record<string, string> = {
  FOPDT: 'First order with dead time', SOPDT: 'Second order with dead time', SO_UNDERDAMPED: 'Second order underdamped',
  IPDT: 'Integrating with dead time', INTEGRATOR_LAG: 'Integrating with lag',
};
export const familyLabel = (family: string | null | undefined): string => FAMILY_LABEL[(family ?? '').toUpperCase()] ?? codeLabel(family);

/** The candidate rows' parameter keys (ProcessModel.toString) in words, with their unit. */
const CANDIDATE_PARAM: Record<string, [string, string]> = {
  gain: ['Gain', ''], theta: ['Dead time', 's'], tau: ['Time constant', 's'], tau2: ['Second time constant', 's'],
  zeta: ['Damping ratio', ''], wn: ['Natural frequency', 'rad/s'],
};
/** "theta", "4.0" → "Dead time 4 s"; another key reads as its parameter name ("process_gain" → "Process gain"). */
export function candidateParamText(key: string, raw: string): string {
  const [label, unit] = CANDIDATE_PARAM[key] ?? [words(key), /(_time|time_constant)/.test(key) ? 's' : ''];
  const n = Number(raw);
  return `${label} ${Number.isFinite(n) ? plainNumber(n) : raw}${unit ? ` ${unit}` : ''}`;
}

/** "ESTIMATION:NOT_ESTIMATED:NO_EXCITATION" → "Estimation · Not estimated · No excitation". */
export const reasonText = (reason: string): string => reason.split(':').map(p => p.trim()).filter(Boolean).map(p => codeLabel(p)).join(' · ');

/** The validation step's output keys in words (subgate E). */
const VALIDATION_LABEL: Record<string, string> = {
  verdict: 'Verdict', free_run_rmse: 'Free-run error (RMSE)', prediction_rmse: 'One-step prediction error (RMSE)', fit_improvement: 'Fit improvement',
  residual_bias: 'Residual bias', whiteness: 'Whiteness', input_residual_correlation: 'Input–residual correlation',
};
export const validationLabel = (key: string): string => VALIDATION_LABEL[key] ?? outputLabel(key);
