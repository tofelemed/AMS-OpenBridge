// CHG-169 (owner review, the approved sample): Effective with no loop lists what every loop runs under. Search first ("Loop,
// service, profile or unit"), then ONE dropdown "All loops 243 · Governed bundle 1 · Factory layer 242" (owner answer 2c, client
// side) in place of the count sentence; rows Loop (the service under the tag, the tag once) · Profile in words · Runs under
// ("✓ Active (verified)" over "LOOP v6", or "○ Factory layer") · Effective from; 20 a page, governed first, the shared pager; a
// row opens the loop; the foot holds Build details.
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EffectiveLoops } from './EffectiveLoops';
import { setActiveZone } from '../../../cpa/activeZone';
import type { ConfigCatalogue, EffectiveSummaryLoop } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
afterEach(cleanup);
beforeAll(() => setActiveZone('UTC'));

const loop = (id: string, over: Partial<EffectiveSummaryLoop> = {}): EffectiveSummaryLoop => ({
  loopId: id, displayName: `Flow controller ${id} (FCS0101)`, site: 'hdpe', area: 'A', unit: 'b2', loopType: id.slice(0, 3), profileId: 'TEMP_SLOW_SELF_REG', state: 'NO_ACTIVE_BUNDLE', bundle: null, ...over,
});
const loops: EffectiveSummaryLoop[] = [
  ...Array.from({ length: 24 }, (_, i) => loop(`TIC1${String(i).padStart(4, '0')}`)),
  loop('FIC10302', { displayName: 'Reactor feed flow', profileId: 'FLOW_FAST_SELF_REG', state: 'ACTIVE_VERIFIED', bundle: { bundleId: 'l6', version: 6, contentHash: 'f9153b00aaf3ba1a', scopeKind: 'LOOP', scopeRef: 'FIC10302', changeClass: 'POLICY', effectiveFrom: '2026-09-25T18:37:00Z', since: null } }),
];
const catalogue = { catalogueHash: '8bbcbbbb7da04ddc', count: 165, workers: [{}, {}, {}, {}, {}, {}] } as unknown as ConfigCatalogue;
const view = (over: Partial<React.ComponentProps<typeof EffectiveLoops>> = {}) => {
  const onOpenLoop = vi.fn();
  render(<MemoryRouter><EffectiveLoops loops={loops} loading={false} error={null} onRetry={() => {}} catalogue={catalogue} onOpenLoop={onOpenLoop} {...over} /></MemoryRouter>);
  return { onOpenLoop };
};
const dataRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('EffectiveLoops', () => {
  it('lists what each loop runs under, governed first, 20 a page, in words', () => {
    view();
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Loop', 'Profile', 'Runs under', 'Effective from · UTC']);
    expect(dataRows()).toHaveLength(20);
    expect(dataRows()[0].textContent).toMatch(/^FIC10302Reactor feed flow · B2Flow, fast self-regulating✓Active \(verified\)LOOP v625 Sept 18:37$/);
    expect(dataRows()[1].textContent).toMatch(/^TIC10000Flow controller \(FCS0101\) · B2Temperature, slow self-regulating○Factory layer—$/);
    expect(screen.queryByText(/loops run a governed bundle/)).toBeNull();                 // the count sentence became the dropdown
    expect(screen.getByRole('navigation', { name: 'Loop pages' })).toBeTruthy();
  });

  it('the dropdown narrows to the governed loops or the factory layer, with their counts', () => {
    view();
    const shown = screen.getByRole('combobox', { name: 'Loops shown' }) as HTMLSelectElement;
    expect([...shown.options].map(o => o.textContent)).toEqual(['All loops 25', 'Governed bundle 1', 'Factory layer 24']);
    fireEvent.change(shown, { target: { value: 'governed' } });
    expect(dataRows().map(r => r.textContent)).toEqual([expect.stringMatching(/^FIC10302/)]);
    fireEvent.change(shown, { target: { value: 'factory' } });
    expect(dataRows()).toHaveLength(20);
    expect(dataRows().some(r => /FIC10302/.test(r.textContent ?? ''))).toBe(false);
  });

  it('the search matches loop, service, profile and unit; no match offers Show all loops', () => {
    view();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a loop' }), { target: { value: 'reactor' } });
    expect(dataRows()).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a loop' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No loop matches “zzz”')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Loops shown' }), { target: { value: 'governed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show all loops' }));
    expect((screen.getByRole('searchbox', { name: 'Find a loop' }) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('combobox', { name: 'Loops shown' }) as HTMLSelectElement).value).toBe('all');
    expect(dataRows()).toHaveLength(20);
  });

  it('a row opens its loop', () => {
    const { onOpenLoop } = view();
    fireEvent.click(dataRows()[0]);
    expect(onOpenLoop).toHaveBeenCalledWith('FIC10302');
  });

  it('Build details holds the catalogue identifiers, the hash short and copyable', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Build details' }));
    const dialog = screen.getByRole('dialog', { name: 'Build details' });
    expect(dialog.textContent).toMatch(/Catalogue hash8bbcbbbb/);
    expect(dialog.textContent).not.toMatch(/8bbcbbbb7da0/);
    expect(dialog.textContent).toMatch(/Catalogue properties165/);
    expect(dialog.textContent).toMatch(/Workers announced6/);
    expect(within(dialog).getByRole('button', { name: 'Copy catalogue hash' })).toBeTruthy();
  });

  it('loading, failure and a fleet with no governed loop are said', () => {
    view({ loops: [], loading: true });
    expect(screen.getByText('Loading what each loop runs under…')).toBeTruthy();
    cleanup();
    const onRetry = vi.fn();
    view({ loops: [], error: new Error('down'), onRetry });
    expect(screen.getByText('Configuration summary unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
    cleanup();
    view({ loops: [loop('TIC10101')] });
    expect(screen.getByText(/No loop runs a governed bundle yet/)).toBeTruthy();
  });
});
