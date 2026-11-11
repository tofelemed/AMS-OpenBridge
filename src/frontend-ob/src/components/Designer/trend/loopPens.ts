/**
 * Task 26: the pens of a chosen loop. A loop trends its numeric signals; MODE is a text series, so a line chart on it is
 * noise (it has its own lane on Historical). Colour follows the role, through the owner's `--signal-*` variables.
 */
import type { CpmLoop } from '../../../api/cpmApi';
import type { PenSpec } from './trendSupport';

export const PEN_ROLES = ['PV', 'SP', 'OP', 'VP'] as const;
export type PenRole = typeof PEN_ROLES[number];

export interface LoopPen { tag: string; role: PenRole }

/** PV, SP, OP and VP pens of the loop, in that order. A role with no tag gets none; one tag shared by two roles is one pen. */
export function loopPens(loop: Pick<CpmLoop, 'tags'>, roles: readonly PenRole[] = PEN_ROLES): LoopPen[] {
  const seen = new Set<string>();
  const pens: LoopPen[] = [];
  // Role first, then dedupe: PV and SP on one tag still give the SP pen when only SP is asked for.
  for (const role of PEN_ROLES.filter(r => roles.includes(r))) {
    const tag = loop.tags?.[role];
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    pens.push({ tag, role });
  }
  return pens;
}

/** The roles a link asks for (`?roles=PV,OP`); none given, or none valid, means all of them. `none` is an explicit empty set. */
export function rolesOf(param: string | null): PenRole[] {
  if (param?.trim().toLowerCase() === 'none') return [];
  const asked = (param ?? '').split(',').map(r => r.trim().toUpperCase());
  const roles = PEN_ROLES.filter(r => asked.includes(r));
  return roles.length > 0 ? roles : [...PEN_ROLES];
}

/**
 * Pen specs for the trend engine: coloured by role, setpoint dashed, labelled by the role. CHG-175: a loop's signal is
 * read only through a binding from the asset model (see PenSpec.needsModelBinding).
 */
export function penSpecsOf(pens: LoopPen[]): PenSpec[] {
  return pens.map(p => ({
    path: p.tag,
    label: p.role,
    color: `var(--signal-${p.role.toLowerCase()})`,
    ...(p.role === 'SP' ? { lineStyle: 'dashed' as const } : {}),
    needsModelBinding: true,
  }));
}
