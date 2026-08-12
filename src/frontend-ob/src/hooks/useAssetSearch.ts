// Phase 4 — the single asset-search hook behind collections / dynamic search criteria.
// Calls the asset-model POST /assets/search (structural: root, descendants, level, template).
// Auto-refetches so a collection updates as assets are added/removed (I11).
import { useQuery } from '@tanstack/react-query';
import { apiFetch, backgroundPoll } from '../api/apiFetch';
import type { CollectionCriteria } from '../components/Designer/types';

const ASSET_API = (import.meta.env.VITE_ASSET_SERVICE_URL as string | undefined) || '/api/assets';

export interface SearchedAsset {
  id: string;
  contextualPath: string;
  name: string;
  type: number;
  template?: string;
}

export function useAssetSearch(criteria: CollectionCriteria, enabled = true) {
  return useQuery({
    queryKey: ['asset-search', criteria],
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    // H2: 30s interval poll — must not extend the idle-session clock.
    queryFn: backgroundPoll(async (): Promise<SearchedAsset[]> => {
      const res = await apiFetch(`${ASSET_API}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root: criteria.root || undefined,
          returnAllDescendants: !!criteria.returnAllDescendants,
          assetType: criteria.assetType ?? undefined,
          template: criteria.template || undefined,
          take: 200,
        }),
      });
      if (!res.ok) throw new Error('asset search failed');
      const data = await res.json() as { assets?: SearchedAsset[] };
      return data.assets ?? [];
    }),
  });
}
