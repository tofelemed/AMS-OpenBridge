// v2.5 Task 0.5 — GET /api/v1/cpm/capabilities: the deployed build's identity and installed
// methods (spec v6 R26/C07). Governance shows the source commit and jar digest per observed
// engine so two "3.0.0" jars are never mistaken for the same calculation.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fetchMod from '../apiFetch';
import { getCapabilities, shortIdentity, type CpmCapabilities } from './capabilities';

vi.mock('../apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../apiFetch')>();
  return { ...actual, apiJson: vi.fn() };
});

const payload: CpmCapabilities = {
  service: { version: '1.0.0', sourceCommit: 'deadbeefcafe0123' },
  engine: { observed: [{
    calculationVersion: '3.0.0', dynamicsProfileVersion: '2.0.0',
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    jarSha256: 'a'.repeat(64), contractVersion: 'v1', lastSeen: '2026-09-16T12:00:00Z',
  }] },
  methods: [{ gate: 'G12', methodId: 'G12.STEP_TEST_FLAG', version: 'legacy', state: 'LEGACY_FLAG_ONLY' }],
  topics: { samples: 'traverse.cpa.loop.samples.v1' },
  schemas: { tuple: '1.0', gateResult: 'v1' },
  windows: {},
};

describe('getCapabilities', () => {
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockResolvedValue(payload);
  });

  it('asks the capabilities route and returns the typed manifest', async () => {
    const m = await getCapabilities();
    expect(vi.mocked(fetchMod.apiJson).mock.calls[0][0]).toBe('/api/v1/cpm/capabilities');
    expect(m.engine.observed[0].jarSha256).toHaveLength(64);
  });
});

describe('shortIdentity', () => {
  it('abbreviates a real hash to 12 characters and never invents one for unknown', () => {
    expect(shortIdentity('0123456789abcdef0123456789abcdef01234567')).toBe('0123456789ab');
    expect(shortIdentity(null)).toBe('unknown');
    expect(shortIdentity('unknown')).toBe('unknown');
    expect(shortIdentity('unknown-not-a-jar')).toBe('unknown-not-a-jar');
  });
});
