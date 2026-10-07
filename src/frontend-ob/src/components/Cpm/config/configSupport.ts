/**
 * v2.5 Task 3D.1: presentation-only helpers for the configuration workspace - state tones, value
 * text, and the typed parsing of an editor input against the catalogue entry (a fraction unit
 * refuses a percent, an integer refuses 2.5, an enum refuses a value outside its vocabulary). The
 * server validates again; this only keeps an obviously wrong value from being sent.
 */
import type { CpmTone } from '../shared';
import type { CatalogueEntry, DeploymentState, EffectiveConfig } from '../../../api/cpm/config';

export function bundleStateTone(state: string | null | undefined): CpmTone {
  switch (state) {
    case 'ACTIVE_VERIFIED': return 'good';
    case 'APPROVED': case 'VALIDATED': case 'SHADOW_EVALUATED': case 'PREPARED': case 'SCHEDULED': return 'warn';
    case 'REJECTED': case 'ACTIVATION_FAILED': case 'PARTIALLY_ACKNOWLEDGED': case 'EXPIRED': return 'bad';
    default: return 'muted';
  }
}

/** CHG-066: ACTIVE_VERIFIED by the ACK-window fallback (no loop in scope produced a result) is active but not proven. */
const verifiedByResult = (d: { probeResults?: unknown }) =>
  ((d.probeResults ?? null) as { verifiedBy?: string; pinnedResults?: number } | null)?.verifiedBy !== 'ACK_WINDOW';

export function deploymentStateTone(state: DeploymentState | string | null | undefined, d?: { probeResults?: unknown }): CpmTone {
  switch (state) {
    case 'ACTIVE_VERIFIED': return !d || verifiedByResult(d) ? 'good' : 'warn';
    case 'ACTIVATION_FAILED': case 'PARTIALLY_ACKNOWLEDGED': return 'bad';
    case 'ROLLED_BACK': return 'muted';
    default: return 'warn';
  }
}

/** The operator-facing label of a deployment state: what is happening and what it is not. */
export function deploymentStateText(d: { state: string; kind: string; error?: string | null; probeResults?: unknown }): string {
  switch (d.state) {
    case 'SCHEDULED': return 'Scheduled - PREPARE not yet broadcast';
    case 'PREPARING': return 'Preparing - waiting for every required worker to acknowledge the bundle';
    case 'PREPARED': return 'Prepared - every worker holds the bundle; APPLY is being broadcast';
    case 'APPLYING': return 'Applying - waiting for the workers to switch at the effective time (warm-up after a state boundary)';
    case 'PROBING': return 'Probing - applied everywhere; waiting for a result pinned to this bundle hash';
    case 'ACTIVE_VERIFIED':
      if (!verifiedByResult(d)) return 'Active - applied by every worker; not yet verified by a result (no loop in scope produced one in the probe window)';
      return d.kind === 'ROLLBACK' ? 'Rollback verified - the previous bundle is active again' : 'Active and verified - a result carries this bundle hash';
    case 'PARTIALLY_ACKNOWLEDGED': return `Partially acknowledged - NOT active (${d.error ?? 'a required worker did not answer'})`;
    case 'ACTIVATION_FAILED': return `Activation failed - NOT active (${d.error ?? 'a worker refused the bundle'})`;
    case 'ROLLED_BACK': return 'Rolled back - superseded by a later deployment of the previous bundle';
    default: return d.state;
  }
}

export const shortHash = (h: string | null | undefined, n = 12): string => (h ? h.slice(0, n) : '—');

export function valueText(v: unknown): string {
  if (v === null || v === undefined) return 'NO_VALUE';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(10)));
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.length === 0 ? '[]' : v.map(String).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export const isFractionUnit = (unit: string): boolean => /fraction|ratio/i.test(unit) && !/percent|%/i.test(unit);

/** The typed value an input text stands for, or the reason it cannot be sent. */
export function parseInput(entry: CatalogueEntry, text: string): { value?: unknown; error?: string } {
  const t = text.trim();
  if (t === '') return { error: 'A value is required (use Reset to inherit instead).' };
  switch (entry.type) {
    case 'number':
    case 'integer': {
      if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return { error: 'Not a finite number.' };
      const n = Number(t);
      if (!Number.isFinite(n)) return { error: 'Not a finite number.' };
      if (entry.type === 'integer' && !Number.isInteger(n)) return { error: 'Must be an integer.' };
      const v = entry.validation as Record<string, unknown>;
      const min = typeof v.minimum === 'number' ? v.minimum : undefined;
      const max = typeof v.maximum === 'number' ? v.maximum : undefined;
      if (isFractionUnit(entry.unit) && n > 1 && (max === undefined || max <= 1)) return { error: `${entry.unit}: a fraction, not a percent (0.5, not 50).` };
      if (min !== undefined && n < min) return { error: `Below the minimum ${min}.` };
      if (max !== undefined && n > max) return { error: `Above the maximum ${max}.` };
      return { value: n };
    }
    case 'boolean':
      if (t === 'true') return { value: true };
      if (t === 'false') return { value: false };
      return { error: 'true or false.' };
    case 'enum': {
      const allowed = Array.isArray(entry.validation) ? (entry.validation as string[]) : [];
      return allowed.length === 0 || allowed.includes(t) ? { value: t } : { error: `One of ${allowed.join(', ')}.` };
    }
    case 'string_array': {
      const items = t.split(',').map(s => s.trim()).filter(Boolean);
      const v = entry.validation as Record<string, unknown>;
      if (typeof v.minItems === 'number' && items.length < v.minItems) return { error: `At least ${v.minItems} item(s).` };
      if (typeof v.maxItems === 'number' && items.length > v.maxItems) return { error: `At most ${v.maxItems} item(s).` };
      return { value: items };                                             // the whole array replaces the inherited one
    }
    default:
      return { value: t };
  }
}

/** The layer a bundle edits (its own scope); the property values it explicitly sets. */
export function ownLayerContent(layers: Array<{ kind: string; content: Record<string, unknown> }>, scopeKind: string): Record<string, unknown> {
  return layers.find(l => l.kind === scopeKind)?.content ?? {};
}

/** Properties whose value differs between two resolved blocks (the diff of a draft against its parent or the effective config). */
export function diffProperties(before: Record<string, unknown>, after: Record<string, unknown>): Array<{ property: string; before: unknown; after: unknown }> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: Array<{ property: string; before: unknown; after: unknown }> = [];
  for (const k of [...keys].sort()) {
    const b = before[k], a = after[k];
    if (JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)) out.push({ property: k, before: b, after: a });
  }
  return out;
}

// ── 2026-09-18 Gate Configuration redesign: the effective configuration in words ────────────────
export interface LayerCard { kind: 'FACTORY' | 'SITE' | 'PROFILE' | 'LOOP'; ref: string; count: number; present: boolean; origin: string }

/** The layers a loop resolves through, bottom-up, each with what it sets; a missing level is stated as "no bundle". */
const LAYER_KINDS = new Set(['FACTORY', 'SITE', 'PROFILE', 'LOOP', 'REGIME']);
/** A source that names no layer (NO_VALUE: the property is unset everywhere) sets nothing. */
export const isLayerSource = (src: string | undefined): boolean => !!src && LAYER_KINDS.has(src);

export function layerStack(eff: EffectiveConfig): LayerCard[] {
  const counts: Record<string, number> = {};
  for (const src of Object.values(eff.sources)) if (isLayerSource(src)) counts[src] = (counts[src] ?? 0) + 1;
  const b = eff.bundle;
  const bundleAt = (kind: string) => (b && b.scopeKind === kind ? `bundle ${bundleLabel(b)}` : null);
  return [
    { kind: 'FACTORY', ref: 'shipped', count: counts.FACTORY ?? 0, present: true, origin: 'shipped defaults' },
    { kind: 'PROFILE', ref: eff.profileId, count: counts.PROFILE ?? 0, present: (counts.PROFILE ?? 0) > 0 || bundleAt('PROFILE') != null, origin: bundleAt('PROFILE') ?? 'class pack' },
    { kind: 'SITE', ref: eff.site, count: counts.SITE ?? 0, present: (counts.SITE ?? 0) > 0 || bundleAt('SITE') != null, origin: bundleAt('SITE') ?? 'no bundle' },
    { kind: 'LOOP', ref: eff.loopId, count: counts.LOOP ?? 0, present: (counts.LOOP ?? 0) > 0 || bundleAt('LOOP') != null, origin: bundleAt('LOOP') ?? 'no bundle' },
  ];
}

/** Per gate (in catalogue order of appearance): how many properties it has and how many a layer above FACTORY sets. */
export function overridesByGate(eff: EffectiveConfig): Record<string, { total: number; overridden: number }> {
  const out: Record<string, { total: number; overridden: number }> = {};
  for (const key of Object.keys(eff.properties)) {
    const gate = key.split('.')[0];
    const g = (out[gate] ??= { total: 0, overridden: 0 });
    g.total++;
    const src = eff.sources[key];
    if (isLayerSource(src) && src !== 'FACTORY') g.overridden++;
  }
  return out;
}

/** One line for the workers: applied ACKs, jar count, catalogue agreement - and its tone. */
export function workersSummary(eff: EffectiveConfig): { text: string; tone: CpmTone } {
  // an observer reads no property and never acknowledges: it is neither counted nor blamed
  const ws = eff.workers.filter(w => w.required !== false);
  const jars = [...new Set(ws.map(w => w.jarSha256))];
  const jarText = jars.length === 1 ? `one jar ${shortHash(jars[0], 8)}` : `${jars.length} jars`;
  const catalogueOff = eff.bundle ? ws.filter(w => w.catalogueHash !== eff.bundle!.catalogueHash).length : 0;
  if (!eff.bundle) return { text: `${ws.length} worker${ws.length === 1 ? '' : 's'} on ${jarText} · factory layer (nothing to acknowledge)`, tone: jars.length > 1 ? 'warn' : 'muted' };
  const applied = ws.filter(w => w.ack?.status === 'ACK' && w.ack.bundleHash === eff.bundle!.contentHash).length;
  const parts = [`${applied} of ${ws.length} applied`, jarText, catalogueOff ? `catalogue differs on ${catalogueOff}` : 'catalogue matches'];
  const bad = applied < ws.length || jars.length > 1 || catalogueOff > 0;
  return { text: parts.join(' · '), tone: bad ? 'bad' : 'good' };
}

/** "LOOP v2 · f9153b00" - how a bundle is named everywhere on the page; null is the factory layer. */
export const bundleLabel = (b: { scopeKind: string; version: number; contentHash: string } | null | undefined): string =>
  b ? `${b.scopeKind} v${b.version} · ${shortHash(b.contentHash, 8)}` : 'factory layer';
