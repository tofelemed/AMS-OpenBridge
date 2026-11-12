/**
 * CHG-176 (owner, 12 Nov 2026): how far a Designer display trusts a binding.
 *
 * The binding resolver answers `provenance: "asset-model"` for a registered path and `"fallback"` when the asset model
 * was slow, down, or did not know the path; a fallback is derived from the path string and still says `resolved: true`.
 * Its derivation follows the asset model's naming rules, so most tags land right, but it cannot see per-asset overrides,
 * and CPLM loop signals never live at the derived address.
 *
 *  - asset-model  : used as today.
 *  - fallback     : the value from the derived path is shown, its NE107 quality at best Uncertain.
 *  - loop-unread  : a fallback on a registered loop's signal; nothing is read, Uncertain with no value. Also used while
 *                   the loop registry has not answered, so a loop signal never shows a wrong value even briefly.
 *
 * A registry that cannot be read (or may not be read) leaves every fallback at "fallback". Pure; no React. The quality
 * shown for a trust level is qualityWithTrust in ./quality (kept there: this module is also reached by the CPA Trend
 * page, which must not pull in the NE107 colour table).
 */

export type BindingTrust = 'asset-model' | 'fallback' | 'loop-unread';

/** The reason a value is not trusted, given once in the value's tooltip or detail. */
export const TRUST_REASON: Record<Exclude<BindingTrust, 'asset-model'>, string> = {
  fallback: 'Binding not confirmed by the asset model',
  'loop-unread': 'Loop signal not resolved: the asset model did not answer',
};

/** What the CPA loop registry says about loop signals: not asked, asked, known, or not to be had. */
export type LoopSignalLookup =
  | { status: 'idle' | 'pending' | 'unavailable' }
  | { status: 'ready'; signals: ReadonlySet<string> };

/** Registry paths and display paths are compared trimmed and case-blind (a near miss must not unhide a loop signal). */
export const normPath = (p: string) => p.trim().toLowerCase();

/** Every signal of every loop (each value of its `tags` map: PV, SP, OP, MODE, VP ...), normalised. */
export function loopSignalSet(loops: ReadonlyArray<{ tags?: Record<string, string> | null }>): Set<string> {
  const out = new Set<string>();
  for (const l of loops) for (const t of Object.values(l.tags ?? {})) if (t) out.add(normPath(t));
  return out;
}

export const isFallbackBinding = (b: { provenance?: string } | null | undefined): boolean => b?.provenance === 'fallback';

/** The trust of one bound path, from the resolver's answer and the loop registry. */
export function bindingTrust(path: string | undefined, binding: { provenance?: string } | null | undefined, lookup: LoopSignalLookup): BindingTrust {
  if (!path || !isFallbackBinding(binding)) return 'asset-model';
  if (lookup.status === 'unavailable') return 'fallback';
  if (lookup.status === 'ready') return lookup.signals.has(normPath(path)) ? 'loop-unread' : 'fallback';
  return 'loop-unread';
}

const RANK: Record<BindingTrust, number> = { 'asset-model': 0, fallback: 1, 'loop-unread': 2 };

/** The least trusted of several values (a symbol shows one quality for all of them). */
export function worstTrust(list: readonly BindingTrust[]): BindingTrust {
  let worst: BindingTrust = 'asset-model';
  for (const t of list) if (RANK[t] > RANK[worst]) worst = t;
  return worst;
}

/** The reason for a trust level, or undefined when the binding is trusted. */
export const trustReason = (t: BindingTrust): string | undefined => (t === 'asset-model' ? undefined : TRUST_REASON[t]);
