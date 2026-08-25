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

/** Declared tier order. Intersected with the served keys before rendering. */
export const TIER_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Eligibility', keys: ['G0', 'G1', 'G2', 'G2r'] },
  { label: 'Performance', keys: ['G3', 'G4'] },
  { label: 'Diagnostic evidence', keys: ['G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'] },
  { label: 'Confirmation', keys: ['G12', 'G13', 'G14'] },
  { label: 'Fusion', keys: ['G15'] },
];

/**
 * THE gate-status tone. Every screen that colours a gate must come through here.
 *
 * It exists because two mappings were live at once and they disagreed on the two
 * statuses that matter most: the matrix's glyph map read STRONG as attention and
 * EXCLUDED as failure, while shared.tsx's diagnosis-oriented `toneFor` read them
 * the other way round. The same loop and window therefore rendered G1 red on
 * Performance and amber on Explorer, and G4 the reverse.
 *
 * The resolution treats a gate status as SEVERITY, not as "did the gate run":
 *   EXCLUDED — a blocking gate rejected the window, so there is no verdict at all
 *   STRONG   — the engine found strong evidence, i.e. the finding driving a
 *              SUSPECTED/CONFIRMED diagnosis
 * Both are the reason an engineer is on the screen, so both read as bad. Flip the
 * STRONG branch here if the site's alarm philosophy calls it evidence rather than
 * severity — one line, and every screen follows.
 *
 * `toneFor` in shared.tsx keeps its own vocabulary for DIAGNOSES; the two are
 * different value sets and must not be shared again.
 */
export function gateTone(status: string | null | undefined): CpmTone {
  const s = (status ?? '').toUpperCase();
  if (s === 'PASS') return 'good';
  if (s === 'WARN' || s === 'REVIEW') return 'warn';
  if (s === 'FAIL' || s === 'STRONG' || s.startsWith('EXCLUDED')) return 'bad';
  return 'muted';
}

export interface GateGlyph {
  glyph: string;
  tone: CpmTone;
  /** Spoken form. The glyph alone gives a screen reader "✓ button" and nothing else. */
  label: string;
}

const GLYPH_BY_TONE: Record<CpmTone, { glyph: string; label: string }> = {
  good: { glyph: '✓', label: 'pass' },
  warn: { glyph: '!', label: 'needs attention' },
  bad: { glyph: '×', label: 'failed' },
  muted: { glyph: '—', label: 'not evaluated' },
};

/** CPA glyph vocabulary: ✓ pass · ! attention · × failed · — not evaluated. */
export function glyphFor(status: string | null | undefined): GateGlyph {
  const tone = gateTone(status);
  return { tone, ...GLYPH_BY_TONE[tone] };
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
    const tone = glyphFor(row.gates[k]).tone;
    return tone === 'warn' || tone === 'bad';
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
      const tone = glyphFor(row.gates[f.gate]).tone;
      if (tone !== 'warn' && tone !== 'bad') return false;
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
      const tone = glyphFor(row.gates[key]).tone;
      if (tone === 'warn') warn++;
      else if (tone === 'bad') bad++;
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
