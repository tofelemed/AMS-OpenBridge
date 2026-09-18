// 2026-09-18 Gate Configuration redesign: the landing says where to start - what every loop in scope
// runs under, and the bundles in progress - paged and searchable, each row a link into the loop's page.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfigOverview } from './ConfigOverview';
import type { BundleSummary, EffectiveSummaryLoop } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const loop = (id: string, over: Partial<EffectiveSummaryLoop> = {}): EffectiveSummaryLoop => ({
  loopId: id, displayName: `Loop ${id}`, site: 'hdpe', area: 'A', unit: 'U', loopType: id.slice(0, 3), profileId: 'FLOW_FAST_SELF_REG', state: 'NO_ACTIVE_BUNDLE', bundle: null, ...over,
});
const loops: EffectiveSummaryLoop[] = [
  loop('FIC10302', { state: 'ACTIVE_VERIFIED', bundle: { bundleId: 'l2', version: 2, contentHash: 'f9153b00aaf3ba1a', scopeKind: 'LOOP', scopeRef: 'FIC10302', changeClass: 'POLICY', effectiveFrom: '2026-09-17T06:36:16Z', since: '2026-09-17T06:36:16Z' } }),
  ...Array.from({ length: 24 }, (_, i) => loop(`TIC1${String(i).padStart(4, '0')}`, { profileId: 'TEMP_SLOW_SELF_REG' })),
];
const bundles: BundleSummary[] = [
  { bundleId: 's1', version: 1, contentHash: 'aaaa1111bbbb', site: 'hdpe', scopeKind: 'SITE', scopeRef: null, parentBundleId: null, changeClass: 'POLICY', state: 'DRAFT', effectiveFrom: null, createdBy: 'alice', createdAt: 't', updatedAt: '2026-09-18T08:00:00Z', note: 'site-wide G4', validationErrors: 1 },
  { bundleId: 'l2', version: 2, contentHash: 'f9153b00aaf3ba1a', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY', state: 'ACTIVE_VERIFIED', effectiveFrom: 't', createdBy: 'bob', createdAt: 't', updatedAt: 't', note: null, validationErrors: 0 },
];
const props = { loops, loopsLoading: false, loopsError: null, bundles, bundlesLoading: false, bundlesError: null, onRetry: () => {} };

describe('ConfigOverview', () => {
  it('lists what each loop runs under, paged, with a link to the loop; the active bundle counts', () => {
    render(<MemoryRouter><ConfigOverview {...props} /></MemoryRouter>);
    const table = screen.getByRole('table', { name: 'Configuration by loop' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(20);                                                            // page 1 of 2
    expect(rows[0].textContent).toMatch(/FIC10302.*ACTIVE_VERIFIED.*LOOP v2 · f9153b00/);
    expect(rows[1].textContent).toMatch(/TIC10000.*factory layer/);
    expect(within(rows[0]).getByRole('link', { name: /FIC10302/ }).getAttribute('href')).toBe('/cpm/config?loop=FIC10302&view=effective');
    expect(screen.getByText(/1 of 25 loops run a governed bundle/)).toBeTruthy();
    expect(screen.getByText(/Page 1 of 2/)).toBeTruthy();
  });

  it('the search narrows the loops; the bundles in progress leave the active and superseded ones out', () => {
    render(<MemoryRouter><ConfigOverview {...props} /></MemoryRouter>);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a loop' }), { target: { value: 'fic' } });
    expect(within(screen.getByRole('table', { name: 'Configuration by loop' })).getAllByRole('row').slice(1)).toHaveLength(1);
    const progress = screen.getByRole('table', { name: 'Bundles in progress' });
    const prows = within(progress).getAllByRole('row').slice(1);
    expect(prows).toHaveLength(1);
    expect(prows[0].textContent).toMatch(/SITE.*v1.*DRAFT.*1 validation error/);
    expect(within(prows[0]).getByRole('link').getAttribute('href')).toBe('/cpm/config?view=editor&bundle=s1');
  });

  it('states emptiness when no loop runs a bundle and nothing is in progress', () => {
    render(<MemoryRouter><ConfigOverview {...props} loops={[loop('TIC10101')]} bundles={[]} /></MemoryRouter>);
    expect(screen.getByText(/No loop runs a governed bundle yet/)).toBeTruthy();
    expect(screen.getByText(/Nothing in progress/)).toBeTruthy();
  });
});
