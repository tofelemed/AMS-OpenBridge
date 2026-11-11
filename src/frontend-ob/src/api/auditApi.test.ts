// CHG-174: the trail pages on the server. `offset` is sent only when given, so a caller with today's parameters sends today's request.
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiJson = vi.fn(async (..._args: unknown[]) => ({ total: 0, count: 0, events: [] }));
vi.mock('./apiFetch', () => ({ apiJson: (...a: unknown[]) => apiJson(...a) }));

const { getAuditEvents, verifyAuditChain } = await import('./auditApi');

afterEach(() => apiJson.mockClear());

describe('audit-service client', () => {
  it('sends today’s parameters unchanged', async () => {
    await getAuditEvents({ entityType: 'CpmLoop', userId: 'g_admin', take: 200 });
    expect(apiJson.mock.calls[0][0]).toBe('/api/audit?entityType=CpmLoop&userId=g_admin&take=200');
  });

  it('sends the offset and the time range when given', async () => {
    await getAuditEvents({ eventType: 'USER_CREATED', from: '2026-11-04T00:00:00.000Z', to: '2026-11-05T23:59:59.999Z', take: 25, offset: 50 });
    expect(apiJson.mock.calls[0][0]).toBe(
      '/api/audit?eventType=USER_CREATED&from=2026-11-04T00%3A00%3A00.000Z&to=2026-11-05T23%3A59%3A59.999Z&take=25&offset=50');
  });

  it('a zero offset is sent, so the service says whether it pages', async () => {
    await getAuditEvents({ take: 25, offset: 0 });
    expect(apiJson.mock.calls[0][0]).toBe('/api/audit?take=25&offset=0');
  });

  it('verification is the same POST', async () => {
    await verifyAuditChain();
    expect(apiJson).toHaveBeenCalledWith('/api/audit/verify', { method: 'POST' });
  });
});
