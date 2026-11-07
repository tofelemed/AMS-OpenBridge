/**
 * Loop Detail (Task 24): the pure rules for what the page states. A fact is stated once; the VP states stay apart
 * (applicable and mapped, expected but not mapped, not installed, not applicable); readiness lists only the
 * checks that are not met, by name.
 */
import type { CpmLoop, CpmReadiness } from '../../../api/cpmApi';
import { peerApplicabilityOf, inputContextOf } from '../optionalInputs';
import { serviceName } from '../loopName';

export function vpStateText(loop: CpmLoop): string {
  const c = inputContextOf(loop)!;
  if (c.vp === 'NOT_INSTALLED') return 'Not installed';
  if (c.vp === 'NOT_APPLICABLE') return 'Not applicable';
  return c.vpMapped ? 'Applicable · mapped' : 'Expected · not mapped: G14 cannot confirm a final-element fault';
}

export function peerText(loop: CpmLoop): string {
  if (loop.links.length > 0) return loop.links.map(l => `${l.relType} → ${l.toLoopId}`).join(', ');
  return peerApplicabilityOf(loop) === 'EXPECTED' ? 'None · expected: G13 not evaluated' : 'Not applicable';
}

export function acquisitionText(loop: CpmLoop): string {
  const a = loop.model?.acquisition;
  if (!a) return 'Not served';
  return `${a.mode}${a.gridSeconds != null ? ` · ${a.gridSeconds} s grid` : ' · grid undeclared'}`;
}

export const plantPath = (loop: CpmLoop): string => [loop.site, loop.area, loop.unit].filter(Boolean).join(' / ');

/** The facts rows, in reading order. Observability, the plant path and the state are rendered by the page. */
export function factsOf(loop: CpmLoop): Array<[label: string, value: string]> {
  return [
    ['Service', serviceName(loop) || loop.displayName],
    ['Loop type', loop.loopType],
    ['Criticality', loop.criticality],
    ['Gate profile', loop.thresholdProfileId ?? 'default'],
    ['Acquisition', acquisitionText(loop)],
    ['Valve position', vpStateText(loop)],
    ['Peer links', peerText(loop)],
  ];
}

/** Signal roles in the order the registry contract lists them; unknown roles last. */
const ROLE_ORDER = ['PV', 'SP', 'OP', 'MODE', 'VP'];
export function signalRows(loop: CpmLoop): Array<[role: string, path: string]> {
  const rank = (r: string) => { const i = ROLE_ORDER.indexOf(r.toUpperCase()); return i === -1 ? ROLE_ORDER.length : i; };
  return Object.entries(loop.tags).filter(([, p]) => !!p).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Checks that are not met, by name with their message; a fact that does not apply here is not a gap. */
export function missingFields(readiness: Pick<CpmReadiness, 'checks'> | undefined): Array<{ id: string; label: string; message: string | null }> {
  return (readiness?.checks ?? [])
    .filter(c => !c.ok && c.state !== 'NOT_APPLICABLE' && c.state !== 'NOT_INSTALLED')
    .map(c => ({ id: c.id, label: c.label, message: c.message }));
}
