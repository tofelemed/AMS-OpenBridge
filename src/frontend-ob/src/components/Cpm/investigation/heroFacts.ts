/**
 * CHG-141: the words and figures of the result card. Pure, so each phrase is tested.
 *
 * The title is the served window's own result and nothing else reads into it: an older verdict is named beside it, as
 * older. It uses `diagnosisLabel`, the words of the window list on the same page; `conditionOf` only sorts the window
 * into a kind, because its labels call a judged window "not evaluated" and every exclusion "not in automatic".
 * Persisting is measured at the window end, so an older window does not read today's duration.
 */
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { conditionOf, leadingCauseOf, nextCheckOf } from '../explorer/summary/summaryText';
import { isRerun } from '../evidence/useWindowAt';
import { evidenceScore } from '../evidenceScore';
import { contextOfMatrix, metricAvailability } from '../metricAvailability';
import { persistingText } from '../overview/priorityReason';
import { diagnosisLabel } from '../vocabulary';
import { windowLabel } from '../windowLabel';

export interface HeroFact { value: string; label: string }

/** A stored fraction as a whole percent. Missing is a dash, and a ratio above 1 stays what it is. */
const pct = (v: number | null | undefined): string => (v != null && Number.isFinite(v) ? `${Math.round(v * 100)} %` : '—');

function persisting(episode: Pick<CpmEventFrame, 'opened_at'> | null | undefined, windowEnd: string | null): string {
  const end = windowEnd ? Date.parse(windowEnd) : NaN;
  const text = persistingText(episode?.opened_at ?? null, Number.isFinite(end) ? end : Date.now());
  return text === '—' ? 'No open episode' : text.replace(/^persisting /, '');
}

/** A judged window says how it did; one that was not judged says why, from the values that decide that. */
export function heroFacts(matrix: CpmGateMatrix, episode: Pick<CpmEventFrame, 'opened_at'> | null | undefined): HeroFact[] {
  const { kind } = conditionOf(matrix.diagnosis);
  const metrics = matrix.metrics ?? {};
  if (kind === 'finding' || kind === 'healthy') {
    const good = metricAvailability(contextOfMatrix(matrix), 'good_error_pct', metrics.good_error_pct);
    return [
      { value: good.state === 'measured' ? pct(metrics.good_error_pct) : '—', label: 'Good-error time' },
      { value: persisting(episode, matrix.windowEnd), label: 'Persisting' },
      { value: String(evidenceScore(matrix.confidence) ?? '—'), label: 'Evidence score' },
    ];
  }
  return [
    { value: pct(metrics.auto_pct), label: 'Time in normal mode' },
    { value: pct(metrics.saturation_pct), label: 'Time at an OP limit' },
    { value: pct(metrics.completeness), label: 'Data coverage' },
  ];
}

/** The episode open at the window's end, whether or not it has closed since. */
export function episodeAt<T extends Pick<CpmEventFrame, 'opened_at' | 'closed_at'>>(frames: readonly T[], windowEnd: string | null | undefined): T | null {
  const end = windowEnd ? Date.parse(windowEnd) : NaN;
  if (!Number.isFinite(end)) return null;
  return frames.find(f => Date.parse(f.opened_at) <= end && (!f.closed_at || end <= Date.parse(f.closed_at))) ?? null;
}

export const heroTitle = (matrix: Pick<CpmGateMatrix, 'diagnosis'>): string => diagnosisLabel(matrix.diagnosis);

/** A symptom is not a cause, and a leading mechanism is not a confirmed one until G14 says so (SME #19). */
export function causeOf(matrix: Pick<CpmGateMatrix, 'diagnosis' | 'verdictV2'>): { text: string; unconfirmed: boolean } {
  const cause = leadingCauseOf(matrix);
  if (cause) return { text: cause, unconfirmed: matrix.verdictV2?.confirmation?.state !== 'CONFIRMED' };
  return { text: conditionOf(matrix.diagnosis).kind === 'finding' ? 'Not established' : 'Not qualified', unconfirmed: false };
}

/** `nextCheckOf`, except that its fallback for a finding is "open the investigation", which is this page. */
export function heroNextCheck(matrix: Pick<CpmGateMatrix, 'diagnosis' | 'narrative'>): string {
  const condition = conditionOf(matrix.diagnosis);
  if (condition.kind === 'finding' && !matrix.narrative?.recommendation?.trim()) return 'Compare PV, SP and OP over this window.';
  return nextCheckOf(matrix, condition);
}

/** "Latest evaluated window · 12 h · ends 5 Nov 10:15 UTC". */
export function windowHeading(matrix: CpmGateMatrix, opts: { latest: boolean; windowKind: string; timeZone?: string }): string {
  const name = windowLabel({ windowKind: opts.windowKind, windowEnd: matrix.windowEnd }, opts.timeZone);
  return `${opts.latest ? 'Latest evaluated window' : 'Earlier window'} · ${name}${isRerun(matrix) ? ' · re-run (no original stored)' : ''}`;
}
