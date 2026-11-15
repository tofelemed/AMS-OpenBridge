// CHG-201 (owner-approved mockup, 15 Nov 2026): the Loop Registry list is one full-width table. Loop (the tag, the description
// under it without the tag, a Not monitored / Retired pill), Type, Plant unit (the asset model's name), Valve position (with a ?),
// Ready for analysis, and a ›. The whole row opens the loop's page, by click or Enter. CHG-200: a loop with no type reads
// "Unknown type".
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';
import { RegistryList } from './RegistryList';

afterEach(cleanup);

const P = 'hdpe/section_600/u6002';
const tags = { PV: `${P}/l.pv`, SP: `${P}/l.sp`, OP: `${P}/l.op`, MODE: `${P}/l.mode` };
const loop = (loopId: string, over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId, assetId: null, displayName: `Flow controller ${loopId} (FCS0101)`, site: 'hdpe', area: 'section_600', unit: 'u6002',
  loopType: 'FIC', criticality: 'medium', isActive: true, monitoringEnabled: true, tags, observabilityFlags: [], links: [],
  stepTestApproved: false, thresholdProfileId: null, engineering: { pvMin: 0, pvMax: 10, pvUnit: 'kg/h', opMin: 0, opMax: 100 }, ...over,
} as CpmLoop);
const locations = {
  sites: [{ contextualPath: 'hdpe', name: 'HDPE Plant' }],
  areas: [{ contextualPath: 'hdpe/section_600', name: 'Section 600' }],
  units: [{ contextualPath: 'hdpe/section_600/u6002', name: '6002-Pellet Homogenization II Silo 4 & 5' }],
};
const ready = loop('FIC10302', {
  displayName: 'Reactor feed flow', tags: { ...tags, VP: `${P}/l.vp` }, links: [{ toLoopId: 'X', relType: 'PEER', origin: 'x' }],
});

const show = (rows: CpmLoop[], onOpen = vi.fn(), locs: typeof locations | null = locations) => {
  render(<MemoryRouter><RegistryList rows={rows} locations={locs ?? undefined} hrefFor={id => `/cpm/registry/${id}`} onOpen={onOpen} /></MemoryRouter>);
  return onOpen;
};
const rowOf = (id: string) => screen.getByRole('link', { name: id }).closest('tr')!;
const cells = (id: string) => [...rowOf(id).querySelectorAll('td')].map(td => td.textContent);

describe('RegistryList', () => {
  it('has the six columns of the approved mockup, the Valve position head with its ?', () => {
    show([loop('FIC10401')]);
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Loop', 'Type', 'Plant unit', 'Valve position?', 'Ready for analysis', 'Open the loop']);
    fireEvent.click(screen.getByRole('button', { name: 'Valve position' }));
    expect(screen.getByText(/Not fitted: the valve has no position signal\./)).toBeTruthy();
  });

  it('reads each loop in words: description without the tag, type, unit name, valve position and readiness', () => {
    show([loop('FIC10401'), ready]);
    expect(cells('FIC10401')).toEqual([
      'FIC10401Flow controller · FCS0101', 'Flow', '6002 · Pellet Homogenization II Silo 4 & 5', '!Not connected', '!2 items to set', '›',
    ]);
    expect(cells('FIC10302')).toEqual(['FIC10302Reactor feed flow', 'Flow', '6002 · Pellet Homogenization II Silo 4 & 5', 'Connected', '✓Ready', '›']);
  });

  it('shows Ready in the neutral tone and the items to set in amber, never green', () => {
    show([loop('FIC10401'), ready]);
    expect(within(rowOf('FIC10302')).getByText('Ready').closest('.cpm-pill')!.className).toContain('cpm-pill--muted');
    expect(within(rowOf('FIC10401')).getByText('2 items to set').closest('.cpm-pill')!.className).toContain('cpm-pill--warn');
    expect(document.querySelector('.cpm-pill--good')).toBeNull();
  });

  it('puts a muted pill beside the tag only for Not monitored and Retired; a retired loop has no readiness', () => {
    show([loop('OFF', { monitoringEnabled: false }), loop('OLD', { isActive: false, monitoringEnabled: false })]);
    expect(within(rowOf('OFF')).getByText('Not monitored')).toBeTruthy();
    expect(within(rowOf('OLD')).getByText('Retired')).toBeTruthy();
    expect(cells('OFF')[4]).toBe('!3 items to set');
    expect(cells('OLD')[4]).toBe('—');
  });

  it('names a loop type in words, an unknown one "Unknown type"', () => {
    show([loop('PIC1', { loopType: 'PIC' }), loop('X1', { loopType: 'UNKNOWN' })]);
    expect(cells('PIC1')[1]).toBe('Pressure');
    expect(cells('X1')[1]).toBe('Unknown type');
  });

  it('shows no slug for the unit, a dash before the plant names are read', () => {
    show([loop('FIC10401')], vi.fn(), null);
    expect(cells('FIC10401')[2]).toBe('—');
  });

  it('opens the loop from anywhere on its row, by click or Enter; the tag is a link but not a second tab stop', () => {
    const onOpen = show([loop('FIC10401'), ready]);
    fireEvent.click(rowOf('FIC10302').querySelectorAll('td')[2]);
    expect(onOpen).toHaveBeenLastCalledWith('FIC10302');
    fireEvent.keyDown(rowOf('FIC10401'), { key: 'Enter' });
    expect(onOpen).toHaveBeenLastCalledWith('FIC10401');
    const link = screen.getByRole('link', { name: 'FIC10401' });
    expect(link.getAttribute('href')).toBe('/cpm/registry/FIC10401');
    expect(link.getAttribute('tabindex')).toBe('-1');
    expect(rowOf('FIC10401').getAttribute('tabindex')).toBe('0');
  });
});
