/**
 * v2.5 workbench: the words of a verdict. One sentence for the card (status, the headline numbers,
 * the reason as a phrase) and the "why this result" paragraphs of the explain panel, ending with the
 * next valid action. Reason tokens become phrases; an unknown token is humanised, never hidden.
 */
import type { Headline } from './views/headlines';
import type { GateState } from './GateResultState';

const REASONS: Record<string, string> = {
  BANDWIDTH: 'limited by the {grid} acquisition grid',
  NO_VP: 'no valve-position signal is mapped',
  NO_UPSTREAM_LINKS: 'no peer links are configured',
  NO_PEER_LINKS: 'no peer links are configured',
  NO_STEP_TEST: 'no approved step test is on record',
  G0_FAIL: 'the window failed data qualification',
  INSUFFICIENT_SAMPLES: 'too few qualified samples in the window',
  INSUFFICIENT_DATA: 'too few qualified samples in the window',
  QUALITY_UNKNOWN: 'the source quality is unknown for the window',
  HEALTH_NOT_CONFIGURED: 'no transmitter health source is configured',
  LEGACY_FLAG_ONLY: 'the result predates v2.5 and carries a flag, not an analysis',
  INTERACTION_NOT_ANALYSED_BY_LONG_TIER: 'the long tier did not analyse peer interaction',
  NO_POSITIVE_EVIDENCE: 'no positive non-following evidence exists',
  VP_TRACKING_HEALTHY: 'the valve position tracks its command',
  NON_FOLLOWING_DWELL: 'a non-following dwell was recorded',
  NOT_A_FINAL_ELEMENT_CLAIM: 'the claim is not about the final element',
  DISABLED_BY_CONFIG: 'the gate is switched off by configuration',
  NO_OBJECTIVE: 'no control objective is declared for the loop',
  NO_SPAN: 'no engineering span is declared for the loop',
  PEER_UNOBSERVED: 'the peer loop has no samples in the window',
  MODE_TRANSFER: 'the controller changed mode during the capture',
  SUPERSEDED_BY_EVENT: 'a later event superseded the capture',
  CAPTURE_MAX: 'the capture reached its maximum length',
  HEALTH_INELIGIBLE: 'the transmitter health made the window ineligible',
};

const humanise = (token: string) => token.toLowerCase().replace(/_/g, ' ');

export function statusWord(status: string | null): string {
  if (!status) return 'no verdict';
  return /^[A-Z_]+$/.test(status) && status.includes('_') ? humanise(status) : status;
}

/** "2.0 samples per 10.0 s period < 8 (observed grid 5.0 s)" / "(declared 5 s)" -> "5 s"; otherwise nothing. */
function gridOf(detail?: string | null): string | null {
  const m = detail?.match(/(?:observed|declared)\s+(?:grid\s+)?([\d.]+)\s*s/i) ?? detail?.match(/\(([\d.]+)\s*s\s*grid\)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? `${Number(n.toFixed(1))} s` : null;
}

export function reasonSentence(reason: string | null, ctx: { gate: string; eligibilityDetail?: string | null }): string | null {
  if (!reason) return null;
  const template = REASONS[reason];
  const grid = gridOf(ctx.eligibilityDetail);
  const phrase = template ? template.replace('{grid} ', grid ? `${grid} ` : '') : humanise(reason);
  return `${phrase} (${reason})`;
}

export interface VerdictInput {
  gate: string; name: string; status: string | null; reason: string | null; headline: Headline[]; eligibilityDetail?: string | null;
}

export function verdictSentence(i: VerdictInput): string {
  const head = `${i.gate} ${i.name}`;
  if (!i.status) return `${head}: no verdict recorded for this run.`;
  const numbers = i.headline.slice(0, 3).map((h, n) => `${n === 0 ? h.label : h.label.charAt(0).toLowerCase() + h.label.slice(1)} ${h.value}${h.unit ? ` ${h.unit}` : ''}`).join(', ');
  const reason = reasonSentence(i.reason, { gate: i.gate, eligibilityDetail: i.eligibilityDetail });
  let s = `${head}: ${i.status}`;
  if (numbers) s += ` — ${numbers}`;
  if (reason) s += `${numbers ? ';' : ' —'} ${reason}`;
  return s + '.';
}

export interface WhyInput {
  gate: string; name: string; status: string | null; reason: string | null; state: GateState;
  eligibilityDetail?: string | null;
}

/** The explain panel's "why this result" - plain sentences, ending with what to do next. */
export function whyParagraphs(i: WhyInput): string[] {
  const out: string[] = [];
  const name = `${i.gate} ${i.name}`;
  if (i.status) {
    const reason = reasonSentence(i.reason, { gate: i.gate, eligibilityDetail: i.eligibilityDetail });
    out.push(`The engine judged ${name} ${i.status}${reason ? ` because ${reason}` : ''}.`);
  } else {
    out.push(`No verdict cell of ${name} exists for this run's tier.`);
  }
  // the definition and preconditions are stated once, in "What this gate asks" - not repeated here
  switch (i.state.kind) {
    case 'READY': out.push('Read the evidence below; every value is this run\'s own, computed under the configuration named on the right.'); break;
    case 'NOT_EVALUATED': out.push('Meet the prerequisite the reason names and the next window will evaluate the gate; this is a verdict, not missing data.'); break;
    case 'SHORT_TIER': out.push('Open the short windows of the same period to read this gate\'s own runs.'); break;
    case 'NOT_RETAINED': out.push('Reconstruct the evidence to rebuild the arrays under the same identity.'); break;
    case 'EVIDENCE_EXPIRED': out.push('Reconstruct the evidence; the verdict and its scalars are unaffected.'); break;
    case 'EVIDENCE_PENDING': out.push('The artifacts are still arriving; the view refreshes as they land.'); break;
    case 'UNSUPPORTED_METHOD': out.push('This build carries no method for the gate; a later deployment adds it.'); break;
    case 'DISABLED': out.push('Enable the gate in the governed configuration to evaluate it.'); break;
    case 'SHADOW': out.push('This run belongs to a bounded evaluation; compare it with the live run of the same window.'); break;
    default: out.push(`${i.state.title}. ${i.state.stillValid}`.trim());
  }
  return out;
}
