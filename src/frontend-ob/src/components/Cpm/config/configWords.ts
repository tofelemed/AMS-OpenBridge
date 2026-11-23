/**
 * CHG-169 (owner review, the approved sample docs/theme/redesign/samples/gate-configuration-proposal.html): the words of the
 * Gate Configuration page in one place. A state is tone + glyph + word ("✓ Active (verified)") on every view, as How to read
 * keys it; a change class is "Policy", "◆ State boundary" or "✕ Deployment"; a number carries its unit ("3600 s", "0.5 pp")
 * and an unset one reads a dash (CHG-224: never "No value"); a source reads in the page's words. Presentation only: every value is still the server's.
 */
import type { CpmTone } from '../shared';
import { humanise } from '../vocabulary';
import { stamp, zoneTag } from '../events/eventTime';
import { deploymentStateTone, valueText } from './configSupport';
import { stateWord } from './levelWords';

/** "25 Sept 18:37 UTC": a time where no column heading names the zone (a panel, a dialog). */
export function stampZoned(ts: string | number | null | undefined): string {
  const s = stamp(ts);
  return s === '—' ? s : `${s} ${zoneTag(new Date(ts as string | number).getTime())}`;
}

export interface StateWord { label: string; tone: CpmTone; glyph: string }

const ON_ITS_WAY = new Set(['VALIDATED', 'SHADOW_EVALUATED', 'APPROVED', 'SCHEDULED', 'PREPARED']);
const NOT_ACTIVE = new Set(['REJECTED', 'EXPIRED', 'PARTIALLY_ACKNOWLEDGED', 'ACTIVATION_FAILED']);
const LABEL: Record<string, string> = {
  DRAFT: 'Draft', VALIDATED: 'Validated', SHADOW_EVALUATED: 'Shadow evaluated', APPROVED: 'Approved', SCHEDULED: 'Scheduled', PREPARED: 'Prepared',
  ACTIVE_VERIFIED: 'Active (verified)', REJECTED: 'Rejected', EXPIRED: 'Approval expired', PARTIALLY_ACKNOWLEDGED: 'Partially acknowledged',
  ACTIVATION_FAILED: 'Activation failed', ROLLED_BACK: 'Rolled back', SUPERSEDED: 'Superseded', NO_ACTIVE_BUNDLE: 'Factory layer',
};

/** A bundle's state in words; a loop without a governed bundle runs the factory layer. */
export function bundleStateWord(state: string | null | undefined): StateWord {
  const s = state ?? 'NO_ACTIVE_BUNDLE';
  const label = LABEL[s] ?? humanise(s);
  if (s === 'ACTIVE_VERIFIED') return { label, tone: 'good', glyph: '✓' };
  if (ON_ITS_WAY.has(s)) return { label, tone: 'warn', glyph: '◐' };
  if (NOT_ACTIVE.has(s)) return { label, tone: 'bad', glyph: '✕' };
  if (s === 'ROLLED_BACK') return { label, tone: 'muted', glyph: '↺' };
  if (s === 'SUPERSEDED') return { label, tone: 'muted', glyph: '⊘' };
  return { label, tone: 'muted', glyph: '○' };
}

const GLYPH: Record<CpmTone, string> = { good: '✓', warn: '◐', bad: '✕', muted: '↺' };

/** A deployment's state in words; the tone is the server's (an ACK-window verification is not proven). */
export function deploymentStateWord(d: { state: string; probeResults?: unknown }): StateWord {
  const tone = deploymentStateTone(d.state, d);
  return { label: stateWord(d.state), tone, glyph: GLYPH[tone] };
}

/** The change class in words: Policy plain, a state boundary and a deployment marked. */
export function classWord(changeClass: string | null | undefined): StateWord {
  if (changeClass === 'STATE_BOUNDARY') return { label: 'State boundary', tone: 'warn', glyph: '◆' };
  if (changeClass === 'DEPLOYMENT') return { label: 'Deployment', tone: 'bad', glyph: '✕' };
  return { label: changeClass && changeClass !== 'POLICY' ? humanise(changeClass) : 'Policy', tone: 'muted', glyph: '' };
}

/** A value as words: an unset one reads a dash (CHG-224: never "No value"). */
export const valueWords = (v: unknown): string => (v === null || v === undefined ? '—' : valueText(v));

/** The catalogue units a number is read with; any other unit (fraction, ratio, state…) is said in the property's panel. */
const UNIT: Record<string, string> = {
  s: 's', day: 'days', sample: 'samples', percentage_point: 'pp', PV_EU: 'PV units', 'sample/cycle': 'samples / cycle', cycle: 'cycles', degree: '°',
};

/** "3600 s", "0.5 pp", "4.5"; an unset value reads a dash. */
export function valueWithUnit(v: unknown, unit: string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const suffix = typeof v === 'number' && unit ? UNIT[unit] : undefined;
  return suffix ? `${valueText(v)}${suffix === '°' ? '' : ' '}${suffix}` : valueText(v);
}

const FROM: Record<string, string> = { LOOP: 'This loop', PROFILE: 'Loop type', SITE: 'Plant', FACTORY: 'Factory' };

/** Where a value comes from, in the page's words; no layer sets it = the system works it out. */
export const sourceWord = (level: string | null | undefined): string => (level ? FROM[level] : undefined) ?? 'Worked out automatically';

/** A property name in pieces that may break after "_" and ".", so a long name wraps between words, never inside one. */
export function breakableParts(name: string): string[] {
  return name.split(/(?<=[._])/).filter(Boolean);
}

const SETTING_NAME: Record<string, string> = {
  'G2r.pv_region_min': 'Region minimum', 'G2r.pv_region_max': 'Region maximum',
  'G2r.out_of_domain_warn_fraction': 'Warn when outside the region', 'G2r.mode': 'Region checked on', 'G2r.role': 'Region role',
  'G2r.applied_input_region_min': 'Input region minimum', 'G2r.applied_input_region_max': 'Input region maximum',
  'G2r.evidence_retention_days': 'Evidence kept (days)',
};
const WORD: Record<string, string> = { min: 'minimum', max: 'maximum', pv: 'PV', sp: 'SP', op: 'OP', vp: 'VP' };

/** A property as the person reads it: a plain name, or the part after the gate made into words. The code stays in a title. */
export function settingName(property: string): string {
  if (SETTING_NAME[property]) return SETTING_NAME[property];
  const rest = property.includes('.') ? property.slice(property.indexOf('.') + 1) : property;
  const unit = rest.endsWith('_s') ? ' (s)' : rest.endsWith('_pct') ? ' (%)' : '';
  const words = (unit ? rest.replace(/_(s|pct)$/, '') : rest).split('_').filter(Boolean).map(w => WORD[w] ?? w);
  const text = words.join(' ');
  return (text.charAt(0).toUpperCase() + text.slice(1)) + unit;
}
