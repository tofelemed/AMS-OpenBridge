// v2.5 Task 2D.1 - GET /api/v1/cpm/gate-catalogue: roles and definitions come from the build, and an
// unknown gate reads '—', never a guessed role.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fetchMod from '../apiFetch';
import { getGateCatalogue, gateRole, type GateCatalogue } from './catalogue';

vi.mock('../apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../apiFetch')>();
  return { ...actual, apiJson: vi.fn() };
});

const payload: GateCatalogue = {
  count: 2,
  gates: [
    { gate: 'G5', name: 'Oscillation (ACF)', tier: 'long', role: 'PRIMARY', definition: 'd', preconditions: 'p',
      method: { id: 'G5.ACF_OSCILLATION', version: '3.0.0', state: 'INSTALLED' }, artifactKinds: ['acf_series'], propertyIds: [],
      capabilityState: 'INSTALLED', capabilityReason: null },
    { gate: 'G13', name: 'Interaction', tier: 'fusion', role: 'CONTEXT', definition: 'd', preconditions: 'p',
      method: { id: 'G13.PEER_LINK_FLAG', version: 'legacy', state: 'LEGACY_FLAG_ONLY' }, artifactKinds: ['interaction'], propertyIds: [],
      capabilityState: 'UNAVAILABLE', capabilityReason: 'INTERACTION_METHOD_NOT_INSTALLED' },
  ],
  service: { version: '1.0.0', sourceCommit: 'abc' },
};

describe('gate catalogue', () => {
  beforeEach(() => { vi.mocked(fetchMod.apiJson).mockReset(); });

  it('fetches the catalogue from the build endpoint', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue(payload);
    const c = await getGateCatalogue();
    expect(fetchMod.apiJson).toHaveBeenCalledWith('/api/v1/cpm/gate-catalogue');
    expect(c.gates.map(g => g.gate)).toEqual(['G5', 'G13']);
    expect(c.gates[1].capabilityState).toBe('UNAVAILABLE');
  });

  it('reads a role from the catalogue and never guesses one', () => {
    expect(gateRole(payload, 'G5')).toBe('PRIMARY');
    expect(gateRole(payload, 'G99')).toBe('—');
    expect(gateRole(undefined, 'G5')).toBe('—');
  });
});
