// 2026-09-17 audit F12: the Explorer's context panel showed loop type / gate profile / a calculation
// version string (R26: a version string identifies nothing) and none of the v2.5 loop-model
// dimensions; it also offered no way into the workbench, the response page or the configuration.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

  // cpa-ui-fix-plan Phase 3: the two routes are buttons (useNavigate), not text links; the
  // Workbench one takes the exact run from the Summary when it knows it.
  it('routes to the workbench and the response page for this loop, and opens the effective configuration', () => {
    const Probe: React.FC = () => { const l = useLocation(); return <div data-testid="location">{l.pathname}{l.search}</div>; };
    const { rerender } = render(
      <MemoryRouter initialEntries={['/cpm/explorer?loop=FIC10405']}>
        <Routes><Route path="*" element={<><LoopModelCard loop={loop(null)} /><Probe /></>} /></Routes>
      </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Evidence workbench/ }));
    expect(screen.getByTestId('location').textContent).toBe('/cpm/evidence?loop=FIC10405&kind=24h');
    fireEvent.click(screen.getByRole('button', { name: /System response/ }));
    expect(screen.getByTestId('location').textContent).toBe('/cpm/response?loop=FIC10405');
    fireEvent.click(screen.getByRole('button', { name: /Effective configuration/ }));
    expect(screen.getByTestId('effective-config').textContent).toBe('FIC10405');

    rerender(
      <MemoryRouter initialEntries={['/cpm/explorer?loop=FIC10405']}>
        <Routes><Route path="*" element={<><LoopModelCard loop={loop(null)} workbenchHref="/cpm/evidence?loop=FIC10405&methodRun=run-1&gate=G15&mode=FIXED" workbenchTitle="run" /><Probe /></>} /></Routes>
      </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Evidence workbench/ }));
    expect(screen.getByTestId('location').textContent).toBe('/cpm/evidence?loop=FIC10405&methodRun=run-1&gate=G15&mode=FIXED');
  });
});
