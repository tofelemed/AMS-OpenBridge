// CHG-219 (owner-approved design docs/next-release/gate-configuration-per-loop-design.md): the third view. Effective | Bundles |
// Per-loop settings; the table of regions with their source; Edit regions -> Save sends only the changed rows as one batch, which
// opens above the table; the author as Admin approves alone; Deploy; the stale notice prepares new versions.
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { setActiveZone } from '../../../cpa/activeZone';
import { GateConfigurationWorkspace } from './GateConfigurationWorkspace';
import { respond } from './configTestData';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));

const ALL = ['cpm.config.read', 'cpm.config.draft', 'cpm.config.validate', 'cpm.config.shadow', 'cpm.config.approve', 'cpm.config.activate', 'cpm.config.rollback'];
const REGIONS = { count: 2, loops: [
  { loopId: 'FIC10302', displayName: 'Reactor feed flow', loopType: 'FIC', site: 'hdpe', pvRangeMin: 0, pvRangeMax: 120, regionMin: 20, regionMax: 100, source: 'LOOP', bundleId: 'l6', bundleVersion: 6 },
  { loopId: 'FIC10301', displayName: null, loopType: 'FIC', site: 'hdpe', pvRangeMin: 0, pvRangeMax: 50, regionMin: null, regionMax: null, source: 'NONE', bundleId: null, bundleVersion: null },
] };
const BATCH = { batchId: 'b1', site: 'hdpe', count: 1, createdBy: 'admin', rows: [
  { loopId: 'FIC10301', site: 'hdpe', bundleId: 'n1', version: 1, state: 'VALIDATED', pvMin: 5, pvMax: 45, previousMin: null, previousMax: null, error: null, problems: [], deploymentId: null, deploymentState: null, createdBy: 'admin' },
] };
let stale = { site: 'hdpe', count: 0, loops: [] as unknown[] };

const LocationProbe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };
function renderAt(search: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/cpm/config${search}`]}>
        <Routes><Route path="/cpm/config" element={<><GateConfigurationWorkspace /><LocationProbe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const loc = () => screen.getByTestId('loc').textContent ?? '';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const writes = () => vi.mocked(fetchMod.apiFetch).mock.calls.map(([url, init]) => ({
  method: (init as RequestInit | undefined)?.method, url: String(url),
  body: (init as RequestInit | undefined)?.body ? JSON.parse(String((init as RequestInit).body)) : undefined,
}));
const asUser = (role: string) => useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role, is_active: true, permissions: ALL }, status: 'authenticated', accessToken: 't' });
const table = () => screen.getByRole('region', { name: 'Per-loop settings' });

describe('Per-loop settings', () => {
  beforeAll(() => setActiveZone('UTC'));
  beforeEach(() => {
    stale = { site: 'hdpe', count: 0, loops: [] };
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => {
      if (url.includes('/configuration/regions?')) return REGIONS;
      if (url.includes('/configuration/loop-settings/stale?')) return stale;
      if (url.includes('/configuration/batches/b1?')) return BATCH;
      return respond(url);
    });
    vi.mocked(fetchMod.apiFetch).mockReset();
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ok({ batchId: 'b1', count: 1, drafts: 1, failed: 0, rows: BATCH.rows }));
    asUser('Admin');
  });
  afterEach(cleanup);

  it('is the third view; the table shows each loop region, PV range and where the region comes from', async () => {
    renderAt('');
    await screen.findByRole('button', { name: 'Per-loop settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Per-loop settings' }));
    await waitFor(() => expect(loc()).toBe('/cpm/config?view=per-loop'));
    await waitFor(() => expect(within(table()).getAllByRole('row').length).toBe(3));
    const [, first, second] = within(table()).getAllByRole('row').map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent));
    expect(first).toEqual(['FIC10301', 'FIC', '0 – 50', '', '', 'None', '—']);
    expect(second).toEqual(['FIC10302Reactor feed flow', 'FIC', '0 – 120', '20', '100', 'Own', '—']);
    expect(screen.queryByRole('region', { name: 'Batch' })).toBeNull();
  });

  it('Edit regions -> Save sends only the changed rows as one batch, which opens above the table', async () => {
    renderAt('?view=per-loop');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit regions' }));
    expect((screen.getByRole('button', { name: 'Save 0 changes' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('FIC10301 region min'), { target: { value: '5' } });
    expect((screen.getByRole('button', { name: 'Save 0 changes' }) as HTMLButtonElement).disabled).toBe(true);   // half a region
    expect(within(table()).getByText('Give both values, or leave both empty')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('FIC10301 region max'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'commissioning' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await waitFor(() => expect(writes()).toEqual([{ method: 'POST', url: '/api/v1/cpm/configuration/regions', body: { regions: [{ loopId: 'FIC10301', pvMin: 5, pvMax: 45 }], note: 'commissioning' } }]));
    await waitFor(() => expect(loc()).toBe('/cpm/config?view=per-loop&batch=b1'));
    const panel = await screen.findByRole('region', { name: 'Batch' });
    await waitFor(() => expect(within(panel).getByText('5 – 45')).toBeTruthy());
    expect(within(panel).getByText('Validated')).toBeTruthy();
    expect(within(table()).getAllByText('Validated').length).toBe(1);                    // the Pending column follows the batch
  });

  it('the author as Admin approves alone; then Deploy; a second person is needed otherwise', async () => {
    renderAt('?view=per-loop&batch=b1');
    const panel = await screen.findByRole('region', { name: 'Batch' });
    const approve = await within(panel).findByRole('button', { name: 'Approve alone (Admin)' });
    fireEvent.click(approve);
    await waitFor(() => expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/v1/cpm/configuration/batches/b1/approve?site=hdpe', body: { note: '', validityHours: 72 } }));
    cleanup();
    asUser('Engineer');
    renderAt('?view=per-loop&batch=b1');
    const again = await screen.findByRole('region', { name: 'Batch' });
    const blocked = await within(again).findByRole('button', { name: 'Approve' });
    expect((blocked as HTMLButtonElement).disabled).toBe(true);
    expect(within(again).getByText('Needs a second person')).toBeTruthy();
  });

  it('after a plant-wide change the stale notice prepares new versions in one batch', async () => {
    stale = { site: 'hdpe', count: 2, loops: [{}, {}] };
    renderAt('?view=per-loop');
    expect(await screen.findByText('2 loops have their own settings on the previous plant-wide settings.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare their new versions' }));
    await waitFor(() => expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/v1/cpm/configuration/loop-settings/restack', body: { site: 'hdpe' } }));
    await waitFor(() => expect(loc()).toBe('/cpm/config?view=per-loop&batch=b1'));
  });
});
