/**
 * CHG-141: Why this result. The 17 gates by tier, each tier summarised in one line from `gateMark`, so a card and the
 * gates it opens can never disagree. Only "limit symptom" is this file's own: on G10 a symptom is time at an output
 * limit, which says more than "symptom seen" and does not suggest a valve cause. Also the limits box under the gates.
 */
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { ConclusionBasis } from '../conclusionBasis';
import { conditionOf } from '../explorer/summary/summaryText';
import { evidenceScoreCap } from '../evidenceScore';
import { QUIET, TIER_GROUPS, gateMark, isNoResult, type GateMeaning } from '../gateStatus';
import { codeLabel } from '../vocabulary';

export interface GateGroup { tier: string; summary: string; gates: string[] }

interface Mark { gate: string; word: string; meaning: GateMeaning }

const PASSED: ReadonlySet<GateMeaning> = new Set<GateMeaning>(['ok', 'ok-limited']);

/** "G12 / G13 not evaluated · G14 n/a": gates that read the same are named together. */
function byWord(marks: Mark[]): string {
  const words = [...new Set(marks.map(m => m.word))];
  return words.map(w => `${marks.filter(m => m.word === w).map(m => m.gate).join(' / ')} ${w.toLowerCase()}`).join(' · ');
}

function eligibility(marks: Mark[]): string {
  const held = marks.filter(m => !PASSED.has(m.meaning));
  if (held.length === 1) return `${held[0].gate} · ${held[0].word}`;
  if (held.length > 1) return byWord(held);
  return marks.some(m => m.meaning === 'ok-limited') ? 'All pass on available data' : 'All pass';
}

function diagnostic(marks: Mark[]): string {
  const symptoms = marks.filter(m => !QUIET.has(m.meaning))
    .map(m => (m.gate === 'G10' && (m.meaning === 'seen' || m.meaning === 'strong') ? { ...m, word: m.meaning === 'seen' ? 'limit symptom' : 'strong limit symptom' } : m));
  if (symptoms.length) return byWord(symptoms);
  if (marks.every(m => isNoResult(m.meaning))) return 'Not evaluated';
  return marks.some(m => m.meaning === 'not-seen-limited') ? 'Not seen on available data' : 'Not seen';
}

function summaryOf(tier: string, marks: Mark[], excluded: boolean): string {
  switch (tier) {
    case 'Eligibility': return eligibility(marks);
    case 'Diagnostic evidence': return diagnostic(marks);
    case 'Confirmation': return excluded ? 'Not applicable to this excluded case' : byWord(marks);
    case 'Fusion': return marks.map(m => `${m.gate} · ${m.word}`).join(' · ');
    default: return byWord(marks);
  }
}

/** Always the five tiers and all 17 gates. `flags` are the window's effective input flags: a pass judged without an input says so. */
export function gateGroups(matrix: CpmGateMatrix, flags?: readonly string[] | null): GateGroup[] {
  const excluded = conditionOf(matrix.diagnosis).kind === 'excluded';
  return TIER_GROUPS.map(({ label, keys }) => {
    const marks = keys.map((gate): Mark => {
      const { word, meaning } = gateMark(matrix.gates.find(c => c.key === gate)?.status, gate, flags);
      return { gate, word, meaning };
    });
    return { tier: label, summary: summaryOf(label, marks, excluded), gates: keys };
  });
}

export function tierOf(gate: string | null | undefined): string | null {
  const g = (gate ?? '').toLowerCase();
  return TIER_GROUPS.find(t => t.keys.some(k => k.toLowerCase() === g))?.label ?? null;
}

/** The chosen card, else the card of a gate named in the link, else where this kind of window is explained. */
export function chosenTier(matrix: Pick<CpmGateMatrix, 'diagnosis'>, tier: string | null, gate: string | null): string {
  if (tier && TIER_GROUPS.some(t => t.label === tier)) return tier;
  const { kind } = conditionOf(matrix.diagnosis);
  return tierOf(gate) ?? (kind === 'finding' || kind === 'healthy' ? 'Diagnostic evidence' : 'Eligibility');
}

export interface ConclusionLimits { title: string; lines: string[] }

/**
 * What the conclusion does not cover. A window that was not judged keeps its reason here, in words, because that reason
 * is why there is no result; an engine trace string stays under Technical details. A capped score keeps its cap on
 * screen: the general meaning of the score is behind its ?, the cap is about this window.
 */
export function conclusionLimits(
  matrix: Pick<CpmGateMatrix, 'diagnosis' | 'confidence' | 'narrative'>,
  ctx: { basis: ConclusionBasis | null; limits: string[]; machineReason: string | null },
): ConclusionLimits {
  const { kind } = conditionOf(matrix.diagnosis);
  if (kind === 'finding' || kind === 'healthy') {
    const cap = evidenceScoreCap(matrix.narrative?.statusReason, matrix.confidence);
    return { title: 'What is still unconfirmed', lines: [...(ctx.basis?.notChecked ?? []), ...ctx.limits, ...(cap ? [`Evidence score ${cap}`] : [])] };
  }
  const reason = ctx.machineReason && !ctx.machineReason.includes('=') ? [codeLabel(ctx.machineReason)] : [];
  return { title: 'Limits on this conclusion', lines: [...reason, ...ctx.limits] };
}
