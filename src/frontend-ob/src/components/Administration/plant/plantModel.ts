/**
 * The plant model's data and rules, shared by the tree, the node panel, the editor and the CSV importer (moved out of
 * PlantModelConfig.tsx in CHG-172 unchanged). Path segments are immutable identity (lowercase snake_case slugs; a `u` prefix
 * when a name starts with a digit, as IoTDB nodes must not); display names are freely editable. MIGRATION_LOG decision #17.
 */
import type { useQueryClient } from '@tanstack/react-query';
import { apiJson } from '../../../api/apiFetch';

export const ASSET_API = (import.meta.env.VITE_ASSET_SERVICE_URL as string | undefined) || '/api/assets';

// asset_type in the asset model.
export const TYPE_NAMES: Record<number, string> = { 1: 'Site', 2: 'Area', 3: 'Unit', 4: 'Device', 5: 'Measurement' };
export const CHILD_TYPE: Record<number, number | null> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: null };

export interface AssetNode {
  id: string;
  contextualPath: string;
  name: string;
  type: number;
  description?: string | null;
  engineeringUnit?: string | null;
  loEngLimit?: number | null;
  hiEngLimit?: number | null;
  template?: string | null;
  parentId?: string | null;
}

/** Path segment from a display name: lowercase, non-alnum → '_', collapsed; 'u' prefix when it starts with a digit. */
export function slugSegment(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return /^[0-9]/.test(s) ? `u${s}` : s;
}

export const SEGMENT_RX = /^[A-Za-z0-9_-]+$/;

export async function fetchAssets(params: string): Promise<AssetNode[]> {
  const data = await apiJson<{ assets?: AssetNode[] }>(`${ASSET_API}?${params}`);
  return data.assets ?? [];
}

export function invalidatePlantModel(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['plant-model'] });
  void qc.invalidateQueries({ queryKey: ['assets'] });
  void qc.invalidateQueries({ queryKey: ['cpm', 'filters'] });
  void qc.invalidateQueries({ queryKey: ['cpm', 'plant-locations'] });
}

/**
 * A node the CPM Loop Registry owns (transport overrides, lifecycle): the loop's device (CpmLoop) or one of its signals
 * (CpmLoopSignal). The projection names a device by its loopId and a signal "<loopId> <ROLE>", so the first word is the loop.
 */
export const isCpmNode = (n: AssetNode) => n.template === 'CpmLoop' || n.template === 'CpmLoopSignal';
export const loopIdOf = (n: AssetNode) => n.name.split(' ')[0];
