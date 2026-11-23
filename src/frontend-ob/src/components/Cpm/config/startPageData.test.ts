import { describe, expect, it } from 'vitest';
import type { BundleSummary, EffectiveSummaryLoop } from '../../../api/cpm/config';
import { changesInProgress, runningNow } from './startPageData';

const b = (id: string, state: string, over: Partial<BundleSummary> = {}): BundleSummary => ({
  bundleId: id, version: 1, contentHash: 'h', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY',
  state: state as BundleSummary['state'], effectiveFrom: null, createdBy: 'a', createdAt: '2026-11-23T06:00:00Z', updatedAt: '2026-11-23T06:00:00Z', note: null, validationErrors: 0, ...over,
});

describe('changesInProgress', () => {
  it('drops settled versions and maps each state to its next step', () => {
    const rows = changesInProgress([
      b('act', 'ACTIVE_VERIFIED'), b('sup', 'SUPERSEDED'), b('rb', 'ROLLED_BACK'),
      b('sh', 'SHADOW_EVALUATED', { createdAt: '2026-11-23T08:00:00Z' }), b('dr', 'DRAFT', { createdAt: '2026-11-23T07:00:00Z' }), b('ap', 'APPROVED', { createdAt: '2026-11-23T09:00:00Z' }),
    ]);
    expect(rows.map(r => r.bundle.bundleId)).toEqual(['ap', 'sh', 'dr']);
    expect(rows.map(r => [r.nextStep, r.done])).toEqual([['deploy', 4], ['approve', 3], ['check', 1]]);
  });
});

describe('changesInProgress retries', () => {
  it('sends a rejected change back to Edit and a lapsed approval to Approve', () => {
    const rows = changesInProgress([b('rj', 'REJECTED', { createdAt: '2026-11-23T08:00:00Z' }), b('ex', 'EXPIRED')]);
    expect(rows.map(r => [r.bundle.bundleId, r.nextStep, r.done])).toEqual([['rj', 'edit', 0], ['ex', 'approve', 3]]);
  });
});

describe('changesInProgress keeps a deployment that did not finish (final review I2)', () => {
  it('lists a partly deployed and a failed deployment, both at Deploy with four steps done', () => {
    const rows = changesInProgress([b('pa', 'PARTIALLY_ACKNOWLEDGED', { createdAt: '2026-11-23T08:00:00Z' }), b('af', 'ACTIVATION_FAILED')]);
    expect(rows.map(r => [r.bundle.bundleId, r.nextStep, r.done])).toEqual([['pa', 'deploy', 4], ['af', 'deploy', 4]]);
  });
});

const loop = (id: string, profile: string): EffectiveSummaryLoop => ({
  loopId: id, displayName: '', site: 'hdpe', area: null, unit: null, loopType: 'FIC', profileId: profile, state: 'ACTIVE_VERIFIED', bundle: null,
});

describe('runningNow', () => {
  it('lists the plant first, then types, then loops by id; counts loops; skips markers and unsettled versions', () => {
    const loops = [...Array.from({ length: 47 }, (_, i) => loop(`L${i}`, 'FLOW')), loop('X1', 'OTHER')];
    const rows = runningNow([
      b('l2', 'ACTIVE_VERIFIED', { scopeRef: 'FIC10401' }), b('l1', 'ACTIVE_VERIFIED', { scopeRef: 'FIC10302' }),
      b('p', 'ACTIVE_VERIFIED', { scopeKind: 'PROFILE', scopeRef: 'FLOW' }), b('s', 'ACTIVE_VERIFIED', { scopeKind: 'SITE', scopeRef: null }),
      b('m', 'ACTIVE_VERIFIED', { scopeRef: 'FIC10999', inherits: true }), b('d', 'DRAFT'),
    ], loops);
    expect(rows.map(r => r.bundle.bundleId)).toEqual(['s', 'p', 'l1', 'l2']);
    expect(rows.map(r => r.loopCount)).toEqual([48, 47, 1, 1]);
  });
});
