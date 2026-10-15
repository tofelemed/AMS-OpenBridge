/**
 * Gate-status vocabulary shared by the Performance matrix, the fleet gate
 * roll-up, the attention list and the evidence panel.
 *
 * Why it is its own module: the glyph mapping and the tier grouping used to
 * live inside CpmPerformance, so every other surface that wanted to say
 * "this gate failed" either re-derived it or drifted. One vocabulary, one file.
 */
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import type { CpmTone } from './shared';
import { gateLimits } from './inputLimits';

/** Declared tier order. Intersected with the served keys before rendering. */
export const TIER_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Eligibility', keys: ['G0', 'G1', 'G2', 'G2r'] },
  { label: 'Performance', keys: ['G3', 'G4'] },
  { label: 'Diagnostic evidence', keys: ['G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'] },
  { label: 'Confirmation', keys: ['G12', 'G13', 'G14'] },
  { label: 'Fusion', keys: ['G15'] },
];

/** What a gate is: a check on the window, a symptom detector, or the decision. Decided by its tier. */
export type GateRole = 'eligibility' | 'performance' | 'diagnostic' | 'confirmation' | 'decision' | 'unknown';

const ROLE_BY_TIER: Record<string, GateRole> = {
  Eligibility: 'eligibility', Performance: 'performance', 'Diagnostic evidence': 'diagnostic', Confirmation: 'confirmation', Fusion: 'decision',
};

export function gateRole(gate: string | null | undefined): GateRole {
  const g = (gate ?? '').trim().toLowerCase();
  const tier = TIER_GROUPS.find(t => t.keys.some(k => k.toLowerCase() === g));
  return tier ? ROLE_BY_TIER[tier.label] : 'unknown';
}

/** The meaning of one gate result — what the mark on screen must say (SME review #16, CHG-052). */
export type GateMeaning = 'ok' | 'ok-limited' | 'attention' | 'failed' | 'unusable' | 'excluded' | 'not-seen' | 'not-seen-limited'
  | 'seen' | 'strong' | 'detected' | 'classified' | 'suspected' | 'confirmed' | 'ruled-out' | 'none' | 'not-applicable' | 'pending';

/** CHG-098 (SME review 2 #24): the meanings that carry no result — "not evaluated", "not applicable", "pending". */
export const NO_RESULT: ReadonlySet<GateMeaning> = new Set<GateMeaning>(['none', 'not-applicable', 'pending']);
/** True when the status carries no result (not evaluated, not applicable / disabled, pending). */
export const isNoResult = (meaning: GateMeaning): boolean => NO_RESULT.has(meaning);

export interface GateGlyph {
  glyph: string;
  tone: CpmTone;
  /** The short word shown beside the gate ("Strong", "Not seen"). */
  word: string;
  /** Spoken / hover form. The glyph alone gives a screen reader "✓ button" and nothing else. */
  label: string;
  meaning: GateMeaning;
  /** CHG-064: the missing inputs a pass was judged without ("no transmitter health source"); absent on a full pass. */
  limitedBy?: string[];
}

/**
 * THE gate mark. One symbol per MEANING, never per colour: the same red "×" used to stand for a window
 * rejected by data qualification (G0 FAIL), strong symptom evidence (G7 STRONG) and the confirmed condition
 * (G15 CONFIRMED), and a green "✓" on a diagnostic gate meant only "this method did not see the symptom".
 * ISA-101: colour is never the only cue (shape + word carry it) and red is kept for what needs action — a
 * failed performance check or a confirmed condition. Symptoms are amber; "not seen" / "not usable" are grey.
 * Glyphs are the large geometric forms (✕ ◯ ⬤): the small ones (× ○ ●) render at half the height of ✓ ◐ ▲.
 */
const MARK: Record<GateMeaning, Omit<GateGlyph, 'meaning'>> = {
  ok: { glyph: '✓', tone: 'good', word: 'OK', label: 'check passed' },
  // CHG-064 (SME #24): a pass with an input missing is grey — green is kept for a pass on full inputs (ISA-101, NE107)
  'ok-limited': { glyph: '✓', tone: 'muted', word: 'OK on available data', label: 'check passed on the inputs available' },
  attention: { glyph: '!', tone: 'warn', word: 'Attention', label: 'check needs attention' },
  failed: { glyph: '✕', tone: 'bad', word: 'Failed', label: 'check failed' },
  unusable: { glyph: '⊘', tone: 'muted', word: 'Not usable', label: 'window not usable for this check' },
  // CHG-098 (SME review 2 #24): an exclusion is a deliberate choice (mode / operating region), not an unusable window
  excluded: { glyph: '⊖', tone: 'muted', word: 'Excluded', label: 'excluded on purpose (mode or operating region)' },
  'not-seen': { glyph: '◯', tone: 'muted', word: 'Not seen', label: 'symptom not seen by this method' },
  'not-seen-limited': { glyph: '◯', tone: 'muted', word: 'Not seen on available data', label: 'symptom not seen on the inputs available' },
  seen: { glyph: '◐', tone: 'warn', word: 'Seen', label: 'symptom seen' },
  strong: { glyph: '⬤', tone: 'warn', word: 'Strong', label: 'strong symptom evidence' },
  // CHG-092 (SME 2 #6): G15 carries the diagnosis band — same word as the result pill, amber below confirmed
  detected: { glyph: '△', tone: 'warn', word: 'Detected', label: 'condition detected (weak evidence)' },
  classified: { glyph: '△', tone: 'warn', word: 'Classified', label: 'condition classified (moderate evidence)' },
  suspected: { glyph: '△', tone: 'warn', word: 'Suspected', label: 'condition suspected' },
  confirmed: { glyph: '▲', tone: 'bad', word: 'Confirmed', label: 'condition confirmed' },
  // CHG-098 (SME review 2 #24): "ruled out" has its own mark — the ✓ is kept for a check that passed
  'ruled-out': { glyph: '◇', tone: 'good', word: 'Ruled out', label: 'fault ruled out by measured evidence' },
  // CHG-098 (SME review 2 #24): "—" is "not evaluated" only; not applicable and pending have their own marks
  none: { glyph: '—', tone: 'muted', word: 'Not evaluated', label: 'not evaluated' },
  'not-applicable': { glyph: 'n/a', tone: 'muted', word: 'N/A', label: 'not applicable' },
  pending: { glyph: '…', tone: 'muted', word: 'Pending', label: 'pending' },
};

const NO_VERDICT_WORD: Record<string, string> = {
  NOT_EVALUATED: 'Not evaluated', INSUFFICIENT_EVIDENCE: 'Insufficient', INSUFFICIENT_DATA: 'Insufficient',
  NOT_APPLICABLE: 'N/A', PENDING: 'Pending', NOT_CONFIRMED: 'Not confirmed', DISABLED: 'Disabled', LEGACY_FLAG_ONLY: 'Older result',
};

export function gateMeaning(status: string | null | undefined, gate?: string | null): GateMeaning {
  const s = (status ?? '').toUpperCase();
  const role = gateRole(gate);
  if (s === 'CONFIRMED') return 'confirmed';
  if (s === 'SUSPECTED') return 'suspected';
  if (s === 'CLASSIFIED') return 'classified';
  if (s === 'DETECTED') return 'detected';
  if (s === 'CONTRADICTED') return 'ruled-out';
  if (s === 'STRONG') return 'strong';
  if (s.startsWith('EXCLUDED')) return 'excluded';
  if (s === 'NOT_APPLICABLE' || s === 'DISABLED') return 'not-applicable';
  if (s === 'PENDING') return 'pending';
  if (role === 'diagnostic') {
    if (s === 'PASS') return 'not-seen';
    if (s === 'WARN' || s === 'REVIEW') return 'seen';
    if (s === 'FAIL') return 'strong';
  }
  if (s === 'PASS') return 'ok';
  if (s === 'WARN' || s === 'REVIEW') return 'attention';
  if (s === 'FAIL') return role === 'eligibility' ? 'unusable' : 'failed';
  return 'none';
}

/**
 * The mark for a gate result: symbol, colour, word and spoken label. Pass the gate key whenever known, and the
 * window's input flags (`effectiveInputFlags`) where the surface has them: a pass judged without one of the gate's
 * inputs then reads "OK on available data" and names what was missing (CHG-064).
 */
export function gateMark(status: string | null | undefined, gate?: string | null, inputFlags?: readonly string[] | null): GateGlyph {
  let meaning = gateMeaning(status, gate);
  const limitedBy = meaning === 'ok' || meaning === 'not-seen' ? gateLimits(gate, inputFlags) : [];
  if (limitedBy.length) meaning = meaning === 'ok' ? 'ok-limited' : 'not-seen-limited';
  const m = MARK[meaning];
  const noResult = NO_RESULT.has(meaning);
  const word = noResult ? NO_VERDICT_WORD[(status ?? '').toUpperCase()] ?? m.word : m.word;
  const label = noResult ? word.toLowerCase() : limitedBy.length ? `${m.label} — ${limitedBy.join(', ')}` : m.label;
  return { ...m, word, label, meaning, ...(limitedBy.length ? { limitedBy } : {}) };
}

/** THE gate-status colour, from the same meaning as the mark. */
export const gateTone = (status: string | null | undefined, gate?: string | null, inputFlags?: readonly string[] | null): CpmTone =>
  gateMark(status, gate, inputFlags).tone;

/** Kept for callers of the CPA glyph vocabulary; identical to `gateMark`. */
export const glyphFor = gateMark;

/**
 * The legend every gate strip / matrix shows once (symbol + words). CHG-098 (SME review 2 #24): grouped so a failed
 * check, symptom evidence, an exclusion and "no evaluation" read as four different things, and every mark is in it.
 */
const LEGEND_GROUPS: Array<{ group: string; items: Array<[GateMeaning, string]> }> = [
  { group: 'Checks', items: [['ok', 'check OK'], ['ok-limited', 'OK on available data (an input missing)'], ['attention', 'check needs attention'], ['failed', 'check failed']] },
  { group: 'Window', items: [['unusable', 'window not usable'], ['excluded', 'excluded on purpose (mode / region)']] },
  { group: 'Symptoms', items: [['not-seen', 'symptom not seen'], ['seen', 'symptom seen'], ['strong', 'strong symptom']] },
  { group: 'Result', items: [['suspected', 'detected / classified / suspected'], ['confirmed', 'confirmed'], ['ruled-out', 'ruled out']] },
  { group: 'No result', items: [['none', 'not evaluated'], ['not-applicable', 'not applicable'], ['pending', 'pending']] },
];
export const GATE_LEGEND: Array<{ glyph: string; tone: CpmTone; text: string; meaning: GateMeaning; group: string }> =
  LEGEND_GROUPS.flatMap(g => g.items.map(([meaning, text]) => ({ glyph: MARK[meaning].glyph, tone: MARK[meaning].tone, text, meaning, group: g.group })));

/**
 * CHG-098 (SME review 2 #24): readable gate names, the same words the calculations contract serves
 * (cplm-api CpmEventsController), so a header or a check reads "G7 Stiction shape" without a fetch.
 */
export const GATE_NAMES: Readonly<Record<string, string>> = {
  G0: 'Data quality', G1: 'Mode / service', G2: 'Setpoint activity', G2r: 'Operating region', G3: 'Base performance',
  G4: 'Actuator effort', G5: 'Oscillation (ACF)', G6: 'Spectral (FFT)', G7: 'Stiction shape', G8: 'Horch oddness',
  G9: 'Phase geometry', G10: 'Valve / saturation', G11: 'Sensor health', G12: 'Step-test evidence',
  G13: 'Disturbance context', G14: 'VP confirmation', G15: 'Diagnosis band',
};
export const gateName = (gate: string): string => GATE_NAMES[gate] ?? gate;

/** Meanings that do not move a loop's result: a pass, a symptom not seen, or no result at all. */
const QUIET: ReadonlySet<GateMeaning> = new Set<GateMeaning>(['ok', 'ok-limited', 'not-seen', 'not-seen-limited', ...NO_RESULT]);

/**
 * CHG-098 (SME review 2 #24): the gates behind a row's current result — every gate whose mark says something
 * (failed, attention, not usable, excluded, symptom, ruled out, band) plus G15, which gives the verdict. Ordered as served.
 */
export function resultGates(row: CpmHeatmapLoop, gateKeys: string[], inputFlags?: readonly string[] | null): string[] {
  return gateKeys.filter(k => k === 'G15' || !QUIET.has(gateMark(row.gates[k], k, inputFlags).meaning));
}

/** Performance page view: the readable "checks behind the result" (default) or the full G0–G15 matrix (advanced). */
export type MatrixView = 'checks' | 'matrix';
export const matrixViewOf = (v: string | null): MatrixView => (v === 'matrix' ? 'matrix' : 'checks');

/**
 * Does this result hold the loop back — for the fleet filters and roll-up counts ("Needs attention", the
 * bars per gate). Deliberately the pre-CHG-052 grouping so those numbers do not move with the new marks: a
 * rejected window, a symptom, a failed check and a confirmed condition all count; "bad" = the old red set.
 */
export function reviewSeverity(status: string | null | undefined): 'warn' | 'bad' | null {
  const s = (status ?? '').toUpperCase();
  if (s === 'FAIL' || s === 'STRONG' || s.startsWith('EXCLUDED') || s === 'CONFIRMED') return 'bad';
  if (s === 'WARN' || s === 'REVIEW' || s === 'SUSPECTED') return 'warn';
  return null;
}

/**
 * Intersect the declared tiers with the keys the API actually served, so the
 * grouped header spans can never drift from the body columns, and surface
 * anything served but unclaimed under "Other" instead of silently misfiling it.
 */
export function buildTierGroups(gateKeys: string[]): { label: string; keys: string[] }[] {
  const served = new Set(gateKeys);
  const groups = TIER_GROUPS
    .map(g => ({ label: g.label, keys: g.keys.filter(k => served.has(k)) }))
    .filter(g => g.keys.length > 0);
  const claimed = new Set(groups.flatMap(g => g.keys));
  const ungrouped = gateKeys.filter(k => !claimed.has(k));
  return ungrouped.length ? [...groups, { label: 'Other', keys: ungrouped }] : groups;
}

/** Which gates on this row are warn or fail — i.e. why the verdict is what it is. */
export function drivingGates(row: CpmHeatmapLoop, gateKeys: string[]): string[] {
  return gateKeys.filter(k => {
    return reviewSeverity(row.gates[k]) != null;
  });
}

export const isEvaluated = (row: CpmHeatmapLoop): boolean =>
  row.diagnosis !== 'NOT_EVALUATED';

/** Row-set the matrix is showing. `attention` is the default: see filterRows. */
export type RowFilter = 'attention' | 'evaluated' | 'notEvaluated' | 'all';

export const ROW_FILTERS: { value: RowFilter; label: string }[] = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'evaluated', label: 'Evaluated' },
  { value: 'notEvaluated', label: 'Not evaluated' },
  { value: 'all', label: 'All' },
];

export const isRowFilter = (v: string | null): v is RowFilter =>
  v === 'attention' || v === 'evaluated' || v === 'notEvaluated' || v === 'all';

export interface MatrixFilter {
  mode: RowFilter;
  /** Set by clicking a bar in the roll-up: keep only loops failing THIS gate. */
  gate: string | null;
  /** Free-text over loopId + displayName. */
  q: string;
}

function matchesMode(row: CpmHeatmapLoop, gateKeys: string[], mode: RowFilter): boolean {
  switch (mode) {
    case 'attention': return drivingGates(row, gateKeys).length > 0;
    case 'evaluated': return isEvaluated(row);
    case 'notEvaluated': return !isEvaluated(row);
    default: return true;
  }
}

export function filterRows(
  loops: CpmHeatmapLoop[], gateKeys: string[], f: MatrixFilter,
): CpmHeatmapLoop[] {
  const q = f.q.trim().toLowerCase();
  return loops.filter(row => {
    if (!matchesMode(row, gateKeys, f.mode)) return false;
    if (f.gate) {
      if (reviewSeverity(row.gates[f.gate]) == null) return false;
    }
    if (q && !`${row.loopId} ${row.displayName}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/**
 * Counts for the segmented filter. These are the honest denominators the page
 * shows: a "Needs attention 3" chip beside "Not evaluated 51" is the single
 * fastest way to see that most of the fleet has no verdict yet.
 */
export function filterCounts(
  loops: CpmHeatmapLoop[], gateKeys: string[],
): Record<RowFilter, number> {
  return {
    attention: loops.filter(r => matchesMode(r, gateKeys, 'attention')).length,
    evaluated: loops.filter(isEvaluated).length,
    notEvaluated: loops.filter(r => !isEvaluated(r)).length,
    all: loops.length,
  };
}

export interface GateFailureCount { key: string; warn: number; bad: number; total: number }

/**
 * Fleet-level roll-up: how many loops each gate is holding back. This is the
 * O(1) answer to "where is the fleet failing", which a per-loop matrix can only
 * answer by scanning every row.
 */
export function gateFailureCounts(
  loops: CpmHeatmapLoop[], gateKeys: string[],
): GateFailureCount[] {
  return gateKeys.map(key => {
    let warn = 0, bad = 0;
    for (const row of loops) {
      const sev = reviewSeverity(row.gates[key]);
      if (sev === 'warn') warn++;
      else if (sev === 'bad') bad++;
    }
    return { key, warn, bad, total: warn + bad };
  });
}

/** Newest window end across the served rows — drives the staleness indicator. */
export function latestWindowEnd(loops: CpmHeatmapLoop[]): number | null {
  let newest: number | null = null;
  for (const row of loops) {
    if (!row.windowEnd) continue;
    const t = Date.parse(row.windowEnd);
    if (!Number.isNaN(t) && (newest == null || t > newest)) newest = t;
  }
  return newest;
}
