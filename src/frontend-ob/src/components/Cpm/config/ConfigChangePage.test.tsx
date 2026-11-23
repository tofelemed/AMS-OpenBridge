// The change page: back link, title, one pill, the five-step bar, the Edit and Check step bodies, Back / Next in the footer.
import { APPROVAL_BINDS, APPROVE_RULE, CONTROL_AUTHORITY } from '../governance/GovernanceHowToRead';
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { setActiveZone } from '../../../cpa/activeZone';
import { ConfigChangePage } from './ConfigChangePage';
import { BUNDLES, DEPLOYMENTS, respond } from './configTestData';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, 'data-variant': p.variant }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));

const v13 = { ...(BUNDLES.dv as object), bundleId: 'v13', version: 13, state: 'SHADOW_EVALUATED', scopeRef: 'FIC10302', note: 'Wider activity band', createdBy: 'alice', createdAt: '2026-11-23T06:54:00Z' };
let table: Record<string, unknown> = {};
const Probe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };
function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/cpm/config/changes/:bundleId" element={<><ConfigChangePage /><Probe /></>} />
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
const stepButton = (name: string) => within(screen.getByRole('list', { name: 'Steps of this change' })).getByRole('button', { name: new RegExp(`^${name}`) });

describe('ConfigChangePage', () => {
  beforeAll(() => setActiveZone('UTC'));
  beforeEach(() => {
    table = { ...BUNDLES, v13 };
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => {
      const one = url.match(/\/configuration\/drafts\/([^/?]+)$/);
      if (one) { if (!table[one[1]]) throw new fetchMod.ApiError(404, 'not found'); return table[one[1]]; }
      const dep = url.match(/\/configuration\/drafts\/([^/]+)\/deployments/);
      if (dep) return { deployments: DEPLOYMENTS[dep[1]] ?? [] };
      return respond(url);
    });
    asUser(['cpm.config.read', 'cpm.config.draft', 'cpm.config.validate']);
  });
  afterEach(cleanup);

  it('head: back link to the loop, version title, one lead line, one pill, no eyebrow', async () => {
    renderAt('/cpm/config/changes/v13');
    expect(await screen.findByRole('heading', { name: 'Own settings v13' })).toBeTruthy();
    const back = screen.getByRole('link', { name: /FIC10302/ });
    expect(back.getAttribute('href')).toBe('/cpm/config/loops/FIC10302');
    expect(screen.getByText(/Wider activity band · alice · 23 Nov 06:54/)).toBeTruthy();
    expect(screen.getAllByText('Tried on past data').length).toBe(1);
    expect(document.body.textContent).not.toMatch(/SET UP/);
  });

  it('steps: Edit and Check done, Try done, Approve current; the default step is the current one', async () => {
    renderAt('/cpm/config/changes/v13');
    await screen.findByRole('heading', { name: 'Own settings v13' });
    expect(stepButton('Edit').textContent).toContain('done');
    expect(stepButton('Check').textContent).toContain('done');
    expect(stepButton('Try on past data').textContent).toContain('done');
    expect(stepButton('Approve').textContent).toContain('in progress');
    expect(stepButton('Approve').getAttribute('aria-current')).toBe('step');
  });

  it('Next on Check goes to ?step=try; Back walks back; the first step has no Back, the last no Next', async () => {
    renderAt('/cpm/config/changes/v13?step=check');
    await screen.findByRole('heading', { name: 'Own settings v13' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(loc()).toBe('/cpm/config/changes/v13?step=try');
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(loc()).toBe('/cpm/config/changes/v13?step=check');
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(loc()).toBe('/cpm/config/changes/v13?step=edit');
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
    fireEvent.click(stepButton('Deploy'));
    expect(loc()).toBe('/cpm/config/changes/v13?step=deploy');
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy();
  });

  it('the approval rule is the help beside the Approve step, in Governance\'s words, not text between buttons', async () => {
    renderAt('/cpm/config/changes/v13?step=check');
    await screen.findByRole('heading', { name: 'Own settings v13' });
    fireEvent.click(screen.getByRole('button', { name: 'About Approve' }));
    for (const rule of [APPROVE_RULE, CONTROL_AUTHORITY, APPROVAL_BINDS, 'Approval lasts 72 h.']) expect(screen.getByText(rule)).toBeTruthy();
    expect(screen.queryByText(/Someone other than the author approves\./)).toBeNull();
  });

  it('a running version: every step done, lands on Deploy, no edit control, the reason once', async () => {
    renderAt('/cpm/config/changes/l6');
    expect(await screen.findByRole('heading', { name: 'Own settings v6' })).toBeTruthy();
    for (const s of ['Edit', 'Check', 'Try on past data', 'Approve', 'Deploy']) expect(stepButton(s).textContent).toContain('done');
    expect(stepButton('Deploy').getAttribute('aria-current')).toBe('step');
    expect(screen.getAllByText('This version is running — start a new change to edit.').length).toBe(1);
    fireEvent.click(stepButton('Edit'));
    expect(screen.queryByRole('button', { name: 'Set' })).toBeNull();
    expect(screen.getAllByText(/start a new change to edit/).length).toBe(1);
  });

  it('a plant-wide version links back to Whole plant; an unknown id says Change not found', async () => {
    table.s1 = { ...(BUNDLES.dv as object), bundleId: 's1', version: 2, scopeKind: 'SITE', scopeRef: 'hdpe', state: 'DRAFT' };
    renderAt('/cpm/config/changes/s1');
    const back = await screen.findByRole('link', { name: /Whole plant/ });
    expect(back.getAttribute('href')).toBe('/cpm/config/plant/hdpe');
    cleanup();
    renderAt('/cpm/config/changes/nope');
    expect(await screen.findByText('Change not found')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Gate Configuration/ }).getAttribute('href')).toBe('/cpm/config');
  });

  it('Edit step: search by setting, names in words in the editor panel', async () => {
    renderAt('/cpm/config/changes/v13?step=edit');
    await screen.findByRole('heading', { name: 'Own settings v13' });
    expect(screen.getByRole('searchbox', { name: 'Find a setting' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Find a property/);
  });

  it('Check step: Setting · Now · New table, then Check and Loops', async () => {
    renderAt('/cpm/config/changes/v13?step=check');
    await screen.findByRole('heading', { name: 'Own settings v13' });
    const t = await screen.findByRole('table');
    expect(within(t).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Setting', 'Now', 'New']);
    expect(within(t).getAllByRole('row')[1].textContent).toMatch(/3.*5/);
    const panel = within(screen.getByTestId('diff-impact'));
    expect(panel.getByText('✓ Valid').previousSibling?.textContent).toBe('Check');
    expect(panel.getByText('Loops').nextSibling?.textContent).toBe('1');
    expect(panel.getByRole('button', { name: 'Check' })).toBeTruthy();
    expect(panel.queryByRole('button', { name: 'Validate' })).toBeNull();
  });

  describe('write actions send their requests', () => {
    const ALL = ['cpm.config.read', 'cpm.config.draft', 'cpm.config.validate', 'cpm.config.shadow', 'cpm.config.approve', 'cpm.config.activate', 'cpm.config.rollback'];
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    const writes = () => vi.mocked(fetchMod.apiFetch).mock.calls.map(([url, init]) => ({
      method: (init as RequestInit | undefined)?.method, url: String(url),
      body: (init as RequestInit | undefined)?.body ? JSON.parse(String((init as RequestInit).body)) : undefined,
    }));
    const bodyButton = (name: RegExp) => screen.getAllByRole('button', { name }).filter(b => b.closest('ol') === null)[0];
    beforeEach(() => {
      asUser(ALL);
      vi.mocked(fetchMod.apiFetch).mockReset();
      vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ok({ bundleId: 'new1', deploymentId: 'dep1' }));
    });

    it('Check posts drafts/{id}/validate; a running version cannot be checked', async () => {
      renderAt('/cpm/config/changes/d1?step=check');
      fireEvent.click(await screen.findByRole('button', { name: 'Check' }));
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/v1/cpm/configuration/drafts/d1/validate' });
      cleanup();
      renderAt('/cpm/config/changes/l6?step=check');
      expect((await screen.findByRole('button', { name: 'Check' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('Try on past data posts drafts/{id}/shadow', async () => {
      renderAt('/cpm/config/changes/dv?step=try');
      await screen.findByRole('heading', { name: 'Own settings v2' });
      fireEvent.click(bodyButton(/^Try on past data/));
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/v1/cpm/configuration/drafts/dv/shadow' });
    });

    it('Approve posts drafts/{id}/approve with the note', async () => {
      renderAt('/cpm/config/changes/dv?step=approve');
      fireEvent.change(await screen.findByLabelText('Note (optional)'), { target: { value: 'reviewed' } });
      fireEvent.click(bodyButton(/^Approve/));
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/v1/cpm/configuration/drafts/dv/approve', body: { note: 'reviewed' } });
    });

    it('Approve shows the change and what it applies to', async () => {
      renderAt('/cpm/config/changes/dv?step=approve');
      await screen.findByLabelText('Note (optional)');
      expect(screen.getByText('Applies to').nextSibling?.textContent).toBe('FIC10301');
      expect(screen.getByText('Change').nextSibling?.textContent).toMatch(/→/);
    });

    it('Deploy posts configuration/deployments with scheduledFor, none or the time typed', async () => {
      renderAt('/cpm/config/changes/da?step=deploy');
      fireEvent.click(await screen.findByRole('button', { name: 'Deploy' }));
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(writes()[0]).toEqual({ method: 'POST', url: '/api/v1/cpm/configuration/deployments', body: { bundleId: 'da', scheduledFor: null } });
      fireEvent.change(screen.getByLabelText(/^Takes effect at/), { target: { value: '2026-11-12T06:00' } });
      fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));
      await waitFor(() => expect(writes()).toHaveLength(2));
      expect(writes()[1].body).toMatchObject({ bundleId: 'da' });
      expect(String(writes()[1].body.scheduledFor)).toMatch(/^2026-11-12T06:00/);
    });

    it('Roll back asks first, then posts deployments/{id}/rollback', async () => {
      renderAt('/cpm/config/changes/l6?step=deploy');
      fireEvent.click(await screen.findByRole('button', { name: 'Roll back to Own settings v4' }));
      const dialog = screen.getByRole('dialog');
      expect(writes()).toHaveLength(0);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(writes()).toHaveLength(0);
      fireEvent.click(screen.getByRole('button', { name: 'Roll back to Own settings v4' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Roll back' }));
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/v1/cpm/configuration/deployments/d-rb/rollback' });
    });

    it('a try-on-past-data step bar help says nothing on the plant changes', async () => {
      renderAt('/cpm/config/changes/dv?step=edit');
      await screen.findByRole('heading', { name: 'Own settings v2' });
      fireEvent.click(screen.getByRole('button', { name: 'About Try on past data' }));
      expect(screen.getByText(/Nothing on the plant changes\./)).toBeTruthy();
    });
  });

  it('the lead leaves out the batch and self-approval markers of the note (retest issue 7)', async () => {
    table = { ...BUNDLES, v13: { ...v13, note: '[batch 3c410b59-00db-499d-a130-4e72f3f3764f inherit] retest one' } };
    renderAt('/cpm/config/changes/v13?step=edit');
    expect(await screen.findByText(/retest one · alice/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/3c410b59|\[batch/);
  });

  it('a fresh draft with no own values shows Edit as the current step, not done (hasOwnEdits)', async () => {
    const empty = { ...(BUNDLES.d1 as { layers: Array<{ kind: string; content: object }> }), bundleId: 'd0', layers: (BUNDLES.d1 as { layers: Array<{ kind: string; content: object }> }).layers.map(l => (l.kind === 'LOOP' ? { ...l, content: {} } : l)) };
    table = { ...BUNDLES, d0: empty };
    renderAt('/cpm/config/changes/d0');
    expect((await screen.findByRole('button', { name: /^Edit/ })).getAttribute('aria-current')).toBe('step');
    expect(stepButton('Edit').textContent).not.toMatch(/✓/);
  });

  describe('step marks follow the real changes (review round)', () => {
    const base = BUNDLES.d1 as { layers: Array<{ kind: string; content: object }>; resolved: { properties: Record<string, unknown> } };
    const withCatalogue = () => {
      const prev = vi.mocked(fetchMod.apiJson).getMockImplementation()!;
      vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string, ...r: never[]) => {
        if (String(url).includes('/configuration/catalogue')) {
          const c = respond(String(url)) as { properties: object[] };
          return { ...c, properties: [...c.properties, { property: 'G7.role', gate: 'G7', type: 'enum', unit: null, kind: 'NOT_APPLIED', editable: false, setIn: 'NOT_APPLIED', registryField: null, changeClass: 'POLICY', validation: [], dependencies: [], consumers: [], default: null, commissioningRequired: false, notReadByBuild: null }] };
        }
        return prev(url, ...r);
      });
    };
    const editStep = async () => (await screen.findByRole('button', { name: /^Edit/ }));

    it('a loop draft started from a type bundle with no own values has Edit current', async () => {
      table = { ...BUNDLES, d0: { ...base, bundleId: 'd0', parentBundleId: 'pp', layers: base.layers }, pp: { ...base, bundleId: 'pp', scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG', state: 'ACTIVE_VERIFIED' } };
      renderAt('/cpm/config/changes/d0');
      expect((await editStep()).textContent).toMatch(/in progress/);
      expect(stepButton('Edit').textContent).not.toMatch(/✓/);
    });
    it('a parent with legacy non-editable keys and no real edit leaves Edit current; one real edit marks it done', async () => {
      withCatalogue();
      const parent = { ...base, bundleId: 'pp', state: 'ACTIVE_VERIFIED', resolved: { ...base.resolved, properties: { ...base.resolved.properties, 'G7.role': 'PRIMARY' } } };
      table = { ...BUNDLES, d0: { ...base, bundleId: 'd0', parentBundleId: 'pp' }, pp: parent };
      renderAt('/cpm/config/changes/d0');
      await waitFor(() => expect(stepButton('Edit').textContent).toMatch(/in progress/));
      cleanup();
      table = { ...BUNDLES, d0: { ...base, bundleId: 'd0', parentBundleId: 'pp', resolved: { ...base.resolved, properties: { ...base.resolved.properties, 'G4.activity_warn_ratio': 9 } } }, pp: parent };
      renderAt('/cpm/config/changes/d0');
      await waitFor(() => expect(stepButton('Edit').textContent).toMatch(/not started|done|✓/));
      await waitFor(() => expect(stepButton('Edit').textContent).toMatch(/✓/));
    });
    it('a plant-wide marker shows Edit, Check and Try as not used', async () => {
      table = { ...BUNDLES, mk: { ...(BUNDLES.dv as object), bundleId: 'mk', inherits: true, state: 'VALIDATED' } };
      renderAt('/cpm/config/changes/mk');
      await screen.findByRole('button', { name: /^Edit/ });
      for (const n of ['Edit', 'Check', 'Try on past data']) { expect(stepButton(n).textContent).not.toMatch(/✓|in progress/); expect(stepButton(n).textContent).toMatch(/not started/); }
      expect(stepButton('Approve').textContent).toMatch(/in progress/);
    });
  });
});
