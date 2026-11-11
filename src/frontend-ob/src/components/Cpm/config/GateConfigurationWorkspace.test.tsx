// CHG-169 (owner review, the approved sample and the answers of 11 Nov 2026): the address machine and what each view reads.
// No loop: Effective lists every loop (one fleet read, no per-loop read); Bundles lists the bundles in progress. ?loop= alone is
// replaced with view=effective; ?gate= opens that gate (it opened on G0); a bundle opens under Bundles as five tabs; the band
// names it with its state and Record details; a missing bundle reads "Bundle not found"; How to read holds the gate roles.
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { setActiveZone } from '../../../cpa/activeZone';
import { configHref } from '../cpaHref';
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
const LocationProbe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };
function renderAt(search: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/cpm/config${search}`]}>
        <Routes><Route path="/cpm/config" element={<><GateConfigurationWorkspace /><LocationProbe /></>} /><Route path="*" element={<LocationProbe />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const urls = () => vi.mocked(fetchMod.apiJson).mock.calls.map(c => String(c[0]));
const loc = () => screen.getByTestId('loc').textContent ?? '';
const asUser = (permissions: string[]) => useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions }, status: 'authenticated', accessToken: 't' });

describe('GateConfigurationWorkspace', () => {
  beforeAll(() => setActiveZone('UTC'));
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => respond(url));
    vi.mocked(fetchMod.apiFetch).mockReset();
    asUser(ALL);
  });
  afterEach(cleanup);

  it('without a loop Effective lists every loop from one fleet read; the header holds Effective | Bundles and How to read', async () => {
    renderAt('');
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole('row').length).toBe(3));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Gate Configuration');
    expect(screen.getByRole('button', { name: 'Effective' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Bundles' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'How to read' })).toBeTruthy();
    expect(urls().some(u => u.includes('/configuration/effective/summary'))).toBe(true);
    expect(urls().some(u => u.includes('/configuration/effective?'))).toBe(false);
    expect(urls().some(u => u.includes('/configuration/drafts?'))).toBe(false);          // the bundles in progress are Bundles' read
    expect(screen.queryByText('Technical details')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Gate role policy' })).toBeNull();
    fireEvent.click(screen.getAllByRole('row')[1]);
    await waitFor(() => expect(loc()).toBe('/cpm/config?loop=FIC10302&view=effective'));
  });

  it('?loop= alone is replaced with view=effective: the layer strip, the loop in the band, Open loop', async () => {
    renderAt('?loop=FIC10302');
    await waitFor(() => expect(loc()).toBe('/cpm/config?loop=FIC10302&view=effective'));
    const strip = await screen.findByRole('list', { name: 'Layers' });
    expect(within(strip).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'FACTORYShipped defaults2 properties', 'PROFILEFlow, fast self-regulating1 override', 'SITEhdpeno bundle', 'LOOPv6✓Active (verified)1 override',
    ]);
    expect(screen.queryByText('Effective layer')).toBeNull();                              // the tiles went
    expect(urls().some(u => u.includes('/configuration/drafts?'))).toBe(false);           // the levels load only on Bundles
    fireEvent.click(screen.getByRole('button', { name: /Open loop/ }));
    await waitFor(() => expect(loc()).toBe('/cpm/explorer?loop=FIC10302'));
  });

  it('?gate= opens that gate (System Response links G12); choosing a gate puts it in the address', async () => {
    renderAt('?loop=FIC10302&view=effective&gate=G12');
    const gate = await screen.findByRole('combobox', { name: 'Gate' }) as HTMLSelectElement;
    expect(gate.value).toBe('G12');
    expect(screen.getByRole('button', { name: 'noise_multiplier' })).toBeTruthy();
    expect([...gate.options].map(o => o.textContent)).toEqual(['G0 · Data quality', 'G4 · Actuator effort · 2 set above factory', 'G12 · Step-test evidence']);
    fireEvent.change(gate, { target: { value: 'G4' } });
    await waitFor(() => expect(loc()).toBe('/cpm/config?loop=FIC10302&view=effective&gate=G4'));
    const rows = screen.getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows).toEqual([expect.stringMatching(/^activity_warn_ratioPolicy4\.5LOOP v6$/), expect.stringMatching(/^activity_high_ratioPolicy8PROFILE$/)]);   // catalogue order
    expect(screen.getByRole('heading', { name: 'G4.activity_warn_ratio' })).toBeTruthy();
    expect(screen.getByRole('complementary').textContent).toMatch(/SourceLOOP · bundle v6/);
  });

  it('the foot says the workers in one line and opens Workers with the build identifiers', async () => {
    renderAt('?loop=FIC10302&view=effective');
    await screen.findByRole('list', { name: 'Layers' });
    expect(screen.getByText('2 of 2 applied')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Workers' }));
    const dialog = screen.getByRole('dialog', { name: 'Workers' });
    expect(within(dialog).getAllByRole('row').slice(1).map(r => r.textContent)).toEqual(['AMS - CPLM Short Feature Engine✓ACK', 'AMS - CPLM Gate Fusion Engine✓ACK']);
    expect(dialog.textContent).toMatch(/Bundle hashf9153b00/);
    expect(dialog.textContent).toMatch(/Worker jardabe1862/);
  });

  it('Bundles reads the three levels on demand; a row selects, the panel opens the version; the toggle goes back', async () => {
    renderAt('?loop=FIC10302&view=bundles');
    await screen.findByRole('heading', { name: 'LOOP v6' });
    const lists = urls().filter(u => u.includes('/configuration/drafts?'));
    expect(lists.some(u => u.includes('scopeKind=LOOP&scopeRef=FIC10302'))).toBe(true);
    expect(lists.some(u => u.includes('scopeKind=PROFILE&scopeRef=FLOW_FAST_SELF_REG'))).toBe(true);
    expect(lists.some(u => u.includes('scopeKind=SITE'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'v7' }));
    expect(screen.getByRole('heading', { name: 'LOOP v7' })).toBeTruthy();
    expect(loc()).toBe('/cpm/config?loop=FIC10302&view=bundles');
    fireEvent.click(screen.getByRole('button', { name: 'Open v7 →' }));
    await waitFor(() => expect(loc()).toBe('/cpm/config?loop=FIC10302&view=editor&bundle=l7'));
    expect(screen.getByRole('button', { name: 'Bundles' }).getAttribute('aria-pressed')).toBe('true');   // a bundle opens under Bundles
    fireEvent.click(screen.getByRole('button', { name: 'Bundles' }));
    await waitFor(() => expect(loc()).toBe('/cpm/config?loop=FIC10302&view=bundles'));
  });

  it('without a loop Bundles lists the bundles in progress', async () => {
    renderAt('?view=bundles');
    await screen.findByRole('heading', { name: 'LOOP FIC10301 v1' });
    expect(screen.getAllByRole('row').slice(1).map(r => r.textContent)).toEqual([expect.stringMatching(/^LOOP FIC10301v1○Draft.*admin$/)]);
    fireEvent.click(screen.getByRole('button', { name: 'Open v1 →' }));
    await waitFor(() => expect(loc()).toBe('/cpm/config?view=editor&bundle=d1'));
  });

  it('a bundle: the band names it with its state; Record details holds its identifiers, short and copyable; five tabs with marks', async () => {
    renderAt('?loop=FIC10302&view=editor&bundle=l6&tab=deployments');
    await screen.findByText('LOOP v6');
    const band = screen.getByRole('region', { name: 'Loop and its controls' });
    expect(band.textContent).toMatch(/LOOP v6✓Active \(verified\)Record details/);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Properties ✓', 'Diff & impact ✓', 'Shadow ✓', 'Approval ✓', 'Deployments ✓']);
    expect(screen.getByRole('tab', { name: 'Deployments ✓' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText('This version is Active (verified) - create a new version to change it.')).toHaveLength(1);
    fireEvent.click(within(band).getByRole('button', { name: 'Record details' }));
    const dialog = screen.getByRole('dialog', { name: 'Record details' });
    expect(dialog.textContent).toMatch(/Content hashf9153b00/);
    expect(dialog.textContent).toMatch(/Etag6c8eae20025f98e6/);
    expect(dialog.textContent).toMatch(/Created.*e2e_cfg_engineer · 25 Sept 18:36 UTC/);
    expect(dialog.textContent).toMatch(/Noteslice-3 e2e/);
    expect(within(dialog).getByRole('button', { name: 'Copy content hash' })).toBeTruthy();
  });

  it('Next moves to the next tab and the tab is in the address', async () => {
    renderAt('?loop=FIC10302&view=editor&bundle=l6');
    fireEvent.click(await screen.findByRole('button', { name: 'Next: Diff & impact →' }));
    await waitFor(() => expect(loc()).toBe('/cpm/config?loop=FIC10302&view=editor&bundle=l6&tab=diff'));
    expect(screen.getByRole('heading', { name: '1 property differs from the layers below' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next: Shadow →' }));
    await waitFor(() => expect(loc()).toMatch(/tab=shadow$/));
    expect(screen.queryByText(/Validate the bundle first/)).toBeNull();                   // a frozen version is not told to validate
  });

  it('a bundle the server does not know reads Bundle not found, and ‹ Bundles leads back', async () => {
    renderAt('?loop=FIC10302&view=editor&bundle=nope');
    await screen.findByText('Bundle not found');
    expect(screen.queryByText(/Could not load this data/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '‹ Bundles' }));
    await waitFor(() => expect(loc()).toBe('/cpm/config?loop=FIC10302&view=bundles'));
  });

  it('How to read holds the levels, the states and the gate roles of the build', async () => {
    renderAt('');
    fireEvent.click(screen.getByRole('button', { name: 'How to read' }));
    const dialog = screen.getByRole('dialog', { name: 'How to read' });
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Levels', 'Change class', 'Flags', 'Bundle state', 'Gate roles']);
    expect(dialog.textContent).toMatch(/The most specific active level wins\./);
    await waitFor(() => expect(dialog.textContent).toMatch(/BLOCKINGG0/));
    expect(dialog.textContent).toMatch(/G9 geometry is supporting-only\./);
  });

  it('without cpm.config.read the page says what it needs', () => {
    asUser([]);
    renderAt('');
    expect(screen.getByText('Reading the governed configuration needs cpm.config.read.')).toBeTruthy();
  });

  it('configHref keeps the Governance and System Response links working', () => {
    expect(configHref({ site: 'hdpe', scope: 'LOOP', ref: 'FIC10302', bundle: 'l2' })).toBe('/cpm/config?loop=FIC10302&view=editor&bundle=l2');
    expect(configHref({ site: 'hdpe', scope: 'SITE', bundle: 's1' })).toBe('/cpm/config?view=editor&bundle=s1');
    expect(configHref({ loop: 'FIC10302', gate: 'G12' })).toBe('/cpm/config?loop=FIC10302&view=effective&gate=G12');
    expect(configHref({ loop: 'FIC10302', bundle: 'l6', tab: 'deployments' })).toBe('/cpm/config?loop=FIC10302&view=editor&bundle=l6&tab=deployments');
  });
});
