/**
 * SME review #19 (CHG-055): keep what was OBSERVED apart from what might have CAUSED it. "Oscillation
 * confirmed" confirms the symptom; the leading hypothesis ("controller tuning") is the engine's highest-
 * scoring explanation — qualified, not confirmed (G14 confirms valve claims only). This splits the fusion
 * verdict into observed symptoms, possible causes (with what would confirm each), causes ruled out (why)
 * and causes not assessed (why), in the engine's own terms.
 */
import { HYPOTHESIS_LABEL, OBSERVATION_LABEL, type CpmVerdictV2 } from '../../api/cpm/verdict';
import { codeLabel, lowerFirst, methodLabel } from './vocabulary';
import { optionalInputLimitation, type InputContext } from './optionalInputs';
import { gateMeaning } from './gateStatus';
import { evidenceScoreText } from './evidenceScore';

export interface CauseItem { id: string; label: string; detail: string }
export interface CauseBreakdown {
  observed: CauseItem[];
  possible: Array<CauseItem & { leading: boolean; confirmed: boolean }>;
  ruledOut: CauseItem[];
  notAssessed: CauseItem[];
}

/** What would turn a possible cause into a confirmed one. */
const HOW_TO_CONFIRM: Record<string, string> = {
  OSCILLATION_TUNING: 'a tuning review or an approved step test would confirm it',
  STICTION: 'valve-position (VP) tracking would confirm it (G14)',
  EXTERNAL_DISTURBANCE: 'peer links to the upstream / interacting loops would let it be assessed',
  EXCESSIVE_EFFORT: 'a review of the controller gain would confirm it',
  ACTUATOR_LIMIT: 'checking the valve sizing and the output limits would confirm it',
  SENSOR: 'a transmitter health source (NE107) would confirm it',
};

/** Why a cause could not be assessed, from the window's own flags. */
const NOT_ASSESSED_BECAUSE: Record<string, string[]> = {
  EXTERNAL_DISTURBANCE: ['NO_UPSTREAM_LINKS', 'NO_PEER_LINKS'],
  STICTION: ['NO_VP', 'NO_VALID_CYCLE'],
  SENSOR: ['HEALTH_NOT_CONFIGURED'],
};

const hypothesisLabel = (id: string) => HYPOTHESIS_LABEL[id] ?? codeLabel(id);

function gatesOf(basis: string | undefined, methodId: string | undefined): string {
  const fromBasis = (basis ?? '').match(/G\d+r?/g);
  if (fromBasis?.length) return [...new Set(fromBasis)].join(', ');
  return (methodId ?? '').split('|').map(m => methodLabel(m)).filter(m => m !== '—').join(', ');
}

/** CHG-064: the gates that SAW something on this window; null = cells unknown (keep the engine's list). */
function firedGates(cells: ReadonlyArray<{ key: string; status: string | null }> | undefined): Set<string> | null {
  if (!cells) return null;
  return new Set(cells.filter(c => FIRED.has(gateMeaning(c.status, c.key))).map(c => c.key.toUpperCase()));
}
const FIRED = new Set(['seen', 'strong', 'attention', 'failed', 'suspected', 'confirmed']);

/**
 * `cells` (the window's gate results) narrows each observation's gate list to the gates that fired: the engine's
 * basis names the gates it CONSULTED, and "Sustained oscillation — G5, G6" beside G5 "Not seen" reads as a contradiction.
 */
export function causeBreakdown(v: CpmVerdictV2 | undefined | null, flags: string[] = [], inputs?: InputContext,
  cells?: ReadonlyArray<{ key: string; status: string | null }>): CauseBreakdown | null {
  if (!v || v.legacy) return null;
  const fired = firedGates(cells);
  const observed = Object.entries(v.observations ?? {})
    .filter(([, o]) => o.present)
    .sort(([, a], [, b]) => (a.role === 'PRIMARY' ? 0 : 1) - (b.role === 'PRIMARY' ? 0 : 1) || b.score - a.score)
    .map(([id, o]) => ({ id, label: OBSERVATION_LABEL[id] ?? codeLabel(id),
      detail: gatesOf(o.basis, o.methodId).split(', ').filter(g => g && (!fired || !/^G\d/.test(g) || fired.has(g.toUpperCase()))).join(', ') }));

  const possible: CauseBreakdown['possible'] = [];
  const ruledOut: CauseItem[] = [];
  const notAssessed: CauseItem[] = [];
  const entries = Object.entries(v.hypotheses ?? {}).sort(([, a], [, b]) => b.score - a.score);
  for (const [id, h] of entries) {
    if (id === 'NONE') continue;
    const state = (h.state ?? '').toUpperCase();
    const blockedBy = (NOT_ASSESSED_BECAUSE[id] ?? []).filter(f => flags.includes(f));
    const caveat = blockedBy.length ? ` — note: ${blockedBy.map(f => lowerFirst(optionalInputLimitation(f, inputs) ?? codeLabel(f))).join('; ')}${blockedBy.some(f => optionalInputLimitation(f, inputs)?.includes('does not apply')) ? '' : ', so it could not be checked fully'}` : '';
    if (state === 'QUALIFIED' && h.score > 0) {
      const confirmed = id === 'STICTION' && v.confirmation?.state === 'CONFIRMED';
      const groups = h.evidenceGroups.map(g => lowerFirst(OBSERVATION_LABEL[g] ?? codeLabel(g))).join(', ');
      possible.push({
        id, label: hypothesisLabel(id), leading: v.leadingHypothesis === id, confirmed,
        detail: `${evidenceScoreText(h.score)}${groups ? ` from ${groups}` : ''} · ${confirmed ? 'confirmed by measured valve position' : `not confirmed — ${HOW_TO_CONFIRM[id] ?? 'no confirming measurement is available'}`}`,
      });
    } else if (state === 'DISQUALIFIED') {
      // the engine's verdict stands; a flag that limited the check is said beside it, not instead of it
      const why = [...h.disqualifiers, ...h.contradictions].map(c => lowerFirst(codeLabel(c)));
      ruledOut.push({ id, label: hypothesisLabel(id), detail: `${why.length ? why.join('; ') : 'its required evidence was not seen'}${caveat}` });
    } else {
      const detail = state === 'QUALIFIED' ? 'no evidence scored' : lowerFirst(codeLabel(state || 'NOT_ASSESSED'));
      notAssessed.push({ id, label: hypothesisLabel(id), detail: `${detail}${caveat}` });
    }
  }
  return { observed, possible, ruledOut, notAssessed };
}
