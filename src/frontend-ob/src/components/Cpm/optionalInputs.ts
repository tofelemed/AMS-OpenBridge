/**
 * SME review #23 (CHG-059): optional inputs (valve position VP, peer links for G13) read by their applicability —
 * the same rule as cplm-api's OptionalInputs (registry `engineering.vpApplicability` / `peerApplicability`, else VP
 * from the command path: a drive or a direct action on PV has no valve). It turns the engine's one `NO_VP` /
 * `NO_UPSTREAM_LINKS` flag into the sentence that is true for THIS loop: a configuration gap only where the input is
 * expected; otherwise the plant fact and the diagnosis it limits.
 */
import type { CpmLoop } from '../../api/cpmApi';

export type Applicability = 'EXPECTED' | 'NOT_INSTALLED' | 'NOT_APPLICABLE';

export interface InputContext {
  vp: Applicability;
  /** A VP tag is mapped in the registry. */
  vpMapped: boolean;
  peers: Applicability;
}

const norm = (v: unknown): Applicability | null => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return s === 'EXPECTED' || s === 'NOT_INSTALLED' || s === 'NOT_APPLICABLE' ? s : null;
};

export function vpApplicabilityOf(loop: Pick<CpmLoop, 'engineering' | 'model'> | undefined | null): Applicability {
  const declared = norm(loop?.engineering?.vpApplicability);
  if (declared) return declared;
  const path = (loop?.model?.commandPath ?? '').toUpperCase();
  return path === 'OP_TO_VFD' || path === 'OP_TO_PV' ? 'NOT_APPLICABLE' : 'EXPECTED';
}

export function peerApplicabilityOf(loop: Pick<CpmLoop, 'engineering'> | undefined | null): Applicability {
  return norm(loop?.engineering?.peerApplicability) ?? 'EXPECTED';
}

export function inputContextOf(loop: (Pick<CpmLoop, 'engineering' | 'model'> & { tags?: Record<string, string> }) | undefined | null): InputContext | undefined {
  if (!loop) return undefined;
  const tags = loop.tags ?? {};
  return {
    vp: vpApplicabilityOf(loop),
    vpMapped: Object.keys(tags).some(k => k.toUpperCase() === 'VP' && !!tags[k]),
    peers: peerApplicabilityOf(loop),
  };
}

/** The limitation a flag means on this loop; null = not an optional-input flag (the caller keeps its own text). */
export function optionalInputLimitation(flag: string, ctx: InputContext | undefined): string | null {
  if (!ctx) return null;
  if (flag === 'NO_VP') {
    if (ctx.vp === 'NOT_APPLICABLE') return 'No valve on this loop: valve (stiction) diagnosis does not apply';
    if (ctx.vp === 'NOT_INSTALLED') return 'No positioner feedback installed: a valve (stiction) cause can be suspected, not confirmed';
    if (ctx.vpMapped) return 'Valve position mapped but no samples in this window: a valve cause cannot be confirmed until it returns';
    return 'Valve position expected but not mapped: map its tag so a valve (stiction) cause can be confirmed';
  }
  if ((flag === 'NO_UPSTREAM_LINKS' || flag === 'NO_PEER_LINKS') && ctx.peers !== 'EXPECTED')
    return 'No interacting loops: peer interaction (G13) does not apply';
  return null;
}

export const APPLICABILITY_OPTIONS: Array<{ value: '' | Applicability; label: string }> = [
  { value: '', label: 'Derive (from the command path)' },
  { value: 'EXPECTED', label: 'Expected' },
  { value: 'NOT_INSTALLED', label: 'Not installed' },
  { value: 'NOT_APPLICABLE', label: 'Not applicable' },
];

type LoopLike = Pick<CpmLoop, 'engineering' | 'model'> & { tags?: Record<string, string> };

/** Registry table cell: one word per state, so "not mapped" is the gap and the facts read as facts. */
export function vpCellLabel(loop: LoopLike): string {
  const c = inputContextOf(loop)!;
  if (c.vpMapped) return 'Mapped';
  return c.vp === 'NOT_APPLICABLE' ? 'No valve' : c.vp === 'NOT_INSTALLED' ? 'Not installed' : 'Not mapped';
}

/** Registry detail row for an unmapped VP: what it means on this loop. */
export function vpDetail(loop: LoopLike): string {
  const c = inputContextOf(loop)!;
  if (c.vp === 'NOT_APPLICABLE') return 'No valve on this loop — valve diagnosis does not apply';
  if (c.vp === 'NOT_INSTALLED') return 'No positioner feedback installed — a valve cause can be suspected, not confirmed';
  return 'Expected but not mapped — G14 cannot confirm a final-element fault';
}

/** Registry detail row when a loop has no peer links. */
export const peerDetail = (loop: Pick<CpmLoop, 'engineering'>): string =>
  peerApplicabilityOf(loop) === 'EXPECTED' ? 'None — expected; G13 not evaluated' : 'None — no interacting loops (G13 does not apply)';
