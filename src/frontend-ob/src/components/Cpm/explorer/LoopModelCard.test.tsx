// 2026-09-17 audit F12: the Explorer's context panel showed loop type / gate profile / a calculation
// version string (R26: a version string identifies nothing) and none of the v2.5 loop-model
// dimensions; it also offered no way into the workbench, the response page or the configuration.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LoopModelCard, LoopModelLink } from './LoopModelCard';
import { useAuthStore } from '../../../store/authStore';
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
    expect(screen.getByText('Fast self-regulating')).toBeTruthy();
    expect(screen.getByText('TIGHT')).toBeTruthy();
    expect(screen.getByText('Output drives a valve')).toBeTruthy();
    expect(screen.getByText('PERIODIC · 5 s grid')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'How this is classified' }));
    expect(screen.getByText(/derived from the tag type/)).toBeTruthy();
  });

  it('says when a person declared the model, and when the registry served none', () => {
    const { rerender } = render(<MemoryRouter><LoopModelCard loop={loop({ serviceFamily: 'LEVEL', dynamicClass: 'INTEGRATING', objectiveType: 'AVERAGING', topology: 'SINGLE', commandPath: 'OP_TO_VALVE', acquisition: { mode: 'RBE' }, classificationSource: 'EXPLICIT' })} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'How this is classified' }));
    expect(screen.getByText(/declared by a person/)).toBeTruthy();
    rerender(<MemoryRouter><LoopModelCard loop={loop(null)} /></MemoryRouter>);
    expect(screen.getByText(/not served by this registry/)).toBeTruthy();
  });

  // The loop model is a dialog from the Summary: Loop Registry → is the next step, System Response ↗ a related look.
  // The Workbench button went: Review evidence → in the band is the one way there.
  it('opens as a dialog from "Loop model & setup →", with Loop Registry → and System Response ↗', () => {
    const Probe: React.FC = () => { const l = useLocation(); return <div data-testid="location">{l.pathname}{l.search}</div>; };
    const perms = ['cpm.config.read'];   // CHG-081: the effective configuration is SuperAdmin only
    useAuthStore.setState({ user: { user_id: 'u', username: 'superadmin', email: '', role: 'SuperAdmin', is_active: true, permissions: perms }, status: 'authenticated', accessToken: 't' });
    render(
      <MemoryRouter initialEntries={['/cpm/explorer?loop=FIC10405']}>
        <Routes><Route path="*" element={<><LoopModelLink loop={loop(null)} /><Probe /></>} /></Routes>
      </MemoryRouter>);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Loop model & setup →' }));
    const d = screen.getByRole('dialog', { name: /Loop model & setup/ });
    expect(d.textContent).toContain('Gate profile');
    expect(d.textContent).not.toMatch(/PRESET|Context|Evidence workbench/);
    fireEvent.click(screen.getByRole('button', { name: /effective configuration/i }));
    expect(screen.getByTestId('effective-config').textContent).toBe('FIC10405');
    fireEvent.click(screen.getByRole('button', { name: 'System Response ↗' }));
    expect(screen.getByTestId('location').textContent).toBe('/cpm/response?loop=FIC10405');
    fireEvent.click(screen.getByRole('button', { name: 'Loop Registry →' }));
    expect(screen.getByTestId('location').textContent).toBe('/cpm/registry?loop=FIC10405');
  });

  it('shows no Effective configuration button without cpm.config.read (CHG-081)', () => {
    const perms: string[] = [];
    useAuthStore.setState({ user: { user_id: 'u', username: 'superadmin', email: '', role: 'SuperAdmin', is_active: true, permissions: perms }, status: 'authenticated', accessToken: 't' });
    render(<MemoryRouter><LoopModelCard loop={loop(null)} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /effective configuration/i })).toBeNull();
  });
});
