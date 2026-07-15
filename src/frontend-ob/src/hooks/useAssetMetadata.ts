// Phase 6 — read a tag's authoritative engineering unit and limits from the asset catalog.
// asset-model stores engineering_unit / lo_eng_limit / hi_eng_limit per measurement but nothing in the
// UI ever read them (the audit's "declared and read by nothing"). This hook surfaces them so:
//   • the real unit replaces TrendCore's regex-guessed unit (P1),
//   • gauges/trends/multi-state can inherit thresholds from the asset (G20 / E3.1),
// all still addressed by UNS path (bind-through-the-UNS holds).
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/apiFetch';

const ASSET_API = (import.meta.env.VITE_ASSET_SERVICE_URL as string | undefined) || '/api/assets';

export interface AssetMetadata {
  engineeringUnit?: string | null;
  loEngLimit?: number | null;
  hiEngLimit?: number | null;
}

async function fetchMeta(path: string): Promise<AssetMetadata> {
  const res = await apiFetch(`${ASSET_API}/by-path/${encodeURI(path)}`);
  if (!res.ok) return {};
  const a = await res.json() as AssetMetadata;
  return { engineeringUnit: a.engineeringUnit, loEngLimit: a.loEngLimit, hiEngLimit: a.hiEngLimit };
}

/** Fetch unit + engineering limits for a UNS path. Disabled when path is empty. */
export function useAssetMetadata(path?: string, enabled = true) {
  return useQuery({
    queryKey: ['asset-meta', path],
    enabled: enabled && !!path,
    staleTime: 5 * 60_000,
    queryFn: () => fetchMeta(path as string),
  });
}

/** Batch variant for multi-pen trends: returns a path → metadata map. */
export function useAssetMetadataBatch(paths: string[], enabled = true) {
  const key = paths.slice().sort().join('|');
  return useQuery({
    queryKey: ['asset-meta-batch', key],
    enabled: enabled && paths.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, AssetMetadata>> => {
      const entries = await Promise.all(paths.map(async p => [p, await fetchMeta(p)] as const));
      return Object.fromEntries(entries);
    },
  });
}
