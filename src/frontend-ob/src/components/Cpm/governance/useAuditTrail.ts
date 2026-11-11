/**
 * CHG-174 (owner answer 2): the trail pages through every event on the server, 25 a page, newest first; it read the newest 200
 * and paged them in the browser. Entity, user, event type and the time range ask the server; Find searches only the rows fetched
 * (the page shown). An older audit-service ignores `offset` and answers without it: the trail then falls back to today's read
 * (the newest 200, paged here) and says so, so a page number never shows the first page's rows again.
 */
import { useEffect, useMemo, useState } from 'react';
import type { AuditEventRow, AuditQuery } from '../../../api/auditApi';
import { useAuditEvents } from '../../../hooks/useAudit';
import { actionView, actorView, entityName, entityOne } from './auditCatalog';

export const PAGE_SIZE = 25;
/** What the trail read before the service paged, and still reads from an older service. */
export const LEGACY_TAKE = 200;

export interface TrailFilters { entityType: string; eventType: string; user: string; from?: string; to?: string }

const words = (e: AuditEventRow) => [actorView(e.userId).text, actionView(e).label, entityName(e), entityOne(e.entityType), e.entityId, e.eventType];

/** Find: the rows whose actor, action, entity (words or code) hold the text, ignoring case. */
export function findRows(rows: readonly AuditEventRow[], text: string): AuditEventRow[] {
  const q = text.trim().toLowerCase();
  return q ? rows.filter(e => words(e).some(v => v.toLowerCase().includes(q))) : [...rows];
}

export function useAuditTrail(filters: TrailFilters, search: string, page: number, enabled: boolean) {
  const [legacy, setLegacy] = useState(false);
  const base: AuditQuery = {
    entityType: filters.entityType || undefined,
    eventType: filters.eventType || undefined,
    userId: filters.user || undefined,
    from: filters.from,
    to: filters.to,
  };
  const query: AuditQuery = legacy ? { ...base, take: LEGACY_TAKE } : { ...base, take: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  const audit = useAuditEvents(query, 30_000, enabled);
  const data = audit.data;
  useEffect(() => { if (data && typeof data.offset !== 'number') setLegacy(true); }, [data]);

  const view = useMemo(() => {
    const fetched = data?.events ?? [];
    const total = data?.total ?? 0;
    const found = findRows(fetched, search);
    if (!legacy) return { rows: found, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, fetched: fetched.length };
    const pageCount = Math.max(1, Math.ceil(found.length / PAGE_SIZE));
    const safe = Math.min(page, pageCount);
    return { rows: found.slice((safe - 1) * PAGE_SIZE, safe * PAGE_SIZE), pageCount, total, fetched: fetched.length };
  }, [data, search, legacy, page]);

  return { ...view, legacy, audit };
}
