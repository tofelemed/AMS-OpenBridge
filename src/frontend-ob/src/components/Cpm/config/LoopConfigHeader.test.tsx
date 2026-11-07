// Task 25: the header says what the loop runs under as three tiles; build identifiers stay behind Technical details,
// and a worker on another catalogue stays on screen.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CatalogueNote, LoopConfigHeader } from './LoopConfigHeader';
import type { ConfigCatalogue, EffectiveConfig } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
afterEach(cleanup);

const eff: EffectiveConfig = {
  loopId: 'FIC10302', site: 'hdpe', profileId: 'FLOW_FAST_SELF_REG', state: 'ACTIVE_VERIFIED',
  bundle: { bundleId: 'l2', version: 2, contentHash: 'f9153b00aaf3ba1a', scopeKind: 'LOOP', scopeRef: 'FIC10302', changeClass: 'POLICY', effectiveFrom: '2026-09-17T06:36:16Z', catalogueHash: '8bbcbbbb' },
  properties: {}, sources: {},
  workers: [{ jobName: 'a', jarSha256: '4ea1da78aaaa', catalogueHash: '8bbcbbbb', ack: { status: 'ACK', bundleHash: 'f9153b00aaf3ba1a', jarSha256: '4ea1da78aaaa', receivedAt: 't' } }],
};
const catalogue = (matches: boolean): ConfigCatalogue => ({
  catalogueHash: '8bbcbbbb7da0aaaa', count: 20, executionPlanHash: 'e', properties: [], factoryLayerAvailable: true, profileIds: [], executionPlan: {},
  workers: [{ jobName: 'a', jarSha256: 'j', catalogueHash: matches ? '8bbcbbbb7da0aaaa' : 'other', catalogueMatches: matches }],
});
const view = (e: EffectiveConfig | undefined, cat = catalogue(true), loading = false, onOpenWorkers = vi.fn()) => render(
  <MemoryRouter><LoopConfigHeader loopId="FIC10302" eff={e} loading={loading} catalogue={cat} onOpenWorkers={onOpenWorkers} /></MemoryRouter>);

describe('LoopConfigHeader', () => {
  it('shows Effective layer, Profile and Worker alignment as three tiles', () => {
    const onOpenWorkers = vi.fn();
    view(eff, catalogue(true), false, onOpenWorkers);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Gate Configuration');
    const tiles = [...document.querySelectorAll<HTMLElement>('.cpm-kpicard')];
    expect(tiles.map(t => within(t).getByText(/^(Effective layer|Profile|Worker alignment)$/).textContent)).toEqual(['Effective layer', 'Profile', 'Worker alignment']);
    expect(tiles[0].textContent).toMatch(/LOOP v2.*ACTIVE_VERIFIED/);
    expect(tiles[1].textContent).toMatch(/FLOW_FAST_SELF_REG/);
    expect(tiles[2].textContent).toMatch(/1 of 1 applied/);
    fireEvent.click(tiles[2]);
    expect(onOpenWorkers).toHaveBeenCalled();
    expect(tiles[0].getAttribute('href')).toBe('/cpm/config?loop=FIC10302&view=bundles');   // leads to the loop's bundles
    expect(tiles[1].getAttribute('href')).toBe(tiles[0].getAttribute('href'));
  });

  it('reads the factory layer, and shows a skeleton while the effective read is in flight', () => {
    view({ ...eff, state: 'NO_ACTIVE_BUNDLE', bundle: null });
    expect(screen.getAllByText(/Factory layer/).length).toBeGreaterThan(0);
    cleanup();
    view(undefined, undefined, true);
    expect(screen.getByLabelText('Loading the effective configuration').getAttribute('aria-busy')).toBe('true');
  });

  it('keeps "a worker runs ANOTHER catalogue" visible', () => {
    view(eff, catalogue(false));
    const note = screen.getByText(/a worker runs ANOTHER catalogue/);
    expect(note.closest('details')).toBeNull();
    cleanup();
    render(<CatalogueNote catalogue={catalogue(true)} />);
    expect(screen.queryByText(/ANOTHER catalogue/)).toBeNull();
  });

  it('hides build identifiers in Technical details', () => {
    view(eff);
    const details = screen.getByText('Technical details').closest('details')!;
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.textContent).toMatch(/f9153b00aaf3ba1a/);
    expect(details.textContent).toMatch(/8bbcbbbb7da0aaaa/);
    expect(screen.queryByText('bundle hash')).toBeNull();   // no loose hash on the page
    expect(document.body.textContent!.split('f9153b00aaf3ba1a').length - 1).toBe(1);
  });
});
