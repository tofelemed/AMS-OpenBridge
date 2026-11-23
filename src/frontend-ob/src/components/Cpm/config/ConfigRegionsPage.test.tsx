// Gate Configuration journey, task 9: the Operating regions page, its many-loop dialog and "Use plant-wide settings".
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { ConfigRegionsPage } from './ConfigRegionsPage';
import { LOOPS, respond } from './configTestData';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-info', () => ({ ObiInfo: () => null }));

const ALL = ['cpm.config.read', 'cpm.config.draft', 'cpm.config.approve', 'cpm.config.activate'];
const REGIONS = { count: 3, loops: [
  { loopId: 'FIC10301', loopType: 'FIC', site: 'hdpe', pvRangeMin: 0, pvRangeMax: 140, source: 'NONE' },
  { loopId: 'FIC10302', displayName: 'Reactor feed flow', loopType: 'FIC', site: 'hdpe', pvRangeMin: 0, pvRangeMax: 200, regionMin: 90, regionMax: 120, source: 'LOOP', bundleId: 'l12', bundleVersion: 12 },
  { loopId: 'FIC10401', displayName: 'Flow controller FIC10401 (FCS0101)', loopType: 'FIC', site: 'hdpe', regionMin: 771, regionMax: 829, source: 'PROFILE' },
] };
const BATCH = { batchId: 'b1', site: 'hdpe', count: 2, createdBy: 'admin', rows: [
  { loopId: 'FIC10301', site: 'hdpe', bundleId: 'n1', version: 1, state: 'VALIDATED', pvMin: 5, pvMax: 45, error: null, problems: [], deploymentId: null, deploymentState: null, createdBy: 'admin' },
  { loopId: 'FIC10302', site: 'hdpe', bundleId: 'n2', version: 13, state: 'VALIDATED', pvMin: null, pvMax: null, error: null, problems: [], deploymentId: null, deploymentState: null, createdBy: 'admin', inherits: true },
] };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const Probe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };
function renderAt(search = '?site=hdpe') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[`/cpm/config/regions${search}`]}>
    <Routes><Route path="/cpm/config/regions" element={<><ConfigRegionsPage /><Probe /></>} /></Routes>
  </MemoryRouter></QueryClientProvider>);
}
const loc = () => screen.getByTestId('loc').textContent ?? '';
const pick = (loopId: string) => fireEvent.click(screen.getByRole('checkbox', { name: `Select ${loopId}` }));
const bodyOf = (i: number) => JSON.parse(String((vi.mocked(fetchMod.apiFetch).mock.calls[i][1] as RequestInit).body));

describe('ConfigRegionsPage', () => {
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => {
      if (url.includes('/configuration/regions?')) return REGIONS;
      if (url.includes('/configuration/loop-settings/stale?')) return { site: 'hdpe', count: 0, loops: [] };
      if (url.includes('/configuration/batches/b1?')) return BATCH;
      return respond(url);
    });
    vi.mocked(fetchMod.apiFetch).mockReset();
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ok({ batchId: 'b1', count: 1, drafts: 1, failed: 0, rows: BATCH.rows }));
    useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions: ALL }, status: 'authenticated', accessToken: 't' });
  });
  afterEach(cleanup);

  it('lists Loop, Type, PV range, Region, From, with a name only when the plant gave one', async () => {
    renderAt();
    await screen.findByRole('checkbox', { name: 'Select FIC10301' });
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['', 'Loop', 'Type', 'PV range', 'Region', 'From']);
    const rows = within(table).getAllByRole('row').slice(1).map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent));
    expect(rows[0].slice(1)).toEqual(['FIC10301', 'FIC', '0 – 140', '—', '—']);
    expect(rows[1].slice(1)).toEqual(['FIC10302Reactor feed flow', 'FIC', '0 – 200', '90 – 120', 'Own settings v12']);
    expect(rows[2].slice(1)).toEqual(['FIC10401', 'FIC', '', '771 – 829', 'Type settings']);
    expect(screen.getByRole('heading', { name: 'Operating regions' })).toBeTruthy();
  });

  it('with several plants and none chosen it asks for a plant', async () => {
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => (url.includes('/loops') && !url.includes('/configuration')
      ? { loops: [...LOOPS.loops, { ...LOOPS.loops[0], loopId: 'X1', site: 'other' }] } : respond(url)));
    renderAt('');
    expect(await screen.findByText('Choose a plant in the header')).toBeTruthy();
  });

  it('two selected rows enable "Edit regions (2)"; the dialog flags 150 on a 0 - 140 loop; Save posts one batch and the page shows it', async () => {
    renderAt();
    await screen.findByRole('checkbox', { name: 'Select FIC10301' });
    expect((screen.getByRole('button', { name: 'Edit regions (0)' }) as HTMLButtonElement).disabled).toBe(true);
    pick('FIC10301'); pick('FIC10302');
    fireEvent.click(screen.getByRole('button', { name: 'Edit regions (2)' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByRole('heading', { name: 'Operating regions · 2 loops' })).toBeTruthy();
    expect(within(dlg).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Loop', 'PV range', 'Now', 'Minimum', 'Maximum']);
    const save = within(dlg).getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    fireEvent.change(within(dlg).getByLabelText('FIC10301 Minimum'), { target: { value: '51.4' } });
    fireEvent.change(within(dlg).getByLabelText('FIC10301 Maximum'), { target: { value: '150' } });
    expect(within(dlg).getByText('Above the PV range')).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText('Reason'), { target: { value: 'Recommended regions' } });
    expect(save.disabled).toBe(false);
    fireEvent.change(within(dlg).getByLabelText('FIC10302 Maximum'), { target: { value: 'x' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dlg).getByLabelText('FIC10302 Maximum'), { target: { value: '120' } });
    fireEvent.click(save);
    await waitFor(() => expect(vi.mocked(fetchMod.apiFetch)).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toEqual({ regions: [{ loopId: 'FIC10301', pvMin: 51.4, pvMax: 150 }], note: 'Recommended regions' });
    await waitFor(() => expect(loc()).toBe('/cpm/config/regions?site=hdpe&batch=b1'));
    const panel = await screen.findByRole('region', { name: 'Batch' });
    expect(await within(panel).findByRole('button', { name: 'Approve alone' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Deploy' })).toBeTruthy();
    expect(within(panel).getByText('Uses the plant-wide settings')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Use plant-wide settings" is offered when every selected loop has its own settings, and posts the loops with the reason', async () => {
    renderAt();
    await screen.findByRole('checkbox', { name: 'Select FIC10301' });
    pick('FIC10302'); pick('FIC10301');
    expect(screen.queryByRole('button', { name: /^Use plant-wide settings/ })).toBeNull();
    pick('FIC10301');
    fireEvent.click(screen.getByRole('button', { name: 'Use plant-wide settings (1)' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByRole('heading', { name: 'Use plant-wide settings · 1 loop' })).toBeTruthy();
    expect(within(dlg).getByText('FIC10302')).toBeTruthy();
    const go = within(dlg).getByRole('button', { name: 'Use plant-wide settings' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(within(dlg).getByLabelText('Reason'), { target: { value: 'Back to the plant defaults' } });
    fireEvent.click(go);
    await waitFor(() => expect(vi.mocked(fetchMod.apiFetch)).toHaveBeenCalledTimes(1));
    expect(String(vi.mocked(fetchMod.apiFetch).mock.calls[0][0])).toBe('/api/v1/cpm/configuration/loop-settings/inherit');
    expect(bodyOf(0)).toEqual({ site: 'hdpe', loopIds: ['FIC10302'], note: 'Back to the plant defaults' });
    await waitFor(() => expect(loc()).toBe('/cpm/config/regions?site=hdpe&batch=b1'));
  });

  it('a loop the server refuses shows its reason in the dialog', async () => {
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ok({ batchId: 'b2', count: 1, drafts: 0, failed: 1, rows: [{ loopId: 'FIC10302', error: 'the loop already uses the plant-wide settings' }] }));
    renderAt();
    await screen.findByRole('checkbox', { name: 'Select FIC10301' });
    pick('FIC10302');
    fireEvent.click(screen.getByRole('button', { name: 'Use plant-wide settings (1)' }));
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText('Reason'), { target: { value: 'x' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Use plant-wide settings' }));
    expect(await within(dlg).findByText('the loop already uses the plant-wide settings')).toBeTruthy();
  });

  it('a partial save keeps the refused loop and its reason on the page after the dialog closes', async () => {
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ok({ batchId: 'b1', count: 2, drafts: 1, failed: 1, rows: [
      ...BATCH.rows.slice(0, 1), { loopId: 'FIC10302', bundleId: null, error: 'the loop is retired', problems: [] }] }));
    renderAt();
    await screen.findByRole('checkbox', { name: 'Select FIC10301' });
    pick('FIC10301'); pick('FIC10302');
    fireEvent.click(screen.getByRole('button', { name: 'Edit regions (2)' }));
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText('FIC10301 Minimum'), { target: { value: '5' } });
    fireEvent.change(within(dlg).getByLabelText('FIC10301 Maximum'), { target: { value: '45' } });
    fireEvent.change(within(dlg).getByLabelText('Reason'), { target: { value: 'x' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('FIC10302')).toBeTruthy();
    expect(within(alert).getByText('the loop is retired')).toBeTruthy();
  });

  it('without permission to prepare changes the buttons are present, disabled, with the reason', async () => {
    useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Viewer', is_active: true, permissions: ['cpm.config.read'] }, status: 'authenticated', accessToken: 't' });
    renderAt();
    await screen.findByRole('checkbox', { name: 'Select FIC10301' });
    const b = screen.getByRole('button', { name: 'Edit regions (0)' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(screen.getByText('Needs permission to prepare changes')).toBeTruthy();
  });
});
