// Final whole-branch review, code fixes on the pages: I2 (a deployment that did not finish stays visible), I3 (permission reasons in
// words, once per group; no second Edit region; the change page without approve / activate / draft), I5 (a type without a version
// shows the plant version it runs), M-a (the frozen line per state), M-b (a plant-wide marker is read-only), M-g, M-h.
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { setActiveZone } from '../../../cpa/activeZone';
import { APPROVE_RULE } from '../governance/GovernanceHowToRead';
import { ConfigStartPage } from './ConfigStartPage';
import { ConfigScopePage } from './ConfigScopePage';
import { ConfigRegionsPage } from './ConfigRegionsPage';
import { ConfigChangePage } from './ConfigChangePage';
import { BUNDLES, CATALOGUE, EFFECTIVE, respond } from './configTestData';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-info', () => ({ ObiInfo: () => null }));

const DRAFT_WHY = 'Needs permission to prepare changes';
const sum = (id: string, version: number, state: string, over: Record<string, unknown> = {}) => ({
  bundleId: id, version, contentHash: 'h', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY', state,
  effectiveFrom: null, createdBy: 'superadmin', createdAt: '2026-11-23T06:54:00Z', updatedAt: '2026-11-23T06:54:00Z', note: null, validationErrors: 0, ...over,
});
const EDITABLE_CATALOGUE = { ...CATALOGUE, properties: CATALOGUE.properties.map(p => ({ ...p, editable: true })) };
const REGIONS = { count: 2, loops: [
  { loopId: 'FIC10301', loopType: 'FIC', site: 'hdpe', pvRangeMin: 0, pvRangeMax: 140, source: 'NONE' },
  { loopId: 'FIC10302', loopType: 'FIC', site: 'hdpe', pvRangeMin: 0, pvRangeMax: 200, regionMin: 90, regionMax: 120, source: 'LOOP', bundleId: 'l12', bundleVersion: 12 },
] };

let rows: Record<'START' | 'LOOP' | 'PROFILE' | 'SITE', unknown[]>;
let effective: unknown;
let table: Record<string, unknown>;
function answer(url: string): unknown {
  if (url.includes('/configuration/regions?')) return REGIONS;
  if (url.includes('/configuration/loop-settings/stale?')) return { site: 'hdpe', count: 2, loops: [{}, {}] };
  if (url.includes('/configuration/catalogue')) return EDITABLE_CATALOGUE;
  if (url.includes('/configuration/effective?')) return effective;
  if (url.includes('/configuration/drafts?')) {
    const kind = new URL(`http://x${url}`).searchParams.get('scopeKind') as 'LOOP' | 'PROFILE' | 'SITE' | null;
    return { site: 'hdpe', projection: 'summary', bundles: rows[kind ?? 'START'] };
  }
  const one = url.match(/\/configuration\/drafts\/([^/?]+)$/);
  if (one && table[one[1]]) return table[one[1]];
  return respond(url);
}

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/cpm/config" element={<ConfigStartPage />} />
          <Route path="/cpm/config/loops/:loopId" element={<ConfigScopePage kind="LOOP" />} />
          <Route path="/cpm/config/types/:profileId" element={<ConfigScopePage kind="PROFILE" />} />
          <Route path="/cpm/config/regions" element={<ConfigRegionsPage />} />
          <Route path="/cpm/config/changes/:bundleId" element={<ConfigChangePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const asUser = (permissions: string[]) => useAuthStore.setState({
  user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions }, status: 'authenticated', accessToken: 't',
});
const bodyButton = (name: RegExp) => screen.getAllByRole('button', { name }).filter(b => b.closest('ol') === null)[0] as HTMLButtonElement;

beforeAll(() => setActiveZone('UTC'));
beforeEach(() => {
  rows = { START: [], LOOP: [sum('l12', 12, 'ACTIVE_VERIFIED')], PROFILE: [], SITE: [] };
  effective = { ...EFFECTIVE, bundle: { ...EFFECTIVE.bundle, bundleId: 'l12', version: 12 } };
  table = { ...BUNDLES };
  vi.mocked(fetchMod.apiJson).mockReset();
  vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => answer(url));
  asUser(['cpm.config.read', 'cpm.config.draft']);
});
afterEach(cleanup);

describe('a deployment that did not finish stays visible (I2)', () => {
  it('the start page keeps a partly deployed and a failed change in progress, both at Deploy', async () => {
    rows.START = [sum('l14', 14, 'PARTIALLY_ACKNOWLEDGED'), sum('f2', 2, 'ACTIVATION_FAILED', { scopeRef: 'FIC10301' })];
    renderAt('/cpm/config');
    const region = await screen.findByRole('region', { name: 'Changes in progress' });
    for (const name of ['FIC10302 · own settings v14', 'FIC10301 · own settings v2']) {
      const row = (await within(region).findByText(name)).closest('tr')!;
      expect(within(row).getByText('Deploy')).toBeTruthy();
    }
  });

  it.each([['PARTIALLY_ACKNOWLEDGED', 'v13 partly deployed'], ['ACTIVATION_FAILED', 'v13 deploy failed']])('the loop page pill names a %s version', async (state, words) => {
    rows.LOOP = [sum('l12', 12, 'ACTIVE_VERIFIED'), sum('l13', 13, state)];
    renderAt('/cpm/config/loops/FIC10302');
    expect((await screen.findByRole('link', { name: words })).getAttribute('href')).toBe('/cpm/config/changes/l13');
  });
});

describe('permission reasons in words, once per group (I3)', () => {
  it('the loop page without permission to prepare changes says so once', async () => {
    asUser(['cpm.config.read']);
    renderAt('/cpm/config/loops/FIC10302');
    for (const name of ['Edit region', 'Use plant-wide settings', 'Change settings']) expect((await screen.findByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(DRAFT_WHY).length).toBe(1);
    expect(document.body.textContent).not.toMatch(/cpm\.config/);
  });

  it('the Operating region tab has no second Edit region (the header has it)', async () => {
    renderAt('/cpm/config/loops/FIC10302?tab=region');
    expect(await screen.findByText('90 – 120')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Edit region' }).length).toBe(1);
  });

  it('the start page: Update them is disabled with its reason', async () => {
    asUser(['cpm.config.read']);
    renderAt('/cpm/config');
    expect((await screen.findByRole('button', { name: 'Update them' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(DRAFT_WHY)).toBeTruthy();
  });

  it('the regions page says the reason once for both buttons', async () => {
    asUser(['cpm.config.read']);
    renderAt('/cpm/config/regions?site=hdpe');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select FIC10302' }));
    expect((screen.getByRole('button', { name: 'Use plant-wide settings (1)' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Edit regions (1)' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(DRAFT_WHY).length).toBe(1);
    expect(document.body.textContent).not.toMatch(/cpm\.config/);
  });

  it('the change page without approve, activate or draft: Approve and Deploy disabled with reasons, the editor read-only', async () => {
    asUser(['cpm.config.read', 'cpm.config.validate', 'cpm.config.shadow']);
    renderAt('/cpm/config/changes/dv?step=approve');
    await screen.findByLabelText('Note (optional)');
    expect(bodyButton(/^Approve/).disabled).toBe(true);
    expect(screen.getByText(APPROVE_RULE)).toBeTruthy();
    cleanup();
    renderAt('/cpm/config/changes/da?step=deploy');
    expect((await screen.findByRole('button', { name: 'Deploy' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Needs permission to deploy changes')).toBeTruthy();
    cleanup();
    renderAt('/cpm/config/changes/dv?step=edit');
    await screen.findByRole('heading', { name: 'Own settings v2' });
    await screen.findAllByTestId('property-form');
    expect(screen.queryByRole('button', { name: 'Set' })).toBeNull();
    cleanup();
    asUser(['cpm.config.read', 'cpm.config.draft']);
    renderAt('/cpm/config/changes/dv?step=edit');
    expect(await screen.findByRole('button', { name: 'Set' })).toBeTruthy();
  });

  it('the change page names the check and roll back permissions in words', async () => {
    asUser(['cpm.config.read']);
    renderAt('/cpm/config/changes/d1?step=check');
    expect((await screen.findByRole('button', { name: 'Check' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Needs permission to check changes')).toBeTruthy();
    cleanup();
    renderAt('/cpm/config/changes/l6?step=deploy');
    await screen.findByRole('heading', { name: 'Own settings v6' });
    await waitFor(() => expect(screen.getByText('Needs permission to roll back')).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/cpm\.config/);
  });
});

describe('a type without a version of its own (I5)', () => {
  it('shows the plant version it runs, not the factory defaults', async () => {
    rows.SITE = [sum('s2', 2, 'ACTIVE_VERIFIED', { scopeKind: 'SITE', scopeRef: null })];
    table.s2 = { ...(BUNDLES.dv as object), bundleId: 's2', version: 2, scopeKind: 'SITE', scopeRef: null, state: 'ACTIVE_VERIFIED',
      resolved: { properties: { 'G0.mode': 'OPERATIONAL', 'G4.activity_high_ratio': 9 }, sources: { 'G0.mode': 'FACTORY', 'G4.activity_high_ratio': 'SITE' } } };
    renderAt('/cpm/config/types/FLOW_FAST_SELF_REG?site=hdpe&gate=G4');
    expect(await screen.findByText('Plant settings v2')).toBeTruthy();
    expect(screen.queryByText('Factory settings')).toBeNull();
    const table4 = await screen.findByRole('table', { name: 'Values in use' });
    const row = within(table4).getAllByRole('row').find(r => r.getAttribute('title') === 'G4.activity_high_ratio')!;
    expect(within(row).getByText('9')).toBeTruthy();
    expect(within(row).getByText('Plant')).toBeTruthy();
  });
});

describe('the change page (M-a, M-b)', () => {
  it.each([
    ['ACTIVATION_FAILED', 'This version failed to deploy — start a new change to edit.'],
    ['PARTIALLY_ACKNOWLEDGED', 'This version is partly deployed — start a new change to edit.'],
    ['EXPIRED', 'The approval of this version expired — start a new change to edit.'],
    ['SUPERSEDED', 'This version was replaced — start a new change to edit.'],
    ['SCHEDULED', 'This version is being deployed — start a new change to edit.'],
  ])('a %s version reads one sentence', async (state, line) => {
    table.fz = { ...(table.da as object), bundleId: 'fz', state };
    renderAt('/cpm/config/changes/fz');
    expect(await screen.findByText(line)).toBeTruthy();
  });

  it('a marker for the plant-wide settings is read-only even for someone who may prepare changes', async () => {
    table.mk = { ...(table.d1 as object), bundleId: 'mk', inherits: true };
    renderAt('/cpm/config/changes/mk?step=edit');
    await screen.findAllByTestId('property-form');
    expect(screen.queryByRole('button', { name: 'Set' })).toBeNull();
  });
});

describe('the regions page and the Versions tab (M-h, M-g)', () => {
  it('the regions page leaves the plant-wide notice to the start page', async () => {
    renderAt('/cpm/config/regions?site=hdpe');
    await screen.findByRole('checkbox', { name: 'Select FIC10302' });
    expect(screen.queryByRole('button', { name: /Prepare their new versions/ })).toBeNull();
    expect(screen.queryByText(/previous plant-wide settings/)).toBeNull();
  });

  it('a loop with no version anywhere says it runs Factory settings', async () => {
    effective = { ...EFFECTIVE, bundle: null };
    rows.LOOP = [];
    renderAt('/cpm/config/loops/FIC10302?tab=versions');
    expect(await screen.findByText('No own versions — this loop runs Factory settings.')).toBeTruthy();
  });
});
