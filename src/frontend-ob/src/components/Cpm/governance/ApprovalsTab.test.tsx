// @vitest-environment jsdom
// CHG-174 (owner review, badges 9-10, answers 1 and 4): the queue as a list with the selected bundle in a panel, read from the
// summary projection (finding: it read every bundle in full), its exit on the Gate Configuration tab that step needs.
// CHG-202 (owner, 15 Nov 2026): sites by their plant-model name, a profile in words, the signed-in author by name, no key.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApprovalsTab } from './ApprovalsTab';

const go = vi.fn();
let held = ['system.manage', 'cpm.config.read'];
let me: { user_id: string; username: string; full_name?: string } | null = null;
const summaries = vi.fn();
const full = vi.fn();

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('../../../ui/shell/shellHooks', () => ({ useShellBand: () => 'wide' }));
vi.mock('react-router-dom', () => ({ useNavigate: () => go }));
vi.mock('../../../cpa/activeZone', () => ({ activeZone: () => 'UTC' }));
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean; user: typeof me }) => unknown) => pick({ hasPermission: p => held.includes(p), user: me }),
}));
vi.mock('../plantLocation', () => ({
  useSiteFilters: () => ({ data: [{ path: 'root.hdpe', name: 'HDPE Plant', segment: 'hdpe' }, { path: 'root.site2', name: 'Site Two', segment: 'site2' }] }),
}));
vi.mock('../../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops: [{ loopId: 'FIC10301', site: 'hdpe' }, { loopId: 'X1', site: 'site2' }], count: 2 } }),
}));
vi.mock('../../../api/cpm/config', () => ({
  listBundleSummaries: (...a: unknown[]) => summaries(...a),
  listBundles: (...a: unknown[]) => full(...a),
  listDeployments: vi.fn(),
}));

const bundle = (over: Record<string, unknown>) => ({
  bundleId: 'b-1', version: 2, contentHash: '9e2b41f0aa11bb22cc33', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10301', parentBundleId: null,
  changeClass: 'POLICY', state: 'VALIDATED', effectiveFrom: null, createdBy: 'b_engineer', createdAt: '2026-11-10T09:00:00Z',
  updatedAt: '2026-11-11T09:12:00Z', note: null, validationErrors: 0, ...over,
});

const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ApprovalsTab /></QueryClientProvider>,
);

beforeEach(() => {
  held = ['system.manage', 'cpm.config.read'];
  me = null;
  go.mockClear(); summaries.mockReset(); full.mockReset();
  summaries.mockImplementation(async (site: string) => ({
    site,
    bundles: site === 'hdpe'
      ? [
        bundle({}),
        bundle({ bundleId: 'b-2', scopeRef: 'PIC30102', version: 3, state: 'APPROVED', createdBy: 'a_engineer', updatedAt: '2026-11-09T11:05:00Z' }),
        bundle({ bundleId: 'b-3', scopeRef: 'FIC10302', version: 8, state: 'SHADOW_EVALUATED', changeClass: 'STATE_BOUNDARY', updatedAt: '2026-11-10T16:40:00Z' }),
        bundle({ bundleId: 'b-4', state: 'ACTIVE_VERIFIED' }),
        bundle({ bundleId: 'b-5', state: 'DRAFT' }),
      ]
      : [],
  }));
});
afterEach(cleanup);

describe('approvals', () => {
  it('reads the summary projection of each site the user sees, never the full bundles', async () => {
    mount();
    await screen.findAllByText('FIC10301 · v2');
    expect(summaries.mock.calls.map(c => c[0]).sort()).toEqual(['hdpe', 'site2']);
    expect(full).not.toHaveBeenCalled();
  });

  it('lists what waits for approval or activation, newest update first, the state in words', async () => {
    mount();
    await screen.findByText('PIC30102 · v3');
    expect(screen.getByRole('heading', { name: 'Waiting for approval or activation' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Bundle', 'State', 'Author', 'Updated · UTC']);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map(r => within(r).getAllByRole('cell')[0].querySelector('strong')?.textContent)).toEqual(['FIC10301 · v2', 'FIC10302 · v8', 'PIC30102 · v3']);
    expect(within(rows[0]).getByText('Validated')).toBeTruthy();
    expect(within(rows[0]).getByText('11 Nov 09:12')).toBeTruthy();
    expect(within(rows[1]).getByText('Shadow evaluated')).toBeTruthy();
    expect(within(rows[1]).getByText(/State boundary/)).toBeTruthy();
    expect(within(rows[2]).getByText('Approved')).toBeTruthy();
    expect(screen.queryByText('VALIDATED')).toBeNull();
    expect(screen.queryByText('POLICY')).toBeNull();
  });

  it('the panel holds the selected bundle and opens its Approval tab', async () => {
    mount();
    const panel = await screen.findByRole('complementary');
    expect(within(panel).getByRole('heading', { name: 'FIC10301 · v2' })).toBeTruthy();
    const kv = (label: string) => within(panel).getByText(label).nextElementSibling?.textContent;
    expect(kv('Site')).toBe('HDPE Plant');
    expect(kv('Scope')).toBe('Loop FIC10301');
    expect(kv('Change class')).toBe('Policy');
    expect(kv('Author')).toBe('b_engineer');
    expect(kv('Waits for')).toBe('Approval');
    fireEvent.click(within(panel).getByText('Open approval →'));
    expect(go).toHaveBeenCalledWith('/cpm/config?loop=FIC10301&view=editor&bundle=b-1&tab=approval');
  });

  it('an approved bundle waits for activation and opens its Deployments tab', async () => {
    mount();
    await screen.findByText('PIC30102 · v3');
    fireEvent.click(screen.getAllByRole('row')[3]);
    const panel = screen.getByRole('complementary');
    expect(within(panel).getByText('Waits for').nextElementSibling?.textContent).toBe('Activation');
    fireEvent.click(within(panel).getByText('Open deployments →'));
    expect(go).toHaveBeenCalledWith('/cpm/config?loop=PIC30102&view=editor&bundle=b-2&tab=deployments');
  });

  it('has no Record details: no bundle id or content hash (CHG-184)', async () => {
    mount();
    const panel = await screen.findByRole('complementary');
    expect(within(panel).queryByText('Record details')).toBeNull();
    expect(screen.queryByText(/9e2b41f0/)).toBeNull();
  });

  it('nothing waiting reads the two sentences word for word', async () => {
    summaries.mockImplementation(async (site: string) => ({ site, bundles: [bundle({ state: 'ACTIVE_VERIFIED' })] }));
    mount();
    expect(await screen.findByText('Nothing awaiting approval or activation')).toBeTruthy();
    expect(screen.getByText('Validated drafts appear here for an independent approver; approved bundles until they are activated and verified.')).toBeTruthy();
  });

  it('a failed read says so with Retry, and Retry reads again', async () => {
    summaries.mockImplementation(async () => { throw new Error('The service is currently unavailable. Try again shortly.'); });
    mount();
    expect(await screen.findByText('The bundle list could not be read')).toBeTruthy();
    const before = summaries.mock.calls.length;
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(summaries.mock.calls.length).toBeGreaterThan(before));
  });

  it('without cpm.config.read it says so in words and reads nothing (it showed the raw 403; CHG-202: no key)', () => {
    held = ['system.manage'];
    mount();
    expect(screen.getByText('You do not have permission to view approvals')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/cpm\.config\.read/);
    expect(summaries).not.toHaveBeenCalled();
  });

  it('names a site by its plant name, a profile in words, and the signed-in author by name (CHG-202)', async () => {
    me = { user_id: 'u-1', username: 'b_engineer', full_name: 'Bea Engineer' };
    summaries.mockImplementation(async (site: string) => ({ site, bundles: site === 'hdpe'
      ? [bundle({ scopeKind: 'PROFILE', scopeRef: 'pid_flow', version: 4 }), bundle({ bundleId: 'b-9', scopeKind: 'SITE', scopeRef: null, version: 2, updatedAt: '2026-11-08T09:00:00Z' })]
      : [bundle({ bundleId: 'b-7', site: 'site2', scopeRef: 'X1', updatedAt: '2026-11-07T09:00:00Z' })] }));
    mount();
    const panel = await screen.findByRole('complementary');
    expect(within(panel).getByRole('heading', { name: 'PID flow · v4' })).toBeTruthy();
    expect(within(panel).getByText('Scope').nextElementSibling?.textContent).toBe('Profile PID flow');
    expect(within(panel).getByText('Author').nextElementSibling?.textContent).toBe('Bea Engineer');
    expect(screen.getByText('HDPE Plant · v2')).toBeTruthy();
    expect(screen.getAllByText(/· Site Two/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/pid_flow|\bhdpe\b|b_engineer/)).toHaveLength(0);
  });
});
