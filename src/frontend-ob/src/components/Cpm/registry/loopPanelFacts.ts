/**
 * CHG-168 (owner review, the approved sample docs/theme/redesign/samples/loop-registry-proposal.html): the pure rules for what
 * the selected loop's panel states, each fact once. Rows: plant path, type, criticality, gate profile, model; Record details:
 * objective · topology · command, acquisition, how the model was set. Readiness: the valve position (G14) and the peer links
 * (G13) in one row each, the server's advice behind a ?, then every other check not met (it merged the Valve position and
 * Peer links facts, the Observability flags and the readiness list, which said each gap three times). Signals: each required
 * role, a missing one with its advice; the path under the plant path as "…/fic10401.pv".
 */
import type { CpmLoop, CpmReadiness } from '../../../api/cpmApi';
import type { CpmTone } from '../shared';
import { inputContextOf, peerApplicabilityOf } from '../optionalInputs';
import { modelLabel } from '../registryShared';

export const plantPath = (loop: CpmLoop): string => [loop.site, loop.area, loop.unit].filter(Boolean).join(' / ');

export function panelRows(loop: CpmLoop): Array<[label: string, value: string]> {
  return [
    ['Plant path', plantPath(loop)],
    ['Loop type', loop.loopType],
    ['Criticality', loop.criticality],
    ['Gate profile', loop.thresholdProfileId ?? 'default'],
    ['Model', modelLabel(loop)],
  ];
}

export function acquisitionText(loop: CpmLoop): string {
  const a = loop.model?.acquisition;
  if (!a) return 'Not served';
  return `${a.mode}${a.gridSeconds != null ? ` · ${a.gridSeconds} s grid` : ' · grid undeclared'}`;
}

export interface RecordRow { label: string; value: string; sub?: string }

/** The Record details dialog: the loop's secondary facts. */
export function recordRows(loop: CpmLoop): RecordRow[] {
  const m = loop.model;
  if (!m) return [{ label: 'Acquisition', value: acquisitionText(loop) }];
  return [
    { label: 'Objective · topology · command', value: `${m.objectiveType} · ${m.topology} · ${m.commandPath}` },
    { label: 'Acquisition', value: acquisitionText(loop) },
    m.classificationSource === 'EXPLICIT'
      ? { label: 'Model set by', value: 'Declared in the registry' }
      : { label: 'Model set by', value: 'The loop type', sub: 'Declare it in Edit configuration to make it explicit.' },
  ];
}

/** A pill (tone, glyph, word) with the server's advice behind its ?, or plain text (the peer links themselves). */
export type Fact = { pill: [tone: CpmTone, glyph: string, word: string]; advice: string | null } | { text: string };

const checkOf = (r: Pick<CpmReadiness, 'checks'> | undefined, id: string) => r?.checks.find(c => c.id === id);
const adviceOf = (r: Pick<CpmReadiness, 'checks'> | undefined, id: string): string | null => {
  const c = checkOf(r, id);
  return c && !c.ok ? c.message ?? null : null;
};

export function vpFact(loop: CpmLoop, readiness: Pick<CpmReadiness, 'checks'> | undefined): Fact & { advice: string | null } {
  const c = inputContextOf(loop)!;
  if (c.vp === 'NOT_INSTALLED') return { pill: ['muted', '—', 'Not installed'], advice: null };
  if (c.vp === 'NOT_APPLICABLE') return { pill: ['muted', '—', 'Not applicable'], advice: null };
  const check = checkOf(readiness, 'tag_vp');
  if (c.vpMapped) {
    return check?.state === 'TEMPORARILY_UNAVAILABLE'
      ? { pill: ['warn', '!', 'Mapped · no samples'], advice: check.message ?? null }
      : { pill: ['good', '✓', 'Mapped'], advice: null };
  }
  return { pill: ['warn', '!', 'Expected · not mapped'], advice: adviceOf(readiness, 'tag_vp') };
}

export function peerFact(loop: CpmLoop, readiness: Pick<CpmReadiness, 'checks'> | undefined): Fact {
  if (loop.links.length > 0) return { text: loop.links.map(l => `${l.relType} → ${l.toLoopId}`).join(', ') };
  const a = peerApplicabilityOf(loop);
  if (a === 'NOT_APPLICABLE') return { pill: ['muted', '—', 'Not applicable'], advice: null };
  if (a === 'NOT_INSTALLED') return { pill: ['muted', '—', 'Not installed'], advice: null };
  return { pill: ['warn', '!', 'None · expected'], advice: adviceOf(readiness, 'peer_links') };
}

/** Checks that are not met, by name with their message; a fact that does not apply here is not a gap. */
export function missingFields(readiness: Pick<CpmReadiness, 'checks'> | undefined): Array<{ id: string; label: string; message: string | null }> {
  return (readiness?.checks ?? [])
    .filter(c => !c.ok && c.state !== 'NOT_APPLICABLE' && c.state !== 'NOT_INSTALLED')
    .map(c => ({ id: c.id, label: c.label, message: c.message }));
}

/** The unmet checks without a row of their own: the signal roles are in Signals, VP and peers in their rows. */
export const otherChecks = (readiness: Pick<CpmReadiness, 'checks'> | undefined) =>
  missingFields(readiness).filter(c => !c.id.startsWith('tag_') && c.id !== 'peer_links');

const ROW_FLAGS = new Set(['NO_VP', 'NO_UPSTREAM_LINKS', 'NO_PEER_LINKS']);
/** Observability flags other than the valve position and peer links, which have rows of their own. */
export const otherFlags = (loop: CpmLoop): string[] => (loop.observabilityFlags ?? []).filter(f => !ROW_FLAGS.has(f));

export interface SignalRow { role: string; path: string | null; advice: string | null }

/** Signal roles in the order the registry contract lists them; unknown roles last. */
const ROLE_ORDER = ['PV', 'SP', 'OP', 'MODE', 'VP'];
const REQUIRED = ['PV', 'SP', 'OP', 'MODE'];

export function signalRows(loop: CpmLoop, readiness: Pick<CpmReadiness, 'checks'> | undefined): SignalRow[] {
  const mapped = new Map(Object.entries(loop.tags ?? {}).filter(([, p]) => !!p).map(([r, p]) => [r.toUpperCase(), p]));
  const roles = [...new Set([...REQUIRED, ...mapped.keys()])];
  const rank = (r: string) => { const i = ROLE_ORDER.indexOf(r); return i === -1 ? ROLE_ORDER.length : i; };
  return roles.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map(role => {
    const path = mapped.get(role) ?? null;
    return { role, path, advice: path ? null : adviceOf(readiness, `tag_${role.toLowerCase()}`) };
  });
}

/** The path under the loop's plant path, as "…/fic10401.pv"; a path elsewhere stays whole. */
export function shortPath(path: string, loop: Pick<CpmLoop, 'site' | 'area' | 'unit'>): string {
  const prefix = `${[loop.site, loop.area, loop.unit].filter(Boolean).join('/')}/`;
  return prefix.length > 1 && path.toLowerCase().startsWith(prefix.toLowerCase()) ? `…/${path.slice(prefix.length)}` : path;
}
