/**
 * CHG-179 — GET /api/v1/cpm/loops/signal-paths: every registered loop's signal paths, trimmed, lower-cased,
 * de-duplicated and sorted by the server. Allowed for display.view OR analytics.view, so an operator's display can tell
 * a CPLM loop signal from a plain tag (CHG-176) without the right to read the loop registry. Weak ETag; 15 s server cache.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';

export interface CpmLoopSignalPaths {
  paths: string[];
  count: number;
  generatedAt: string;
}

export const getLoopSignalPaths = () => apiJson<CpmLoopSignalPaths>(`${CPM_BASE}/loops/signal-paths`);
