// The Gate Configuration start page: one filter bar, the plant-wide notice, the two tables, the old-link redirect.
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { setActiveZone } from '../../../cpa/activeZone';
import { ConfigStartPage } from './ConfigStartPage';
import { LOOPS, respond } from './configTestData';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));

const ALL = ['cpm.config.read', 'cpm.config.draft'];
let stale = { site: 'hdpe', count: 2, loops: [{}, {}] as unknown[] };
let twoSites = false;
let failDrafts = false;
let pendingDrafts = false;

const LocationProbe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };
function renderAt(search: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/cpm/config${search}`]}>
        <Routes><Route path="*" element={<><ConfigStartPage /><LocationProbe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const loc = () => screen.getByTestId('loc').textContent ?? '';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const summary = (id: string, version: number, state: string, over: Record<string, unknown> = {}) => ({
  bundleId: id, version, contentHash: 'h', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY', state,
  effectiveFrom: '2026-11-23T06:23:00Z', createdBy: 'superadmin', createdAt: '2026-11-23T06:54:00Z', updatedAt: '2026-11-23T06:54:00Z', note: null, validationErrors: 0, ...over,
});
const BUNDLES = [
  summary('l12', 12, 'ACTIVE_VERIFIED', { scopeRef: 'FIC10302' }),
  summary('l3', 3, 'ACTIVE_VERIFIED', { scopeRef: 'FIC10301' }),
  summary('s1', 1, 'ACTIVE_VERIFIED', { scopeKind: 'SITE', scopeRef: null }),
  summary('p1', 1, 'ACTIVE_VERIFIED', { scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG' }),
  summary('l13', 13, 'SHADOW_EVALUATED', { scopeRef: 'FIC10302', note: '[batch 3c410b59-00db-499d-a130-4e72f3f3764f inherit] Wider region for the new feed rate' }),
];

describe('ConfigStartPage', () => {
  beforeAll(() => setActiveZone('UTC'));
  beforeEach(() => {
    stale = { site: 'hdpe', count: 2, loops: [{}, {}] };
    twoSites = false; failDrafts = false; pendingDrafts = false;
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => {
      if (url.includes('/configuration/regions?')) return { count: 2, loops: [
        { loopId: 'FIC10302', site: 'hdpe', regionMin: 20, regionMax: 100, source: 'LOOP' }, { loopId: 'FIC10301', site: 'hdpe', source: 'NONE' }, { loopId: 'FIC10303', site: 'hdpe', regionMin: 1, regionMax: 2, source: 'LOOP' }] };
      if (url.includes('/configuration/loop-settings/stale?')) return stale;
      if (url.includes('/configuration/drafts?') && failDrafts) throw new Error('boom');
      if (url.includes('/configuration/drafts?') && pendingDrafts) return new Promise(() => undefined);
      if (url.includes('/configuration/drafts?')) return { site: 'hdpe', bundles: BUNDLES };
      if (url.endsWith('/loops') || url.includes('/loops?')) return twoSites ? { loops: [...LOOPS.loops, { ...LOOPS.loops[0], loopId: 'TIC20001', site: 'other' }] } : LOOPS;
      return respond(url);
    });
    vi.mocked(fetchMod.apiFetch).mockReset();
    useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions: ALL }, status: 'authenticated', accessToken: 't' });
  });
  afterEach(cleanup);

  it('the loop search and How to read; picking a loop opens its page', async () => {
    renderAt('');
    expect(screen.getAllByRole('combobox', { name: 'Loop' }).length).toBe(1);
    expect(screen.getByRole('button', { name: 'How to read' })).toBeTruthy();
    fireEvent.click(screen.getByRole('combobox', { name: 'Loop' }));
    fireEvent.mouseDown(await screen.findByRole('option', { name: /FIC10302/ }));
    await waitFor(() => expect(loc()).toBe('/cpm/config/loops/FIC10302'));
  });

  it('has one filter bar: loop search, Loop type, Whole plant, Operating regions - and no cards', async () => {
    renderAt('');
    const bar = screen.getByRole('group', { name: 'Choose what to change' });
    expect(within(bar).getAllByRole('combobox', { name: 'Loop' }).length).toBe(1);
    expect(within(bar).getByLabelText('Loop type')).toBeTruthy();
    expect(within(bar).getByLabelText('Whole plant')).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Operating regions' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Where to start' })).toBeNull();
    for (const t of ['One loop', 'A loop type', 'with own settings', 'Edit regions', 'Choose a type']) expect(screen.queryByText(new RegExp(t))).toBeNull();
    fireEvent.click(within(bar).getByRole('button', { name: 'Operating regions' }));
    expect(loc()).toBe('/cpm/config/regions');
  });

  it('choosing a loop type opens its page and the select goes back to its label', async () => {
    renderAt('?site=hdpe');
    const type = screen.getByLabelText('Loop type') as HTMLSelectElement;
    await waitFor(() => expect(type.disabled).toBe(false));
    expect(Array.from(type.options).map(o => o.textContent)).toEqual(['Loop type', 'Flow, fast self-regulating']);
    fireEvent.change(type, { target: { value: 'FLOW_FAST_SELF_REG' } });
    expect(loc()).toBe('/cpm/config/types/FLOW_FAST_SELF_REG?site=hdpe');
    expect(type.value).toBe('');
  });

  it('choosing a plant opens the plant page', async () => {
    twoSites = true;
    renderAt('');
    const plant = screen.getByLabelText('Whole plant') as HTMLSelectElement;
    await waitFor(() => expect(plant.options.length).toBe(3));
    fireEvent.change(plant, { target: { value: 'other' } });
    expect(loc()).toBe('/cpm/config/plant/other');
  });

  it('lists the changes in progress and Continue goes to the next step', async () => {
    renderAt('');
    const region = await screen.findByRole('region', { name: 'Changes in progress' });
    expect(await within(region).findByText('FIC10302 · own settings v13')).toBeTruthy();
    expect(within(region).getByText('Wider region for the new feed rate')).toBeTruthy();
    expect(within(region).getByText('Approve')).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Continue' }));
    expect(loc()).toBe('/cpm/config/changes/l13?step=approve');
  });

  it('lists what runs now without a state column and with the service name only when it is real', async () => {
    renderAt('');
    const region = await screen.findByRole('region', { name: 'Running now' });
    await within(region).findByText('Whole plant');
    const rows = within(region).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows[0]).toContain('Plant settings v1');
    expect(rows.some(r => r?.includes('FIC10302') && r.includes('Reactor feed flow') && r.includes('Own settings v12'))).toBe(true);
    expect(within(region).queryByText('State')).toBeNull();
    expect(screen.queryByText(/Flow controller/)).toBeNull();
  });

  it('the stale notice updates the loops with a reason and opens the batch', async () => {
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ok({ batchId: 'b7', count: 2, drafts: 2, failed: 0, rows: [] }));
    renderAt('');
    expect(await screen.findByText("2 loops don't have the latest plant settings yet")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Update them' }));
    const dialog = screen.getByRole('dialog', { name: 'Update 2 loops' });
    const update = within(dialog).getByRole('button', { name: 'Update' }) as HTMLButtonElement;
    expect(update.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'plant review' } });
    fireEvent.click(update);
    await waitFor(() => expect(loc()).toBe('/cpm/config/regions?batch=b7'));
    expect(JSON.parse(String((vi.mocked(fetchMod.apiFetch).mock.calls.find(c => (c[1] as RequestInit | undefined)?.body)![1] as RequestInit).body))).toMatchObject({ site: 'hdpe', note: 'plant review' });
  });

  it('a failed summaries read says so with Retry, never "Factory settings" or "Nothing in progress"', async () => {
    failDrafts = true;
    renderAt('');
    const region = await screen.findByRole('region', { name: 'Changes in progress' });
    expect(await within(region).findByRole('button', { name: /retry/i })).toBeTruthy();
    expect(screen.queryByText('Factory settings')).toBeNull();
    expect(screen.queryByText('Nothing in progress.')).toBeNull();
    expect(screen.queryByText('Every loop runs on factory settings.')).toBeNull();
  });

  it('a pending summaries read shows no empty copy', async () => {
    pendingDrafts = true;
    renderAt('');
    await screen.findByRole('region', { name: 'Changes in progress' });
    await waitFor(() => expect(screen.getByRole('group', { name: 'Choose what to change' })).toBeTruthy());
    expect((screen.getByLabelText('Loop type') as HTMLSelectElement).disabled).toBe(false);
    expect(screen.queryByText('Nothing in progress.')).toBeNull();
    expect(screen.queryByText('Every loop runs on factory settings.')).toBeNull();
    expect(screen.queryByText('Factory settings')).toBeNull();
  });

  it('an old link goes to its new page', async () => {
    renderAt('?loop=FIC10302&view=bundles');
    await waitFor(() => expect(loc()).toBe('/cpm/config/loops/FIC10302?tab=versions'));
  });
});
