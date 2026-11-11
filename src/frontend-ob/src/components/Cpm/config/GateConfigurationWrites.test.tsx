// CHG-169: every write path of the redesigned page sends the same request as before, from its step's tab - Prepare draft
// (now with the level's ACTIVE version as parent, owner answer 2b), Set and Reset to inherited (one op, If-Match the etag),
// Validate, Run shadow, Approve, Activate and Roll back (now only after its confirmation, owner answer 2a). A refusal reads
// "Refused:" / "Conflict:" as the lifecycle column said it.
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { setActiveZone } from '../../../cpa/activeZone';
import { GateConfigurationWorkspace } from './GateConfigurationWorkspace';
import { BUNDLES, respond } from './configTestData';

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
const refused = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) }) as unknown as Response;
/** Every write the page sent: method, path, body, If-Match. */
const writes = () => vi.mocked(fetchMod.apiFetch).mock.calls.map(([url, init]) => ({
  method: (init as RequestInit | undefined)?.method, url: String(url),
  body: (init as RequestInit | undefined)?.body ? JSON.parse(String((init as RequestInit).body)) : undefined,
  ifMatch: ((init as RequestInit | undefined)?.headers as Record<string, string> | undefined)?.['If-Match'],
}));

describe('Gate Configuration write paths', () => {
  beforeAll(() => setActiveZone('UTC'));
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => respond(url));
    vi.mocked(fetchMod.apiFetch).mockReset();
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ok({ bundleId: 'new1', deploymentId: 'dep1' }));
    useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions: ALL }, status: 'authenticated', accessToken: 't' });
  });
  afterEach(cleanup);

  it('Prepare bundle draft starts from the active version of the level and opens the new draft', async () => {
    renderAt('?loop=FIC10302&view=bundles');
    await screen.findByRole('heading', { name: 'LOOP v6' });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare bundle draft' }));
    const dialog = screen.getByRole('dialog', { name: 'Prepare bundle draft' });
    expect(within(dialog).getByRole('radio', { name: /LOOP/ }).closest('tr')!.textContent).toMatch(/v6✓Active \(verified\)/);
    fireEvent.change(within(dialog).getByLabelText('Draft note'), { target: { value: 'tighten G4' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/v1/cpm/configuration/drafts',
      body: { site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: 'l6', note: 'tighten G4' } });
    await waitFor(() => expect(loc()).toBe('/cpm/config?loop=FIC10302&view=editor&bundle=new1'));
  });

  it('Set and Reset to inherited send one op with the etag the editor saw', async () => {
    BUNDLES.d1 = { ...(BUNDLES.d1 as object), layers: (BUNDLES.d1 as { layers: Array<{ kind: string }> }).layers.map(l => (l.kind === 'LOOP' ? { ...l, content: { 'G4.activity_high_ratio': 9 } } : l)) };
    renderAt('?loop=FIC10301&view=editor&bundle=d1&gate=G4');
    await screen.findByRole('heading', { name: 'G4.activity_warn_ratio' });
    const panel = screen.getByRole('complementary');
    expect((within(panel).getByRole('button', { name: 'Set' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(panel).getByText('Enter or choose a value first')).toBeTruthy();
    expect(within(panel).getByText('Already inherited: this level sets no value of its own')).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText('G4.activity_warn_ratio value'), { target: { value: '4.5' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Set' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'PATCH', url: '/api/v1/cpm/configuration/drafts/d1', body: { ops: [{ op: 'set', property: 'G4.activity_warn_ratio', value: 4.5 }] }, ifMatch: 'W/"d1-1"' });
    fireEvent.click(screen.getByRole('button', { name: 'activity_high_ratio' }));
    const next = screen.getByRole('complementary');
    await waitFor(() => expect((within(next).getByRole('button', { name: 'Reset to inherited' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(next).getByRole('button', { name: 'Reset to inherited' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toMatchObject({ method: 'PATCH', body: { ops: [{ op: 'reset', property: 'G4.activity_high_ratio' }] }, ifMatch: 'W/"d1-1"' });
  });

  it('Validate is on Diff & impact and posts the validation', async () => {
    renderAt('?loop=FIC10301&view=editor&bundle=d1&tab=diff');
    fireEvent.click(await screen.findByRole('button', { name: 'Validate' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/v1/cpm/configuration/drafts/d1/validate' });
  });

  it('Run shadow is the one shadow control and posts the run over the hours typed', async () => {
    renderAt('?loop=FIC10301&view=editor&bundle=dv&tab=shadow');
    const hours = await screen.findByLabelText('Hours');
    fireEvent.change(hours, { target: { value: '12' } });
    expect(screen.queryByRole('button', { name: 'Shadow' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Run shadow' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'POST', url: '/api/v1/cpm/configuration/drafts/dv/shadow', body: { hours: 12 }, ifMatch: undefined });
  });

  it('Approve sends the note and validity; a self-approval refused by the server reads Refused', async () => {
    renderAt('?loop=FIC10301&view=editor&bundle=dv&tab=approval');
    await screen.findByText('No approval binds the current content');
    fireEvent.change(screen.getByLabelText('Approval note'), { target: { value: 'reviewed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/v1/cpm/configuration/drafts/dv/approve', body: { note: 'reviewed', validityHours: 72 } });
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => refused(403, 'self-approval is refused: the approver must differ from the author'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByText('Refused: self-approval is refused: the approver must differ from the author');
  });

  it('without the approve permission Approve says what it needs (four eyes)', async () => {
    useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions: ALL.filter(p => p !== 'cpm.config.approve') }, status: 'authenticated', accessToken: 't' });
    renderAt('?loop=FIC10301&view=editor&bundle=dv&tab=approval');
    await screen.findByText('Needs cpm.config.approve (by someone other than the author).');
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Activate sends the effective time typed, or none', async () => {
    renderAt('?loop=FIC10301&view=editor&bundle=da&tab=deployments');
    await screen.findByText('No deployment of this version yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'POST', url: '/api/v1/cpm/configuration/deployments', body: { bundleId: 'da', scheduledFor: null }, ifMatch: undefined });
    fireEvent.change(screen.getByLabelText('Effective from (optional, ISO)'), { target: { value: '2026-11-12T06:00:00Z' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1].body).toEqual({ bundleId: 'da', scheduledFor: '2026-11-12T06:00:00Z' });
    expect(screen.getByText('Only a verified activation can be rolled back.')).toBeTruthy();
  });

  it('Roll back is offered once and asks first, naming the activation and the version that runs again', async () => {
    renderAt('?loop=FIC10302&view=editor&bundle=l6&tab=deployments');
    await screen.findByRole('heading', { name: 'Rollback verified - the previous bundle is active again' });
    expect(screen.getAllByRole('button', { name: /Roll back/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }));
    const dialog = screen.getByRole('dialog', { name: 'Roll back to the previous bundle' });
    expect(writes()).toHaveLength(0);                                                   // nothing is sent on the first click
    expect(dialog.textContent).toMatch(/Rolls backThe activation of v6, 25 Sept 18:37 UTC/);
    await waitFor(() => expect(dialog.textContent).toMatch(/Active againv4⊘Superseded/));   // the server rule: newest SUPERSEDED / ACTIVE_VERIFIED of the scope but v6
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Roll back' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/v1/cpm/configuration/deployments/d-act/rollback' });
  });

  it('a frozen version says why once; its disabled actions do not repeat it', async () => {
    renderAt('?loop=FIC10302&view=editor&bundle=l6&tab=diff');
    await screen.findByRole('heading', { name: '1 property differs from the layers below' });
    expect(screen.getAllByText('This version is Active (verified) - create a new version to change it.')).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Validate' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: /Approval/ }));
    await screen.findByText('Approved by admin');
    expect(screen.getByText('Expired')).toBeTruthy();                                    // muted: it ran out after activation
    expect(screen.getAllByText('This version is Active (verified) - create a new version to change it.')).toHaveLength(1);
  });
});
