/**
 * CHG-185 (owner review item 5, decision Q3): the state colour of a live PV / SP / OP / Mode reading. ISA-101: neutral when normal,
 * amber + a word when it needs a look, no green; red only with the plant's own alarm limits, which the CPA does not have. A reading
 * that is not live (last received …, from historian, last stored …) never takes a state colour, and neither does a reading whose
 * threshold the page does not hold: nothing here invents one.
 *
 * Where each threshold comes from:
 *  - OP "At limit": the loop's registered OP range (registry `engineering.opMin` / `opMax`, the range "Time at an OP limit"
 *    normalises OP to). The reading is amber at or beyond a registered bound, as shown to two decimals. The engine's KPI also counts
 *    a tolerance band inside each bound (a gate setting the page cannot read), so the reading never claims more than the registry says.
 *  - Mode: the engine's normal-mode vocabulary (AUTO / CASCADE …, `utils/modeVocabulary`, the same test as "Time in normal mode").
 *  - PV "Off setpoint" needs the G3 good-error band: a fraction of the PV span set in the loop's gate configuration, which only a
 *    configuration reader can load. The page does not hold it, so PV stays neutral.
 *  - SP is always neutral.
 */
import type { CpmEngineeringRange } from '../../../../api/cpmApi';
import { classifyMode } from '../../../../utils/modeVocabulary';

/** The word shown with the amber colour, or null for a neutral reading. */
export type ReadingState = string | null;

const bounded = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** "At limit" for a live OP at or beyond a registered bound; neutral without a registered range or a live value. */
export function opReadingState(op: number | null, live: boolean, range: CpmEngineeringRange | null | undefined): ReadingState {
  if (!live || op == null || !Number.isFinite(op)) return null;
  const min = range?.opMin;
  const max = range?.opMax;
  if (!bounded(min) || !bounded(max) || max <= min) return null;
  const shown = Math.round(op * 100) / 100;
  return shown <= min || shown >= max ? 'At limit' : null;
}

/** True when a live mode is not one the engine counts as normal (manual, never published, or a token it cannot read). */
export function modeNeedsLook(mode: unknown, live: boolean): boolean {
  if (!live || mode === undefined || mode === null || mode === '') return false;
  return classifyMode(String(mode)) !== 'auto';
}

/** CHG-193 (final review M6): "Not normal" beside an amber mode box, in the place OP says "At limit"; null for a neutral one. */
export const modeReadingState = (mode: unknown, live: boolean): ReadingState => (modeNeedsLook(mode, live) ? 'Not normal' : null);
