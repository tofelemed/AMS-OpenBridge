// The loop, loop-type and plant pages of Gate Configuration: head, pills, buttons, three tabs.
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { setActiveZone } from '../../../cpa/activeZone';
import { ConfigScopePage } from './ConfigScopePage';
import { EFFECTIVE, LOOP_LEVEL, respond } from './configTestData';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, 'data-variant': p.variant }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-info', () => ({ ObiInfo: () => null }));

const sum = (id: string, version: number, state: string, over: Record<string, unknown> = {}) => ({
  bundleId: id, version, contentHash: 'h', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY', state,
  effectiveFrom: null, createdBy: 'superadmin', createdAt: '2026-11-23T06:54:00Z', updatedAt: '2026-11-23T06:54:00Z', note: null, validationErrors: 0, ...over,
});
const eff12 = { ...EFFECTIVE, bundle: { ...EFFECTIVE.bundle, bundleId: 'l12', version: 12 },
  properties: { ...EFFECTIVE.properties, 'G2r.pv_region_min': 90, 'G2r.pv_region_max': 120, 'G2r.out_of_domain_warn_fraction': 0.05 },
  sources: { ...EFFECTIVE.sources, 'G2r.pv_region_min': 'LOOP', 'G2r.pv_region_max': 'LOOP', 'G2r.out_of_domain_warn_fraction': 'FACTORY' } };
const effType = { ...EFFECTIVE, bundle: { ...EFFECTIVE.bundle, bundleId: 'p1', version: 1, scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG' } };
let effective: unknown = eff12;
let loopsFail = false;
let loopLevel: unknown[] = [];
const resetLevel = () => [sum('l12', 12, 'ACTIVE_VERIFIED'), sum('l13', 13, 'SHADOW_EVALUATED'), ...LOOP_LEVEL.slice(2)];

const Probe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };
function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/cpm/config/loops/:loopId" element={<><ConfigScopePage kind="LOOP" /><Probe /></>} />
          <Route path="/cpm/config/types/:profileId" element={<><ConfigScopePage kind="PROFILE" /><Probe /></>} />
          <Route path="/cpm/config/plant/:site" element={<><ConfigScopePage kind="SITE" /><Probe /></>} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const loc = () => screen.getByTestId('loc').textContent ?? '';
const asUser = (permissions: string[]) => useAuthStore.setState({
  user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions }, status: 'authenticated', accessToken: 't',
});

describe('ConfigScopePage', () => {
  beforeAll(() => setActiveZone('UTC'));
  beforeEach(() => {
    effective = eff12; loopsFail = false;
    loopLevel = resetLevel();
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => {
      if (loopsFail && url.endsWith('/loops')) throw new Error('boom');
      if (url.includes('/configuration/effective?')) return effective;
      if (url.includes('/configuration/regions?')) return { count: 1, loops: [{ loopId: 'FIC10302', site: 'hdpe', regionMin: 90, regionMax: 120, pvRangeMin: 0, pvRangeMax: 200, source: 'LOOP' }] };
      if (url.includes('/configuration/drafts?') && url.includes('scopeKind=LOOP')) return { site: 'hdpe', projection: 'summary', bundles: loopLevel };
      if (url.includes('/configuration/drafts?') && url.includes('scopeKind=PROFILE')) {
        return { site: 'hdpe', projection: 'summary', bundles: [sum('p1', 1, 'ACTIVE_VERIFIED', { scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG' })] };
      }
      if (url.includes('/configuration/drafts/p1')) return { bundleId: 'p1', version: 1, resolved: { properties: { 'G4.activity_high_ratio': 8 }, sources: { 'G4.activity_high_ratio': 'PROFILE' } } };
      return respond(url);
    });
    asUser(['cpm.config.read', 'cpm.config.draft']);
  });
  afterEach(cleanup);

  it('loop page: title, lead, pills, buttons in order, no eyebrow or layer strip', async () => {
    renderAt('/cpm/config/loops/FIC10302');
    expect(await screen.findByRole('heading', { name: 'FIC10302' })).toBeTruthy();
    expect(screen.getByText('Reactor feed flow · U1001')).toBeTruthy();
    expect(await screen.findByText('Own settings v12')).toBeTruthy();
    const wait = await screen.findByRole('link', { name: 'v13 waiting for approval' });
    expect(wait.getAttribute('href')).toBe('/cpm/config/changes/l13');
    const names = screen.getAllByRole('button').map(b => b.textContent).filter(t => ['Open loop ↗', 'Edit region', 'Change settings'].includes(t ?? ''));
    expect(names).toEqual(['Open loop ↗', 'Edit region', 'Change settings']);
    expect(screen.getByRole('button', { name: 'Change settings' }).getAttribute('data-variant')).toBe('raised');
    expect(screen.queryByText(/set up/i)).toBeNull();
    expect(screen.queryByLabelText('Layers')).toBeNull();
    expect(screen.getByRole('link', { name: /Gate Configuration/ }).getAttribute('href')).toBe('/cpm/config');
  });

  it('values in use: plain names, percent, From words, code only in the title', async () => {
    renderAt('/cpm/config/loops/FIC10302?gate=G2r');
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Region minimum').closest('tr')?.getAttribute('title')).toBe('G2r.pv_region_min');
    const warn = within(table).getByText('Warn when outside the region').closest('tr')!;
    expect(within(warn).getByText('5 %')).toBeTruthy();
    expect(within(warn).getByText('Factory')).toBeTruthy();
    expect(within(within(table).getByText('Region maximum').closest('tr')!).getByText('This loop')).toBeTruthy();
    expect(screen.queryByText('G2r.pv_region_min')).toBeNull();
  });

  it('a loop running type settings shows that pill and an empty own-versions list', async () => {
    effective = effType; loopLevel = [];
    renderAt('/cpm/config/loops/FIC10302?tab=versions');
    expect(await screen.findByText('Type settings v1')).toBeTruthy();
    expect(await screen.findByText('No own versions — this loop runs Type settings v1.')).toBeTruthy();
  });

  it('versions row opens the change page; tab changes push the url', async () => {
    renderAt('/cpm/config/loops/FIC10302');
    fireEvent.click(await screen.findByRole('tab', { name: 'Versions' }));
    expect(loc()).toContain('tab=versions');
    fireEvent.click(await screen.findByRole('button', { name: /Own settings v12/ }));
    await waitFor(() => expect(loc()).toBe('/cpm/config/changes/l12'));
  });

  it('region tab shows the region, the PV range and where it comes from', async () => {
    renderAt('/cpm/config/loops/FIC10302?tab=region');
    expect(await screen.findByText('90 – 120')).toBeTruthy();
    expect(screen.getByText('0 – 200')).toBeTruthy();
    expect(screen.getByText('This loop')).toBeTruthy();
  });

  it('type page: title in words, no Region tab', async () => {
    renderAt('/cpm/config/types/FLOW_FAST_SELF_REG?site=hdpe');
    expect(await screen.findByRole('heading', { name: 'Flow, fast self-regulating' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Operating region' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit region' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open loop ↗' })).toBeNull();
    expect(await screen.findByText('Loop type')).toBeTruthy();
  });

  it('plant page: SITE versions carry scopeRef "" and still count as the own of the plant (retest 1)', async () => {
    const base = vi.mocked(fetchMod.apiJson).getMockImplementation()!;
    const site = [sum('s1', 1, 'ACTIVE_VERIFIED', { scopeKind: 'SITE', scopeRef: '' }), sum('s2', 2, 'DRAFT', { scopeKind: 'SITE', scopeRef: '' })];
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string, ...rest: unknown[]) => {
      if (url.includes('/configuration/drafts?') && url.includes('scopeKind=SITE')) return { site: 'hdpe', projection: 'summary', bundles: site };
      if (url.includes('/configuration/drafts/s1')) return { bundleId: 's1', version: 1, resolved: { properties: { 'G4.activity_high_ratio': 8 }, sources: { 'G4.activity_high_ratio': 'SITE' } } };
      return (base as (u: string, ...r: unknown[]) => Promise<unknown>)(url, ...rest);
    });
    renderAt('/cpm/config/plant/hdpe');
    expect(await screen.findByText('Plant settings v1')).toBeTruthy();
    expect(screen.queryByText('Factory settings')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(await screen.findByText('Plant settings v2')).toBeTruthy();
    expect(screen.getAllByText('Plant settings v1').length).toBeGreaterThan(0);
  });

  it('plant page title is Whole plant', async () => {
    renderAt('/cpm/config/plant/hdpe');
    expect(await screen.findByRole('heading', { name: 'Whole plant' })).toBeTruthy();
  });

  it('a reader without permission to prepare changes sees Change settings disabled with its reason', async () => {
    asUser(['cpm.config.read']);
    renderAt('/cpm/config/loops/FIC10302');
    const b = await screen.findByRole('button', { name: 'Change settings' });
    expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Needs permission to prepare changes').length).toBeGreaterThan(0);
  });

  it('a failing loops read on a loop page shows the error and Retry refetches', async () => {
    loopsFail = true;
    renderAt('/cpm/config/loops/FIC10302');
    expect(await screen.findByRole('link', { name: /Gate Configuration/ })).toBeTruthy();
    const retry = await screen.findByRole('button', { name: /Retry/ });
    const calls = () => vi.mocked(fetchMod.apiJson).mock.calls.filter(c => String(c[0]).endsWith('/loops')).length;
    const before = calls();
    loopsFail = false;
    fireEvent.click(retry);
    await waitFor(() => expect(calls()).toBeGreaterThan(before));
    expect(await screen.findByRole('heading', { name: 'FIC10302' })).toBeTruthy();
  });

  it('a failing loops read on a type page shows the error, not "Choose a plant"', async () => {
    loopsFail = true;
    renderAt('/cpm/config/types/FLOW_FAST_SELF_REG');
    expect(await screen.findByRole('button', { name: /Retry/ })).toBeTruthy();
    expect(screen.queryByText(/Choose a plant/)).toBeNull();
  });

  it('a Versions row for a running version says Running and nothing says verified', async () => {
    renderAt('/cpm/config/loops/FIC10302?tab=versions');
    await screen.findByRole('button', { name: /Own settings v12/ });
    expect(screen.getByText('Running')).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/verified/i);
  });

  it('an unknown loop says so and keeps the back link', async () => {
    renderAt('/cpm/config/loops/NOPE1');
    expect(await screen.findByText('No loop NOPE1')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Gate Configuration/ })).toBeTruthy();
  });

  it('Change settings: no level read before it is clicked; a closed and reopened dialog starts clean', async () => {
    vi.mocked(fetchMod.apiFetch).mockReset();
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ({ ok: false, status: 403, json: async () => ({ error: 'no permission to draft' }) }) as unknown as Response);
    renderAt('/cpm/config/loops/FIC10302');
    await screen.findByRole('heading', { name: 'FIC10302' });
    const reads = () => vi.mocked(fetchMod.apiJson).mock.calls.map(c => String(c[0])).filter(u => u.includes('/configuration/drafts?') && (u.includes('scopeKind=SITE') || u.includes('scopeKind=PROFILE')));
    expect(reads()).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change settings' }));
    const reason = () => screen.getByLabelText('Reason') as HTMLTextAreaElement;
    await waitFor(() => expect(reads().length).toBeGreaterThan(0));
    fireEvent.change(reason(), { target: { value: 'Wider region' } });
    const start = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement;
    await waitFor(() => expect(start.disabled).toBe(false));
    fireEvent.click(start);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change settings' }));
    expect(reason().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Edit region opens the one-loop dialog with the current region', async () => {
    renderAt('/cpm/config/loops/FIC10302');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit region' }));
    expect(await screen.findByRole('heading', { name: 'Operating region · FIC10302' })).toBeTruthy();
    expect(await screen.findByText('Now 90 – 120 · PV range 0 – 200')).toBeTruthy();
  });

  it('Edit region while the regions read fails shows the error with Retry', async () => {
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => {
      if (url.includes('/configuration/regions?')) throw new Error('regions down');
      if (url.includes('/configuration/effective?')) return effective;
      if (url.includes('/configuration/drafts?') && url.includes('scopeKind=LOOP')) return { site: 'hdpe', projection: 'summary', bundles: loopLevel };
      return respond(url);
    });
    renderAt('/cpm/config/loops/FIC10302');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit region' }));
    const dlg = await screen.findByRole('dialog');
    expect(await within(dlg).findByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('Edit region for a loop missing from the regions says so', async () => {
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => (url.includes('/configuration/regions?') ? { count: 0, loops: [] }
      : url.includes('/configuration/effective?') ? effective
      : url.includes('/configuration/drafts?') && url.includes('scopeKind=LOOP') ? { site: 'hdpe', projection: 'summary', bundles: loopLevel } : respond(url)));
    renderAt('/cpm/config/loops/FIC10302');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit region' }));
    expect(await screen.findByText('This loop has no region data.')).toBeTruthy();
  });

  it('without permission to prepare changes Edit region and Use plant-wide settings are present, disabled, the shared reason said once', async () => {
    asUser(['cpm.config.read']);
    renderAt('/cpm/config/loops/FIC10302');
    const edit = await screen.findByRole('button', { name: 'Edit region' }) as HTMLButtonElement;
    const plant = await screen.findByRole('button', { name: 'Use plant-wide settings' }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    expect(plant.disabled).toBe(true);
    expect(screen.getAllByText('Needs permission to prepare changes').length).toBe(1);
  });

  describe('Use plant-wide settings', () => {
    it('is offered on a loop with settings of its own, and posts that loop', async () => {
      vi.mocked(fetchMod.apiFetch).mockReset();
      vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ batchId: 'b5', count: 1, drafts: 1, failed: 0, rows: [] }) }) as unknown as Response);
      renderAt('/cpm/config/loops/FIC10302');
      fireEvent.click(await screen.findByRole('button', { name: 'Use plant-wide settings' }));
      const dlg = screen.getByRole('dialog');
      fireEvent.change(within(dlg).getByLabelText('Reason'), { target: { value: 'Back to the plant defaults' } });
      fireEvent.click(within(dlg).getByRole('button', { name: 'Use plant-wide settings' }));
      await waitFor(() => expect(loc()).toBe('/cpm/config/regions?batch=b5'));
      const [url, init] = vi.mocked(fetchMod.apiFetch).mock.calls[0];
      expect(String(url)).toBe('/api/v1/cpm/configuration/loop-settings/inherit');
      expect(JSON.parse(String((init as RequestInit).body))).toEqual({ site: 'hdpe', loopIds: ['FIC10302'], note: 'Back to the plant defaults' });
    });

    it('is not offered on a loop that runs type settings, or one that already uses the plant-wide settings', async () => {
      effective = effType; loopLevel = [];
      renderAt('/cpm/config/loops/FIC10302');
      await screen.findByText('Type settings v1');
      expect(screen.queryByRole('button', { name: 'Use plant-wide settings' })).toBeNull();
      cleanup();
      effective = eff12; loopLevel = [sum('l12', 12, 'ACTIVE_VERIFIED', { inherits: true })];
      renderAt('/cpm/config/loops/FIC10302');
      await screen.findByText('Uses the plant-wide settings');
      expect(screen.queryByRole('button', { name: 'Use plant-wide settings' })).toBeNull();
    });
  });
});
