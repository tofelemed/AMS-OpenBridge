/**
 * The rule for where a new version starts from (moved out of DraftBundleDialog, CHG-169 / CHG-220): the version a draft of a level
 * starts from is that level's ACTIVE version, else its newest by number; a level's FIRST version starts from the active version of
 * the nearest level above (LOOP -> PROFILE -> SITE); none at all means the factory layers (a null parent). The server copies the
 * layers of the `parentBundleId` it is given, so the choice is the request's. Pure: no React.
 */
import type { BundleSummary, ScopeKind } from '../../../api/cpm/config';

export interface LevelData { ref: string; bundles: BundleSummary[]; loading: boolean; error: unknown; retry?: () => void }
export type Levels = Record<'LOOP' | 'PROFILE' | 'SITE', LevelData>;

export type DraftRequest = { scopeKind: ScopeKind; scopeRef: string | null; parentBundleId: string | null; note?: string };
export type Start = { kind: keyof Levels; bundle: BundleSummary };

export const ABOVE: Record<keyof Levels, (keyof Levels)[]> = { LOOP: ['PROFILE', 'SITE'], PROFILE: ['SITE'], SITE: [] };
export const newestFirst = (level: LevelData) => [...level.bundles].sort((a, b) => b.version - a.version);
export const activeOf = (level: LevelData) => newestFirst(level).find(v => v.state === 'ACTIVE_VERIFIED') ?? null;

/** The version a draft of this level starts from, or null (the factory layers). */
export function startsFrom(kind: keyof Levels, levels: Levels): Start | null {
  const own = levels[kind];
  const mine = activeOf(own) ?? newestFirst(own)[0];
  if (mine) return { kind, bundle: mine };
  for (const up of ABOVE[kind]) {
    const active = activeOf(levels[up]);
    if (active) return { kind: up, bundle: active };
  }
  return null;
}

export function draftRequest(kind: keyof Levels, levels: Levels, note: string): DraftRequest {
  const level = levels[kind];
  return { scopeKind: kind, scopeRef: kind === 'SITE' ? null : level.ref, parentBundleId: startsFrom(kind, levels)?.bundle.bundleId ?? null, note: note.trim() || undefined };
}
