/**
 * CHG-169 (owner review): the order and the gate dropdown that Effective and a bundle's Properties share. Properties are listed
 * in catalogue order on both (Effective used to sort alphabetically while the editor kept catalogue order); each gate option
 * names the gate in the app's gate vocabulary ("G4 · Actuator effort") and carries its count: how many a layer above FACTORY
 * sets (Effective), how many a validation error names (a bundle).
 */
import type { CatalogueEntry, EffectiveConfig } from '../../../api/cpm/config';
import { gateName } from '../gateStatus';
import { overridesByGate } from './configSupport';

export const GATES = ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];
const gateRank = (g: string) => { const i = GATES.indexOf(g); return i < 0 ? GATES.length : i; };

export interface GateOption { value: string; label: string }

/** Property keys in catalogue order; keys the catalogue does not list go last, alphabetically (all alphabetical without it). */
export function catalogueOrder(keys: string[], entries: CatalogueEntry[] | undefined): string[] {
  const rank = new Map((entries ?? []).map((e, i) => [e.property, i]));
  return [...keys].sort((a, b) => {
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ra !== rb ? ra - rb : a.localeCompare(b);
  });
}

const named = (g: string) => `${g} · ${gateName(g)}`;

/** Effective: the gates this loop's configuration holds, in gate order, each with what a layer above FACTORY sets. */
export function effectiveGateOptions(eff: EffectiveConfig): GateOption[] {
  const counts = overridesByGate(eff);
  return Object.keys(counts).sort((a, b) => gateRank(a) - gateRank(b) || a.localeCompare(b))
    .map(g => ({ value: g, label: `${named(g)}${counts[g].overridden > 0 ? ` · ${counts[g].overridden} set above factory` : ''}` }));
}

/** A bundle: every gate, each with the number of its properties a validation error names. */
export const bundleGateOptions = (invalid: Record<string, number>): GateOption[] =>
  GATES.map(g => ({ value: g, label: `${named(g)}${invalid[g] ? ` · ${invalid[g]} invalid` : ''}` }));

/** The validation errors that name a property (quoted, or followed by a space), as the property rows read them. */
export const errorsFor = (errors: string[], property: string): string[] =>
  errors.filter(e => e.includes(`'${property}'`) || e.includes(`${property} `));

/** Per gate: how many of its properties a validation error names. */
export function invalidByGate(entries: CatalogueEntry[], errors: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) if (errorsFor(errors, e.property).length > 0) out[e.gate] = (out[e.gate] ?? 0) + 1;
  return out;
}
