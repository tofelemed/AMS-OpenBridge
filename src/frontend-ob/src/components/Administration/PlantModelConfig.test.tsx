// @vitest-environment jsdom
// CHG-172 (owner review, the approved sample, badges 16-18): Plant model with the onboarding strip above the tree (its counts
// load with the page); the tree shows level, name and the path under it, CPM once on the loop's device; the row buttons moved
// into the node panel (Add …, Edit, Delete; Path with Copy, Template, Managed by; Loop Registry → for a CPM node). The editor in
// titled parts, the delete confirmation word for word ending in Delete. Every request as before.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';

const { apiJson, apiFetch, toastError } = vi.hoisted(() => ({ apiJson: vi.fn(), apiFetch: vi.fn(), toastError: vi.fn() }));
let held = ['asset.view', 'asset.edit', 'analytics.view', 'ingestion.view'];
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('../../store/authStore', () => ({ useAuthStore: (pick: (s: unknown) => unknown) => pick({ hasPermission: (p: string) => held.includes(p) }) }));
vi.mock('../../api/apiFetch', async () => {
  const real = await vi.importActual<typeof import('../../api/apiFetch')>('../../api/apiFetch');
  return { ...real, apiJson, apiFetch };
});
vi.mock('./dataSourcesApi', async () => {
  const real = await vi.importActual<typeof import('./dataSourcesApi')>('./dataSourcesApi');
  return { ...real, listDataSources: async () => Array.from({ length: 8 }, () => ({})) };
});
vi.mock('./PlantModelImport', () => ({ ImportDialog: () => <div role="dialog" aria-label="Import plant model from CSV" /> }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: toastError } }));

import { PlantModelConfig } from './PlantModelConfig';

const P = 'hdpe/section_100/u1001_polymerization_reactor_1';
const node = (id: string, type: number, name: string, contextualPath: string, over: object = {}) => ({ id, type, name, contextualPath, ...over });
const SITE = node('hdpe', 1, 'HDPE Plant', 'hdpe');
const AREA = node('s100', 2, 'Section 100', 'hdpe/section_100');
const UNIT = node('u1001', 3, '1001-Polymerization Reactor 1', P);
const DEVICE = node('fc', 4, 'FC10711', `${P}/fc10711`, { template: 'CpmLoop' });
const SIGNAL = node('fcpv', 5, 'FC10711 PV', `${P}/fc10711.pv`, { template: 'CpmLoopSignal', engineeringUnit: 'm3/h' });
const children: Record<string, object[]> = { hdpe: [AREA], s100: [UNIT], u1001: [DEVICE], fc: [SIGNAL] };
const counts: Record<string, number> = { 1: 3, 2: 8, 3: 29, 4: 273, 5: 1102 };

const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
const show = async (at = '/admin/plant-model') => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[at]}><PlantModelConfig /><Where /></MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole('button', { name: /^HDPE Plant/ });
};
const open = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Expand ${name}` }));
const pick = (name: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
const panel = () => screen.getByRole('complementary');
const dialog = (name: string) => screen.getByRole('dialog', { name });
const posts = () => apiJson.mock.calls.filter(c => c[1]?.method);

beforeEach(() => {
  held = ['asset.view', 'asset.edit', 'analytics.view', 'ingestion.view'];
  toastError.mockReset();
  apiFetch.mockReset().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
  apiJson.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method) return {};
    const q = new URLSearchParams(url.split('?')[1] ?? '');
    if (url.startsWith('/api/aliases')) return { total: 703 };
    if (url.startsWith('/api/v1/cpm/loops')) return { loops: [...Array(241).fill({ monitoringEnabled: true }), { monitoringEnabled: false }, { monitoringEnabled: false }] };
    if (q.get('take') === '1') return { total: counts[q.get('type') ?? ''] ?? 0 };
    if (q.get('type') === '1') return { assets: [SITE] };
    if (q.get('parentId')) return { assets: children[q.get('parentId')!] ?? [] };
    if (q.get('search')) return { assets: [DEVICE] };
    return { assets: [] };
  });
});
afterEach(cleanup);

describe('the onboarding strip', () => {
  it('shows the five stages with their counts when the page opens', async () => {
    await show();
    const strip = screen.getByRole('region', { name: 'Onboarding stages' });
    await waitFor(() => expect(strip.textContent).toContain('3 / 8 / 29'));
    expect(strip.textContent).toContain('273 / 1102');
    expect(strip.textContent).toContain('703');
    expect(strip.textContent).toContain('243 (241 monitored)');
    expect(strip.textContent).toContain('1 · Hierarchy');
    expect(strip.textContent).toContain('5 · Ingestion sources');
    expect(screen.queryByText('Each stage feeds the next.')).toBeNull();
  });
});

describe('the tree', () => {
  it('shows level, name and the path under it; CPM only on the loop device; no buttons in the rows', async () => {
    await show();
    open('HDPE Plant');
    open(await screen.findByText('Section 100').then(() => 'Section 100'));
    open(await screen.findByText('1001-Polymerization Reactor 1').then(() => '1001-Polymerization Reactor 1'));
    await screen.findByText('FC10711');
    open('FC10711');
    await screen.findByText('FC10711 PV');
    const tree = screen.getByRole('region', { name: 'Plant model' });
    expect(within(tree).getAllByText('CPM')).toHaveLength(1);
    expect(within(tree).getByText(`${P}/fc10711`)).toBeTruthy();
    expect(within(tree).queryByRole('button', { name: /Edit|Delete|\+ / })).toBeNull();
  });

  it('searches from two characters and opens on the search a link names', async () => {
    await show();
    const box = screen.getByRole('searchbox', { name: 'Find in plant model' });
    expect(box.getAttribute('placeholder')).toBe('Name or path, 2 characters or more');
    fireEvent.change(box, { target: { value: 'f' } });
    expect(apiJson.mock.calls.some(c => String(c[0]).includes('search='))).toBe(false);
    fireEvent.change(box, { target: { value: 'fc' } });
    await waitFor(() => expect(apiJson.mock.calls.some(c => c[0] === '/api/assets?search=fc&take=200')).toBe(true));
    cleanup();
    render(
      <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/admin/plant-model?search=fc10711']}><PlantModelConfig /></MemoryRouter></QueryClientProvider>,
    );
    await waitFor(() => expect(apiJson.mock.calls.some(c => c[0] === '/api/assets?search=fc10711&take=200')).toBe(true));
  });
});

describe('the node panel', () => {
  it('holds the path, the template, who manages it, the actions and Loop Registry for a CPM node', async () => {
    await show();
    open('HDPE Plant'); await screen.findByText('Section 100');
    open('Section 100'); await screen.findByText('1001-Polymerization Reactor 1');
    open('1001-Polymerization Reactor 1'); await screen.findByText('FC10711');
    pick('FC10711');
    const p = panel();
    expect(within(p).getByText('Device')).toBeTruthy();
    expect(within(p).getByRole('heading', { level: 2 }).textContent).toBe('FC10711');
    expect(p.textContent).toContain(`Path${P}/fc10711`);
    expect(within(p).getByRole('button', { name: 'Copy path' })).toBeTruthy();
    expect(p.textContent).toContain('TemplateCpmLoop');
    expect(p.textContent).toContain('Managed byCPM Loop Registry');
    expect(within(p).getAllByRole('button').map(b => b.textContent)).toEqual(expect.arrayContaining(['Add Measurement', 'Edit', 'Delete', 'Loop Registry →']));
    fireEvent.click(within(p).getByRole('button', { name: 'Loop Registry →' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/registry?loop=FC10711');
  });

  it('adds a child in titled parts with the same request', async () => {
    await show();
    pick('HDPE Plant');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add Area' }));
    const d = dialog('Add Area');
    expect(within(d).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Place', 'Names']);
    expect(d.textContent).toContain('UnderHDPE Plant · hdpe');
    fireEvent.change(within(d).getByLabelText('Display name *'), { target: { value: 'Section 700' } });
    expect(d.textContent).toContain('Full pathhdpe/section_700');
    expect(within(d).getByText('The path segment is permanent identity — the display name can change later.')).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Create Area' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][0]).toBe('/api/assets');
    expect(JSON.parse(posts()[0][1].body)).toEqual({
      contextualPath: 'hdpe/section_700', name: 'Section 700', type: 2, description: null, template: null,
      engineeringUnit: null, loEngLimit: null, hiEngLimit: null, parentId: 'hdpe',
    });
  });

  it('refuses an invalid path segment and says why the button is off', async () => {
    await show();
    pick('HDPE Plant');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add Area' }));
    const d = dialog('Add Area');
    expect((within(d).getByRole('button', { name: 'Create Area' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(d).getByText('Display name is required')).toBeTruthy();
    fireEvent.change(within(d).getByLabelText('Display name *'), { target: { value: 'Section 7' } });
    fireEvent.change(within(d).getByLabelText('Path segment *'), { target: { value: 'section 7' } });
    expect(within(d).getAllByText('Invalid segment — letters, digits, _ and - only').length).toBeGreaterThan(0);
    expect((within(d).getByRole('button', { name: 'Create Area' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('edits a node with the same request', async () => {
    await show();
    pick('HDPE Plant');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Edit' }));
    const d = dialog('Edit Site');
    expect(d.textContent).toContain('Pathhdpe');
    fireEvent.change(within(d).getByLabelText('Display name *'), { target: { value: 'HDPE Plant North' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][0]).toBe('/api/assets/hdpe');
    expect(posts()[0][1].method).toBe('PUT');
    expect(JSON.parse(posts()[0][1].body)).toEqual({ name: 'HDPE Plant North', description: '', template: '' });
  });

  it('asks before deleting, word for word, and shows a refusal', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'Asset has children' }) });
    await show();
    pick('HDPE Plant');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete' }));
    const d = dialog('Delete Site');
    expect(within(d).getByText("Delete 'HDPE Plant' (hdpe)? Deletes are refused while children or control loops still reference it.")).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/assets/hdpe', { method: 'DELETE' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Asset has children'));
  });

  it('keeps Import CSV and Add site for asset.edit, and shows a reader the facts only', async () => {
    await show();
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add site' }));
    expect(dialog('Add Site')).toBeTruthy();
    cleanup();
    held = ['asset.view'];
    await show();
    expect(screen.queryByRole('button', { name: 'Add site' })).toBeNull();
    pick('HDPE Plant');
    expect(within(panel()).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(panel().textContent).toContain('Pathhdpe');
  });
});
