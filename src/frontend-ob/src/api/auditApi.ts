/**
 * Audit-service client (immutable hash-chained trail). Routed via the /api/audit
 * proxy (nginx + vite) because /api/v1/* belongs to ams-api. Requires the
 * admin.audit.view permission server-side; callers should handle 403 honestly.
 */
import { apiJson } from './apiFetch';

export interface AuditEventRow {
  eventId: string;
  timestampUtc: string;
  eventType: string;
  userId: string;
  entityType: string;
  entityId: string;
  correlationId: string | null;
  currentHash: string;
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  userId?: string;
  eventType?: string;
  from?: string;
  to?: string;
  take?: number;
}

export const getAuditEvents = (q: AuditQuery = {}, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  if (q.entityType) params.set('entityType', q.entityType);
  if (q.entityId) params.set('entityId', q.entityId);
  if (q.userId) params.set('userId', q.userId);
  if (q.eventType) params.set('eventType', q.eventType);
  if (q.from) params.set('from', q.from);
  if (q.to) params.set('to', q.to);
  if (q.take) params.set('take', String(q.take));
  return apiJson<{ total: number; count: number; events: AuditEventRow[] }>(
    `/api/audit?${params.toString()}`, { signal });
};

/** Full-chain cryptographic verification; returns the service's verdict text. */
export const verifyAuditChain = () =>
  apiJson<string>('/api/audit/verify', { method: 'POST' });
