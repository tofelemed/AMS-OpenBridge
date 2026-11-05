// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuditTrail, auditLabel } from './AuditTrail';

const row = (over: Record<string, unknown>) => ({
  eventId: String(Math.random()), timestampUtc: '2026-11-04T13:04:11.48+00:00', eventType: 'CPM_LOOP_ACTIVATED',
  userId: 'admin', entityType: 'CpmLoop', entityId: 'FIC00701', correlationId: null, currentHash: 'abcdef0123456789ffff', ...over,
});

let held = ['admin.audit.view'];
let answer: Record<string, unknown>;
const asked = vi.fn();
const verify = { isIdle: true, isPending: false, isSuccess: false, isError: false, data: undefined, error: null, mutate: vi.fn() };

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: p => held.includes(p) }),
}));
vi.mock('../../../hooks/useDebounce', () => ({ useDebounce: (v: string) => v }));
vi.mock('../../../hooks/useAudit', () => ({
  useAuditEvents: (q: unknown, _ms: number, enabled: boolean) => { asked(q, enabled); return answer; },
  useVerifyAuditChain: () => verify,
}));

const events = (list: unknown[], total = list.length) => ({ data: { total, count: list.length, events: list } });
const lastQuery = () => asked.mock.calls[asked.mock.calls.length - 1][0];

beforeEach(() => {
  held = ['admin.audit.view'];
  asked.mockClear();
  verify.mutate.mockClear();
  answer = events([
    row({ eventType: 'CPM_EVENT_ACKNOWLEDGED', userId: 'operator', entityId: '48213', correlationId: 'c-71af' }),
    row({ eventType: 'CPM_LOOP_DELETED', userId: '' }),
  ]);
});
afterEach(cleanup);

describe('the one audit trail', () => {
  it('shows every column of both old views', () => {
    render(<AuditTrail />);
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Timestamp', 'Event type', 'User', 'Entity', 'Hash signature', 'Correlation']);
    expect(screen.getByText('c-71af')).toBeTruthy();
    expect(screen.getAllByText('abcdef0123456789…').length).toBe(2);
    expect(screen.getByText('system')).toBeTruthy();
  });

  it('reads as words, and the code stays on hover', () => {
    answer = events([row({ eventType: 'CPM_LOOP_DELETED', entityType: 'RolePermissions' })]);
    render(<AuditTrail />);
    expect(screen.getByText('Role permissions').getAttribute('title')).toBe('RolePermissions');
    expect(screen.getAllByText('CPM loop deleted').length).toBeGreaterThan(0);
    expect(auditLabel('RBAC_ROLE_PERMISSIONS_RESET')).toBe('RBAC role permissions reset');
    expect(auditLabel('ingestion.datasource.tested')).toBe('Ingestion datasource tested');
  });

  it('keeps the exact time on hover', () => {
    render(<AuditTrail />);
    expect(screen.getAllByRole('cell')[0].getAttribute('title')).toBe('2026-11-04T13:04:11.48+00:00');
  });

  it('offers the event types the records hold, never one that matches nothing', () => {
    render(<AuditTrail />);
    const options = [...screen.getByLabelText('Event type').querySelectorAll('option')].map(o => o.value);
    expect(options).toEqual(['', 'CPM_EVENT_ACKNOWLEDGED', 'CPM_LOOP_DELETED']);
  });

  it('asks the server for entity, event type and user, and reaches older records', () => {
    render(<AuditTrail />);
    fireEvent.click(screen.getByText('CPM events'));
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'CPM_LOOP_DELETED' } });
    fireEvent.change(screen.getByLabelText('User'), { target: { value: ' admin ' } });
    expect(lastQuery()).toEqual({ entityType: 'CpmEventFrame', eventType: 'CPM_LOOP_DELETED', userId: 'admin', take: 200 });
  });

  it('keeps the other types on offer once a narrowed answer holds one', () => {
    const { rerender } = render(<AuditTrail />);
    answer = events([row({ eventType: 'CPM_LOOP_DELETED' })]);
    rerender(<AuditTrail />);
    expect(screen.getByLabelText('Event type').querySelectorAll('option').length).toBe(3);
  });

  it('Find searches the rows fetched without asking the server', () => {
    render(<AuditTrail />);
    const before = asked.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Find by user, action or entity'), { target: { value: '48213' } });
    expect(screen.getAllByRole('row').length).toBe(2);
    expect(screen.getByText(/showing 1 matching/)).toBeTruthy();
    expect(lastQuery()).toEqual(asked.mock.calls[before - 1][0]);
  });

  it('says which empty it is', () => {
    answer = events([]);
    render(<AuditTrail />);
    expect(screen.getByText('No governance events recorded yet')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('User'), { target: { value: 'nobody' } });
    expect(screen.getByText('No audit events match')).toBeTruthy();
  });

  it('states when older entries are not fetched', () => {
    answer = events(Array.from({ length: 30 }, () => row({})), 4825);
    render(<AuditTrail />);
    expect(screen.getByText(/1–25 of 30 fetched/).textContent).toContain('newest 200 of 4825, older entries are not fetched');
  });

  it('makes no standing claim until a verification has run, and Verify runs it', () => {
    render(<AuditTrail />);
    expect(screen.getByRole('status').textContent).toContain('makes no standing claim');
    fireEvent.click(screen.getByText('Verify cryptographic chain'));
    expect(verify.mutate).toHaveBeenCalled();
  });

  it('without the read permission it says so and asks for nothing', () => {
    held = [];
    answer = {};
    render(<AuditTrail />);
    expect(screen.getByText('Audit reads require the admin.audit.view permission')).toBeTruthy();
    expect(asked.mock.calls[0][1]).toBe(false);
  });
});
