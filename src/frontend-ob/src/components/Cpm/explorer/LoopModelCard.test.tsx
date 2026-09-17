// 2026-09-17 audit F12: the Explorer's context panel showed loop type / gate profile / a calculation
// version string (R26: a version string identifies nothing) and none of the v2.5 loop-model
// dimensions; it also offered no way into the workbench, the response page or the configuration.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoopModelCard } from './LoopModelCard';
import type { CpmLoop } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('../config/EffectiveConfigDrawer', () => ({ EffectiveConfigDrawer: (p: { loopId: string }) => React.createElement('div', { 'data-testid': 'effective-config' }, p.loopId) }));
afterEach(cleanup);

const loop = (model: CpmLoop['model']): CpmLoop => ({
  loopId: 'FIC10405', displayName: 'Hexane feed flow', site: 'hdpe', area: 'a', unit: 'u', loopType: 'FIC', criticality: 'medium', tags: {},
  thresholdProfileId: null, model,
} as unknown as CpmLoop);

describe('LoopModelCard', () => {
  it('names the five dimensions, the acquisition contract and where the classification came from', () => {
    render(<MemoryRouter><LoopModelCard loop={loop({ serviceFamily: 'FLOW', dynamicClass: 'FAST_SELF_REG', objectiveType: 'TIGHT', topology: 'SINGLE', commandPath: 'OP_TO_VALVE',
      acquisition: { mode: 'PERIODIC', gridSeconds: 5 }, classificationSource: 'PRESET_FROM_LOOP_TYPE' })} /></MemoryRouter>);
    expect(screen.getByText('FLOW')).toBeTruthy();
    expect(screen.getByText('FAST_SELF_REG')).toBeTruthy();
    expect(screen.getByText('TIGHT')).toBeTruthy();
    expect(screen.getByText('OP_TO_VALVE')).toBeTruthy();
    expect(screen.getByText('PERIODIC · 5 s grid')).toBeTruthy();
    expect(screen.getByText(/derived from the tag type/)).toBeTruthy();
  });

  it('says when a person declared the model, and when the registry served none', () => {
    const { rerender } = render(<MemoryRouter><LoopModelCard loop={loop({ serviceFamily: 'LEVEL', dynamicClass: 'INTEGRATING', objectiveType: 'AVERAGING', topology: 'SINGLE', commandPath: 'OP_TO_VALVE', acquisition: { mode: 'RBE' }, classificationSource: 'EXPLICIT' })} /></MemoryRouter>);
    expect(screen.getByText(/declared by a person/)).toBeTruthy();
    rerender(<MemoryRouter><LoopModelCard loop={loop(null)} /></MemoryRouter>);
    expect(screen.getByText(/not served by this registry/)).toBeTruthy();
  });

  it('links to the workbench and the response page for this loop, and opens the effective configuration', () => {
    render(<MemoryRouter><LoopModelCard loop={loop(null)} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Evidence workbench/ }).getAttribute('href')).toBe('/cpm/evidence?loop=FIC10405');
    expect(screen.getByRole('link', { name: /System response/ }).getAttribute('href')).toBe('/cpm/response?loop=FIC10405');
    fireEvent.click(screen.getByRole('button', { name: /Effective configuration/ }));
    expect(screen.getByTestId('effective-config').textContent).toBe('FIC10405');
  });
});
