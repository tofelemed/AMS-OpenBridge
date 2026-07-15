// Phase 6 — data quality on open (W4 / U11). A LiveMetric carries an OPC-UA/Sparkplug-B quality code
// (192 = GOOD) that until now was ignored: symbols only ever reflected *staleness*. This maps the code
// (plus staleness) to the ISA-18.2 / NAMUR NE107 quality states the platform standardises on, so a
// display shows a bad/uncertain/maintenance tag distinctly from a merely stale one.

export type QualityState = 'good' | 'uncertain' | 'bad' | 'maintenance' | 'outOfService';

export interface QualityInfo {
  state: QualityState;
  /** NAMUR NE107 category label. */
  ne107: string;
  /** Short glyph for a compact badge. */
  glyph: string;
  /** OpenBridge alert token (colour reserved for abnormal — 'good' returns null: no colour). */
  color: string | null;
  label: string;
}

const INFO: Record<QualityState, Omit<QualityInfo, 'state'>> = {
  good:         { ne107: 'Good',                    glyph: '✓', color: null,                 label: 'Good' },
  uncertain:    { ne107: 'Out of Specification',    glyph: '?', color: 'var(--ams-caut)',    label: 'Uncertain' },
  bad:          { ne107: 'Failure',                 glyph: '✕', color: 'var(--ams-crit)',    label: 'Bad' },
  maintenance:  { ne107: 'Maintenance Required',    glyph: '⬦', color: 'var(--ams-advisory)', label: 'Maintenance' },
  outOfService: { ne107: 'Function Check',          glyph: '⚠', color: 'var(--ams-warn)',    label: 'Out of Service' },
};

/**
 * Derive the quality state from an OPC-UA/Sparkplug quality code and a staleness flag.
 * OPC-UA quality bytes: 0xC0 (192) Good, 0x40 (64) Uncertain, 0x00 Bad. Sparkplug property "quality"
 * follows the same convention here. A stale-but-otherwise-good tag is reported Uncertain, not Good —
 * an operator must see that the number stopped updating.
 */
export function qualityFromCode(code: number | undefined, stale: boolean): QualityState {
  // Derive the code-based state FIRST. Staleness must not mask a worse state: a tag that is both BAD and
  // stale is BAD (a failure the operator must see), not merely "uncertain".
  let state: QualityState = 'good';
  if (code !== undefined)
  {
    // Vendor-specific "maintenance"/"out of service" sub-statuses (uncommon; supported if the edge sends them).
    if (code === 0x0C || code === 0x1C) state = 'maintenance';
    else if (code === 0x08 || code === 0x18) state = 'outOfService';
    else if (code >= 0xC0) state = 'good';       // 192+
    else if (code >= 0x40) state = 'uncertain';  // 64–191
    else state = 'bad';                          // 0–63
  }
  if (state === 'bad' || state === 'maintenance' || state === 'outOfService') return state;
  // A good/uncertain tag that stopped updating is reported Uncertain.
  return stale ? 'uncertain' : state;
}

export function qualityInfo(state: QualityState): QualityInfo {
  return { state, ...INFO[state] };
}

/** Convenience: full info straight from a code + staleness. */
export function qualityFrom(code: number | undefined, stale: boolean): QualityInfo {
  return qualityInfo(qualityFromCode(code, stale));
}
