// 2026-09-18 Gate Configuration redesign: the URL machine. No loop → the overview (one fleet read, the
// bundles of the site in summary form); ?loop= alone → the URL is replaced with view=effective and the
// effective read is the only per-loop request; the Bundles view reads the three levels only when opened;
// a version opens the editor; the toolbar's loop search drives everything (no left column).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { GateConfigurationWorkspace, configHref } from './GateConfigurationWorkspace';

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
vi.mock('@oicl/openbridge-webcomponents-react/components/tab-row/tab-row', () => ({
  ObcTabRow: (p: { tabs: Array<{ id: string; title: string }>; selectedTabId: string; onTabSelected: (e: { detail: { id: string } }) => void }) =>
    React.createElement('div', { role: 'tablist', 'aria-label': 'Views' }, p.tabs.map(t => React.createElement('button', { key: t.id, role: 'tab', 'aria-selected': t.id === p.selectedTabId, onClick: () => p.onTabSelected({ detail: { id: t.id } }) }, t.title))),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));

const loops = { loops: [
  { loopId: 'FIC10302', displayName: 'Reactor feed flow', site: 'hdpe', area: 'a', unit: 'u', loopType: 'FIC', tags: {}, links: [], observabilityFlags: [] },
  { loopId: 'TIC10101', displayName: 'Temp', site: 'hdpe', area: 'a', unit: 'u', loopType: 'TIC', tags: {}, links: [], observabilityFlags: [] },
] };
const effective = {
  loopId: 'FIC10302', site: 'hdpe', profileId: 'FLOW_FAST_SELF_REG', state: 'ACTIVE_VERIFIED',
  bundle: { bundleId: 'l2', version: 2, contentHash: 'f9153b00aaf3ba1a', scopeKind: 'LOOP', scopeRef: 'FIC10302', changeClass: 'POLICY', effectiveFrom: '2026-09-17T06:36:16Z', catalogueHash: 'c' },
  properties: { 'G0.mode': 'OPERATIONAL', 'G4.activity_warn_ratio': 4.5 }, sources: { 'G0.mode': 'FACTORY', 'G4.activity_warn_ratio': 'LOOP' },
  workers: [{ jobName: 'a', jarSha256: 'j', catalogueHash: 'c', ack: { status: 'ACK', bundleHash: 'f9153b00aaf3ba1a', jarSha256: 'j', receivedAt: 't' } }],
};
const summaryRow = (kind: string, id: string, version: number, state: string) => ({ bundleId: id, version, contentHash: 'f9153b00aaf3ba1a', site: 'hdpe', scopeKind: kind, scopeRef: kind === 'LOOP' ? 'FIC10302' : kind === 'PROFILE' ? 'FLOW_FAST_SELF_REG' : null, parentBundleId: null, changeClass: 'POLICY', state, effectiveFrom: null, createdBy: 'alice', createdAt: 't', updatedAt: '2026-09-17T06:36:16Z', note: null, validationErrors: 0 });

function respond(url: string): unknown {
  if (url.includes('/configuration/effective/summary')) return { count: 2, loops: [
    { loopId: 'FIC10302', displayName: 'Reactor feed flow', site: 'hdpe', area: 'a', unit: 'u', loopType: 'FIC', profileId: 'FLOW_FAST_SELF_REG', state: 'ACTIVE_VERIFIED', bundle: { ...effective.bundle, since: null } },
    { loopId: 'TIC10101', displayName: 'Temp', site: 'hdpe', area: 'a', unit: 'u', loopType: 'TIC', profileId: 'TEMP_SLOW_SELF_REG', state: 'NO_ACTIVE_BUNDLE', bundle: null },
  ] };
  if (url.includes('/configuration/effective?')) return effective;
  if (url.includes('/configuration/catalogue')) return { catalogueHash: 'c'.repeat(64), count: 2, executionPlanHash: 'e', properties: [
    { property: 'G0.mode', id: 'CFG-001', gate: 'G0', type: 'enum', unit: 'state', effect: 'x', default: 'OPERATIONAL', validation: ['OPERATIONAL'], dependencies: [], consumers: [], changeClass: 'POLICY', commissioningRequired: false, notReadByBuild: null },
    { property: 'G4.activity_warn_ratio', id: 'CFG-020', gate: 'G4', type: 'number', unit: 'ratio', effect: 'y', default: 4, validation: {}, dependencies: [], consumers: [], changeClass: 'POLICY', commissioningRequired: false, notReadByBuild: null },
  ], workers: [], factoryLayerAvailable: true, profileIds: ['FLOW_FAST_SELF_REG'], executionPlan: {} };
  if (url.includes('/configuration/drafts?')) {
    const q = new URL('http://x' + url).searchParams;
    if (q.get('projection') !== 'summary') throw new Error(`lists must read summary rows: ${url}`);
    const kind = q.get('scopeKind');
    const all = [summaryRow('LOOP', 'l2', 2, 'ACTIVE_VERIFIED'), summaryRow('LOOP', 'l1', 1, 'SUPERSEDED'), summaryRow('SITE', 's1', 1, 'DRAFT')];
    return { site: 'hdpe', projection: 'summary', bundles: kind ? all.filter(b => b.scopeKind === kind) : all };
  }
  if (/\/configuration\/drafts\/l2$/.test(url)) return { ...summaryRow('LOOP', 'l2', 2, 'ACTIVE_VERIFIED'), parentHash: null, catalogueHash: 'c', executionPlanHash: 'e',
    layers: [{ kind: 'FACTORY', ref: null, ordinal: 0, content: { 'G0.mode': 'OPERATIONAL' }, content_hash: 'h' }], resolved: { properties: { 'G0.mode': 'OPERATIONAL' }, sources: { 'G0.mode': 'FACTORY' }, execution_plan: {} },
    validation: { errors: [], warnings: [], notReadByBuild: {}, changeClass: 'POLICY' }, shadow: null, etag: 'W/"2"', approvals: [] };
  if (url.includes('/configuration/deployments')) return { count: 0, deployments: [] };
  if (url.includes('/assets/filters')) return { sites: ['hdpe'], areas: [], units: [] };
  if (url.includes('/loops')) return loops;
  throw new Error(`unexpected request ${url}`);
}

const LocationProbe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };
function renderAt(search: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/cpm/config${search}`]}>
        <Routes><Route path="/cpm/config" element={<><GateConfigurationWorkspace /><LocationProbe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const urls = () => vi.mocked(fetchMod.apiJson).mock.calls.map(c => String(c[0]));
const loc = () => screen.getByTestId('loc').textContent ?? '';

describe('GateConfigurationWorkspace', () => {
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => respond(url));
    useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions: ['cpm.config.read', 'cpm.config.draft', 'cpm.config.validate', 'cpm.config.shadow', 'cpm.config.approve', 'cpm.config.activate', 'cpm.config.rollback'] }, status: 'authenticated', accessToken: 't' });
  });
  afterEach(cleanup);

  it('without a loop it lands on the overview: one fleet read, the bundles in summary form, no per-loop effective read', async () => {
    renderAt('');
    await waitFor(() => expect(screen.getByRole('table', { name: 'Configuration by loop' })).toBeTruthy());
    expect(urls().some(u => u.includes('/configuration/effective/summary'))).toBe(true);
    expect(urls().some(u => u.includes('/configuration/effective?'))).toBe(false);
    expect(urls().filter(u => u.includes('/configuration/drafts?')).every(u => u.includes('projection=summary'))).toBe(true);
    expect(screen.getByRole('table', { name: 'Bundles in progress' }).textContent).toMatch(/SITE hdpe.*DRAFT/);
    expect(screen.queryByText(/Site → scope → reference/)).toBeNull();                              // the left column is gone
  });

  it('?loop= alone is replaced with view=effective and shows the effective configuration', async () => {
    renderAt('?loop=FIC10302');
    await waitFor(() => expect(loc()).toBe('/cpm/config?loop=FIC10302&view=effective'));
    await waitFor(() => expect(screen.getByRole('list', { name: 'Layers' })).toBeTruthy());
    expect(screen.getByText(/ACTIVE_VERIFIED · LOOP v2/)).toBeTruthy();
    expect(urls().some(u => u.includes('/configuration/drafts?'))).toBe(false);                    // the levels load only on the Bundles view
  });

  it('the Bundles view reads the three levels on demand and a version opens the editor', async () => {
    renderAt('?loop=FIC10302&view=bundles');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^v2/ }).length).toBeGreaterThan(0));
    const lists = urls().filter(u => u.includes('/configuration/drafts?'));
    expect(lists.some(u => u.includes('scopeKind=LOOP&scopeRef=FIC10302'))).toBe(true);
    expect(lists.some(u => u.includes('scopeKind=PROFILE&scopeRef=FLOW_FAST_SELF_REG'))).toBe(true);
    expect(lists.some(u => u.includes('scopeKind=SITE'))).toBe(true);
    fireEvent.click(screen.getAllByRole('button', { name: /^v2/ })[0]);
    await waitFor(() => expect(loc()).toBe('/cpm/config?loop=FIC10302&view=editor&bundle=l2'));
    await waitFor(() => expect(screen.getByText(/Properties · G0/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '‹ Bundles' }));
    await waitFor(() => expect(loc()).toBe('/cpm/config?loop=FIC10302&view=bundles'));
  });

  it('configHref keeps the Governance links working and names the loop for a LOOP scope', () => {
    expect(configHref({ site: 'hdpe', scope: 'LOOP', ref: 'FIC10302', bundle: 'l2' })).toBe('/cpm/config?loop=FIC10302&view=editor&bundle=l2');
    expect(configHref({ site: 'hdpe', scope: 'SITE', bundle: 's1' })).toBe('/cpm/config?view=editor&bundle=s1');
  });
});
