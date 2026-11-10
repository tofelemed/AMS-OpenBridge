/**
 * CHG-141: the words and figures of the result card. Pure, so each phrase is tested.
 *
 * The title is the served window's own result and nothing else reads into it: an older verdict is named beside it, as
 * older. Persisting is measured at the window end, so an older window does not read today's duration.
 */
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { conditionOf, leadingCauseOf, nextCheckOf } from '../explorer/summary/summaryText';
import { evidenceScore } from '../evidenceScore';
import { contextOfMatrix, metricAvailability } from '../metricAvailability';
import { persistingText } from '../overview/priorityReason';

export interface HeroFact { value: string; label: string }

/** A stored fraction as a whole percent. Missing is a dash, and a ratio above 1 stays what it is. */
const pct = (v: number | null | undefined): string => (v != null && Number.isFinite(v) ? `${Math.round(v * 100)} %` : '—');

type Episode = Pick<CpmEventFrame, 'opened_at'>;

/** `null` is known: none was open. `undefined` is unknown (the episodes are unread), and says nothing. */
function persisting(episode: Episode | null | undefined, windowEnd: string | null): string {
  if (episode === undefined) return '—';
  const end = windowEnd ? Date.parse(windowEnd) : NaN;
  const text = persistingText(episode?.opened_at ?? null, Number.isFinite(end) ? end : Date.now());
  return text === '—' ? 'No open episode' : text.replace(/^persisting /, '');
}

/**
 * A window with a result says how it did. One that was not judged says why, from the values that decide that. A no-fault
 * window is judged, but it has no verdict to score (`hasVerdict`), so it shows how it did from the window's own values.
 */
export function heroFacts(matrix: CpmGateMatrix, episode: Episode | null | undefined): HeroFact[] {
  const { kind } = conditionOf(matrix.diagnosis);
  const metrics = matrix.metrics ?? {};
  const good = metricAvailability(contextOfMatrix(matrix), 'good_error_pct', metrics.good_error_pct);
  const goodError = { value: good.state === 'measured' ? pct(metrics.good_error_pct) : '—', label: 'Good-error time' };
  const normalMode = { value: pct(metrics.auto_pct), label: 'Time in normal mode' };
  const coverage = { value: pct(metrics.completeness), label: 'Data coverage' };
  if (kind === 'finding' || kind === 'healthy') {
    return [
      goodError,
      { value: persisting(episode, matrix.windowEnd), label: 'Persisting' },
      { value: String(evidenceScore(matrix.confidence) ?? '—'), label: 'Evidence score' },
    ];
  }
  if (kind === 'no-fault') return [goodError, normalMode, coverage];
  return [normalMode, { value: pct(metrics.saturation_pct), label: 'Time at an OP limit' }, coverage];
}

/** The episode open at the window's end, whether or not it has closed since. */
export function episodeAt<T extends Pick<CpmEventFrame, 'opened_at' | 'closed_at'>>(frames: readonly T[], windowEnd: string | null | undefined): T | null {
  const end = windowEnd ? Date.parse(windowEnd) : NaN;
  if (!Number.isFinite(end)) return null;
  return frames.find(f => Date.parse(f.opened_at) <= end && (!f.closed_at || end <= Date.parse(f.closed_at))) ?? null;
}

export const heroTitle = (matrix: Pick<CpmGateMatrix, 'diagnosis'>): string => conditionOf(matrix.diagnosis).label;

/**
 * A symptom is not a cause, and a leading mechanism is not a confirmed one until G14 says so (SME #19). On a no-fault window
 * nothing reached the threshold: naming what fell short would contradict the title, so it stays in Hypothesis comparison.
 */
export function causeOf(matrix: Pick<CpmGateMatrix, 'diagnosis' | 'verdictV2'>): { text: string; unconfirmed: boolean } {
  const { kind } = conditionOf(matrix.diagnosis);
  if (kind === 'no-fault') return { text: 'None identified', unconfirmed: false };
  const cause = leadingCauseOf(matrix);
  if (cause) return { text: cause, unconfirmed: matrix.verdictV2?.confirmation?.state !== 'CONFIRMED' };
  return { text: kind === 'finding' ? 'Not established' : 'Not qualified', unconfirmed: false };
}

/** `nextCheckOf`, except that its fallback for a finding is "open the investigation", which is this page. */
export function heroNextCheck(matrix: Pick<CpmGateMatrix, 'diagnosis' | 'narrative'>): string {
  const condition = conditionOf(matrix.diagnosis);
  if (condition.kind === 'finding' && !matrix.narrative?.recommendation?.trim()) return 'Compare PV, SP and OP over this window.';
  return nextCheckOf(matrix, condition);
}
