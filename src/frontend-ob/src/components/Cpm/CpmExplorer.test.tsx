// @vitest-environment jsdom
// CHG-158 (owner review): no ? on the Loop Explorer title; the loop is chosen in the band at the top, loop or not.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../hooks/useCpm', () => ({ useCpmLoops: () => ({ data: { loops: [{ loopId: 'FIC1', tags: {}, links: [] }] }, isLoading: false, isError: false, error: null, refetch: () => {} }) }));
const scope = vi.hoisted(() => ({ active: false, hit: true }));
vi.mock('./plantScope', () => ({ useCpmScope: () => ({ active: scope.active, matches: () => scope.hit, params: {} }) }));
vi.mock('./explorer/LoopTree', () => ({ default: () => null }));
vi.mock('./explorer/summary/WindowKindToggle', () => ({
  default: (p: { onChange: (k: string) => void }) => <button type="button" onClick={() => p.onChange('24h')}>to 24h</button>,
}));

import CpmExplorer from './CpmExplorer';

afterEach(() => { cleanup(); scope.active = false; scope.hit = true; });

describe('CpmExplorer', () => {
  it('has no ? on the page title', () => {
    render(<MemoryRouter initialEntries={['/cpm/explorer']}><CpmExplorer /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Loop Explorer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Loop Explorer' })).toBeNull();
  });

  // CHG-158: the page switch wins over a short window chosen on the Calculations tab
  it('drops the Calculations tab short window when the 12h / 24h switch is used', () => {
    const Where: React.FC = () => { const l = useLocation(); return <span data-testid="where">{l.search}</span>; };
    render(<MemoryRouter initialEntries={['/cpm/explorer?calcWindow=5m']}>
      <Routes><Route path="*" element={<><CpmExplorer /><Where /></>} /></Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'to 24h' }));
    const q = new URLSearchParams(screen.getByTestId('where').textContent ?? '');
    expect(q.get('window')).toBe('24h');
    expect(q.get('calcWindow')).toBeNull();
  });

  // CHG-158 (owner review): no left list before a loop is chosen; the same control as after, in the same place
  it('offers the loop control in the band at the top while no loop is chosen, and no left list', () => {
    render(<MemoryRouter initialEntries={['/cpm/explorer']}><CpmExplorer /></MemoryRouter>);
    expect(screen.queryByRole('complementary', { name: 'Loops' })).toBeNull();
    const band = screen.getByRole('region', { name: 'Loop and its controls' });
    expect(band.querySelector('.cpm-band--card') ?? (band.classList.contains('cpm-band--card') ? band : null)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose a loop' })).toBeTruthy();
    expect(screen.getByText('Choose a loop above to open its summary, signals, calculations and history.')).toBeTruthy();
  });

  it('says No loops in this scope only when the header scope holds none', () => {
    scope.active = true;
    render(<MemoryRouter initialEntries={['/cpm/explorer']}><CpmExplorer /></MemoryRouter>);
    expect(screen.getByText('Select a loop')).toBeTruthy();
    cleanup();
    scope.hit = false;
    render(<MemoryRouter initialEntries={['/cpm/explorer']}><CpmExplorer /></MemoryRouter>);
    expect(screen.getByText('No loops in this scope')).toBeTruthy();
  });
});
