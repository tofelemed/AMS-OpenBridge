// Task 16: the Rules & parameters tab. What the gate asks, the method, the parameters THIS run used (its own artifacts'
// provenance, never today's defaults), the configuration it ran under, and one note that the run is pinned.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RulesTab } from './RulesTab';
import { artifact, manifest, methodRun } from './runFixture';
import type { GateCatalogueEntry } from '../../../../api/cpm/catalogue';
import { useAuthStore } from '../../../../store/authStore';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('../../../../api/cpm/config', () => ({ getEffectiveConfig: vi.fn(async () => ({ profileId: 'standard', bundle: { version: 4 }, properties: {} })) }));
vi.mock('../../config/EffectiveConfigDrawer', () => ({ EffectiveConfigDrawer: () => <div data-testid="config-drawer" /> }));
afterEach(cleanup);

const entry = {
  gate: 'G3', name: 'Base performance', tier: 'short', role: 'PERFORMANCE', definition: 'Error against the objective', preconditions: 'PV and SP',
  method: { id: 'G3.OBJECTIVE_ERROR', version: '3.0.0', state: 'INSTALLED' }, artifactKinds: [], propertyIds: [], capabilityState: 'INSTALLED', capabilityReason: null,
} as unknown as GateCatalogueEntry;
const asUser = (permissions: string[]) =>
  useAuthStore.setState({ user: { user_id: 'u', username: 'eng', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't' });

const show = (m = manifest()) => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter><RulesTab gate="G3" run={methodRun()} entry={entry} manifest={m} timeZone="UTC" /></MemoryRouter>
  </QueryClientProvider>,
);

describe('RulesTab', () => {
  it('says what the gate asks and which method ran', () => {
    asUser([]);
    show();
    expect(screen.getByText('Error against the objective')).toBeTruthy();
    expect(screen.getByTitle('G3.OBJECTIVE_ERROR').textContent).toMatch(/ v3\.0\.0$/);
  });

  it('uses the run\'s own parameters', () => {
    asUser([]);
    show(manifest([artifact({ kind: 'error_band', provenance: { tolerance_band: '0.5' } })]));
    expect(screen.getByText('Tolerance band')).toBeTruthy();
    expect(screen.queryByText(/No parameter was retained/)).toBeNull();
  });

  it('says when no parameter was retained for the run', () => {
    asUser([]);
    show();
    expect(screen.getByText(/No parameter was retained for this run/)).toBeTruthy();
  });

  it('offers the configuration the run used only to a user who may read it, with the thresholds line', async () => {
    asUser([]);
    show();
    expect(screen.queryByRole('button', { name: /Configuration used by this run/ })).toBeNull();
    cleanup();
    asUser(['cpm.config.read']);
    show();
    expect(await screen.findByText(/Thresholds: standard profile · bundle v4/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Configuration used by this run ↗' }));
    expect(screen.getByTestId('config-drawer')).toBeTruthy();
  });

  it('states once that the run is pinned', () => {
    asUser([]);
    show();
    expect(screen.getAllByText(/not those in force now/)).toHaveLength(1);
  });
});
