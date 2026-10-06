/**
 * CHG-063: Loop Events paged on the server (cplm-api `GET /events/page`) and one episode by id (`GET /events/{id}`).
 * State tab, loop, plant scope and free text are applied in SQL; `counts` is every tab's count under the same
 * loop / scope / search, so tab counts describe every matching episode, not a fetched slice.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';
import type { CpmEventFrame, CpmShelvePolicy } from '../cpmApi';
import type { EventFilterKey } from '../../components/Cpm/events/shelfState';

export interface CpmEventPageQuery {
  state: EventFilterKey;
  loopId?: string;
  q?: string;
  site?: string;
  area?: string;
  unit?: string;
  sort: 'triage' | 'recent';
  /** 1-based. */
  page: number;
  pageSize: number;
}

export interface CpmEventPage {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  state: EventFilterKey;
  sort: 'triage' | 'recent';
  counts: Record<EventFilterKey, number>;
  shelvePolicy?: CpmShelvePolicy;
  events: CpmEventFrame[];
}

export function eventPageParams(q: CpmEventPageQuery): URLSearchParams {
  const p = new URLSearchParams({ state: q.state, sort: q.sort, page: String(q.page), pageSize: String(q.pageSize) });
  for (const k of ['loopId', 'q', 'site', 'area', 'unit'] as const) {
    const v = q[k]?.trim();
    if (v) p.set(k, v);
  }
  return p;
}

export const getEventPage = (q: CpmEventPageQuery, signal?: AbortSignal) =>
  apiJson<CpmEventPage>(`${CPM_BASE}/events/page?${eventPageParams(q).toString()}`, { signal });

export const getEvent = (id: number, signal?: AbortSignal) =>
  apiJson<CpmEventFrame>(`${CPM_BASE}/events/${id}`, { signal });
