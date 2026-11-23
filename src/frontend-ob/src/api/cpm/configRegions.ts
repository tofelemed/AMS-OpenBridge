/**
 * CHG-219: per-loop settings - operating regions in bulk, their batches (approve / deploy), and the loops whose own settings sit on
 * an older plant-wide base (re-stack). Mirrors cplm-api CHG-108, base /api/v1/cpm/configuration.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';
import { send } from './config';

/** Where a loop's region comes from: its own LOOP bundle, a plant-wide PROFILE / SITE bundle, or nowhere. */
export type RegionSource = 'LOOP' | 'PROFILE' | 'SITE' | 'NONE';

export interface LoopRegion {
  loopId: string; displayName: string | null; loopType: string | null; site: string;
  pvRangeMin: number | null; pvRangeMax: number | null; regionMin: number | null; regionMax: number | null;
  source: RegionSource; bundleId: string | null; bundleVersion: number | null;
  /** The loop's own version is a marker that says it uses the plant-wide settings (CHG-223). */
  inherits?: boolean;
}
export interface RegionsPage { count: number; loops: LoopRegion[] }

export interface BatchRow {
  loopId: string; site: string; bundleId: string | null; version: number | null; state: string;
  pvMin: number | null; pvMax: number | null; previousMin: number | null; previousMax: number | null;
  error: string | null; problems: string[]; deploymentId: string | null; deploymentState: string | null;
  /** The draft author's username. */
  createdBy?: string | null;
  /** The row is a marker: the loop uses the plant-wide settings (CHG-223). */
  inherits?: boolean;
}
export interface BatchResult { batchId: string; count: number; drafts?: number; failed: number; rows: BatchRow[] }
/** `createdBy`: the author's username; with the viewer's role it decides Approve / "Approve alone (Admin)" (the server enforces the same rule). */
export interface Batch { batchId: string; site: string; count: number; rows: BatchRow[]; createdBy?: string | null }

export interface StaleLoop {
  loopId: string; displayName: string | null; loopType: string | null; bundleId: string; version: number;
  base: 'PROFILE' | 'SITE' | 'FACTORY'; baseBundleId: string | null; baseVersion: number | null; ownProperties: string[];
}
export interface StalePage { site: string; count: number; loops: StaleLoop[] }

export interface RegionChange { loopId: string; pvMin: number | null; pvMax: number | null }

const q = (site: string) => `site=${encodeURIComponent(site)}`;

// cplm-api leaves null fields out of its answers: an absent region must read null, or `undefined !== null` counts as a change
const LOOP_NULLS = { displayName: null, loopType: null, pvRangeMin: null, pvRangeMax: null, regionMin: null, regionMax: null, bundleId: null, bundleVersion: null };
const ROW_NULLS = { bundleId: null, version: null, pvMin: null, pvMax: null, previousMin: null, previousMax: null, error: null, deploymentId: null, deploymentState: null, createdBy: null };
const fullRow = (r: Partial<BatchRow>): BatchRow => ({ ...ROW_NULLS, ...r, problems: r.problems ?? [] } as BatchRow);
const fullRows = <T extends { rows: BatchRow[] }>(b: T): T => ({ ...b, rows: (b.rows ?? []).map(fullRow) });

export const getRegions = async (site: string, signal?: AbortSignal): Promise<RegionsPage> => {
  const page = await apiJson<RegionsPage>(`${CPM_BASE}/configuration/regions?${q(site)}`, { signal });
  return { ...page, loops: (page.loops ?? []).map(l => ({ ...LOOP_NULLS, ...l })) };
};

/** Changed rows only; both values null clears the loop's own region. One batch for all of them. */
export const postRegions = (regions: RegionChange[], note: string) => send<BatchResult>('/configuration/regions', 'POST', { regions, note }).then(fullRows);

export const getStaleLoops = (site: string, signal?: AbortSignal) =>
  apiJson<StalePage>(`${CPM_BASE}/configuration/loop-settings/stale?${q(site)}`, { signal });

export const restackLoops = (site: string, note: string, loopIds?: string[]) =>
  send<BatchResult>('/configuration/loop-settings/restack', 'POST', { site, note, ...(loopIds ? { loopIds } : {}) }).then(fullRows);

export const getBatch = (batchId: string, site: string, signal?: AbortSignal) =>
  apiJson<Batch>(`${CPM_BASE}/configuration/batches/${encodeURIComponent(batchId)}?${q(site)}`, { signal }).then(fullRows);

export const approveBatch = (batchId: string, site: string, note: string, validityHours = 72) =>
  send<{ approved: number; failed: number; rows: BatchRow[] }>(`/configuration/batches/${encodeURIComponent(batchId)}/approve?${q(site)}`, 'POST', { note, validityHours }).then(fullRows);

export const deployBatch = (batchId: string, site: string) =>
  send<{ scheduled: number; failed: number; rows: BatchRow[] }>(`/configuration/batches/${encodeURIComponent(batchId)}/deploy?${q(site)}`, 'POST').then(fullRows);

/** CHG-223: loops give up their own settings and use the plant-wide ones. One batch (approve / deploy as any other). */
export const inheritLoops = (site: string, loopIds: string[], note: string) =>
  send<BatchResult>('/configuration/loop-settings/inherit', 'POST', { site, loopIds, note }).then(fullRows);
