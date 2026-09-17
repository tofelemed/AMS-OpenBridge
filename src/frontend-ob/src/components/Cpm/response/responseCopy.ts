/**
 * 2026-09-17 audit F19/F20: the System Response page in words. One state per event row with a
 * one-line finding, the result card (model family from the kernel's method, parameters with ± and
 * units, validation verdict, one sentence on identifiability), the key results apart from the 52-row
 * catalogue, the subgates A–H as steps. Everything here re-shapes what the kernel reported.
 */
import type { ResponseEventDetail, ResponseEventSummary, ResponseQuantity, ResponseSubgate } from '../../../api/cpm/response';
import type { CpmTone } from '../shared';
import { metricOf, quantityText, stateTone } from './responseSupport';

export const humanise = (code: string | null | undefined): string => (code ?? '').trim().toLowerCase().replace(/_/g, ' ');
const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export interface EventRowView { censored: boolean; state: string; tone: CpmTone; finding: string }

/** One state per row: the model outcome when there is one, else what stopped the event. */
export function eventRowView(e: ResponseEventSummary): EventRowView {
  if (e.captureState === 'CENSORED') {
    return { censored: true, state: 'CENSORED', tone: 'muted', finding: `Candidate censored · ${humanise(e.censorReason) || 'no reason recorded'}` };
  }
  if (e.eligibility === 'INELIGIBLE') return { censored: false, state: 'INELIGIBLE', tone: 'bad', finding: `Ineligible · ${humanise(e.finding) || 'no reason recorded'}` };
  if (e.captureState === 'REJECTED' || e.evaluationState === 'REJECTED') {
    return { censored: false, state: 'REJECTED', tone: 'bad', finding: `Rejected · ${humanise(e.censorReason || e.finding) || 'no reason recorded'}` };
  }
  const model = (e.modelState || 'NONE').toUpperCase();
  const finding = sentence(humanise(e.finding)) || 'No finding recorded';
  if (model !== 'NONE') return { censored: false, state: model, tone: stateTone(model), finding: `${finding} · model ${humanise(model)}` };
  const state = e.evaluationState || e.captureState;
  return { censored: false, state, tone: stateTone(state), finding };
}

/** The key results in catalogue order; the rest of the 52 live in the collapsed table. */
export const KEY_RESULT_IDS: Array<[string, string]> = [
  ['process_gain', 'Process gain K'], ['integrating_gain', 'Integrating gain'], ['dead_time', 'Dead time θ'], ['time_constant', 'Time constant τ'],
  ['time_constant_2', 'Second time constant τ₂'], ['damping_ratio', 'Damping ratio ζ'], ['natural_frequency', 'Natural frequency ωₙ'],
  ['t63', 't63'], ['rise_time_10_90', 'Rise time 10–90 %'], ['settle_response', 'Settling (response band)'], ['settle_target', 'Settling (target band)'],
  ['overshoot', 'Overshoot'], ['steady_error', 'Steady-state error'], ['iae', 'IAE'], ['ise', 'ISE'], ['itae', 'ITAE'],
];
const MODEL_PARAMETER_IDS = new Set(['process_gain', 'integrating_gain', 'dead_time', 'time_constant', 'time_constant_2', 'damping_ratio', 'natural_frequency']);

export interface KeyResult { id: string; label: string; text: string; applicable: boolean; method: string }

export function keyResults(metrics: ResponseQuantity[] | undefined): KeyResult[] {
  const out: KeyResult[] = [];
  for (const [id, label] of KEY_RESULT_IDS) {
    const q = metricOf(metrics, id);
    if (!q) continue;
    out.push({ id, label, text: quantityText(q), applicable: q.value != null, method: q.method });
  }
  return out;
}

export interface ResultSummary {
  family: string | null;
  modelState: string;
  headline: string;
  parameters: Array<{ label: string; text: string }>;
  validation: { state: string; text: string };
  identifiability: string;
}

const familyOf = (metrics: ResponseQuantity[] | undefined): string | null => {
  for (const q of metrics ?? []) {
    if (!MODEL_PARAMETER_IDS.has(q.quantityId) || q.value == null) continue;
    const m = /^MODEL_(\w+)$/.exec(q.method ?? '');
    if (m) return m[1];
  }
  return null;
};

export function resultSummary(result: ResponseEventDetail['result'], metrics: ResponseQuantity[] | undefined): ResultSummary {
  const family = familyOf(metrics);
  const modelState = (result.model_state || 'NONE').toUpperCase();
  const d = result.subgates?.D;
  const e = result.subgates?.E;
  const parameters = keyResults(metrics).filter(k => MODEL_PARAMETER_IDS.has(k.id) && k.applicable).map(k => ({ label: k.label, text: k.text }));
  const eReason = humanise(e?.outputs?.reason as string | undefined);
  const eVerdict = humanise(e?.outputs?.verdict as string | undefined);
  const validation = { state: e?.state ?? 'NOT_RUN', text: [sentence(humanise(e?.state ?? 'NOT_RUN')), eVerdict || eReason].filter(Boolean).join(' · ') };
  let identifiability: string;
  if (family && d?.state === 'ESTIMATED') {
    const legality = humanise(d.outputs?.legality as string | undefined);
    identifiability = `Estimated by ${String(d.outputs?.method_id ?? 'the kernel')}${legality ? ` (legality ${legality})` : ''}; the candidate table below carries the delay profile, the standard errors and the identifiability flags.`;
  } else {
    const reason = humanise((d?.outputs?.reason as string | undefined) || result.finding);
    identifiability = `No model was estimated${reason ? `: ${reason}` : ''}. The observed quantities, if any, are reported without a fit.`;
  }
  return {
    family, modelState,
    headline: family ? `${family} model · ${humanise(modelState)}` : 'No model estimated',
    parameters, validation, identifiability,
  };
}

export const SUBGATE_NAMES: Array<[string, string]> = [['A', 'Eligibility'], ['B', 'Event capture'], ['C', 'Observed metrics'], ['D', 'Estimation'], ['E', 'Validation'], ['F', 'Controller / frequency'], ['G', 'Model comparison'], ['H', 'Advisory']];

export interface SubgateStep { key: string; name: string; state: string; tone: CpmTone; reason: string; outputs: Array<[string, unknown]> }

export function subgateSteps(subgates: Record<string, ResponseSubgate> | undefined): SubgateStep[] {
  return SUBGATE_NAMES.map(([key, name]) => {
    const sg = subgates?.[key];
    const state = sg?.state ?? 'NOT_RUN';
    const outputs = Object.entries(sg?.outputs ?? {});
    return { key, name, state, tone: stateTone(state), reason: humanise(sg?.outputs?.reason as string | undefined), outputs: outputs.filter(([k]) => k !== 'reason') };
  });
}
