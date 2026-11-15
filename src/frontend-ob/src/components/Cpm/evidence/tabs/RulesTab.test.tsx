// Task 16: the Rules & parameters tab. What the gate asks, the method, the parameters THIS run used (its own artifacts'
// provenance, never today's defaults) and one note that the run is pinned. CHG-184: no Configuration section, no versions.
// CHG-187 (owner review 11.3): sentence-case headings, plain "Needs", the role as a word, the profile by its name, the pinned
// paragraph a label with a ? tip.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RulesTab } from './RulesTab';
import { plainNeeds } from './rulesText';
import { artifact, manifest, methodRun } from './runFixture';
import type { GateCatalogueEntry } from '../../../../api/cpm/catalogue';
import { useAuthStore } from '../../../../store/authStore';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
const profile = vi.hoisted(() => ({ id: 'standard' }));
vi.mock('../../../../api/cpm/config', () => ({ getEffectiveConfig: vi.fn(async () => ({ profileId: profile.id, bundle: { version: 4 }, properties: {} })) }));
afterEach(cleanup);

const entry = {
  gate: 'G3', name: 'Base performance', tier: 'short', role: 'PERFORMANCE', definition: 'Error against the objective', preconditions: 'PV and SP',
  method: { id: 'G3.OBJECTIVE_ERROR', version: '3.0.0', state: 'INSTALLED' }, artifactKinds: [], propertyIds: [], capabilityState: 'INSTALLED', capabilityReason: null,
} as unknown as GateCatalogueEntry;
const asUser = (permissions: string[]) =>
  useAuthStore.setState({ user: { user_id: 'u', username: 'eng', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't' });

const show = (m: ReturnType<typeof manifest> | null = manifest(), extra: { manifestLoading?: boolean; manifestError?: unknown } = {}) => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter><RulesTab gate="G3" run={methodRun()} entry={entry} manifest={m ?? undefined} timeZone="UTC" {...extra} /></MemoryRouter>
  </QueryClientProvider>,
);

describe('RulesTab', () => {
  it('says what the gate asks and which method ran, with no version, tier, capability or configuration section (CHG-184)', () => {
    asUser([]);
    show();
    expect(screen.getByText('Error against the objective')).toBeTruthy();
    expect(screen.getByText('Control error vs objective')).toBeTruthy();
    expect(screen.queryByText(/v3\.0\.0/)).toBeNull();
    expect(screen.queryByTitle('G3.OBJECTIVE_ERROR')).toBeNull();
    for (const gone of ['Tier', 'Capability', 'Configuration', 'Bundle']) expect(screen.queryByText(gone)).toBeNull();
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();
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

  it('shows the thresholds line, without the bundle version, only to a user who may read the configuration', async () => {
    asUser([]);
    show();
    expect(screen.queryByText(/Thresholds:/)).toBeNull();
    cleanup();
    asUser(['cpm.config.read']);
    show();
    expect(await screen.findByText(/Thresholds: standard profile, as in force at/)).toBeTruthy();
    expect(screen.queryByText(/bundle v4/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Configuration used by this run/ })).toBeNull();
  });

  it('says the run is pinned as a label, the sentence behind its ?', () => {
    asUser([]);
    show();
    expect(screen.getByText(/Pinned to the run's settings/)).toBeTruthy();
    expect(screen.getByRole('button', { name: "Pinned to the run's settings" })).toBeTruthy();
    expect(screen.queryByText(/This run is pinned/)).toBeNull();
  });

  it('has one sentence-case heading per section and no Method section of its own', () => {
    asUser([]);
    show();
    expect(screen.getAllByRole('heading').map(h => h.textContent)).toEqual(['What this gate asks', 'Parameters used']);
    expect(document.querySelector('.cpm-eyebrow')).toBeNull();
    expect(screen.getByText('Method')).toBeTruthy();   // a row of the first section
  });

  it('writes the role as a word, not in capitals', () => {
    asUser([]);
    show();
    expect(screen.getByText('Performance')).toBeTruthy();
    expect(screen.queryByText('PERFORMANCE')).toBeNull();
  });

  it('names the profile in words when it has a name, never in capitals', async () => {
    asUser(['cpm.config.read']);
    profile.id = 'FLOW_FAST_SELF_REG';
    try {
      show();
      expect(await screen.findByText(/Thresholds: Flow, fast self-regulating profile/)).toBeTruthy();
      expect(screen.queryByText(/FLOW_FAST_SELF_REG/)).toBeNull();
    } finally { profile.id = 'standard'; }
  });

  it('writes "Needs" in plain words for the text it was written from, and keeps any other text as served', () => {
    expect(plainNeeds('G5', 'Enough cycles of the candidate period inside the window (>= 3) at >= 8 samples per period.'))
      .toBe('At least 3 cycles of the oscillation inside the window, with at least 8 samples per cycle.');
    expect(plainNeeds('G14', 'VP mapped, fresh and GOOD over the qualifying interval.')).not.toMatch(/GOOD|VP /);
    expect(plainNeeds('G5', 'A changed precondition.')).toBe('A changed precondition.');
    expect(plainNeeds('G99', 'x')).toBe('x');
  });

  it('does not say no parameter was retained while the manifest is loading, and shows a read error as an error', () => {
    asUser([]);
    show(null, { manifestLoading: true });
    expect(screen.queryByText(/No parameter was retained/)).toBeNull();
    expect(screen.getByText(/Loading the parameters/)).toBeTruthy();
    cleanup();
    show(null, { manifestError: new Error('503 down') });
    expect(screen.queryByText(/No parameter was retained/)).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/503 down/);
  });
});
