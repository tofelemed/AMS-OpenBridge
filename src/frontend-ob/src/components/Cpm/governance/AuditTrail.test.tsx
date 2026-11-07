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
let loopList: { loopId: string }[] | undefined = [{ loopId: 'FIC00701' }];
const go = vi.fn();

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: p => held.includes(p) }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => go }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('../../../cpa/activeZone', () => ({ activeZone: () => 'Asia/Riyadh' }));
vi.mock('../../../hooks/useCpm', () => ({ useCpmLoops: () => ({ data: loopList ? { loops: loopList, count: loopList.length } : undefined }) }));
vi.mock('../../../hooks/useDebounce', () => ({ useDebounce: (v: string) => v }));
vi.mock('../../../hooks/useAudit', () => ({
  useAuditEvents: (q: unknown, _ms: number, enabled: boolean) => { asked(q, enabled); return answer; },
}));

const events = (list: unknown[], total = list.length) => ({ data: { total, count: list.length, events: list } });
const lastQuery = () => asked.mock.calls[asked.mock.calls.length - 1][0];

beforeEach(() => {
  held = ['admin.audit.view'];
  asked.mockClear();
  go.mockClear();
  loopList = [{ loopId: 'FIC00701' }];
  answer = events([
    row({ eventType: 'CPM_EVENT_ACKNOWLEDGED', userId: 'operator', entityId: '48213', correlationId: 'c-71af' }),
    row({ eventType: 'CPM_LOOP_DELETED', userId: '' }),
  ]);
});
afterEach(cleanup);

describe('the one audit trail', () => {
  it('shows When / actor, Action and Entity; hash and correlation are in the dialog', () => {
    render(<AuditTrail />);
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['When / actor', 'Action', 'Entity']);
    expect(screen.getByText('operator')).toBeTruthy();
    expect(screen.getByText('system')).toBeTruthy();
    expect(screen.queryByText('c-71af')).toBeNull();
    expect(screen.queryByText(/abcdef0123456789/)).toBeNull();
  });

  it('a row opens its event with the correlation and hash', () => {
    render(<AuditTrail />);
    fireEvent.click(screen.getAllByRole('button', { name: /2026|04/ })[0]);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('c-71af')).toBeTruthy();
  });

  it('a loop event links to loop detail, and says when the loop is not in the registry', () => {
    render(<AuditTrail />);
    fireEvent.click(screen.getAllByRole('button', { name: /2026|04/ })[1]);
    fireEvent.click(screen.getByText('Open loop ↗'));
    expect(go).toHaveBeenCalledWith('/cpm/registry?loop=FIC00701');
    cleanup();
    loopList = [];
    render(<AuditTrail />);
    fireEvent.click(screen.getAllByRole('button', { name: /2026|04/ })[1]);
    expect(screen.getByText('FIC00701 is not in the loop registry.')).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'CpmEventFrame' } });
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
    fireEvent.change(screen.getByLabelText('Find event'), { target: { value: '48213' } });
    expect(screen.getAllByRole('row').length).toBe(2);
    expect(screen.getByText(/1 matching “48213”/)).toBeTruthy();
    expect(lastQuery()).toEqual(asked.mock.calls[before - 1][0]);
  });

  it('a bulk row does not look up the registry', () => {
    answer = events([row({ entityId: 'bulk:5', eventType: 'CPM_LOOPS_BULK_RETIRED' })]);
    render(<AuditTrail />);
    fireEvent.click(screen.getAllByRole('button', { name: /2026|04/ })[0]);
    expect(screen.queryByText(/not in the loop registry/)).toBeNull();
  });

  it('shows no foot line with zero rows', () => {
    answer = events([]);
    render(<AuditTrail />);
    expect(screen.queryByText(/times in/)).toBeNull();
  });

  it('says which empty it is', () => {
    answer = events([]);
    render(<AuditTrail />);
    expect(screen.getByText('No governance events recorded yet')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('User'), { target: { value: 'nobody' } });
    expect(screen.getByText('No audit events match')).toBeTruthy();
  });

  it('states when older entries are not fetched', () => {
    answer = events(Array.from({ length: 200 }, () => row({})), 4825);
    render(<AuditTrail />);
    const foot = screen.getByText(/1–25 of 200 fetched/).textContent;
    expect(foot).toContain('newest 200 of 4825, older entries are not fetched');
    expect(foot).toContain('times in Asia/Riyadh');
  });

  it('counts only what the response holds when nothing is cut off', () => {
    answer = events([row({}), row({})], 2);
    render(<AuditTrail />);
    expect(screen.getByText(/2 events · times in/)).toBeTruthy();
  });

  it('without the read permission it says so and asks for nothing', () => {
    held = [];
    answer = {};
    render(<AuditTrail />);
    expect(screen.getByText('Audit reads require the admin.audit.view permission')).toBeTruthy();
    expect(asked.mock.calls[0][1]).toBe(false);
  });
});
