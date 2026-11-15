/**
 * The controller-mode vocabulary the CPLM engine understands.
 *
 * Mirror of ingestion-service `Pipeline/ModeVocabulary.cs`, itself a mirror of Flink
 * `CplmNormalizedSample.AUTO_MODE_TOKENS / MANUAL_MODE_TOKENS`. Keep the three in step.
 *
 * Why it matters on screen: the engine's auto test is binary, so anything it does not
 * recognise is simply "not auto" — the loop is excluded at Gate 1 and produces no verdict
 * at all. On the HDPE plant a wrong `mode_value_map` hid that for weeks: G0 stayed green,
 * the data looked perfect, and every loop was silently unscored. Showing the mode, and
 * what it means for analysis, is how that stays visible.
 */

const AUTO = new Set([
  'AUTO', 'AUT', 'A', 'AUTOMATIC', 'NORMAL', 'NORM',
  'CAS', 'CASC', 'CASCADE', 'RSP', 'DDC', 'SUP', 'SUPERVISORY',
]);
const MANUAL = new Set([
  'MAN', 'MANUAL', 'M', 'IMAN', 'ROUT', 'LO', 'LOCAL', 'OFF', 'TRACK',
]);

export type ModeClass = 'auto' | 'manual' | 'unrecognised';

/** What the engine will make of this token. Manual wins before auto, as in the engine. */
export function classifyMode(token: string): ModeClass {
  const m = token.trim().toUpperCase();
  if (!m || m === 'UNKNOWN') return 'unrecognised';
  if (MANUAL.has(m)) return 'manual';
  if (AUTO.has(m)) return 'auto';
  if (m.includes('AUTO') || m.includes('CASCADE')) return 'auto';
  return 'unrecognised';
}

/**
 * CHG-189 (owner review item 12): a stored mode token as the word an engineer says ("Auto", not "AUT"). Only tokens with one
 * meaning are named; any other token reads as stored, so a word never hides what the historian holds.
 */
const WORDS: Record<string, string> = {
  AUTO: 'Auto', AUT: 'Auto', A: 'Auto', AUTOMATIC: 'Auto',
  CAS: 'Cascade', CASC: 'Cascade', CASCADE: 'Cascade', RSP: 'Remote setpoint',
  NORMAL: 'Normal', NORM: 'Normal', SUP: 'Supervisory', SUPERVISORY: 'Supervisory',
  MAN: 'Manual', MANUAL: 'Manual', M: 'Manual', LO: 'Local', LOCAL: 'Local', OFF: 'Off', TRACK: 'Track',
  UNKNOWN: 'Unknown',
};

export function modeWord(token: string): string {
  const t = token.trim();
  return WORDS[t.toUpperCase()] ?? t;
}

export type ModeTone = 'good' | 'warn' | 'bad' | 'muted';

/**
 * Display form for a live MODE value: the mode as a word (CHG-193, sweep D6: the word Replay shows, `modeWord`), plus what it
 * means for whether this loop is scored at all. `UNKNOWN` is its own case — it means the source has never published a mode,
 * not that it sent something we could not read.
 */
export function modeLabel(value: unknown): { label: string; note: string; tone: ModeTone } {
  if (value === undefined || value === null || value === '') {
    return { label: '—', note: 'no live value, none stored', tone: 'muted' };
  }
  const token = String(value).trim().toUpperCase();
  const label = modeWord(String(value));
  if (token === 'UNKNOWN') {
    return { label, note: 'mode never published · excluded at G1', tone: 'warn' };
  }
  switch (classifyMode(token)) {
    case 'auto':
      return { label, note: 'closed loop · analysed', tone: 'good' };
    case 'manual':
      return { label, note: 'manual · excluded at G1', tone: 'warn' };
    default:
      return { label, note: 'not recognised · excluded at G1', tone: 'bad' };
  }
}
