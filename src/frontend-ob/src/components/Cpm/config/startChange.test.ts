// The rule for where a new version starts from (moved out of DraftBundleDialog).
import { describe, expect, it } from 'vitest';
import { draftRequest, startsFrom } from './startChange';
import type { Levels } from './startChange';
import type { BundleSummary } from '../../../api/cpm/config';

const b = (over: Partial<BundleSummary>): BundleSummary => ({
  bundleId: 'b', version: 1, contentHash: 'h', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY', state: 'DRAFT',
  effectiveFrom: null, createdBy: 'a', createdAt: 't', updatedAt: 't', note: null, validationErrors: 0, ...over,
});
const none = { loading: false, error: null, bundles: [] as BundleSummary[] };
const levels = (over: Partial<Levels>): Levels => ({ LOOP: { ref: 'FIC10302', ...none }, PROFILE: { ref: 'FLOW_FAST_SELF_REG', ...none }, SITE: { ref: 'hdpe', ...none }, ...over });

describe('startsFrom', () => {
  it('starts from the own active version, not the newest', () => {
    const l = levels({ LOOP: { ref: 'FIC10302', ...none, bundles: [b({ bundleId: 'v7', version: 7, state: 'ROLLED_BACK' }), b({ bundleId: 'v6', version: 6, state: 'ACTIVE_VERIFIED' })] } });
    expect(startsFrom('LOOP', l)?.bundle.bundleId).toBe('v6');
  });
  it('with no own versions starts from the active type version', () => {
    const l = levels({ PROFILE: { ref: 'FLOW_FAST_SELF_REG', ...none, bundles: [b({ bundleId: 'p2', version: 2, scopeKind: 'PROFILE', state: 'ACTIVE_VERIFIED' })] } });
    expect(startsFrom('LOOP', l)).toMatchObject({ kind: 'PROFILE', bundle: { bundleId: 'p2' } });
    expect(draftRequest('LOOP', l, ' why ')).toEqual({ scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: 'p2', note: 'why' });
  });
  it('with nothing above it is null (factory)', () => {
    expect(startsFrom('LOOP', levels({}))).toBeNull();
    expect(draftRequest('SITE', levels({}), '').parentBundleId).toBeNull();
  });
});
