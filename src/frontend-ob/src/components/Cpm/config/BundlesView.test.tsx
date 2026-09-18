// 2026-09-18 Gate Configuration redesign: the loop's three levels (LOOP → PROFILE → SITE) with their
// versions newest first and a New draft / New version per level, gated by the draft permission; the
// header states what the loop runs under before anything else.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BundlesView } from './BundlesView';
import { LoopConfigHeader } from './LoopConfigHeader';
import type { BundleSummary, EffectiveConfig } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
afterEach(cleanup);

const b = (over: Partial<BundleSummary>): BundleSummary => ({
  bundleId: 'b', version: 1, contentHash: 'f9153b00aaf3ba1a', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY', state: 'DRAFT',
  effectiveFrom: null, createdBy: 'alice', createdAt: '2026-09-17T06:00:00Z', updatedAt: '2026-09-17T06:36:16Z', note: null, validationErrors: 0, ...over,
});
const levels = {
  LOOP: { ref: 'FIC10302', bundles: [b({ bundleId: 'l1', version: 1, state: 'SUPERSEDED' }), b({ bundleId: 'l3', version: 3, contentHash: '337ddfe7aaaa', state: 'ROLLED_BACK' }), b({ bundleId: 'l2', version: 2, state: 'ACTIVE_VERIFIED', effectiveFrom: '2026-09-17T06:36:16Z' })], loading: false, error: null },
  PROFILE: { ref: 'FLOW_FAST_SELF_REG', bundles: [], loading: false, error: null },
  SITE: { ref: 'hdpe', bundles: [b({ bundleId: 's1', scopeKind: 'SITE', scopeRef: null, state: 'DRAFT', validationErrors: 2 })], loading: false, error: null },
};

describe('BundlesView', () => {
  it('lists the three levels, versions newest first with their state, and opens a version', () => {
    const onOpen = vi.fn();
    render(<BundlesView levels={levels} activeBundleId="l2" canDraft onOpen={onOpen} onCreate={() => {}} creating={false} createError={null} />);
    const rows = screen.getAllByRole('listitem').filter(li => li.getAttribute('data-level'));
    expect(rows.map(r => r.getAttribute('data-level'))).toEqual(['LOOP', 'PROFILE', 'SITE']);
    const loop = within(rows[0]);
    expect(loop.getAllByRole('button', { name: /^v\d/ }).map(x => x.textContent)).toEqual([expect.stringMatching(/^v3.*ROLLED_BACK/), expect.stringMatching(/^v2.*ACTIVE_VERIFIED/), expect.stringMatching(/^v1.*SUPERSEDED/)]);
    expect(loop.getByRole('button', { name: /^v2/ }).getAttribute('aria-current')).toBe('true');
    expect(rows[1].textContent).toMatch(/no bundle at this level/);
    expect(rows[2].textContent).toMatch(/2 validation errors/);
    fireEvent.click(loop.getByRole('button', { name: /^v3/ }));
    expect(onOpen).toHaveBeenCalledWith('l3');
  });

  it('a new draft is offered per level with the parent of the newest version; without the permission the reason is stated', () => {
    const onCreate = vi.fn();
    const { unmount } = render(<BundlesView levels={levels} activeBundleId="l2" canDraft onOpen={() => {}} onCreate={onCreate} creating={false} createError={null} />);
    fireEvent.change(screen.getAllByPlaceholderText('draft note')[0], { target: { value: 'tighten G4' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'New version' })[0]);                // LOOP has versions (so has SITE)
    expect(onCreate).toHaveBeenCalledWith({ scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: 'l3', note: 'tighten G4' });
    expect(screen.getAllByRole('button', { name: 'New draft' })).toHaveLength(1);              // PROFILE: no version yet
    unmount();
    render(<BundlesView levels={levels} activeBundleId="l2" canDraft={false} onOpen={() => {}} onCreate={onCreate} creating={false} createError={null} />);
    expect(screen.queryByRole('button', { name: /New (draft|version)/ })).toBeNull();
    expect(screen.getAllByText(/needs cpm\.config\.draft/).length).toBeGreaterThan(0);
  });
});

describe('LoopConfigHeader', () => {
  const eff: EffectiveConfig = {
    loopId: 'FIC10302', site: 'hdpe', profileId: 'FLOW_FAST_SELF_REG', state: 'ACTIVE_VERIFIED',
    bundle: { bundleId: 'l2', version: 2, contentHash: 'f9153b00aaf3ba1a', scopeKind: 'LOOP', scopeRef: 'FIC10302', changeClass: 'POLICY', effectiveFrom: '2026-09-17T06:36:16Z', catalogueHash: '8bbcbbbb' },
    properties: {}, sources: {},
    workers: [{ jobName: 'a', jarSha256: '4ea1da78aaaa', catalogueHash: '8bbcbbbb', ack: { status: 'ACK', bundleHash: 'f9153b00aaf3ba1a', jarSha256: '4ea1da78aaaa', receivedAt: 't' } }],
  };
  it('states what the loop runs under, its profile and the workers in one row', () => {
    render(<LoopConfigHeader loopId="FIC10302" displayName="Reactor feed flow" eff={eff} loading={false} catalogueHash="8bbcbbbb7da0" />);
    expect(screen.getByText(/FIC10302 · Reactor feed flow/)).toBeTruthy();
    expect(screen.getByText(/LOOP v2 · f9153b00/)).toBeTruthy();
    expect(screen.getByText('FLOW_FAST_SELF_REG')).toBeTruthy();
    expect(screen.getByText(/1 of 1 applied · one jar 4ea1da78 · catalogue matches/)).toBeTruthy();
  });
  it('the factory layer, and a skeleton while the effective read is in flight', () => {
    render(<LoopConfigHeader loopId="TIC10101" displayName="Temp" eff={{ ...eff, loopId: 'TIC10101', state: 'NO_ACTIVE_BUNDLE', bundle: null, profileId: 'TEMP_SLOW_SELF_REG' }} loading={false} catalogueHash="c" />);
    expect(screen.getAllByText(/factory layer/).length).toBeGreaterThan(0);
    cleanup();
    render(<LoopConfigHeader loopId="TIC10101" displayName="Temp" eff={undefined} loading catalogueHash="c" />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });
});
