/**
 * The Performance page's pure rules: how served rows are ordered, grouped and worded. Nothing here
 * computes a verdict or a gate result. Gate marks come from `gateMark`, which is the one vocabulary.
 */
import type { CpmHeatmapLoop, CpmRankedLoop, CpmRankingOrder } from '../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { evidenceScoreText } from '../../../components/Cpm/evidenceScore';
import { confirmationProse } from '../../../components/Cpm/investigation/confirmationCopy';
import { gateFailureCounts, gateMark, reviewSeverity, type GateFailureCount, type GateMeaning } from '../../../components/Cpm/gateStatus';
import { hasVerdict } from '../../../components/Cpm/metricAvailability';
import { vpAbsent, type InputContext } from '../../../components/Cpm/optionalInputs';
import { bandOf, diagnosisLabel, exclusionLabel, lowerFirst, phrase } from '../../../components/Cpm/vocabulary';
import { gateBadgeTone } from '../../../ui/GateBadge';
import { diagnosisTone, type BadgeTone } from '../../../ui/statusTones';

export const PAGE_SIZE = 25;
/** The server clamps a ranking at 200 loops (cplm-api CpmFleetController.GetRankings). */
export const RANK_LIMIT = 200;
/** A window older than this is called out rather than shown as current. */
export const STALE_AFTER_MS = 3 * 3_600_000;

export type SortKey = Extract<CpmRankingOrder, 'confidence' | 'error'>;

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'confidence', label: 'By evidence score' },
  { value: 'error', label: 'By control error' },
];

export const sortKeyOf = (v: string | null): SortKey => (v === 'error' ? 'error' : 'confidence');

export const sameLoop = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export { exclusionLabel };

export interface VerdictBadge {
  tone: BadgeTone;
  glyph?: string;
  label: string;
}

/** The verdict column. Diagnosis tones per CD8. An exclusion carries its gate mark. */
export function verdictBadge(diagnosis: string | null | undefined): VerdictBadge {
  const band = bandOf(diagnosis);
  if (band === 'EXCLUDED') {
    const mark = gateMark(diagnosis);
    return { tone: gateBadgeTone(mark.meaning, mark.tone), glyph: mark.glyph, label: exclusionLabel(diagnosis) };
  }
  return { tone: diagnosisTone(band === 'NO_FAULT' ? 'NO_FAULT' : diagnosis).tone, label: diagnosisLabel(diagnosis) };
}

/**
 * Puts rows in the server's ranking order. A ranking stops at RANK_LIMIT and leaves out loops with
 * no rank, so those follow in the order served. Re-sorting here would rank a subset (CHG-023).
 */
export function orderRows<T extends { loopId: string }>(rows: T[], ranked: ReadonlyArray<{ loopId: string }> | undefined): T[] {
  if (!ranked?.length) return rows;
  const at = new Map(ranked.map((l, i) => [l.loopId.toLowerCase(), i]));
  const rank = (row: T) => at.get(row.loopId.toLowerCase()) ?? ranked.length;
  return [...rows].sort((a, b) => rank(a) - rank(b));
}

/** The value a row was ranked on. Null when the ranking has none: a dash, never 0. */
export function rankValue(loop: CpmRankedLoop | undefined, sort: SortKey): string | null {
  if (!loop) return null;
  if (sort === 'error') {
    const share = loop.metrics.goodErrorPct;
    return share != null ? `${(share * 100).toFixed(0)} % in band` : null;
  }
  return hasVerdict(loop.diagnosis) ? evidenceScoreText(loop.confidence) || null : null;
}

export interface RollupPart {
  meaning: GateMeaning;
  glyph: string;
  word: string;
  tone: BadgeTone;
  count: number;
}

export interface RollupColumn extends GateFailureCount {
  /** The held-back loops of this gate by mark, most severe tone first. */
  parts: RollupPart[];
}

const TONE_ORDER: BadgeTone[] = ['danger', 'warning', 'info', 'unknown', 'neutral', 'success'];

/** The served statuses, counted as the old roll-up counted them, then told apart by their marks. */
export function rollupColumns(loops: CpmHeatmapLoop[], gateKeys: string[]): RollupColumn[] {
  return gateFailureCounts(loops, gateKeys).map(column => {
    const parts = new Map<GateMeaning, RollupPart>();
    for (const row of loops) {
      const status = row.gates[column.key];
      if (reviewSeverity(status) == null) continue;
      const mark = gateMark(status, column.key);
      const part = parts.get(mark.meaning);
      if (part) part.count += 1;
      else parts.set(mark.meaning, { meaning: mark.meaning, glyph: mark.glyph, word: mark.word, tone: gateBadgeTone(mark.meaning, mark.tone), count: 1 });
    }
    return { ...column, parts: [...parts.values()].sort((a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone)) };
  });
}

/** The page a loop sits on, for a deep link with no `page`. Null when it is not in the rows. */
export function pageOfLoop(rows: ReadonlyArray<{ loopId: string }>, loopId: string | null): number | null {
  const at = rows.findIndex(r => sameLoop(r.loopId, loopId));
  return at < 0 ? null : Math.floor(at / PAGE_SIZE) + 1;
}

export const fmtAge = (ms: number): string =>
  (ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(1)} h`);

/** The effect of a gate on the verdict, from the served role. Null when the role or result is not known. */
export function effectOnVerdict(gate: string, role: string | null, matrix: CpmGateMatrix | undefined, inputs: InputContext | undefined): string | null {
  if (gate === 'G13') {
    if (!matrix) return null;
    return matrix.hasPeerLinks
      ? `Peer links exist: oscillation without actuator stress disqualifies the stiction family as ${phrase('DISTURBANCE_CONTEXT')}.`
      : 'No peer links: this gate cannot evaluate, and stiction cannot be distinguished from an upstream disturbance.';
  }
  if (gate === 'G14') {
    return matrix ? confirmationProse(matrix.verdictV2?.confirmation, matrix.verdictV2?.legacy ?? true, vpAbsent(inputs)) : null;
  }
  if (!role) return null;
  if (role === 'BLOCKING') return 'A failure here excludes the whole window before any diagnosis is attempted.';
  if (role === 'FUSION') return 'Combines all qualified evidence into the final banded verdict.';
  return `Contributes ${role.toLowerCase()} evidence to family qualification.`;
}

/** `whyRules` words a threshold it could not read as one the profile does not configure. */
const NO_THRESHOLD = 'no threshold configured for this profile';
/** `metricAvailability` gives every exclusion the mode reason. */
const MODE_EXCLUSION = 'loop not in automatic — the window was excluded';

export const THRESHOLDS_RESTRICTED = 'Thresholds not visible to your role';
export const THRESHOLDS_UNAVAILABLE = 'Thresholds could not be read';

export interface DecidingRow {
  label: string;
  value: string;
  against: string;
  ok: boolean | null;
}

/** RD11 D-20 and D-15 on the deciding values: what could not be read is never stated as not configured. */
export function honestRows<R extends DecidingRow>(rows: R[], opts: { canReadConfig: boolean; configFailed: boolean; diagnosis: string | null | undefined }): R[] {
  const missing = !opts.canReadConfig ? THRESHOLDS_RESTRICTED : opts.configFailed ? THRESHOLDS_UNAVAILABLE : null;
  const excluded = (opts.diagnosis ?? '').toUpperCase().startsWith('EXCLUDED') ? exclusionLabel(opts.diagnosis) : null;
  return rows.map(row => ({
    ...row,
    against: missing ? row.against.split(NO_THRESHOLD).join(missing) : row.against,
    value: excluded ? row.value.split(MODE_EXCLUSION).join(lowerFirst(excluded)) : row.value,
  }));
}
