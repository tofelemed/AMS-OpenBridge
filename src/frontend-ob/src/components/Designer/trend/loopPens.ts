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
export function loopPens(loop: Pick<CpmLoop, 'tags'>): LoopPen[] {
  const seen = new Set<string>();
  const pens: LoopPen[] = [];
  for (const role of PEN_ROLES) {
    const tag = loop.tags?.[role];
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    pens.push({ tag, role });
  }
  return pens;
}

/** The roles a link asks for (`?roles=PV,OP`); none given, or none valid, means all of them. */
export function rolesOf(param: string | null): PenRole[] {
  const asked = (param ?? '').split(',').map(r => r.trim().toUpperCase());
  const roles = PEN_ROLES.filter(r => asked.includes(r));
  return roles.length > 0 ? roles : [...PEN_ROLES];
}

/** Pen specs for the trend engine: coloured by role, setpoint dashed, labelled by the role. */
export function penSpecsOf(pens: LoopPen[], roles: readonly PenRole[] = PEN_ROLES): PenSpec[] {
  return pens.filter(p => roles.includes(p.role)).map(p => ({
    path: p.tag,
    label: p.role,
    color: `var(--signal-${p.role.toLowerCase()})`,
    ...(p.role === 'SP' ? { lineStyle: 'dashed' as const } : {}),
  }));
}
