/**
 * CHG-218: the model review shortlist (cplm-api CHG-109, GET /models/review-queue): one row per active loop and path with a
 * validated model nobody has reviewed yet - the newest one, the baseline it would replace, and how many more wait.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';

export interface ReviewModelSummary {
  modelId: string; revision: number; family: string; modelState: string; createdAt: string; createdFromEvent: string | null;
  gain: number | null; timeConstant: number | null; deadTime: number | null; fitImprovement: number | null; validationRmse: number | null;
}

export interface ReviewQueueRow {
  loopId: string; displayName: string; loopType: string; site: string; pathId: string;
  candidate: ReviewModelSummary; baseline: ReviewModelSummary | null; pendingCount: number; lastReviewedAt: string | null;
}

export const getReviewQueue = (site: string | undefined, limit = 200, signal?: AbortSignal) => {
  const p = new URLSearchParams({ limit: String(limit) });
  if (site) p.set('site', site);
  return apiJson<{ count: number; rows: ReviewQueueRow[] }>(`${CPM_BASE}/models/review-queue?${p.toString()}`, { signal });
};
