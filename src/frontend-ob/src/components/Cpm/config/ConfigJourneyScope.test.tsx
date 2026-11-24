// Final review I1 / M-f: the plant chosen in the header (?site=) travels with every link of the Gate Configuration journey, and an
// old link is replaced at once without reading the start page's data first. Two plants, so a dropped ?site= reads "Choose a plant".
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { setActiveZone } from '../../../cpa/activeZone';
import { useContextCarry } from '../../../cpa/useContextCarry';
import { ConfigStartPage } from './ConfigStartPage';
import { ConfigScopePage } from './ConfigScopePage';
import { ConfigRegionsPage } from './ConfigRegionsPage';
import { ConfigChangePage } from './ConfigChangePage';
import { BUNDLES, LOOPS, respond } from './configTestData';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-info', () => ({ ObiInfo: () => null }));

const sum = (id: string, version: number, state: string, over: Record<string, unknown> = {}) => ({
  bundleId: id, version, contentHash: 'h', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY', state,
  effectiveFrom: '2026-11-23T06:23:00Z', createdBy: 'superadmin', createdAt: '2026-11-23T06:54:00Z', updatedAt: '2026-11-23T06:54:00Z', note: null, validationErrors: 0, ...over,
});
const LOOP_ROWS = [sum('l12', 12, 'ACTIVE_VERIFIED'), sum('l13', 13, 'SHADOW_EVALUATED')];
const PROFILE_ROWS = [sum('p1', 1, 'ACTIVE_VERIFIED', { scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG' })];
const SITE_ROWS = [sum('s1', 1, 'ACTIVE_VERIFIED', { scopeKind: 'SITE', scopeRef: null })];
const TWO_PLANTS = { loops: [...LOOPS.loops, { ...LOOPS.loops[0], loopId: 'TIC20001', site: 'other' }] };
const REGIONS = { count: 1, loops: [{ loopId: 'FIC10302', loopType: 'FIC', site: 'hdpe', pvRangeMin: 0, pvRangeMax: 200, regionMin: 90, regionMax: 120, source: 'LOOP', bundleId: 'l12', bundleVersion: 12 }] };
const BATCH = { batchId: 'b7', site: 'hdpe', count: 1, rows: [{ loopId: 'FIC10302', site: 'hdpe', bundleId: 'n1', version: 13, state: 'VALIDATED', pvMin: 5, pvMax: 45, error: null, problems: [], deploymentId: null, deploymentState: null }] };
const L13 = { ...(BUNDLES.dv as object), bundleId: 'l13', version: 13, state: 'SHADOW_EVALUATED', scopeRef: 'FIC10302' };

function answer(url: string): unknown {
  if (url.endsWith('/loops')) return TWO_PLANTS;
  if (url.includes('/configuration/regions?')) return REGIONS;
  if (url.includes('/configuration/loop-settings/stale?')) return { site: 'hdpe', count: 2, loops: [{}, {}] };
  if (url.includes('/configuration/batches/b7?')) return BATCH;
  if (url.includes('/configuration/drafts?')) {
    const kind = new URL(`http://x${url}`).searchParams.get('scopeKind');
    const bundles = kind === 'LOOP' ? LOOP_ROWS : kind === 'PROFILE' ? PROFILE_ROWS : kind === 'SITE' ? SITE_ROWS : [...LOOP_ROWS, ...PROFILE_ROWS, ...SITE_ROWS];
    return { site: 'hdpe', projection: 'summary', bundles };
  }
  if (url.endsWith('/configuration/drafts/p1')) return { ...(BUNDLES.dv as object), bundleId: 'p1', version: 1, scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG', state: 'ACTIVE_VERIFIED' };
  if (url.endsWith('/configuration/drafts/l13')) return L13;
  return respond(url);
}

const Probe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };
/** The app shell's context carry (AppShell): puts the last page's loop back on a link that lacks it. */
const Carry: React.FC = () => { useContextCarry(); return null; };
function renderAt(url: string, onlyStart = false, carry = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/cpm/config" element={<ConfigStartPage />} />
          {!onlyStart && <>
            <Route path="/cpm/config/loops/:loopId" element={<ConfigScopePage kind="LOOP" />} />
            <Route path="/cpm/config/types/:profileId" element={<ConfigScopePage kind="PROFILE" />} />
            <Route path="/cpm/config/plant/:site" element={<ConfigScopePage kind="SITE" />} />
            <Route path="/cpm/config/regions" element={<ConfigRegionsPage />} />
            <Route path="/cpm/config/changes/:bundleId" element={<ConfigChangePage />} />
          </>}
          <Route path="*" element={null} />
        </Routes>
        <Probe />
        {carry && <Carry />}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const loc = () => screen.getByTestId('loc').textContent ?? '';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const backLink = () => screen.getAllByRole('link').find(a => a.classList.contains('cpm-reg-back'))!;

describe('the header plant travels with every journey link (I1)', () => {
  beforeAll(() => setActiveZone('UTC'));
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => answer(url));
    vi.mocked(fetchMod.apiFetch).mockReset();
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ok({ batchId: 'b7', count: 1, drafts: 1, failed: 0, rows: [], bundleId: 'new1' }));
    useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions: ['cpm.config.read', 'cpm.config.draft'] }, status: 'authenticated', accessToken: 't' });
  });
  afterEach(cleanup);

  it('a type chosen on the start page opens with the header plant, not "Choose a plant"', async () => {
    renderAt('/cpm/config?site=hdpe');
    const type = screen.getByLabelText('Loop type') as HTMLSelectElement;
    await waitFor(() => expect(type.disabled).toBe(false));
    fireEvent.change(type, { target: { value: 'FLOW_FAST_SELF_REG' } });
    expect(loc()).toBe('/cpm/config/types/FLOW_FAST_SELF_REG?site=hdpe');
    expect(await screen.findByRole('heading', { name: 'Flow, fast self-regulating' })).toBeTruthy();
    expect(screen.queryByText(/Choose a plant/)).toBeNull();
    expect(backLink().getAttribute('href')).toBe('/cpm/config?site=hdpe');
  });

  it('"Update them" opens the batch on the regions page with the header plant', async () => {
    renderAt('/cpm/config?site=hdpe');
    fireEvent.click(await screen.findByRole('button', { name: 'Update them' }));
    const dialog = screen.getByRole('dialog', { name: 'Update 2 loops' });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'plant review' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(loc()).toBe('/cpm/config/regions?site=hdpe&batch=b7'));
    expect(await screen.findByRole('heading', { name: 'Operating regions' })).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'Batch' })).toBeTruthy();
    expect(screen.queryByText(/Choose a plant/)).toBeNull();
    expect(backLink().getAttribute('href')).toBe('/cpm/config?site=hdpe');
  });

  it('Edit regions, the loop search and Continue keep the header plant; so do the change page links', async () => {
    renderAt('/cpm/config?site=hdpe');
    fireEvent.click(screen.getByRole('button', { name: 'Operating regions' }));
    expect(loc()).toBe('/cpm/config/regions?site=hdpe');
    cleanup();
    renderAt('/cpm/config?site=hdpe');
    fireEvent.click(screen.getByRole('combobox', { name: 'Loop' }));
    fireEvent.mouseDown(await screen.findByRole('option', { name: /FIC10302/ }));
    await waitFor(() => expect(loc()).toBe('/cpm/config/loops/FIC10302?site=hdpe&loop=FIC10302'));
    cleanup();
    renderAt('/cpm/config?site=hdpe');
    const changes = await screen.findByRole('region', { name: 'Changes in progress' });
    fireEvent.click(await within(changes).findByRole('button', { name: 'Continue' }));
    expect(loc()).toBe('/cpm/config/changes/l13?site=hdpe&step=approve');
    expect(await screen.findByRole('heading', { name: 'Own settings v13' })).toBeTruthy();
    expect(backLink().getAttribute('href')).toBe('/cpm/config/loops/FIC10302?site=hdpe');
    fireEvent.click(within(screen.getByRole('list', { name: 'Steps of this change' })).getByRole('button', { name: /^Check/ }));
    expect(loc()).toBe('/cpm/config/changes/l13?site=hdpe&step=check');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(loc()).toBe('/cpm/config/changes/l13?site=hdpe&step=try');
  });

  it('the loop page: back link, the change pill, a Versions row and Use plant-wide settings keep the header plant', async () => {
    renderAt('/cpm/config/loops/FIC10302?site=hdpe');
    expect(await screen.findByRole('heading', { name: 'FIC10302' })).toBeTruthy();
    expect(backLink().getAttribute('href')).toBe('/cpm/config?site=hdpe');
    expect((await screen.findByRole('link', { name: 'v13 waiting for approval' })).getAttribute('href')).toBe('/cpm/config/changes/l13?site=hdpe');
    fireEvent.click(screen.getByRole('button', { name: 'Use plant-wide settings' }));
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText('Reason'), { target: { value: 'Back to the plant defaults' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Use plant-wide settings' }));
    await waitFor(() => expect(loc()).toBe('/cpm/config/regions?site=hdpe&batch=b7'));
    expect(await screen.findByRole('heading', { name: 'Operating regions' })).toBeTruthy();
    cleanup();
    renderAt('/cpm/config/loops/FIC10302?site=hdpe&tab=versions');
    fireEvent.click(await screen.findByRole('button', { name: /Own settings v12/ }));
    await waitFor(() => expect(loc()).toBe('/cpm/config/changes/l12?site=hdpe'));
  });

  it('Change settings → Start opens the new change with the header plant', async () => {
    renderAt('/cpm/config/loops/FIC10302?site=hdpe');
    fireEvent.click(await screen.findByRole('button', { name: 'Change settings' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Wider region' } });
    const start = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement;
    await waitFor(() => expect(start.disabled).toBe(false));
    fireEvent.click(start);
    await waitFor(() => expect(loc()).toBe('/cpm/config/changes/new1?site=hdpe&step=edit'));
  });

  it('Edit region → Save opens the batch with the header plant', async () => {
    renderAt('/cpm/config/loops/FIC10302?site=hdpe');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit region' }));
    fireEvent.change(await screen.findByLabelText('Maximum'), { target: { value: '125' } });
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText('Reason'), { target: { value: 'Wider' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(loc()).toBe('/cpm/config/regions?site=hdpe&batch=b7'));
  });
});

describe('the loop the app carries (re-check of 007eebcc)', () => {
  beforeAll(() => setActiveZone('UTC'));
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => answer(url));
    useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions: ['cpm.config.read', 'cpm.config.draft'] }, status: 'authenticated', accessToken: 't' });
  });
  afterEach(cleanup);

  it('the sidebar link with a loop in context shows the start page, with that loop in the search', async () => {
    renderAt('/cpm/config?site=hdpe&loop=FIC10302', false, true);
    const bar = await screen.findByRole('group', { name: 'Choose what to change' });
    expect(loc()).toBe('/cpm/config?site=hdpe&loop=FIC10302');
    expect(within(bar).getByRole('combobox', { name: /^Loop FIC10302/ })).toBeTruthy();
  });

  it('the back link from a loop page reaches the start page even though the carry puts the loop back', async () => {
    renderAt('/cpm/config/loops/FIC10302?site=hdpe&loop=FIC10302', false, true);
    expect(await screen.findByRole('heading', { name: 'FIC10302' })).toBeTruthy();
    fireEvent.click(backLink());
    expect(await screen.findByRole('group', { name: 'Choose what to change' })).toBeTruthy();
    expect(loc()).toBe('/cpm/config?site=hdpe&loop=FIC10302');
  });

  it('a loop chosen in the search becomes the carried loop, not the one the page came with', async () => {
    renderAt('/cpm/config?site=hdpe&loop=FIC10302', false, true);
    fireEvent.click(await screen.findByRole('combobox', { name: /^Loop FIC10302/ }));
    fireEvent.mouseDown(await screen.findByRole('option', { name: /FIC10301/ }));
    await waitFor(() => expect(loc()).toBe('/cpm/config/loops/FIC10301?site=hdpe&loop=FIC10301'));
  });
});

describe('an old link (M-f)', () => {
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => answer(url));
    useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions: ['cpm.config.read', 'cpm.config.draft'] }, status: 'authenticated', accessToken: 't' });
  });
  afterEach(cleanup);

  it('is replaced at once, keeps the header plant and reads nothing of the start page first', async () => {
    renderAt('/cpm/config?site=hdpe&loop=FIC10302&view=bundles', true);
    await waitFor(() => expect(loc()).toBe('/cpm/config/loops/FIC10302?site=hdpe&tab=versions'));
    expect(vi.mocked(fetchMod.apiJson).mock.calls.map(c => String(c[0]))).toEqual([]);
    expect(screen.queryByRole('group', { name: 'Choose what to change' })).toBeNull();
  });
});
