/**
 * v2.5 Task 3D.1: presentation-only helpers for the configuration workspace - state tones, value
 * text, and the typed parsing of an editor input against the catalogue entry (a fraction unit
 * refuses a percent, an integer refuses 2.5, an enum refuses a value outside its vocabulary). The
 * server validates again; this only keeps an obviously wrong value from being sent.
 */
import type { CpmTone } from '../shared';
import type { CatalogueEntry, DeploymentState } from '../../../api/cpm/config';

export function bundleStateTone(state: string | null | undefined): CpmTone {
  switch (state) {
    case 'ACTIVE_VERIFIED': return 'good';
    case 'APPROVED': case 'VALIDATED': case 'SHADOW_EVALUATED': case 'PREPARED': case 'SCHEDULED': return 'warn';
    case 'REJECTED': case 'ACTIVATION_FAILED': case 'PARTIALLY_ACKNOWLEDGED': case 'EXPIRED': return 'bad';
    default: return 'muted';
  }
}

export function deploymentStateTone(state: DeploymentState | string | null | undefined): CpmTone {
  switch (state) {
    case 'ACTIVE_VERIFIED': return 'good';
    case 'ACTIVATION_FAILED': case 'PARTIALLY_ACKNOWLEDGED': return 'bad';
    case 'ROLLED_BACK': return 'muted';
    default: return 'warn';
  }
}

/** The operator-facing label of a deployment state: what is happening and what it is not. */
export function deploymentStateText(d: { state: string; kind: string; error?: string | null }): string {
  switch (d.state) {
    case 'SCHEDULED': return 'Scheduled - PREPARE not yet broadcast';
    case 'PREPARING': return 'Preparing - waiting for every required worker to acknowledge the bundle';
    case 'PREPARED': return 'Prepared - every worker holds the bundle; APPLY is being broadcast';
    case 'APPLYING': return 'Applying - waiting for the workers to switch at the effective time (warm-up after a state boundary)';
    case 'PROBING': return 'Probing - applied everywhere; waiting for a result pinned to this bundle hash';
    case 'ACTIVE_VERIFIED': return d.kind === 'ROLLBACK' ? 'Rollback verified - the previous bundle is active again' : 'Active and verified - a result carries this bundle hash';
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
