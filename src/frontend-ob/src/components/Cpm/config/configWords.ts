/**
 * CHG-169 (owner review, the approved sample docs/theme/redesign/samples/gate-configuration-proposal.html): the words of the
 * Gate Configuration page in one place. A state is tone + glyph + word ("✓ Active (verified)") on every view, as How to read
 * keys it; a change class is "Policy", "◆ State boundary" or "✕ Deployment"; a number carries its unit ("3600 s", "0.5 pp")
 * and an unset value reads "No value"; a source names its layer (the bundle's version when the value comes from the loop's
 * own bundle). Presentation only: every value is still the server's.
 */
import type { CpmTone } from '../shared';
import { codeLabel, humanise } from '../vocabulary';
import { stamp, zoneTag } from '../events/eventTime';
import { deploymentStateTone, valueText } from './configSupport';

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
  return { label: LABEL[d.state] ?? codeLabel(d.state), tone, glyph: GLYPH[tone] };
}

/** The change class in words: Policy plain, a state boundary and a deployment marked. */
export function classWord(changeClass: string | null | undefined): StateWord {
  if (changeClass === 'STATE_BOUNDARY') return { label: 'State boundary', tone: 'warn', glyph: '◆' };
  if (changeClass === 'DEPLOYMENT') return { label: 'Deployment', tone: 'bad', glyph: '✕' };
  return { label: changeClass && changeClass !== 'POLICY' ? humanise(changeClass) : 'Policy', tone: 'muted', glyph: '' };
}

/** A value as words: an unset one reads "No value" (the engine's NO_VALUE). */
export const valueWords = (v: unknown): string => (v === null || v === undefined ? 'No value' : valueText(v));

/** The catalogue units a number is read with; any other unit (fraction, ratio, state…) is said in the property's panel. */
const UNIT: Record<string, string> = {
  s: 's', day: 'days', sample: 'samples', percentage_point: 'pp', PV_EU: 'PV units', 'sample/cycle': 'samples / cycle', cycle: 'cycles', degree: '°',
};

/** "3600 s", "0.5 pp", "4.5"; an unset value reads "No value". */
export function valueWithUnit(v: unknown, unit: string | null | undefined): string {
  if (v === null || v === undefined) return 'No value';
  const suffix = typeof v === 'number' && unit ? UNIT[unit] : undefined;
  return suffix ? `${valueText(v)}${suffix === '°' ? '' : ' '}${suffix}` : valueText(v);
}

const LAYERS = new Set(['FACTORY', 'SITE', 'PROFILE', 'LOOP', 'REGIME']);

/** The source of a value in a list row: the layer, "LOOP v6" for the loop's own bundle level, "Unset" when no layer sets it. */
export function sourceShort(src: string | null | undefined, bundle: { scopeKind: string; version: number } | null | undefined): string {
  if (!src || !LAYERS.has(src)) return 'Unset';
  return bundle && bundle.scopeKind === src ? `${src} v${bundle.version}` : src;
}

/** The source in a property's panel: where that layer comes from. */
export function sourceFull(src: string | null | undefined, bundle: { scopeKind: string; version: number } | null | undefined, profileId: string): string {
  if (!src || !LAYERS.has(src)) return 'Unset · no layer sets it';
  if (bundle && bundle.scopeKind === src) return `${src} · bundle v${bundle.version}`;
  if (src === 'FACTORY') return 'FACTORY · shipped default';
  if (src === 'PROFILE') return `PROFILE · ${codeLabel(profileId)}`;
  return src;
}

/** A property name in pieces that may break after "_" and ".", so a long name wraps between words, never inside one. */
export function breakableParts(name: string): string[] {
  return name.split(/(?<=[._])/).filter(Boolean);
}
