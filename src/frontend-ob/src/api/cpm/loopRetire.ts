/**
 * CHG-146: retire and restore a loop. Retire is never a delete: tags, links, bindings and all history stay,
 * and the loop can be restored. A reason is required to retire and is written into the audit event.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';

export interface LoopRetireResult {
  loopId: string;
  retired: boolean;
  /** false when the loop was already in the asked state: nothing was written. */
  changed: boolean;
  note?: string | null;
}

const loopUrl = (loopId: string, action: 'retire' | 'restore') =>
  `${CPM_BASE}/loops/${encodeURIComponent(loopId)}/${action}`;

export const retireLoop = ({ loopId, reason }: { loopId: string; reason: string }) =>
  apiJson<LoopRetireResult>(loopUrl(loopId, 'retire'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });

export const restoreLoop = ({ loopId, reason }: { loopId: string; reason?: string }) =>
  apiJson<LoopRetireResult>(loopUrl(loopId, 'restore'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
