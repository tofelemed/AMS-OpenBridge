// @vitest-environment jsdom
// CHG-202 (owner, 15 Nov 2026): the whole Governance page in plain words. Every tab, every selected event or bundle, every
// How to read and every Verify answer is read as the user reads it (text, titles, aria-labels, placeholders): no GUID, no
// hash-like hex run, no "user id", no "Record details", no service, build or engine name, no code or permission key.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CpmGovernance } from '../CpmGovernance';
import { VerifyDialog, VerifyLine } from './VerifyDialog';
import { ApiError } from '../../../api/apiFetch';
import { readerText, technicalIn } from './plainWordsCheck';

const GUID = (n: number) => `7c41e0d2-9b1a-4f7e-8d2c-0a1b2c3d4e5${n}`;
const HASH = `3fa9c2d81e07${'aa55'.repeat(13)}`;
const ME = { user_id: GUID(8), username: 'superadmin', full_name: 'Super Administrator' };

let held: string[] = [];
/** The service's own words, as a failing read would carry them. */
const DETAIL = 'Npgsql.NpgsqlException: timeout in audit-service at audit.immutable_events';
let failing = false;
const fail = () => new ApiError(500, DETAIL, DETAIL);
let answer: Record<string, unknown> = {};
const verify = { isIdle: true, isPending: false, isSuccess: false, isError: false, data: undefined as unknown, error: null as unknown, mutate: vi.fn() };

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../../../ui/shell/shellHooks', () => ({ useShellBand: () => 'wide' }));
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (pick: (s: unknown) => unknown) => pick({ hasPermission: (p: string) => held.includes(p), user: ME }),
}));
vi.mock('../../../cpa/activeZone', () => ({ activeZone: () => 'UTC' }));
vi.mock('../../../hooks/useDebounce', () => ({ useDebounce: (v: string) => v }));
vi.mock('../../../hooks/useAudit', () => ({ useAuditEvents: () => answer, useVerifyAuditChain: () => verify }));
vi.mock('../../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops: [
    { loopId: 'FIC00701', site: 'hdpe', thresholdProfileId: 'pid_flow' }, { loopId: 'X1', site: 'site2', thresholdProfileId: null },
  ], count: 2 } }),
  useCpmCalculations: () => (failing
    ? { isError: true, error: fail(), refetch: () => {} }
    : { data: { calculationVersion: '3.0.0', dynamicsProfileVersion: '2.0.0', engine: 'CplmGateFusionEngine (Flink)' } }),
  useCpmCapabilities: () => ({ data: { service: { version: '1.0.0', sourceCommit: '2f5ff876aaaabbbbcccc' }, engine: { observed: [] } } }),
}));
vi.mock('../plantLocation', () => ({
  useSiteFilters: () => ({ data: [{ path: 'root.hdpe', name: 'HDPE Plant', segment: 'hdpe' }, { path: 'root.site2', name: 'Site Two', segment: 'site2' }] }),
}));
vi.mock('../../../api/rolesApi', () => ({
  getRolesWithPermissions: async () => (failing ? Promise.reject(fail()) : [
    { role_name: 'Engineer', description: null, is_system_role: true, permissions: ['cpm.manage', 'cpm.config.draft'] },
    { role_name: 'SuperAdmin', description: null, is_system_role: true, permissions: ['cpm.manage', 'admin.audit.view', 'cpm.config.approve'] },
  ]),
  getPermissionCatalog: async () => [
    { permission_key: 'cpm.manage', description: 'Onboard and configure control loops (CPLM)', category: 'cpm' },
    { permission_key: 'admin.audit.view', description: 'View the audit log', category: 'admin' },
  ],
}));
const bundle = (over: Record<string, unknown>) => ({
  bundleId: GUID(1), version: 7, contentHash: HASH, site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null,
  changeClass: 'POLICY', state: 'VALIDATED', effectiveFrom: null, createdBy: 'superadmin', createdAt: '2026-11-10T09:00:00Z',
  updatedAt: '2026-11-11T09:12:00Z', note: null, validationErrors: 0, ...over,
});
vi.mock('../../../api/cpm/config', () => ({
  listBundleSummaries: async (site: string) => (failing ? Promise.reject(fail()) : { site, bundles: site === 'hdpe' ? [
    bundle({}),
    bundle({ bundleId: GUID(5), scopeKind: 'PROFILE', scopeRef: 'pid_flow', version: 3, state: 'APPROVED', createdBy: GUID(9) }),
    bundle({ bundleId: GUID(6), scopeKind: 'SITE', scopeRef: null, version: 2, state: 'SHADOW_EVALUATED', changeClass: 'STATE_BOUNDARY' }),
  ] : [bundle({ bundleId: GUID(7), site: 'site2', state: 'ACTIVATION_FAILED', scopeRef: 'X1' })] }),
  listDeployments: async () => ({ deployments: [{ deploymentId: GUID(2), kind: 'ROLLBACK', bundleId: GUID(1) }] }),
}));

const row = (eventType: string, entityType: string, entityId: string, userId = 'operator') => ({
  eventId: `ev-${eventType}-${entityId}`, timestampUtc: '2026-11-04T13:04:11.48+00:00', eventType, userId, entityType, entityId,
  correlationId: GUID(0), currentHash: HASH,
});
const EVENTS = [
  row('CPM_EVIDENCE_REPUBLISHED_BULK', 'CpmLoop', 'bulk:20', 'superadmin'),
  row('CPM_INSTRUMENT_BINDING_CREATED', 'CpmLoop', 'FIC00701'),
  row('CPM_SOMETHING_NEW', 'CpmLoop', 'FIC00701'),
  row('CPM_EVENT_ACKNOWLEDGED', 'CpmEventFrame', '48213'),
  row('CONFIG_DRAFT_APPROVED', 'gate_config_bundle', GUID(1)),
  row('CONFIG_DRAFT_EDITED', 'gate_config_bundle', GUID(3)),
  row('CONFIG_DEPLOYMENT_SCHEDULED', 'config_deployment', GUID(2), 'system'),
  row('CONFIG_ACTIVE_VERIFIED', 'config_deployment', GUID(4), 'system'),
  row('ingestion.datasource.tested', 'data-source-config', '043f185b-1111-4222-8333-944445555666'),
  row('DISPLAY_PUBLISHED', 'Display', GUID(3)),
  row('RBAC_ROLE_UPDATED', 'Role', 'Engineer', GUID(9)),
  row('RBAC_ROLE_PERMISSIONS_RESET', 'RolePermissions', 'Engineer', GUID(8)),
  row('USER_UPDATED', 'User', GUID(4), ''),
  row('cpm.model.reviewed', 'system_model', '1234'),
  row('AUDIT_CHAIN_RECHAINED', 'AuditChain', 'audit.immutable_events', 'system'),
  row('ingestion.thing.done', 'SomethingElse', GUID(5)),
];

const mount = (search = '') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[`/cpm/governance${search}`]}><CpmGovernance /></MemoryRouter>
  </QueryClientProvider>,
);
const seen: string[] = [];
const look = () => { seen.push(readerText()); };
const howToRead = () => {
  fireEvent.click(screen.getByText('How to read'));
  look();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close dialog' }));
};
const expectPlain = () => expect(technicalIn(seen.join('\n')).join(' | ')).toBe('');

beforeEach(() => {
  held = ['system.manage', 'admin.audit.view', 'cpm.config.read', 'rbac.manage', 'admin.users.edit'];
  answer = { data: { total: EVENTS.length, count: EVENTS.length, offset: 0, events: EVENTS } };
  Object.assign(verify, { isIdle: true, isPending: false, isSuccess: false, isError: false, data: undefined, error: null });
  seen.length = 0;
  failing = false;
});
afterEach(cleanup);

describe('Governance in plain words (CHG-202)', () => {
  it('the audit trail, every selected event and How to read show no id, hash, code or service name', async () => {
    mount();
    await screen.findAllByText('FIC10302 · v7');
    look();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(EVENTS.length);
    rows.forEach(r => { fireEvent.click(r); look(); });
    howToRead();
    expectPlain();
    expect(screen.getAllByText('Super Administrator').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unknown user').length).toBeGreaterThan(0);
    expect(screen.queryByText('Record details')).toBeNull();
  });

  it('the Verify audit chain answers say the result in words', () => {
    const states = [
      { isPending: true },
      { isSuccess: true, data: `Chain verified. No tampering detected. ${HASH}` },
      { isError: true, error: new ApiError(500, 'CHAIN TAMPERING DETECTED.') },
      { isError: true, error: new ApiError(403, 'Missing permission admin.audit.view') },
      { isError: true, error: new ApiError(404, 'GET /api/audit/verify returned 404') },
      { isError: true, error: new TypeError('Failed to fetch') },
    ];
    for (const s of states) {
      const v = { isIdle: false, isPending: false, isSuccess: false, isError: false, data: undefined, error: null, ...s } as never;
      render(<><VerifyDialog verify={v} ranAt={new Date('2026-11-11T14:18:06Z')} onRunAgain={() => {}} onClose={() => {}} /><VerifyLine verify={v} ranAt={null} /></>);
      look();
      cleanup();
    }
    expectPlain();
  });

  it('Approvals, each bundle, Separation of duties and Change traceability, with their How to read', async () => {
    mount('?tab=approvals');
    await screen.findAllByText('FIC10302 · v7');
    screen.getAllByRole('row').slice(1).forEach(r => { fireEvent.click(r); look(); });
    howToRead();
    expect(screen.queryAllByText(/\bhdpe\b/)).toHaveLength(0);
    expect(screen.getAllByText(/HDPE Plant/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Separation of duties' }));
    await screen.findByRole('table');
    await screen.findByText('View the audit log');
    look();
    howToRead();

    fireEvent.click(screen.getByRole('tab', { name: 'Change traceability' }));
    await waitFor(() => expect(screen.getByText('Threshold profiles in use')).toBeTruthy());
    look();
    howToRead();
    expect(screen.queryByText('Build details')).toBeNull();
    expectPlain();
  });

  // CHG-203: in the shared QueryError's words (a 500 here: the service did not answer), so every page says it the same way
  it('a failed read says so in words on every tab, never with the service’s own message', async () => {
    failing = true;
    answer = { isError: true, error: fail(), refetch: vi.fn() };
    const NO_ANSWER = 'The service did not answer. Try again.';
    mount();
    expect(screen.getByText('Audit log not reached')).toBeTruthy();
    expect(screen.getByText(NO_ANSWER)).toBeTruthy();
    look();
    fireEvent.click(screen.getByRole('tab', { name: 'Approvals' }));
    await screen.findByText('The bundle list could not be read');
    expect(screen.getByText(NO_ANSWER)).toBeTruthy();
    look();
    fireEvent.click(screen.getByRole('tab', { name: 'Separation of duties' }));
    await screen.findByText('Roles could not be read');
    expect(screen.getByText(NO_ANSWER)).toBeTruthy();
    look();
    fireEvent.click(screen.getByRole('tab', { name: 'Change traceability' }));
    look();
    expect(screen.getByText('Calculation versions could not be read')).toBeTruthy();
    expect(screen.getByText(NO_ANSWER)).toBeTruthy();
    expect(seen.join(' ')).not.toContain('Npgsql');
    expectPlain();
  });

  it('a reader without the permissions is told so in words', () => {
    held = ['system.manage'];
    answer = {};
    mount();
    look();
    for (const tab of ['Approvals', 'Separation of duties']) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      look();
    }
    expectPlain();
  });
});
