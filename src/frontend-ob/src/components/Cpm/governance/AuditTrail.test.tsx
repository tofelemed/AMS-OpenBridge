// @vitest-environment jsdom
// CHG-174 (owner review, the approved sample governance-proposal.html, badges 3-7, and the owner's answers of 11 Nov 2026).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuditTrail } from './AuditTrail';
import { ENTITIES, EVENTS } from './auditCatalog';

const GUID = '7c41e0d2-9b1a-4f7e-8d2c-0a1b2c3d4e5f';
const row = (over: Record<string, unknown>) => ({
  eventId: `ev-${Math.random().toString(16).slice(2)}`, timestampUtc: '2026-11-04T13:04:11.48+00:00', eventType: 'CPM_LOOP_ACTIVATED',
  userId: 'g_admin', entityType: 'CpmLoop', entityId: 'FIC00701', correlationId: null,
  currentHash: '3fa9c2d81e07aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55', ...over,
});

let held = ['admin.audit.view'];
let answer: Record<string, unknown>;
const asked = vi.fn();
let loopList: { loopId: string; site: string }[] | undefined = [{ loopId: 'FIC00701', site: 'hdpe' }];
const go = vi.fn();
let names = { bundle: (_id: string) => undefined as unknown, deployment: (_id: string) => undefined as unknown };

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('../../../ui/shell/shellHooks', () => ({ useShellBand: () => 'wide' }));
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: p => held.includes(p) }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => go }));
vi.mock('../../../cpa/activeZone', () => ({ activeZone: () => 'UTC' }));
vi.mock('../../../hooks/useCpm', () => ({ useCpmLoops: () => ({ data: loopList ? { loops: loopList, count: loopList.length } : undefined }) }));
vi.mock('../../../hooks/useDebounce', () => ({ useDebounce: (v: string) => v }));
vi.mock('./useConfigNames', () => ({ useConfigNames: () => names, bundleName: (b: { scopeRef: string; version: number }) => `${b.scopeRef} · v${b.version}` }));
vi.mock('../../../hooks/useAudit', () => ({
  useAuditEvents: (q: unknown, _ms: number, enabled: boolean) => { asked(q, enabled); return answer; },
}));

const page = (list: unknown[], total = list.length, paged = true) =>
  ({ data: { total, count: list.length, ...(paged ? { offset: 0 } : {}), events: list } });
const lastQuery = () => asked.mock.calls[asked.mock.calls.length - 1][0];
const panel = () => screen.getByRole('complementary');
const rows = () => screen.getAllByRole('row').slice(1);

beforeEach(() => {
  held = ['admin.audit.view'];
  asked.mockClear();
  go.mockClear();
  loopList = [{ loopId: 'FIC00701', site: 'hdpe' }];
  names = { bundle: () => undefined, deployment: () => undefined };
  answer = page([
    row({ eventType: 'CPM_EVENT_ACKNOWLEDGED', userId: 'operator', entityType: 'CpmEventFrame', entityId: '48213', correlationId: 'c-71af' }),
    row({ eventType: 'CPM_LOOP_DELETED', userId: 'system' }),
    row({ eventType: 'RBAC_ROLE_PERMISSIONS_RESET', userId: GUID, entityType: 'RolePermissions', entityId: 'Engineer' }),
  ]);
});
afterEach(cleanup);

describe('the audit trail list', () => {
  it('shows When · UTC, Actor, Action and Entity in words', () => {
    render(<AuditTrail />);
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['When · UTC', 'Actor', 'Action', 'Entity']);
    const [ack, del, reset] = rows();
    expect(within(ack).getByText('4 Nov 13:04')).toBeTruthy();
    expect(within(ack).getByText('operator')).toBeTruthy();
    expect(within(ack).getByText('Event acknowledged')).toBeTruthy();
    expect(within(ack).getByText('✓')).toBeTruthy();
    expect(within(ack).getByText('EVT-48213')).toBeTruthy();
    expect(within(ack).getByText('CPM event')).toBeTruthy();
    expect(within(del).getByText('System')).toBeTruthy();
    expect(within(del).getByText('✕')).toBeTruthy();
    expect(within(reset).getByText('Not recorded by name')).toBeTruthy();
    expect(within(reset).getByText('Role permissions reset')).toBeTruthy();
  });

  it('opens on the first event in the panel; a row selects its event', () => {
    render(<AuditTrail />);
    expect(within(panel()).getByRole('heading', { name: 'Event acknowledged' })).toBeTruthy();
    fireEvent.click(rows()[2]);
    expect(within(panel()).getByRole('heading', { name: 'Role permissions reset' })).toBeTruthy();
    expect(within(panel()).getByText('Recorded by user id only; the id is in Record details.')).toBeTruthy();
    expect(within(panel()).getByText('4 Nov 2026 13:04:11')).toBeTruthy();
    expect(within(panel()).getByText('Not available')).toBeTruthy();
  });

  it('Record details hold the raw ids, the correlation and the hash with Copy', () => {
    render(<AuditTrail />);
    fireEvent.click(within(panel()).getByText('Record details'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('CPM_EVENT_ACKNOWLEDGED')).toBeTruthy();
    expect(within(dialog).getByText('c-71af')).toBeTruthy();
    expect(within(dialog).getByText('3fa9c2d81e07…')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Copy hash' })).toBeTruthy();
    expect(within(dialog).getByText('48213')).toBeTruthy();
  });

  it('an actor recorded by id shows the id only in Record details', () => {
    render(<AuditTrail />);
    expect(screen.queryByText(GUID)).toBeNull();
    fireEvent.click(rows()[2]);
    fireEvent.click(within(panel()).getByText('Record details'));
    const actor = within(screen.getByRole('dialog')).getByRole('region', { name: 'Actor' });
    expect(within(actor).getByText(GUID)).toBeTruthy();
    expect(within(actor).getByText('Not recorded by name')).toBeTruthy();
  });
});

describe('links to the object', () => {
  it('a loop in the registry opens it; a loop not in it says so', () => {
    answer = page([row({ eventType: 'CPM_LOOP_ACTIVATED' })]);
    render(<AuditTrail />);
    fireEvent.click(within(panel()).getByText('FIC00701 ↗'));
    expect(go).toHaveBeenCalledWith('/cpm/registry?loop=FIC00701');
    cleanup();
    loopList = [];
    render(<AuditTrail />);
    expect(within(panel()).getByText('FIC00701 is not in the loop registry.')).toBeTruthy();
    expect(within(panel()).queryByText(/↗/)).toBeNull();
  });

  it('a bundle event opens Gate Configuration on the tab that step needs, named when the page knows the bundle', () => {
    held = ['admin.audit.view', 'cpm.config.read'];
    names = { bundle: () => ({ scopeKind: 'LOOP', scopeRef: 'FIC10302', site: 'hdpe', version: 7 }), deployment: () => undefined };
    answer = page([row({ eventType: 'CONFIG_DRAFT_APPROVED', entityType: 'gate_config_bundle', entityId: 'b-1' })]);
    render(<AuditTrail />);
    expect(within(rows()[0]).getByText('FIC10302 · v7')).toBeTruthy();
    fireEvent.click(within(panel()).getByText('FIC10302 · v7 ↗'));
    expect(go).toHaveBeenCalledWith('/cpm/config?view=editor&bundle=b-1&tab=approval');
  });

  it('a rollback reads as a rollback naming the bundle, and opens its deployments', () => {
    held = ['admin.audit.view', 'cpm.config.read'];
    names = {
      bundle: (id: string) => (id === 'b-6' ? { scopeKind: 'LOOP', scopeRef: 'FIC10302', site: 'hdpe', version: 6 } : undefined),
      deployment: () => ({ kind: 'ROLLBACK', bundleId: 'b-6' }),
    };
    answer = page([row({ eventType: 'CONFIG_DEPLOYMENT_SCHEDULED', entityType: 'config_deployment', entityId: 'd-9' })]);
    render(<AuditTrail />);
    expect(within(rows()[0]).getByText('Rollback scheduled')).toBeTruthy();
    expect(within(rows()[0]).getByText('FIC10302 · v6')).toBeTruthy();
    fireEvent.click(within(panel()).getByText('FIC10302 · v6 ↗'));
    expect(go).toHaveBeenCalledWith('/cpm/config?view=editor&bundle=b-6&tab=deployments');
  });

  it('without the configuration read a deployment keeps its id and no link', () => {
    answer = page([row({ eventType: 'CONFIG_DEPLOYMENT_SCHEDULED', entityType: 'config_deployment', entityId: 'e5b0aa11-1111-4222-8333-944445555666' })]);
    render(<AuditTrail />);
    expect(within(rows()[0]).getByText('Deployment scheduled')).toBeTruthy();
    expect(within(rows()[0]).getByText('e5b0aa11…')).toBeTruthy();
    expect(within(panel()).queryByText(/↗/)).toBeNull();
  });

  it('a role opens Administration for a role manager only', () => {
    answer = page([row({ eventType: 'RBAC_ROLE_PERMISSIONS_RESET', entityType: 'RolePermissions', entityId: 'Engineer' })]);
    render(<AuditTrail />);
    expect(within(panel()).queryByText('Engineer ↗')).toBeNull();
    cleanup();
    held = ['admin.audit.view', 'rbac.manage'];
    render(<AuditTrail />);
    fireEvent.click(within(panel()).getByText('Engineer ↗'));
    expect(go).toHaveBeenCalledWith('/admin/roles?role=Engineer');
  });
});

describe('filters', () => {
  it('Entity and Event type offer every type the services record, not only those fetched', () => {
    render(<AuditTrail />);
    const entity = [...screen.getByLabelText('Entity').querySelectorAll('option')].map(o => o.value);
    expect(entity).toEqual(['', ...ENTITIES.map(e => e.code)]);
    const types = [...screen.getByLabelText('Event type').querySelectorAll('option')].map(o => o.value);
    expect(types).toEqual(['', ...EVENTS.map(e => e.code)]);
  });

  it('choosing an entity narrows the event types to its own', () => {
    render(<AuditTrail />);
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'CPM_LOOP_DELETED' } });
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'User' } });
    const types = [...screen.getByLabelText('Event type').querySelectorAll('option')].map(o => o.value);
    expect(types).toEqual(['', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_BULK_IMPORTED']);
    expect(lastQuery()).toMatchObject({ entityType: 'User', eventType: undefined });
  });

  it('asks the server for entity, event type, user and the first page', () => {
    render(<AuditTrail />);
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'CpmEventFrame' } });
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'CPM_EVENT_SHELVED' } });
    fireEvent.change(screen.getByLabelText('User'), { target: { value: ' Admin ' } });
    expect(lastQuery()).toEqual({ entityType: 'CpmEventFrame', eventType: 'CPM_EVENT_SHELVED', userId: 'Admin', from: undefined, to: undefined, take: 25, offset: 0 });
  });

  it('a time range asks the server from / to', () => {
    render(<AuditTrail />);
    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: '7d' } });
    const q = lastQuery() as { from: string; to?: string };
    expect(Date.now() - Date.parse(q.from)).toBeGreaterThanOrEqual(7 * 24 * 3600_000 - 1000);
    expect(q.to).toBeUndefined();
    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-04' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-05' } });
    expect(lastQuery()).toMatchObject({ from: '2026-11-04T00:00:00.000Z', to: '2026-11-05T23:59:59.999Z', offset: 0 });
    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: 'all' } });
    expect(lastQuery()).toMatchObject({ from: undefined, to: undefined });
    expect(screen.queryByLabelText('From')).toBeNull();
  });

  it('Find searches the rows fetched without asking the server, by the words shown', () => {
    render(<AuditTrail />);
    const before = asked.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Find event'), { target: { value: 'acknowledged' } });
    expect(rows()).toHaveLength(1);
    expect(asked.mock.calls.slice(before).every(c => JSON.stringify(c[0]) === JSON.stringify(asked.mock.calls[before - 1][0]))).toBe(true);
  });

  it('no match says so, with no pager or count under it', () => {
    render(<AuditTrail />);
    fireEvent.change(screen.getByLabelText('Find event'), { target: { value: 'zzz' } });
    expect(screen.getByText('No audit events match')).toBeTruthy();
    expect(screen.getByText('The trail records display, CPM, gate-configuration, data-source, role and user changes.')).toBeTruthy();
    expect(screen.queryByText(/^[\d,]+ events?$/)).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('an empty trail says so, without the stale words', () => {
    answer = page([]);
    render(<AuditTrail />);
    expect(screen.getByText('No governance events recorded yet')).toBeTruthy();
    expect(screen.queryByText(/logins|from now on/)).toBeNull();
  });
});

describe('server paging (owner answer 2)', () => {
  it('pages through every event: the pager covers the total, a page asks for its rows', () => {
    answer = page(Array.from({ length: 25 }, () => row({})), 4825);
    render(<AuditTrail />);
    expect(screen.getByText('4,825 events')).toBeTruthy();
    expect(screen.getByText('Page 1 of 193')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(lastQuery()).toMatchObject({ take: 25, offset: 25 });
    fireEvent.click(screen.getByRole('button', { name: 'Last page' }));
    expect(lastQuery()).toMatchObject({ offset: 4800 });
  });

  it('a new filter goes back to the first page', () => {
    answer = page(Array.from({ length: 25 }, () => row({})), 100);
    render(<AuditTrail />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'Display' } });
    expect(lastQuery()).toMatchObject({ entityType: 'Display', offset: 0 });
  });

  it('an older service that does not page: the newest 200 are paged here, and the count says so', () => {
    answer = page(Array.from({ length: 200 }, (_, i) => row({ entityId: `L${i}` })), 4825, false);
    render(<AuditTrail />);
    expect(lastQuery()).toMatchObject({ take: 200 });
    expect(lastQuery()).not.toHaveProperty('offset');
    expect(screen.getByText('Newest 200 of 4,825')).toBeTruthy();
    expect(screen.getByText('Page 1 of 8')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(within(rows()[0]).getByText('L25')).toBeTruthy();
  });

  it('without the read permission it says so and asks for nothing', () => {
    held = [];
    answer = {};
    render(<AuditTrail />);
    expect(screen.getByText('Audit reads require the admin.audit.view permission')).toBeTruthy();
    expect(asked.mock.calls[0][1]).toBe(false);
  });
});
